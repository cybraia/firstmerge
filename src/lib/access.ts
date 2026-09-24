import { matchRepo, type Match } from "./match";
import type { Dataset, RepoRecord, SkillProfile } from "./types";

export const FREE_REPO_COUNT = 2;
export const MEMBER_REPO_COUNT = 30;

export interface Viewer {
  signedIn: boolean;
  skills: SkillProfile | null;
}

/**
 * What a signed-out visitor may receive. Everything gated (issues, policy text,
 * contributing link, personalised reasons) is stripped here, on the server, so it
 * never reaches the browser. Do not "hide" these fields in the UI instead.
 */
export type FreeRepoView = Omit<RepoRecord, "goodFirstIssues" | "aiPolicySnippet" | "contributingUrl">;

export function toFreeView(repo: RepoRecord): FreeRepoView {
  const { goodFirstIssues: _issues, aiPolicySnippet: _policy, contributingUrl: _guide, ...rest } = repo;
  return rest;
}

export interface MemberRepoView {
  repo: RepoRecord;
  match: Match;
}

export type HomeData =
  | { tier: "free"; repos: FreeRepoView[]; lockedCount: number; lockedLanguages: string[] }
  | { tier: "member"; repos: MemberRepoView[]; languages: string[]; hasSkills: boolean };

const byWelcome = (a: RepoRecord, b: RepoRecord) => b.welcomeScore - a.welcomeScore;

export function getHome(ds: Dataset, viewer: Viewer, langFilter?: string): HomeData {
  const ranked = [...ds.repos].sort(byWelcome);

  if (!viewer.signedIn) {
    const shown = ranked.slice(0, FREE_REPO_COUNT);
    const locked = ranked.slice(FREE_REPO_COUNT, MEMBER_REPO_COUNT);
    return {
      tier: "free",
      repos: shown.map(toFreeView),
      lockedCount: locked.length,
      // Aggregate only: language names, never repo names.
      lockedLanguages: [...new Set(locked.map((r) => r.primaryLanguage).filter((l): l is string => !!l))].slice(0, 6),
    };
  }

  const scored = ranked
    .map((repo) => ({ repo, match: matchRepo(repo, viewer.skills) }))
    .sort((a, b) => b.match.fit - a.match.fit)
    .slice(0, MEMBER_REPO_COUNT);
  const languages = [...new Set(scored.map((s) => s.repo.primaryLanguage).filter((l): l is string => !!l))].sort();
  const repos = langFilter ? scored.filter((s) => s.repo.primaryLanguage === langFilter) : scored;
  return { tier: "member", repos, languages, hasSkills: !!viewer.skills?.languages.length };
}

export type DetailData =
  | { access: "none" }
  | { access: "free"; repo: FreeRepoView }
  | { access: "member"; repo: RepoRecord; match: Match };

export function getDetail(ds: Dataset, viewer: Viewer, fullName: string): DetailData {
  const repo = ds.repos.find((r) => r.fullName.toLowerCase() === fullName.toLowerCase());
  if (!repo) return { access: "none" };
  if (viewer.signedIn) return { access: "member", repo, match: matchRepo(repo, viewer.skills) };

  const freeSet = [...ds.repos].sort(byWelcome).slice(0, FREE_REPO_COUNT);
  return freeSet.some((r) => r.fullName === repo.fullName)
    ? { access: "free", repo: toFreeView(repo) }
    : { access: "none" };
}
