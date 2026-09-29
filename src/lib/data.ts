import type { Dataset } from "./types";

// Statically imported (not read with `fs` at request time) so every host that builds this app
// from git — Vercel, Netlify, a plain Node server — bundles the file with the app automatically.
// `predev` / `prebuild` (see package.json / scripts/ensure-data.mjs) guarantee this file exists
// before this module is compiled, even on a fresh clone where `npm run data` has never run.
import live from "../../data/repos.json";

export function getDataset(): Dataset {
  return live as Dataset;
}
