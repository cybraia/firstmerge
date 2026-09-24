import fs from "node:fs";
import path from "node:path";
import type { Dataset } from "./types";

let cached: { file: string; mtimeMs: number; data: Dataset } | null = null;

/**
 * Live data from `npm run data` if present, otherwise the labelled sample set.
 * The cache is keyed on the file's modified time, so re-running the pipeline is picked up
 * without restarting the server.
 */
export function getDataset(): Dataset {
  const dir = path.join(process.cwd(), "data");
  for (const name of ["repos.json", "repos.sample.json"]) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) continue;
    const mtimeMs = fs.statSync(file).mtimeMs;
    if (cached && cached.file === file && cached.mtimeMs === mtimeMs) return cached.data;
    const data = JSON.parse(fs.readFileSync(file, "utf8")) as Dataset;
    cached = { file, mtimeMs, data };
    return data;
  }
  throw new Error("No dataset found. Run `npm run data:sample` or `npm run data`.");
}
