export type Verdict = "welcoming" | "selective" | "hard";
export type Confidence = "high" | "medium" | "low";

export interface Metrics {
  /** Days of PR history the numbers cover (max 180). */
  windowDays: number;
  sampledPRs: number;
  externalPRs: number;
  /** Distinct outside contributors behind those PRs. */
  externalAuthors: number;
  /** Merged / (settled + open-and-ignored for 14+ days). Long-ignored PRs count as misses. */
  externalMergeRate: number | null;
  /** How many PRs the merge rate is based on. Used to discount small samples. */
  mergeRateBasis: number;
  /** External PRs from authors who appear only once in the sample. A proxy for first-timers. */
  newcomerPRs: number;
  newcomerMergeRate: number | null;
  medianFirstResponseHours: number | null;
  medianMergeDays: number | null;
  /** Share of external PRs older than 7 days that never got a maintainer reply. */
  ghostedPct: number | null;
  /** Share of open external PRs that are older than 30 days. */
  staleOpenPct: number | null;
  confidence: Confidence;
}

export interface IssueRef {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  labels: string[];
}

export interface RepoRecord {
  fullName: string;
  url: string;
  description: string;
  primaryLanguage: string | null;
  languages: string[];
  topics: string[];
  stars: number;
  pushedAt: string;
  contributingUrl: string | null;
  aiPolicySnippet: string | null;
  goodFirstIssueCount: number;
  goodFirstIssues: IssueRef[];
  metrics: Metrics;
  welcomeScore: number;
  verdict: Verdict;
  strengths: string[];
  watchouts: string[];
}

export interface Dataset {
  generatedAt: string;
  isSample: boolean;
  repos: RepoRecord[];
}

export interface SkillProfile {
  /** Share of the user's public code per language, 0..1, sorted descending. */
  languages: { name: string; weight: number }[];
  topics: string[];
  /** Merged PRs the user has landed in repos they don't own. */
  mergedPRs: number;
  publicRepos: number;
}
