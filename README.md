# firstmerge

Finds open-source repos that actually merge pull requests from outside contributors, and ranks
them for the signed-in user's own stack.

- **Signed out:** the top 2 repos with their headline numbers.
- **Signed in with GitHub:** the top 30, re-ranked by fit with the user's languages and topics,
  plus open first issues, a realistic timeline, contributing and AI-policy notes.

## Run it locally

```bash
npm install
npm run data:sample      # 40 FICTIONAL repos, so the app runs with no GitHub token
npm run dev              # http://localhost:3000
```

`.env.local` (copy from `.env.example`). With `AUTH_DEV_LOGIN=1` a "Dev login" button appears
locally so you can test the signed-in view without an OAuth app. It is ignored in production.

## Real GitHub sign-in

1. https://github.com/settings/developers -> **New OAuth App**
2. Homepage `http://localhost:3000`, callback `http://localhost:3000/api/auth/callback/github`
3. Put the client ID and secret in `.env.local` as `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`.
4. Set `AUTH_SECRET` (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).

Only the `read:user` scope is requested. At sign-in we read the user's **public** repos once,
derive a small skill profile (languages, topics, merged-PR count) and keep only that in the
encrypted session cookie. The OAuth token itself is not stored.

## Live data

```bash
# .env.local: GITHUB_TOKEN=...   (fine-grained token, no extra permissions)
npm run data             # writes data/repos.json (used automatically over the sample file)
```

The pipeline (`scripts/build-data.ts`) searches active repos with open `good first issue`
tickets across 12 languages, pulls each repo's recent PRs (up to 300, or 180 days), and keeps
repos with enough outside-PR signal. It prints the GraphQL points it used, and sleeps when the
hourly budget runs low. Results are cached per repo in `data/.pipeline-cache.json` and
`data/repos.json` is rewritten every 25 repos, so an interrupted run resumes where it stopped
(`FRESH=1 npm run data` ignores the cache). Bump `SCORING_VERSION` in the script whenever the
scoring logic changes.

## How the paywall works

Gating is enforced on the server in `src/lib/access.ts`. Fields that are locked (issues,
policy text, contributing link, other repos' names) are stripped before rendering, so they are
never in the HTML a signed-out visitor receives. `npm test` asserts this. Do not replace it
with CSS blur or client-side hiding.

## Scoring (`src/lib/metrics.ts`)

Outside contributors = PR authors whose association is NONE, FIRST_TIME_CONTRIBUTOR,
FIRST_TIMER or CONTRIBUTOR, **minus** anyone with 3+ PRs in the sample (that is the team:
GitHub labels staff with private org membership as CONTRIBUTOR). Bots, bot-like accounts
(`*bot`, `*machine`, `danger*`, ...) and drafts are excluded, and a reply within 60 seconds of
opening is treated as automation.

| Component | Weight |
|---|---|
| Merge rate of outside PRs (shrunk toward 50% for small samples) | 35 |
| Median time to first maintainer reply (full marks at 24h, zero at 14 days) | 25 |
| Share of outside PRs that got any reply | 15 |
| Open, unassigned good-first-issues (cap 10) | 10 |
| Volume of outside PRs in the window (cap 30) | 10 |
| Has a contributing guide | 5 |

Merge rate = merged / (settled + PRs still open, unanswered, for 14+ days). Letting outside PRs
rot open therefore counts as a miss instead of being invisible.

Known limits, all surfaced honestly in the UI:

- At most 300 recent PRs and 180 days. Repos so busy that 300 PRs span under 14 days are
  skipped as unmeasurable. Repos with fewer than 8 distinct outside contributors are dropped.
- GitHub's FIRST_TIME_CONTRIBUTOR label changes once a PR is merged, so "first-timer" rates are
  **estimated** from authors who appear once in the sample.
- Rates need at least 5 settled PRs, otherwise they show `n/a`. Repos with a low-confidence
  sample are dropped entirely.
- A silent close counts as ghosted. Some maintainers close duplicates without comment.

## Deploying

`data/repos.json` is git-ignored. Either commit it after `npm run data`, or refresh it on a
schedule (GitHub Action) and redeploy. Set `AUTH_SECRET`, `AUTH_GITHUB_ID`,
`AUTH_GITHUB_SECRET` and `AUTH_URL` on the host, and add the production callback URL to the
OAuth app.

## Layout

```
src/lib/metrics.ts   PR metrics, welcome score, generated strengths/watch-outs
src/lib/match.ts     per-user fit score and reasons
src/lib/access.ts    free vs member views (the paywall)
src/lib/skills.ts    reads the user's public GitHub profile at sign-in
src/auth.ts          Auth.js config (GitHub + dev-only login)
scripts/             build-data.ts (live), make-sample.ts (fictional)
```

## Troubleshooting

**"Server error - There is a problem with the server configuration" on GitHub sign-in.**
Auth.js shows this for any OAuth misconfiguration. The dev server prints the specific cause
(`[auth] ...`). The usual one: `AUTH_GITHUB_SECRET` must be the 40-character *client secret*
(OAuth app -> Client secrets -> Generate), not the client ID. Restart `npm run dev` after
editing `.env.local`, because env files are read at startup. Also check the OAuth app's
callback URL is exactly `http://localhost:3000/api/auth/callback/github`.
