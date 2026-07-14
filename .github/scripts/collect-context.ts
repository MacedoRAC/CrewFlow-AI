/**
 * collect-context.ts — canonical repository context aggregator.
 *
 * Runs each discovery script through `tsx` and merges their JSON output into a
 * single compact `.ai/context/latest.json` consumed by the agents. Running the
 * discovery scripts as separate processes keeps each one simple and lets us
 * isolate failures (a broken script never takes down the whole context build).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { existsSync } from "node:fs";

const SCRIPTS = [
  "build-tree.mts",
  "discover-files.mts",
  "discover-models.mts",
  "discover-services.mts",
  "discover-routes.mts",
  "discover-tests.mts",
  "dependency-map.mts",
  "classify-issue.mts",
  "generate-summary.mts",
] as const;

function runScript(name: string): Record<string, unknown> {
  try {
    const out = execFileSync("npx", ["tsx", join(".github", "scripts", name)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      env: process.env,
    });
    return JSON.parse(out || "{}");
  } catch {
    return {};
  }
}

function gitLog(file: string): string[] {
  try {
    return execFileSync("git", ["log", "--oneline", "-10", "--", file], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
}

function main() {
  const issueNumber = process.env.AI_ISSUE_NUMBER;
  const prNumber = process.env.AI_PR_NUMBER;

  console.log(`[collect-context] issue=${issueNumber} pr=${prNumber}`);

  const results: Record<string, unknown> = {};
  for (const s of SCRIPTS) {
    const key = s.replace(/\.mts$/, "").replace(/[-]/g, "_");
    results[key] = runScript(s);
  }

  const important = ((results.discover_files as any)?.important || []) as string[];
  const recentHistory = important.slice(0, 30).map((f) => ({
    file: f,
    commits: gitLog(f),
  }));

  const context = {
    generatedAt: new Date().toISOString(),
    issueNumber,
    prNumber,
    ...results,
    recentHistory,
  };

  const outDir = join(process.cwd(), ".ai", "context");
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, "latest.json");
  writeFileSync(outFile, JSON.stringify(context, null, 2));
  console.log(`[collect-context] wrote ${existsSync(outFile) ? outFile : outFile}`);
}

main();
