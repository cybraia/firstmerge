import Link from "next/link";
import type { Match } from "@/lib/match";
import { fmtHours } from "@/lib/metrics";
import type { FreeRepoView } from "@/lib/access";

const pct = (n: number | null) => (n === null ? "n/a" : `${Math.round(n * 100)}%`);

export function VerdictBadge({ verdict }: { verdict: FreeRepoView["verdict"] }) {
  return <span className={`verdict ${verdict}`}>{verdict}</span>;
}

export function MetricTiles({ repo, big = false }: { repo: FreeRepoView; big?: boolean }) {
  const m = repo.metrics;
  return (
    <div className={`metrics${big ? " big" : ""}`}>
      <div className="metric">
        <b>{pct(m.externalMergeRate)}</b>
        <span>outside PRs merged</span>
      </div>
      <div className="metric">
        <b>{m.medianFirstResponseHours === null ? "n/a" : fmtHours(m.medianFirstResponseHours)}</b>
        <span>median first reply</span>
      </div>
      <div className="metric">
        <b>{m.medianMergeDays === null ? "n/a" : `${Math.round(m.medianMergeDays)}d`}</b>
        <span>median time to merge</span>
      </div>
      {big ? (
        <div className="metric">
          <b>{pct(m.ghostedPct)}</b>
          <span>never got a reply</span>
        </div>
      ) : null}
    </div>
  );
}

export function RepoCard({ repo, match }: { repo: FreeRepoView; match?: Match }) {
  const score = match ? match.fit : repo.welcomeScore;
  return (
    <article className="card">
      <div className="card-top">
        <div>
          <h3>
            <Link href={`/repo/${repo.fullName}`}>{repo.fullName}</Link>
          </h3>
          <div className="tags" style={{ marginTop: 8 }}>
            {repo.primaryLanguage ? <span className="tag">{repo.primaryLanguage}</span> : null}
            <span className="tag">{repo.stars.toLocaleString()} stars</span>
            <span className="tag">{repo.goodFirstIssueCount} good first issues</span>
          </div>
        </div>
        <div className="score">
          <b>{score}</b>
          <small>{match ? "fit" : "welcome"}</small>
          <div>
            <VerdictBadge verdict={repo.verdict} />
          </div>
        </div>
      </div>
      {repo.description ? <p className="desc">{repo.description}</p> : null}
      <MetricTiles repo={repo} />
      {match && match.reasons.length > 0 ? (
        <div className="reasons">
          {match.reasons.map((r) => (
            <p key={r}>{r}</p>
          ))}
        </div>
      ) : null}
      {repo.strengths.length > 0 ? (
        <ul className="plain good">
          {repo.strengths.slice(0, 1).map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      ) : null}
      {repo.watchouts.length > 0 ? (
        <ul className="plain warn">
          {repo.watchouts.slice(0, 1).map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

/** Purely decorative placeholders: no repo data is ever rendered inside them. */
export function SkeletonCard() {
  return (
    <div className="card skeleton" aria-hidden="true">
      <div className="bar w70" />
      <div className="bar w40" />
      <div className="bar w90" />
      <div className="block" />
      <div className="bar w70" />
    </div>
  );
}
