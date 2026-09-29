/**
 * Builds data/repos.json from live GitHub data.
 *
 *   1. For each language, search several star bands, not just "most starred", so mid-size,
 *      measurable projects are not crowded out by mega-repos that get skipped anyway (see
 *      below).
 *   2. Pull each repo's recent PRs and measure how outside contributors are treated.
 *   3. Keep only repos with enough outside-PR signal.
 *   4. Reserve PER_LANGUAGE_FLOOR slots per language (best-scoring first), then fill the rest
 *      of the dataset with the best-scoring repos overall. Without this, languages whose repos
 *      score slightly lower on average, or that just have fewer candidates, get squeezed out
 *      entirely by a single global top-N cut.
 *
 * Needs GITHUB_TOKEN (public data only). ~10 GraphQL points per repo; the script
 * pauses when the hourly budget runs low.
 */
import fs from "node:fs";
import path from "node:path";
import { buildAnalysis, computeMetrics, verdictFor, welcomeScore, type RawPR } from "../src/lib/metrics";
import { findAiPolicy } from "../src/lib/policy";
import { selectWithLanguageFloor } from "../src/lib/select";
import type { Dataset, RepoRecord } from "../src/lib/types";

const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error("GITHUB_TOKEN is not set. Add it to .env.local (see .env.example).");
  process.exit(1);
}

// How many candidates to search for per language. Sorting by stars means the search always
// finds the same handful of giant repos first, so a flat first: N under-covers a language
// unless it is combined with the star-band split below.
// Python, TypeScript, JavaScript and Ruby are weighted higher: this app's own audience (students
// and early-career developers) skews toward them, and they came out thin in earlier runs.
const LANGUAGE_QUOTA: Record<string, number> = {
  Python: 80, TypeScript: 80, JavaScript: 60, Ruby: 60, Rust: 50,
  Go: 40, Java: 40, "C#": 40, PHP: 40, Kotlin: 40, Swift: 40, "C++": 40,
};
const LANGUAGES = Object.keys(LANGUAGE_QUOTA);
// Split each language's search across these so mid-size, measurable projects are not crowded
// out by the handful of mega-repos that always sort first and usually get skipped anyway (too
// busy to fit in MAX_PR_PAGES, or too little outside-PR signal relative to their size).
const STAR_BANDS: { min: number; max: number | null }[] = [
  { min: 200, max: 999 },
  { min: 1000, max: 4999 },
  { min: 5000, max: 19999 },
  { min: 20000, max: null },
];
/** However a repo scores, guarantee at least this many repos per language survive into the
 * dataset (best-scoring first), so a member whose stack is a thinner language still sees a
 * real list instead of 2 repos. */
const PER_LANGUAGE_FLOOR = 15;
/** Extra best-scoring repos to add on top of every language's floor, regardless of language. */
const EXTRA_SLOTS = 40;
const MIN_EXTERNAL_PRS = 10;
/** Extra pages of 100 PRs to fetch for repos where one page covers under 120 days. */
const MAX_PR_PAGES = 3;
/** Repos so busy that 300 PRs span less than this can't be measured reliably, so they are skipped. */
const MIN_WINDOW_DAYS = 14;
let pointsSpent = 0;

interface GqlResult<T> { data?: T; errors?: { message: string }[] }
let remaining = 5000;
let resetAt = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function gql<T>(query: string, variables: Record<string, unknown> = {}, attempt = 0): Promise<T> {
  if (remaining < 300 && resetAt > Date.now()) {
    const wait = resetAt - Date.now() + 2000;
    console.log(`  rate budget low, sleeping ${Math.round(wait / 1000)}s`);
    await sleep(wait);
  }
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", "User-Agent": "firstmerge-pipeline" },
    body: JSON.stringify({ query, variables }),
  });
  if ((res.status >= 500 || res.status === 403 || res.status === 429) && attempt < 4) {
    const retryAfter = Number(res.headers.get("retry-after") ?? 0) * 1000;
    await sleep(Math.max(retryAfter, 2000 * 2 ** attempt));
    return gql<T>(query, variables, attempt + 1);
  }
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  type RL = { remaining: number; resetAt: string; cost?: number };
  const body = (await res.json()) as GqlResult<T & { rateLimit?: RL }>;
  if (body.errors?.length && !body.data) throw new Error(body.errors.map((e) => e.message).join("; "));
  const rl = (body.data as { rateLimit?: RL }).rateLimit;
  if (rl) { remaining = rl.remaining; resetAt = Date.parse(rl.resetAt); pointsSpent += rl.cost ?? 0; }
  return body.data as T;
}

const SEARCH = `
query($q: String!, $first: Int!) {
  search(query: $q, type: REPOSITORY, first: $first) { nodes { ... on Repository { nameWithOwner } } }
  rateLimit { remaining resetAt cost }
}`;

