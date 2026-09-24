import assert from "node:assert/strict";
import { test } from "node:test";
import { getHome, getDetail, toFreeView, FREE_REPO_COUNT, MEMBER_REPO_COUNT } from "./access";
import { buildAnalysis, computeMetrics, verdictFor, welcomeScore, type RawPR } from "./metrics";
import { matchRepo } from "./match";
import type { Dataset, RepoRecord } from "./types";

const NOW = new Date("2026-09-21T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const hoursAfter = (iso: string, h: number) => new Date(Date.parse(iso) + h * 3_600_000).toISOString();

function pr(over: Partial<RawPR> & { number: number }): RawPR {
  return {
    state: "MERGED",
    isDraft: false,
    createdAt: daysAgo(20),
    closedAt: null,
    mergedAt: null,
    authorAssociation: "NONE",
    authorLogin: `user${over.number}`,
    authorIsBot: false,
    responses: [],
    ...over,
  };
}

test("merge rate, response time and ghosting on an outside-PR fixture", () => {
  const prs: RawPR[] = [];
  // 6 merged outside PRs, maintainer replies after 10h, merged 2 days after opening
  for (let i = 1; i <= 6; i++) {
    const created = daysAgo(30 + i);
    prs.push(pr({ number: i, createdAt: created, mergedAt: hoursAfter(created, 48), responses: [{ createdAt: hoursAfter(created, 10), authorAssociation: "MEMBER", isBot: false }] }));
  }
  // 4 closed without merge and never answered (ghosted)
  for (let i = 7; i <= 10; i++) prs.push(pr({ number: i, state: "CLOSED", createdAt: daysAgo(40) }));
  // maintainers' own PRs and a bot must be ignored
  prs.push(pr({ number: 11, authorAssociation: "MEMBER" }));
  prs.push(pr({ number: 12, authorIsBot: true }));

  const m = computeMetrics(prs, NOW);
  assert.equal(m.externalPRs, 10);
  assert.equal(m.externalMergeRate, 0.6);
  assert.equal(m.medianFirstResponseHours, 10);
  assert.equal(m.medianMergeDays, 2);
  assert.equal(m.ghostedPct, 0.4);
});

test("a reply from a bot does not count as a maintainer response", () => {
  const created = daysAgo(30);
  const prs = Array.from({ length: 6 }, (_, i) =>
    pr({ number: i + 1, state: "CLOSED", createdAt: created, responses: [{ createdAt: hoursAfter(created, 1), authorAssociation: "MEMBER", isBot: true }] }),
  );
  assert.equal(computeMetrics(prs, NOW).ghostedPct, 1);
});

test("a team member with many PRs is not counted as an outside contributor", () => {
  // Real pattern: Automattic/pocket-casts-android had 27 of 28 "outside" PRs from one CONTRIBUTOR.
  const prs = [
    ...Array.from({ length: 27 }, (_, i) => pr({ number: i + 1, authorLogin: "staff", authorAssociation: "CONTRIBUTOR" })),
    pr({ number: 100, authorLogin: "newcomer" }),
  ];
  const m = computeMetrics(prs, NOW);
  assert.equal(m.externalPRs, 1);
  assert.equal(m.externalAuthors, 1);
  assert.equal(m.confidence, "low");
});

test("bot-like accounts typed as users, and instant replies, do not count as maintainer replies", () => {
  const created = daysAgo(30);
  const respond = (login: string, seconds: number) => ({
    createdAt: new Date(Date.parse(created) + seconds * 1000).toISOString(),
    authorAssociation: "COLLABORATOR", isBot: false, login,
  });
  const prs = Array.from({ length: 6 }, (_, i) =>
    pr({
      number: i + 1, state: "CLOSED", createdAt: created,
      responses: [respond("elasticsearchmachine", 5), respond("dangermattic", 3600), respond("wpmobilebot", 7200), respond("human-reviewer", 30)],
    }),
  );
  // Only "human-reviewer" is a person, and 30s after opening is inside the automation window.
  assert.equal(computeMetrics(prs, NOW).ghostedPct, 1);

  const withHuman = prs.map((p) => ({ ...p, responses: [...p.responses, respond("alice", 4 * 3600)] }));
  const m = computeMetrics(withHuman, NOW);
  assert.equal(m.ghostedPct, 0);
  assert.equal(m.medianFirstResponseHours, 4);
});

test("confidence needs many different contributors, not just many PRs", () => {
  const few = Array.from({ length: 40 }, (_, i) => pr({ number: i + 1, authorLogin: `dev${i % 5}` }));
  // 5 authors x 8 PRs each -> all regulars -> nothing left
  assert.equal(computeMetrics(few, NOW).externalPRs, 0);
  const many = Array.from({ length: 40 }, (_, i) => pr({ number: i + 1, authorLogin: `dev${i % 20}` }));
  // 20 authors x 2 PRs each -> kept
  const m = computeMetrics(many, NOW);
  assert.equal(m.externalAuthors, 20);
  assert.equal(m.confidence, "high");
});

test("PRs left open and ignored for weeks count as misses, not as nothing", () => {
  // Real pattern: OpenSearch showed 100% merged but 61% of outside PRs never got a reply.
  const merged = Array.from({ length: 10 }, (_, i) => pr({ number: i + 1, createdAt: daysAgo(40 + i), mergedAt: daysAgo(35) }));
  const ignored = Array.from({ length: 10 }, (_, i) => pr({ number: 100 + i, state: "OPEN", createdAt: daysAgo(30 + i) }));
  const m = computeMetrics([...merged, ...ignored], NOW);
  assert.equal(m.mergeRateBasis, 20);
  assert.equal(m.externalMergeRate, 0.5);
});

test("open PRs that maintainers have engaged with, or that are recent, are not counted as misses", () => {
  const merged = Array.from({ length: 10 }, (_, i) => pr({ number: i + 1, createdAt: daysAgo(40 + i), mergedAt: daysAgo(35) }));
  const engaged = Array.from({ length: 5 }, (_, i) =>
    pr({ number: 100 + i, state: "OPEN", createdAt: daysAgo(30), responses: [{ createdAt: hoursAfter(daysAgo(30), 5), authorAssociation: "MEMBER", isBot: false, login: "maint" }] }),
  );
  const recent = Array.from({ length: 5 }, (_, i) => pr({ number: 200 + i, state: "OPEN", createdAt: daysAgo(3) }));
  const m = computeMetrics([...merged, ...engaged, ...recent], NOW);
  assert.equal(m.mergeRateBasis, 10);
  assert.equal(m.externalMergeRate, 1);
});

test("a small sample cannot outscore a large one with the same rate", () => {
  const base = computeMetrics(Array.from({ length: 30 }, (_, i) => pr({ number: i + 1, mergedAt: daysAgo(10), responses: [{ createdAt: hoursAfter(daysAgo(20), 5), authorAssociation: "OWNER", isBot: false }] })), NOW);
  const small = { ...base, externalMergeRate: 1, mergeRateBasis: 6 };
  const large = { ...base, externalMergeRate: 1, mergeRateBasis: 60 };
  assert.ok(welcomeScore(large, 5, true) > welcomeScore(small, 5, true));
});

test("low sample sizes give null rates and low confidence", () => {
  const m = computeMetrics([pr({ number: 1 }), pr({ number: 2 })], NOW);
  assert.equal(m.externalMergeRate, null);
  assert.equal(m.confidence, "low");
});

test("welcome score is monotonic in merge rate and bounded", () => {
  const base = computeMetrics(Array.from({ length: 30 }, (_, i) => pr({ number: i + 1, mergedAt: daysAgo(10), responses: [{ createdAt: hoursAfter(daysAgo(20), 5), authorAssociation: "OWNER", isBot: false }] })), NOW);
  const good = welcomeScore(base, 10, true);
  const worse = welcomeScore({ ...base, externalMergeRate: 0.1 }, 10, true);
  assert.ok(good > worse);
  assert.ok(good <= 100 && worse >= 0);
  assert.equal(verdictFor(70), "welcoming");
  assert.equal(verdictFor(45), "selective");
  assert.equal(verdictFor(44), "hard");
});

function repo(i: number, lang: string, score: number): RepoRecord {
  const metrics = computeMetrics([], NOW);
  return {
    fullName: `org/repo-${i}`, url: `https://github.com/org/repo-${i}`, description: "d",
    primaryLanguage: lang, languages: [lang], topics: ["cli"], stars: 100, pushedAt: daysAgo(1),
    contributingUrl: "https://github.com/org/repo/blob/HEAD/CONTRIBUTING.md", aiPolicySnippet: "No AI-generated PRs.",
    goodFirstIssueCount: 3, goodFirstIssues: [{ number: 1, title: "secret issue", url: "u", createdAt: daysAgo(2), labels: [] }],
    metrics, welcomeScore: score, verdict: verdictFor(score), ...buildAnalysis({ metrics, goodFirstIssueCount: 3, contributingUrl: "x", aiPolicySnippet: null }),
  };
}

const ds: Dataset = {
  generatedAt: NOW.toISOString(), isSample: true,
  repos: Array.from({ length: 40 }, (_, i) => repo(i, i % 2 ? "Go" : "Python", 90 - i)),
};

test("signed-out visitors get at most 2 repos and no gated fields", () => {
  const home = getHome(ds, { signedIn: false, skills: null });
  assert.equal(home.tier, "free");
  if (home.tier !== "free") return;
  assert.equal(home.repos.length, FREE_REPO_COUNT);
  const json = JSON.stringify(home);
  assert.ok(!json.includes("secret issue"), "issue titles must not leak");
  assert.ok(!json.includes("AI-generated"), "AI policy text must not leak");
  assert.ok(!json.includes("CONTRIBUTING.md"), "contributing link must not leak");
  // locked repos' names must not appear anywhere in the payload
  for (const r of ds.repos.slice(FREE_REPO_COUNT)) assert.ok(!json.includes(r.fullName), `leaked ${r.fullName}`);
  assert.equal(home.lockedCount, MEMBER_REPO_COUNT - FREE_REPO_COUNT);
});

test("signed-in members get 30 repos ranked by fit", () => {
  const skills = { languages: [{ name: "Go", weight: 1 }], topics: [], mergedPRs: 0, publicRepos: 3 };
  const home = getHome(ds, { signedIn: true, skills });
  assert.equal(home.tier, "member");
  if (home.tier !== "member") return;
  assert.equal(home.repos.length, MEMBER_REPO_COUNT);
  assert.equal(home.repos[0].repo.primaryLanguage, "Go");
  assert.ok(home.repos[0].match.reasons.some((r) => r.includes("Go")));
});

test("detail access: free only for the top repos, members for any", () => {
  const top = ds.repos[0].fullName;
  const locked = ds.repos[10].fullName;
  assert.equal(getDetail(ds, { signedIn: false, skills: null }, top).access, "free");
  assert.equal(getDetail(ds, { signedIn: false, skills: null }, locked).access, "none");
  assert.equal(getDetail(ds, { signedIn: true, skills: null }, locked).access, "member");
  assert.equal(getDetail(ds, { signedIn: true, skills: null }, "nope/nope").access, "none");
  assert.ok(!("goodFirstIssues" in toFreeView(ds.repos[0])));
});

test("match without a skill profile falls back to the welcome score", () => {
  assert.equal(matchRepo(ds.repos[3], null).fit, ds.repos[3].welcomeScore);
});
