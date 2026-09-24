import type { Metrics, RepoRecord, Verdict } from "./types";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const WINDOW_DAYS = 180;

/** Authors with these associations are "outside" contributors. */
const EXTERNAL = new Set(["NONE", "FIRST_TIME_CONTRIBUTOR", "FIRST_TIMER", "CONTRIBUTOR"]);
/** Replies from these associations count as a maintainer response. */
const MAINTAINER = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

/**
 * Accounts that look automated even though GitHub types them as normal users
 * (e.g. `elasticsearchmachine`, `wpmobilebot`, `dangermattic`, `cla-checker-service`).
 */
const AUTOMATED_LOGIN =
  /(?:bot|machine|robot)$|bot[-_]|danger|^github-actions|renovate|dependabot|codecov|^cla[-_]|[-_]cla\b|checker|sonar|automation|copilot|^ci[-_]|[-_]ci$/i;

export function looksAutomated(login: string | null | undefined): boolean {
  return !!login && AUTOMATED_LOGIN.test(login);
}

/** A reply this soon after a PR opens is almost always a bot, not a person. */
const AUTOMATION_WINDOW_MS = 60_000;

/** Open outside PRs with no maintainer reply after this long count as not merged. */
const IGNORED_AFTER_DAYS = 14;

/**
 * Authors with this many PRs in the sample are treated as regulars (the team), not outsiders.
 * GitHub labels staff whose org membership is private as CONTRIBUTOR, so association alone
 * can't separate them from real outside contributors.
 */
const REGULAR_AUTHOR_PRS = 3;

export interface RawResponse {
  createdAt: string;
  authorAssociation: string;
  isBot: boolean;
  login?: string | null;
}

export interface RawPR {
  number: number;
  state: "OPEN" | "CLOSED" | "MERGED";
  isDraft: boolean;
  createdAt: string;
  closedAt: string | null;
  mergedAt: string | null;
  authorAssociation: string;
  authorLogin: string | null;
  authorIsBot: boolean;
  responses: RawResponse[];
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function rate(hits: number, total: number, minTotal: number): number | null {
  return total >= minTotal ? hits / total : null;
}

function firstResponseHours(pr: RawPR): number | null {
  const created = Date.parse(pr.createdAt);
  const times = pr.responses
    .filter((r) => !r.isBot && !looksAutomated(r.login) && MAINTAINER.has(r.authorAssociation))
    .map((r) => Date.parse(r.createdAt))
    .filter((t) => t - created >= AUTOMATION_WINDOW_MS);
  return times.length ? (Math.min(...times) - created) / HOUR_MS : null;
}

export function computeMetrics(prs: RawPR[], now: Date = new Date()): Metrics {
  const nowMs = now.getTime();
  const cutoff = nowMs - WINDOW_DAYS * DAY_MS;
  const recent = prs.filter(
    (p) => !p.isDraft && !p.authorIsBot && !looksAutomated(p.authorLogin) && Date.parse(p.createdAt) >= cutoff,
  );

  // A saturated page (100 PRs) can cover less than the full window on busy repos.
  const oldest = recent.length ? Math.min(...recent.map((p) => Date.parse(p.createdAt))) : nowMs;
  const saturated = prs.length >= 100;
  const windowDays = saturated
    ? Math.max(1, Math.min(WINDOW_DAYS, Math.round((nowMs - oldest) / DAY_MS)))
    : WINDOW_DAYS;

  const outsideByAssociation = recent.filter((p) => EXTERNAL.has(p.authorAssociation));
  const perAuthor = new Map<string, number>();
  for (const p of outsideByAssociation) {
    if (p.authorLogin) perAuthor.set(p.authorLogin, (perAuthor.get(p.authorLogin) ?? 0) + 1);
  }
  // Drop regulars: people opening many PRs are almost always the team, not newcomers.
  const external = outsideByAssociation.filter(
    (p) => !p.authorLogin || (perAuthor.get(p.authorLogin) ?? 0) < REGULAR_AUTHOR_PRS,
  );
  const externalAuthors = new Set(external.map((p) => p.authorLogin).filter(Boolean)).size;
  const settled = external.filter((p) => p.state !== "OPEN");
  const merged = settled.filter((p) => p.state === "MERGED");

  // A PR left open and unanswered for weeks is a failure the maintainers just haven't closed.
  // Leaving these out would reward repos that let outside PRs rot.
  const ignoredOpen = new Set(
    external
      .filter((p) => p.state === "OPEN" && nowMs - Date.parse(p.createdAt) >= IGNORED_AFTER_DAYS * DAY_MS && firstResponseHours(p) === null)
      .map((p) => p.number),
  );
  const mergeBasis = settled.length + ignoredOpen.size;

  const newcomer = external.filter((p) => p.authorLogin && perAuthor.get(p.authorLogin) === 1);
  const newcomerSettled = newcomer.filter((p) => p.state !== "OPEN");
  const newcomerMerged = newcomerSettled.filter((p) => p.state === "MERGED");
  const newcomerBasis = newcomerSettled.length + newcomer.filter((p) => ignoredOpen.has(p.number)).length;

  const responseHours = external
    .map(firstResponseHours)
    .filter((h): h is number => h !== null);

  const mergeDays = merged
    .filter((p) => p.mergedAt)
    .map((p) => (Date.parse(p.mergedAt as string) - Date.parse(p.createdAt)) / DAY_MS);

  // Merged PRs count as answered even without a comment; a silent close does not.
  const aged = external.filter((p) => nowMs - Date.parse(p.createdAt) >= 7 * DAY_MS);
  const ghosted = aged.filter((p) => p.state !== "MERGED" && firstResponseHours(p) === null);

  const open = external.filter((p) => p.state === "OPEN");
  const staleOpen = open.filter((p) => nowMs - Date.parse(p.createdAt) >= 30 * DAY_MS);

  // Many PRs from a handful of people says little about how strangers are treated.
  const confidence =
    externalAuthors >= 15 && settled.length >= 20
      ? "high"
      : externalAuthors >= 8 && settled.length >= 10
        ? "medium"
        : "low";

  return {
    windowDays,
    sampledPRs: recent.length,
    externalPRs: external.length,
    externalAuthors,
    externalMergeRate: rate(merged.length, mergeBasis, 5),
    mergeRateBasis: mergeBasis,
    newcomerPRs: newcomer.length,
    newcomerMergeRate: rate(newcomerMerged.length, newcomerBasis, 5),
    medianFirstResponseHours: responseHours.length >= 5 ? median(responseHours) : null,
    medianMergeDays: mergeDays.length >= 5 ? median(mergeDays) : null,
    ghostedPct: rate(ghosted.length, aged.length, 5),
    staleOpenPct: rate(staleOpen.length, open.length, 3),
    confidence,
  };
}

const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));

