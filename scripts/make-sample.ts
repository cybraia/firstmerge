/**
 * Generates data/repos.sample.json: 40 FICTIONAL repos so the app runs without a GitHub token.
 * Names and numbers are made up. The UI shows a banner whenever sample data is in use.
 */
import fs from "node:fs";
import path from "node:path";
import { buildAnalysis, verdictFor, welcomeScore } from "../src/lib/metrics";
import type { Dataset, Metrics, RepoRecord } from "../src/lib/types";

let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

const LANGS = ["TypeScript", "Python", "Go", "Rust", "JavaScript", "Java", "Ruby", "C#"];
const TOPICS = ["cli", "web", "react", "api", "devtools", "database", "testing", "docs", "ml", "security"];
const NAMES = ["atlas", "beacon", "cinder", "delta", "ember", "fjord", "grove", "harbor", "iris", "juno"];
const KINDS = ["cli", "api", "ui", "kit", "sdk"];
const NOW = Date.now();
const iso = (daysAgo: number) => new Date(NOW - daysAgo * 86_400_000).toISOString();

const repos: RepoRecord[] = [];
for (let i = 0; i < 40; i++) {
  const lang = LANGS[i % LANGS.length];
  const quality = 1 - i / 55; // earlier repos are friendlier
  const mergeRate = Math.min(0.95, Math.max(0.15, quality * between(0.7, 1)));
  const externalPRs = Math.round(between(14, 70));
  const metrics: Metrics = {
    windowDays: Math.round(between(40, 180)),
    sampledPRs: 100,
    externalPRs,
    externalAuthors: Math.round(externalPRs * 0.75),
    externalMergeRate: Math.round(mergeRate * 100) / 100,
    mergeRateBasis: Math.round(externalPRs * 0.8),
    newcomerPRs: Math.round(externalPRs * 0.4),
    newcomerMergeRate: Math.round(Math.max(0.1, mergeRate - between(0, 0.2)) * 100) / 100,
    medianFirstResponseHours: Math.round(between(3, 24 + (1 - quality) * 200)),
    medianMergeDays: Math.round(between(1, 4 + (1 - quality) * 25)),
    ghostedPct: Math.round(Math.max(0, (1 - quality) * between(0.2, 0.9)) * 100) / 100,
    staleOpenPct: Math.round(Math.max(0, (1 - quality) * between(0.2, 1)) * 100) / 100,
    confidence: externalPRs >= 30 ? "high" : "medium",
  };
  const gfi = Math.round(between(0, 12));
  const contributing = rand() > 0.15;
  const name = `sample-org/${pick(NAMES)}-${pick(KINDS)}-${i + 1}`;
  const record: RepoRecord = {
    fullName: name,
    url: `https://github.com/${name}`,
    description: `Fictional ${lang} project used to demo the layout (sample data).`,
    primaryLanguage: lang,
    languages: [lang, ...(rand() > 0.6 ? [pick(LANGS)] : [])],
    topics: [pick(TOPICS), pick(TOPICS)],
    stars: Math.round(between(200, 30000)),
    pushedAt: iso(between(0, 10)),
    contributingUrl: contributing ? `https://github.com/${name}/blob/HEAD/CONTRIBUTING.md` : null,
    aiPolicySnippet: rand() > 0.75 ? "Sample text: AI-assisted PRs must be disclosed and understood by the author." : null,
    goodFirstIssueCount: gfi,
    goodFirstIssues: Array.from({ length: Math.min(gfi, 4) }, (_, k) => ({
      number: 100 + k,
      title: pick(["Fix typo in error message", "Add unit test for parser", "Improve --help output", "Document config option", "Handle empty input"]),
      url: `https://github.com/${name}/issues/${100 + k}`,
      createdAt: iso(between(1, 30)),
      labels: ["good first issue"],
    })),
    metrics,
    welcomeScore: 0,
    verdict: "hard",
    strengths: [],
    watchouts: [],
  };
  record.welcomeScore = welcomeScore(metrics, gfi, contributing);
  record.verdict = verdictFor(record.welcomeScore);
  Object.assign(record, buildAnalysis(record));
  repos.push(record);
}

const dataset: Dataset = { generatedAt: new Date().toISOString(), isSample: true, repos };
const out = path.join(process.cwd(), "data", "repos.sample.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(dataset, null, 2));
console.log(`Wrote ${repos.length} sample repos to ${out}`);
console.log("score range:", Math.min(...repos.map((r) => r.welcomeScore)), "-", Math.max(...repos.map((r) => r.welcomeScore)));
