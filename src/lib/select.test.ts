import assert from "node:assert/strict";
import { test } from "node:test";
import { selectWithLanguageFloor } from "./select";
import type { RepoRecord } from "./types";

function fakeRepo(name: string, lang: string, score: number): RepoRecord {
  return {
    fullName: name,
    url: `https://github.com/${name}`,
    description: "",
    primaryLanguage: lang,
    languages: [lang],
    topics: [],
    stars: 100,
    pushedAt: new Date().toISOString(),
    contributingUrl: null,
    aiPolicySnippet: null,
    goodFirstIssueCount: 0,
    goodFirstIssues: [],
    metrics: {
      windowDays: 90, sampledPRs: 0, externalPRs: 0, externalAuthors: 0,
      externalMergeRate: null, mergeRateBasis: 0, newcomerPRs: 0, newcomerMergeRate: null,
      medianFirstResponseHours: null, medianMergeDays: null, ghostedPct: null, staleOpenPct: null,
      confidence: "high",
    },
    welcomeScore: score,
    verdict: "welcoming",
    strengths: [],
    watchouts: [],
  };
}

test("a thin language is not squeezed out by a popular one with higher scores", () => {
  // Real pattern this fixes: 12 C++ repos in the low-mid 80s outscoring the handful of Python
  // repos found, so a plain top-N cut showed a Python user almost nothing.
  const cpp = Array.from({ length: 12 }, (_, i) => fakeRepo(`org/cpp-${i}`, "C++", 90 - i));
  const python = Array.from({ length: 3 }, (_, i) => fakeRepo(`org/py-${i}`, "Python", 60 - i));
  const selected = selectWithLanguageFloor([...cpp, ...python], 15, 0);
  assert.equal(selected.filter((r) => r.primaryLanguage === "Python").length, 3);
  assert.equal(selected.filter((r) => r.primaryLanguage === "C++").length, 12);
});

test("the floor keeps only the best-scoring repos per language, not all of them", () => {
  const many = Array.from({ length: 30 }, (_, i) => fakeRepo(`org/repo-${i}`, "Go", 100 - i));
  const selected = selectWithLanguageFloor(many, 15, 0);
  assert.equal(selected.length, 15);
  assert.deepEqual(
    selected.map((r) => r.fullName),
    many.slice(0, 15).map((r) => r.fullName),
  );
});

test("extra slots fill the rest by score alone, across languages, without duplicating a floor pick", () => {
  const a = [fakeRepo("org/a1", "Go", 90), fakeRepo("org/a2", "Go", 40)];
  const b = [fakeRepo("org/b1", "Rust", 85), fakeRepo("org/b2", "Rust", 30)];
  // floor 1 keeps org/a1 and org/b1; extra 1 should add the next-best overall (org/b2 at 30 > org/a2 at 40? no)
  const selected = selectWithLanguageFloor([...a, ...b], 1, 1);
  const names = selected.map((r) => r.fullName);
  assert.deepEqual(new Set(names), new Set(["org/a1", "org/b1", "org/a2"]));
});

test("output is sorted by score and an empty input gives an empty list", () => {
  const repos = [fakeRepo("org/low", "Go", 10), fakeRepo("org/high", "Go", 99)];
  const selected = selectWithLanguageFloor(repos, 10, 10);
  assert.deepEqual(selected.map((r) => r.fullName), ["org/high", "org/low"]);
  assert.deepEqual(selectWithLanguageFloor([], 10, 10), []);
});
