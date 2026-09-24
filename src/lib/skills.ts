import type { SkillProfile } from "./types";

const GITHUB_GRAPHQL = "https://api.github.com/graphql";

interface ReposResponse {
  data?: {
    viewer: {
      repositories: {
        totalCount: number;
        nodes: {
          languages: { edges: { size: number; node: { name: string } }[] };
          repositoryTopics: { nodes: { topic: { name: string } }[] };
        }[];
      };
    };
    merged: { issueCount: number };
  };
}

/**
 * Read once at sign-in, using the `read:user` scope. Only public data is used, and the
 * OAuth token is not stored: we keep the small derived profile in the session cookie.
 */
export async function fetchSkills(accessToken: string, login: string): Promise<SkillProfile | null> {
  const query = `
    query($mergedQuery: String!) {
      viewer {
        repositories(first: 100, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC,
                     orderBy: { field: PUSHED_AT, direction: DESC }) {
          totalCount
          nodes {
            languages(first: 6, orderBy: { field: SIZE, direction: DESC }) { edges { size node { name } } }
            repositoryTopics(first: 8) { nodes { topic { name } } }
          }
        }
      }
      merged: search(query: $mergedQuery, type: ISSUE, first: 1) { issueCount }
    }`;

  const res = await fetch(GITHUB_GRAPHQL, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      variables: { mergedQuery: `author:${login} is:pr is:merged -user:${login}` },
    }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as ReposResponse;
  if (!body.data) return null;

  const bytes = new Map<string, number>();
  const topicCount = new Map<string, number>();
  for (const repo of body.data.viewer.repositories.nodes) {
    for (const edge of repo.languages.edges) {
      bytes.set(edge.node.name, (bytes.get(edge.node.name) ?? 0) + edge.size);
    }
    for (const t of repo.repositoryTopics.nodes) {
      topicCount.set(t.topic.name, (topicCount.get(t.topic.name) ?? 0) + 1);
    }
  }
  const total = [...bytes.values()].reduce((a, b) => a + b, 0);
  const languages = [...bytes.entries()]
    .map(([name, size]) => ({ name, weight: total ? size / total : 0 }))
    .filter((l) => l.weight >= 0.02)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 8)
    .map((l) => ({ name: l.name, weight: Math.round(l.weight * 1000) / 1000 }));

  return {
    languages,
    topics: [...topicCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t]) => t),
    mergedPRs: body.data.merged.issueCount,
    publicRepos: body.data.viewer.repositories.totalCount,
  };
}

/** Fixed profile for the local dev login. */
export const DEV_SKILLS: SkillProfile = {
  languages: [
    { name: "TypeScript", weight: 0.55 },
    { name: "Python", weight: 0.3 },
    { name: "JavaScript", weight: 0.15 },
  ],
  topics: ["web", "cli", "react"],
  mergedPRs: 0,
  publicRepos: 6,
};
