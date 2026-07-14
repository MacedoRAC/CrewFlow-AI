/**
 * repo.mts — shared helpers for the repository analysis scripts.
 *
 * Keeps every discovery script small and avoids duplicated filesystem logic.
 * All scripts only ever read the repository; they never modify source code.
 */
import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join, relative, extname, dirname } from "node:path";

export const ROOT = process.cwd();

const DEFAULT_IGNORE = new Set([
  ".git",
  "node_modules",
  "vendor",
  "dist",
  "build",
  ".ai",
  "coverage",
  ".next",
  "public",
  "storage",
  "bootstrap",
  "tests",
  "test",
]);

/** Recursively list files under `dir`, skipping heavy/ignored paths. */
export function walk(dir: string, ignore: Set<string> = DEFAULT_IGNORE): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (ignore.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full, { throwIfNoEntry: false });
    if (!st) continue;
    if (st.isDirectory()) {
      out.push(...walk(full, ignore));
    } else {
      out.push(full);
    }
  }
  return out;
}

/** Find files whose path matches every provided substring/extension. */
export function findFiles(
  predicate: (p: string) => boolean,
  base = ROOT,
  ignore: Set<string> = DEFAULT_IGNORE
): string[] {
  return walk(base, ignore).filter(predicate).map((p) => relative(ROOT, p));
}

export function readFile(rel: string): string | null {
  const p = join(ROOT, rel);
  if (!existsSync(p)) return null;
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

export function safeJson<T = unknown>(rel: string): T | null {
  const raw = readFile(rel);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function ext(p: string): string {
  return extname(p).toLowerCase();
}

export function dirOf(rel: string): string {
  return relative(ROOT, dirname(join(ROOT, rel)));
}

/** Heuristic "importance" ranking: source dirs first, small configs included. */
export function importantDirectories(): string[] {
  const candidates = [
    "app",
    "src",
    "lib",
    "services",
    "resources",
    "frontend",
    "components",
  ];
  return candidates.filter((c) => existsSync(join(ROOT, c)));
}

export function emit(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2));
}

export function exists(rel: string): boolean {
  return existsSync(join(ROOT, rel));
}
