// Runs before `dev`/`build`. `data/repos.json` is imported directly by src/lib/data.ts, so it
// must exist at build time on every host (a fresh clone, CI, Vercel). If nobody has run the
// live pipeline yet, seed it from the sample data so the app still builds and runs.
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "data");
const target = path.join(dir, "repos.json");
const sample = path.join(dir, "repos.sample.json");

if (!fs.existsSync(target)) {
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(sample, target);
  console.log("data/repos.json did not exist; seeded it from repos.sample.json. Run `npm run data` for live data.");
}