/** 0-100 "how welcoming is this repo to outside PRs". Weights sum to 100. */
export function welcomeScore(m: Metrics, goodFirstIssueCount: number, hasContributing: boolean): number {
  // Shrink toward 50% for small samples so 10 lucky PRs can't beat 60 solid ones.
  const basis = m.mergeRateBasis;
  const smoothed = m.externalMergeRate === null ? 0 : (m.externalMergeRate * basis + 0.5 * 5) / (basis + 5);
  const merge = smoothed * 35;
  // Full marks at <= 24h, zero at >= 14 days.
  const response =
    m.medianFirstResponseHours === null ? 0 : clamp(1 - (m.medianFirstResponseHours - 24) / (336 - 24)) * 25;
  const answered = (1 - (m.ghostedPct ?? 1)) * 15;
  const issues = clamp(goodFirstIssueCount / 10) * 10;
  const guide = hasContributing ? 5 : 0;
  const volume = clamp(m.externalPRs / 30) * 10;
  return Math.round(merge + response + answered + issues + guide + volume);
}

export function verdictFor(score: number): Verdict {
  return score >= 70 ? "welcoming" : score >= 45 ? "selective" : "hard";
}

export function fmtHours(h: number): string {
  if (h < 1) return "under an hour";
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)} days`;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function buildAnalysis(
  r: Pick<RepoRecord, "metrics" | "goodFirstIssueCount" | "contributingUrl" | "aiPolicySnippet">,
): { strengths: string[]; watchouts: string[] } {
  const m = r.metrics;
  const strengths: string[] = [];
  const watchouts: string[] = [];

  if (m.externalMergeRate !== null) {
    if (m.externalMergeRate >= 0.6) {
      strengths.push(`Merges ${pct(m.externalMergeRate)} of outside PRs (last ${m.windowDays} days), counting long-ignored ones as misses.`);
    } else if (m.externalMergeRate < 0.4) {
      watchouts.push(`Only ${pct(m.externalMergeRate)} of outside PRs get merged, counting long-ignored ones as misses.`);
    }
  }
  if (m.newcomerMergeRate !== null && m.newcomerMergeRate >= 0.5) {
    strengths.push(`One-time contributors get merged ${pct(m.newcomerMergeRate)} of the time.`);
  }
  if (m.medianFirstResponseHours !== null && m.medianFirstResponseHours <= 48) {
    strengths.push(`Maintainers usually reply within ${fmtHours(m.medianFirstResponseHours)}.`);
  }
  if (r.goodFirstIssueCount >= 5) {
    strengths.push(`${r.goodFirstIssueCount} open "good first issue" tickets right now.`);
  } else if (r.goodFirstIssueCount === 0) {
    watchouts.push(`No open "good first issue" tickets right now.`);
  }
  if (r.contributingUrl) strengths.push("Has a written contributing guide.");

  if (m.ghostedPct !== null && m.ghostedPct >= 0.3) {
    watchouts.push(`${pct(m.ghostedPct)} of outside PRs never get a maintainer reply.`);
  }
  if (m.medianMergeDays !== null && m.medianMergeDays >= 14) {
    watchouts.push(`Merges are slow: about ${Math.round(m.medianMergeDays)} days from open to merge.`);
  }
  if (m.staleOpenPct !== null && m.staleOpenPct >= 0.5) {
    watchouts.push(`${pct(m.staleOpenPct)} of open outside PRs have waited over 30 days.`);
  }
  if (r.aiPolicySnippet) {
    watchouts.push("Mentions AI-assisted contributions. Read the policy before using an AI tool.");
  }
  if (m.confidence === "low") {
    watchouts.push("Small sample of outside PRs, so treat these numbers as rough.");
  }
  return { strengths, watchouts };
}
