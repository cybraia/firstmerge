import type { RepoRecord } from "./types";

/**
 * Reserves up to `floor` repos per language (best-scoring first), then fills any remaining room
 * with the best-scoring repos overall, regardless of language, up to `extra` additional repos.
 *
 * A plain global top-N cut lets languages whose repos score slightly lower on average, or that
 * just have fewer candidates, disappear from the dataset entirely, even though a member who
 * writes that language would still rather see a shorter list than none.
 */
export function selectWithLanguageFloor(all: RepoRecord[], floor: number, extra: number): RepoRecord[] {
  const byLang = new Map<string, RepoRecord[]>();
  for (const r of all) {
    const lang = r.primaryLanguage ?? "Other";
    if (!byLang.has(lang)) byLang.set(lang, []);
    byLang.get(lang)!.push(r);
  }

  const selected: RepoRecord[] = [];
  const selectedNames = new Set<string>();
  for (const list of byLang.values()) {
    list.sort((a, b) => b.welcomeScore - a.welcomeScore);
    for (const r of list.slice(0, floor)) {
      selected.push(r);
      selectedNames.add(r.fullName);
    }
  }

  const rest = all.filter((r) => !selectedNames.has(r.fullName)).sort((a, b) => b.welcomeScore - a.welcomeScore);
  for (const r of rest.slice(0, extra)) selected.push(r);

  return selected.sort((a, b) => b.welcomeScore - a.welcomeScore);
}