interface Author { __typename: string; login: string }
interface Reply { createdAt: string; authorAssociation: string; author: Author | null }
interface PRNode {
  number: number; state: RawPR["state"]; isDraft: boolean; createdAt: string;
  closedAt: string | null; mergedAt: string | null; authorAssociation: string;
  author: Author | null; comments: { nodes: Reply[] }; reviews: { nodes: Reply[] };
}
interface Blob { text?: string }
interface RepoNode {
  nameWithOwner: string; url: string; description: string | null; stargazerCount: number; pushedAt: string;
  primaryLanguage: { name: string } | null;
  languages: { nodes: { name: string }[] };
  repositoryTopics: { nodes: { topic: { name: string } }[] };
  contrib1: Blob | null; contrib2: Blob | null; contrib3: Blob | null;
  gfi: { totalCount: number; nodes: { number: number; title: string; url: string; createdAt: string; assignees: { totalCount: number }; labels: { nodes: { name: string }[] } }[] };
  pullRequests: { pageInfo: PageInfo; nodes: PRNode[] };
}
interface PageInfo { hasNextPage: boolean; endCursor: string | null }

const PR_FIELDS = `
  number state isDraft createdAt closedAt mergedAt authorAssociation
  author { __typename login }
  comments(first: 4) { nodes { createdAt authorAssociation author { __typename login } } }
  reviews(first: 3) { nodes { createdAt authorAssociation author { __typename login } } }`;

const DETAIL = `
query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    nameWithOwner url description stargazerCount pushedAt
    primaryLanguage { name }
    languages(first: 5, orderBy: { field: SIZE, direction: DESC }) { nodes { name } }
    repositoryTopics(first: 8) { nodes { topic { name } } }
    contrib1: object(expression: "HEAD:CONTRIBUTING.md") { ... on Blob { text } }
    contrib2: object(expression: "HEAD:.github/CONTRIBUTING.md") { ... on Blob { text } }
    contrib3: object(expression: "HEAD:docs/CONTRIBUTING.md") { ... on Blob { text } }
    gfi: issues(first: 10, states: OPEN, labels: ["good first issue"], orderBy: { field: CREATED_AT, direction: DESC }) {
      totalCount
      nodes { number title url createdAt assignees(first: 1) { totalCount } labels(first: 5) { nodes { name } } }
    }
    pullRequests(first: 100, orderBy: { field: CREATED_AT, direction: DESC }) {
      pageInfo { hasNextPage endCursor }
      nodes { ${PR_FIELDS} }
    }
  }
  rateLimit { remaining resetAt cost }
}`;

const PR_PAGE = `
query($owner: String!, $name: String!, $after: String!) {
  repository(owner: $owner, name: $name) {
    pullRequests(first: 100, after: $after, orderBy: { field: CREATED_AT, direction: DESC }) {
      pageInfo { hasNextPage endCursor }
      nodes { ${PR_FIELDS} }
    }
  }
  rateLimit { remaining resetAt cost }
}`;

const isBot = (a: Author | null) => !!a && (a.__typename === "Bot" || a.login.endsWith("[bot]"));

function toRawPR(n: PRNode): RawPR {
  return {
    number: n.number, state: n.state, isDraft: n.isDraft, createdAt: n.createdAt,
    closedAt: n.closedAt, mergedAt: n.mergedAt, authorAssociation: n.authorAssociation,
    authorLogin: n.author?.login ?? null, authorIsBot: isBot(n.author),
    responses: [...n.comments.nodes, ...n.reviews.nodes].map((r) => ({
      createdAt: r.createdAt, authorAssociation: r.authorAssociation, isBot: isBot(r.author), login: r.author?.login ?? null,
    })),
  };
}

