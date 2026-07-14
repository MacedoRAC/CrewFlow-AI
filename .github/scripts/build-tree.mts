/**
 * build-tree.mts — produce a compact directory tree of the source layout.
 * Excludes vendored and generated folders to keep the output token-friendly.
 */
import { walk, relative, ROOT, emit } from "./repo.mts";

function buildTree(paths: string[]): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const p of paths) {
    const parts = p.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (typeof node[part] !== "object" || node[part] === null) node[part] = {};
      node = node[part] as Record<string, unknown>;
    }
    node[parts[parts.length - 1]] = null;
  }
  return root;
}

const files = walk(ROOT, new Set([
  ".git", "node_modules", "vendor", "dist", "build", ".ai",
  "coverage", ".next", "public", "storage", "bootstrap", "tests", "test",
  ".github",
]));

emit({
  tree: buildTree(files.map((f) => relative(ROOT, f))),
  fileCount: files.length,
});
