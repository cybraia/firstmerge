import type { RepoRecord, SkillProfile } from "./types";

export interface Match {
  /** 0-100, blends how welcoming the repo is with how well it fits this user. */
  fit: number;
  reasons: string[];
}

export function matchRepo(repo: RepoRecord, skills: SkillProfile | null): Match {
  if (!skills || skills.languages.length === 0) {
    return { fit: repo.welcomeScore, reasons: [] };
  }

  const weights = new Map(skills.languages.map((l) => [l.name, l.weight]));
  const top = skills.languages[0].weight;
  const primary = repo.primaryLanguage ? (weights.get(repo.primaryLanguage) ?? 0) : 0;
  const secondary = repo.languages
    .filter((l) => l !== repo.primaryLanguage)
    .reduce((sum, l) => sum + (weights.get(l) ?? 0), 0);
  const langFit = Math.min(1, (primary + 0.4 * secondary) / top);

  const userTopics = new Set(skills.topics);
  const sharedTopics = repo.topics.filter((t) => userTopics.has(t));
  const topicFit = Math.min(1, sharedTopics.length / 2);

  const beginner = skills.mergedPRs < 3;
  const beginnerFit = beginner ? Math.min(1, repo.goodFirstIssueCount / 8) : 0;

  // Beginners weight easy issues; experienced contributors weight the welcome score instead.
  const fit = Math.round(
    100 *
      (0.35 * (repo.welcomeScore / 100) +
        0.4 * langFit +
        0.1 * topicFit +
        (beginner ? 0.15 * beginnerFit : 0.15 * (repo.welcomeScore / 100))),
  );

  const reasons: string[] = [];
  if (primary > 0 && repo.primaryLanguage) {
    reasons.push(
      `You write ${repo.primaryLanguage}: ${Math.round(primary * 100)}% of your public code.`,
    );
  } else if (langFit > 0) {
    reasons.push("Uses languages you already work in.");
  } else {
    reasons.push("Outside your usual languages, so this one is a stretch.");
  }
  if (sharedTopics.length) reasons.push(`Shares your interests: ${sharedTopics.slice(0, 3).join(", ")}.`);
  if (beginner && repo.goodFirstIssueCount > 0) {
    reasons.push(`${repo.goodFirstIssueCount} beginner-friendly issues are open, which suits a first contribution.`);
  }
  return { fit, reasons };
}