async function analyse(fullName: string): Promise<RepoRecord | null> {
  const [owner, name] = fullName.split("/");
  const { repository: r } = await gql<{ repository: RepoNode | null }>(DETAIL, { owner, name });
  if (!r) return null;

  const paths = [["contrib1", "CONTRIBUTING.md"], ["contrib2", ".github/CONTRIBUTING.md"], ["contrib3", "docs/CONTRIBUTING.md"]] as const;
  const found = paths.find(([key]) => r[key]?.text);
  const contributingUrl = found ? `${r.url}/blob/HEAD/${found[1]}` : null;

  let prs = r.pullRequests.nodes.map(toRawPR);
  let page = r.pullRequests.pageInfo;
  let metrics = computeMetrics(prs);
  // Page further back only when one page covers a short window and there is some outside signal.
  for (let n = 1; n < MAX_PR_PAGES && page.hasNextPage && page.endCursor && metrics.windowDays < 120 && metrics.externalAuthors >= 4; n++) {
    const more = await gql<{ repository: { pullRequests: { pageInfo: PageInfo; nodes: PRNode[] } } }>(PR_PAGE, { owner, name, after: page.endCursor });
    prs = prs.concat(more.repository.pullRequests.nodes.map(toRawPR));
    page = more.repository.pullRequests.pageInfo;
    metrics = computeMetrics(prs);
  }
  if (metrics.windowDays < MIN_WINDOW_DAYS) return null; // too busy to measure fairly
  if (metrics.externalPRs < MIN_EXTERNAL_PRS || metrics.confidence === "low") return null;

  const open = r.gfi.nodes.filter((i) => i.assignees.totalCount === 0);
  const record: RepoRecord = {
    fullName: r.nameWithOwner, url: r.url, description: r.description ?? "",
    primaryLanguage: r.primaryLanguage?.name ?? null,
    languages: r.languages.nodes.map((l) => l.name),
    topics: r.repositoryTopics.nodes.map((t) => t.topic.name),
    stars: r.stargazerCount, pushedAt: r.pushedAt, contributingUrl,
    aiPolicySnippet: findAiPolicy([r.contrib1?.text, r.contrib2?.text, r.contrib3?.text]),
    goodFirstIssueCount: open.length,
    goodFirstIssues: open.slice(0, 5).map((i) => ({
      number: i.number, title: i.title, url: i.url, createdAt: i.createdAt, labels: i.labels.nodes.map((l) => l.name),
    })),
    metrics, welcomeScore: 0, verdict: "hard", strengths: [], watchouts: [],
  };
  record.welcomeScore = welcomeScore(metrics, record.goodFirstIssueCount, !!contributingUrl);
  record.verdict = verdictFor(record.welcomeScore);
  Object.assign(record, buildAnalysis(record));
  return record;
}

const CACHE_FILE = path.join(process.cwd(), "data", ".pipeline-cache.json");
const CACHE_TTL_MS = 12 * 3_600_000;
const FRESH = process.env.FRESH === "1";
/** Bump when the scoring logic changes so stale cached results are discarded. */
const SCORING_VERSION = 3;

interface Cache { version: number; entries: Record<string, { at: string; record: RepoRecord | null }> }

function loadCache(): Cache {
  try {
    const c = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) as Cache;
    if (c.version === SCORING_VERSION) return c;
  } catch { /* no cache yet */ }
  return { version: SCORING_VERSION, entries: {} };
}

function saveCache(c: Cache) {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(c));
}

async function main() {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const candidates = new Set<string>();
  for (const lang of LANGUAGES) {
    const perBand = Math.max(5, Math.ceil(LANGUAGE_QUOTA[lang] / STAR_BANDS.length));
    const langSet = new Set<string>();
    for (const band of STAR_BANDS) {
      const starQualifier = band.max === null ? `stars:>=${band.min}` : `stars:${band.min}..${band.max}`;
      const q = `${starQualifier} good-first-issues:>=2 pushed:>=${since} archived:false fork:false is:public language:${lang} sort:stars-desc`;
      const { search } = await gql<{ search: { nodes: { nameWithOwner: string }[] } }>(SEARCH, { q, first: perBand });
      search.nodes.forEach((n) => { langSet.add(n.nameWithOwner); candidates.add(n.nameWithOwner); });
      await sleep(150);
    }
    console.log(`${lang}: ${langSet.size} candidates (${STAR_BANDS.length} star bands) | ${candidates.size} unique overall so far`);
  }

  // Results are cached per repo, so an interrupted run resumes instead of starting over.
  const cache = loadCache();
  const outFile = path.join(process.cwd(), "data", "repos.json");
  const repos: RepoRecord[] = [];
  const writeOutput = () => {
    const dataset: Dataset = { generatedAt: new Date().toISOString(), isSample: false, repos: selectWithLanguageFloor(repos, PER_LANGUAGE_FLOOR, EXTRA_SLOTS) };
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(dataset, null, 2));
    return dataset.repos.length;
  };

  let i = 0;
  let reused = 0;
  for (const fullName of candidates) {
    i++;
    const hit = cache.entries[fullName];
    if (hit && !FRESH && Date.now() - Date.parse(hit.at) < CACHE_TTL_MS) {
      reused++;
      if (hit.record) repos.push(hit.record);
      continue;
    }
    try {
      const rec = await analyse(fullName);
      cache.entries[fullName] = { at: new Date().toISOString(), record: rec };
      console.log(`[${i}/${candidates.size}] ${fullName} ${rec ? `score ${rec.welcomeScore}` : "skipped (not enough outside-PR signal)"}`);
      if (rec) repos.push(rec);
    } catch (err) {
      console.warn(`[${i}/${candidates.size}] ${fullName} failed: ${(err as Error).message}`);
    }
    if (i % 10 === 0) saveCache(cache);
    if (i % 25 === 0) console.log(`  checkpoint: wrote ${writeOutput()} repos so far`);
    await sleep(100);
  }

  saveCache(cache);
  console.log(`Done. ${reused} repos reused from cache. Wrote ${writeOutput()} repos to ${outFile}`);
  console.log(`GraphQL points spent this run: ${pointsSpent}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
