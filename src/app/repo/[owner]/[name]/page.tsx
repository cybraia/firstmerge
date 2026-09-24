import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { SignInButton } from "@/components/AuthButtons";
import { MetricTiles, VerdictBadge } from "@/components/RepoCard";
import { FREE_REPO_COUNT, getDetail } from "@/lib/access";
import { getDataset } from "@/lib/data";
import { fmtHours } from "@/lib/metrics";

export default async function RepoPage({ params }: { params: Promise<{ owner: string; name: string }> }) {
  const [session, { owner, name }] = await Promise.all([auth(), params]);
  const viewer = { signedIn: !!session, skills: session?.skills ?? null };
  const detail = getDetail(getDataset(), viewer, `${decodeURIComponent(owner)}/${decodeURIComponent(name)}`);

  if (detail.access === "none") {
    // Signed-out visitors get the same answer for "locked" and "doesn't exist".
    if (!viewer.signedIn) {
      return (
        <div className="panel" style={{ marginTop: 32 }}>
          <h1 style={{ fontSize: "1.4rem", marginBottom: 8 }}>Sign in to see this repo</h1>
          <p className="locked-note">
            Only the top {FREE_REPO_COUNT} repos are open to visitors. Sign in to see the full list.
          </p>
          <SignInButton />
        </div>
      );
    }
    notFound();
  }

  const repo = detail.repo;
  const m = repo.metrics;
  const member = detail.access === "member" ? detail : null;

  return (
    <>
      <Link href="/" className="back">
        ← All repos
      </Link>
      <div className="detail-head">
        <div>
          <h1>{repo.fullName}</h1>
          <div className="tags" style={{ marginTop: 10 }}>
            {repo.primaryLanguage ? <span className="tag">{repo.primaryLanguage}</span> : null}
            {repo.topics.map((t) => (
              <span className="tag" key={t}>
                {t}
              </span>
            ))}
            <span className="tag">{repo.stars.toLocaleString()} stars</span>
          </div>
          {repo.description ? <p className="desc" style={{ marginTop: 10 }}>{repo.description}</p> : null}
          <p style={{ marginTop: 10 }}>
            <a href={repo.url} target="_blank" rel="noreferrer">
              Open on GitHub ↗
            </a>
          </p>
        </div>
        <div className="score">
          <b style={{ fontSize: "2.2rem" }}>{member ? member.match.fit : repo.welcomeScore}</b>
          <small>{member ? "fit for you" : "welcome score"}</small>
          <div>
            <VerdictBadge verdict={repo.verdict} />
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>How outside contributors are treated</h2>
        <MetricTiles repo={repo} big />
        <p className="fit" style={{ marginTop: 10 }}>
          Based on {m.externalPRs} outside PRs from {m.externalAuthors} different contributors over the last {m.windowDays}
          days (confidence: {m.confidence}). Repeat contributors and bot accounts are excluded. Welcome score{" "}
          {repo.welcomeScore}/100.
        </p>
      </div>

      <div className="two">
        <div className="panel">
          <h2>Working in your favour</h2>
          {repo.strengths.length ? (
            <ul className="plain good">
              {repo.strengths.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          ) : (
            <p className="locked-note">Nothing stands out.</p>
          )}
        </div>
        <div className="panel">
          <h2>Watch out for</h2>
          {repo.watchouts.length ? (
            <ul className="plain warn">
              {repo.watchouts.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          ) : (
            <p className="locked-note">No red flags in the data.</p>
          )}
        </div>
      </div>

      {member ? (
        <>
          <div className="panel">
            <h2>Why it fits you</h2>
            {member.match.reasons.length ? (
              <div className="reasons">
                {member.match.reasons.map((r) => (
                  <p key={r}>{r}</p>
                ))}
              </div>
            ) : (
              <p className="locked-note">We couldn&apos;t read public code on your account, so this is the general score.</p>
            )}
          </div>

          <div className="panel">
            <h2>Realistic timeline</h2>
            <p style={{ margin: 0 }}>
              {m.medianFirstResponseHours !== null
                ? `Expect a first reply in about ${fmtHours(m.medianFirstResponseHours)}`
                : "Reply time is unclear from the data"}
              {m.medianMergeDays !== null ? ` and a merge in roughly ${Math.round(m.medianMergeDays)} days` : ""}. Medians:
              half of PRs are faster, half are slower.
            </p>
          </div>

          <div className="panel">
            <h2>Before you open a PR</h2>
            <ul className="plain">
              <li>
                {member.repo.contributingUrl ? (
                  <a href={member.repo.contributingUrl} target="_blank" rel="noreferrer">
                    Read the contributing guide ↗
                  </a>
                ) : (
                  "No contributing guide found. Check the README and recent merged PRs for conventions."
                )}
              </li>
              <li>Comment on the issue first so someone else doesn&apos;t duplicate the work.</li>
              <li>Keep it small and explain your change in your own words. You may be asked about it.</li>
              {member.repo.aiPolicySnippet ? <li>AI policy mentioned: “{member.repo.aiPolicySnippet}”</li> : null}
            </ul>
          </div>

          <div className="panel">
            <h2>Open first issues</h2>
            {member.repo.goodFirstIssues.length ? (
              member.repo.goodFirstIssues.map((i) => (
                <a className="issue" key={i.number} href={i.url} target="_blank" rel="noreferrer">
                  #{i.number} {i.title}
                </a>
              ))
            ) : (
              <p className="locked-note">No unassigned good-first-issue tickets right now.</p>
            )}
          </div>
        </>
      ) : (
        <div className="panel">
          <h2>Unlock the rest</h2>
          <p className="locked-note">
            Sign in to see this repo&apos;s open first issues, its contributing and AI-policy notes, how well it fits your
            stack, and 28 more repos.
          </p>
          <SignInButton />
        </div>
      )}
    </>
  );
}
