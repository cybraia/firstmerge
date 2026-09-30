import Link from "next/link";
import { auth } from "@/auth";
import { DevSignInButton, SignInButton } from "@/components/AuthButtons";
import { RepoCard, SkeletonCard } from "@/components/RepoCard";
import { FREE_REPO_COUNT, MEMBER_REPO_COUNT, getHome } from "@/lib/access";
import { getDataset } from "@/lib/data";

export default async function Home({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const [session, { lang }] = await Promise.all([auth(), searchParams]);
  const ds = getDataset();
  const viewer = { signedIn: !!session, skills: session?.skills ?? null };
  const home = getHome(ds, viewer, lang);

  const sampleNotice = ds.isSample ? (
    <p className="notice">
      Showing <strong>sample data</strong> (fictional repos) until the live pipeline has run. See the README:{" "}
      <code>npm run data</code>.
    </p>
  ) : null;

  if (home.tier === "free") {
    return (
      <>
        <section className="hero">
          <h1>Find open-source repos that will actually merge your first PR.</h1>
          <p>
            A &quot;good first issue&quot; label tells you nothing about whether maintainers reply. We measure real
            outside-contributor outcomes: merge rate, time to first reply, and how many PRs get ignored.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <SignInButton label={`Unlock ${MEMBER_REPO_COUNT} repos matched to me`} />
            <DevSignInButton />
          </div>
        </section>
        {sampleNotice}

        <div className="section-title">
          <h2>Free preview</h2>
          <small>
            {FREE_REPO_COUNT} of {FREE_REPO_COUNT + home.lockedCount} shown
          </small>
        </div>
        <div className="grid">
          {home.repos.map((r) => (
            <RepoCard key={r.fullName} repo={r} />
          ))}
        </div>

        <div className="locked-wrap">
          <div className="grid" aria-hidden="true">
            {Array.from({ length: 6 }, (_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
          <div className="paywall">
            <div className="paywall-box">
              <p className="eyebrow" style={{ color: "inherit", opacity: 0.7 }}>
                Unlock
              </p>
              <h2>{home.lockedCount} more repos, ranked for your stack</h2>
              <ul>
                <li>Repos re-ranked by the languages and topics in your own GitHub</li>
                <li>Open first issues you can start on today</li>
                <li>What to expect: reply time, merge time, ghosting rate</li>
                <li>Each repo&apos;s contributing guide and AI-contribution policy</li>
              </ul>
              <SignInButton label="Continue with GitHub" />
              {home.lockedLanguages.length > 0 ? <small>Covers {home.lockedLanguages.join(", ")} and more.</small> : null}
              <small>
                We read your public repositories once to learn your stack. We don&apos;t store your GitHub token and we
                never post anything.
              </small>
            </div>
          </div>
        </div>

        <Methodology />
      </>
    );
  }

  const { repos, languages, hasSkills } = home;
  const topLangs = viewer.skills?.languages.slice(0, 4) ?? [];
  return (
    <>
      <section className="hero">
        <p className="eyebrow">Personalised for you</p>
        <h1>Your top {MEMBER_REPO_COUNT} repos</h1>
        <p>
          {hasSkills
            ? "Ranked by how welcoming each project is and how well it matches what you already write."
            : "We couldn't read any public code on your account, so this list is ranked by welcome score only."}
        </p>
        {topLangs.length > 0 ? (
          <div className="tags">
            {topLangs.map((l) => (
              <span className="tag" key={l.name}>
                {l.name} {Math.round(l.weight * 100)}%
              </span>
            ))}
            {viewer.skills && viewer.skills.mergedPRs < 3 ? <span className="tag">First-time contributor</span> : null}
          </div>
        ) : null}
      </section>
      {sampleNotice}

      <nav className="chips" aria-label="Filter by language">
        <Link href="/" className={`chip${lang ? "" : " on"}`}>
          All
        </Link>
        {languages.map((l) => (
          <Link key={l} href={`/?lang=${encodeURIComponent(l)}`} className={`chip${lang === l ? " on" : ""}`}>
            {l}
          </Link>
        ))}
      </nav>

      <div className="grid" style={{ marginTop: 18 }}>
        {repos.map(({ repo, match }) => (
          <RepoCard key={repo.fullName} repo={repo} match={match} />
        ))}
      </div>
      {repos.length === 0 ? <p className="notice">No repos in that language yet.</p> : null}
      <Methodology />
    </>
  );
}

function Methodology() {
  return (
    <section className="method">
      <p className="eyebrow">Methodology</p>
      <h2>How we score</h2>
      <p>
        For each repo we sample the last 100 pull requests (up to 180 days) and look only at outside contributors. The
        welcome score blends merge rate (35), speed of the first maintainer reply (25), share of PRs that got any reply
        (15), open good-first-issues (10), volume of outside PRs (10) and a contributing guide (5). &quot;First-timer&quot;
        rates are estimated from authors who appear once in the sample. Small samples are flagged.
      </p>
    </section>
  );
}
