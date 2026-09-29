# firstmerge

A "good first issue" label doesn't tell you whether anyone will actually reply. firstmerge
looks at real pull-request history for active open-source repos and scores them on how they
actually treat outside contributors: how often their PRs get merged, how fast maintainers
reply, and how many just get ignored.

- **Signed out:** a free preview of the top 2 repos.
- **Signed in with GitHub:** the full ranked list, re-ranked for the languages and topics in
  your own public repos, plus open first issues, a realistic timeline, and each repo's
  contributing guide and AI-contribution policy.

## Run it locally

```bash
npm install
npm run data:sample      # generates 40 FICTIONAL sample repos, so it runs with no GitHub token
npm run dev              # http://localhost:3000
```

Copy `.env.example` to `.env.local` first. With `AUTH_DEV_LOGIN=1` set there, a "Dev login"
button appears locally so you can see the signed-in view without setting up GitHub OAuth.

### Optional: sign in with real GitHub

1. Create an OAuth app at github.com/settings/developers — homepage `http://localhost:3000`,
   callback `http://localhost:3000/api/auth/callback/github`.
2. Put its client ID and secret in `.env.local` as `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`.
3. Set `AUTH_SECRET` to a random value
   (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).

### Optional: pull real repo data instead of the sample set

```bash
# .env.local: GITHUB_TOKEN=...   (a fine-grained token, no extra permissions needed)
npm run data
```

This takes a few minutes and hits the GitHub API, so it's a separate step from `npm install`.
