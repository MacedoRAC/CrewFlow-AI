/**
 * update-memory.mts — after a successful merge, fold durable knowledge from the
 * merged planning documents into the AI memory files so future agents avoid
 * repeating rejected ideas and reuse established patterns.
 *
 * This script is intentionally conservative: it appends a dated section to the
 * memory files rather than rewriting them, and never deletes human-written notes.
 */
import { readdirSync, readFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const MEMORY_DIR = join(process.cwd(), ".ai", "memory");
const PLANS_DIR = join(process.cwd(), ".ai", "plans");
const ARCH_DIR = join(process.cwd(), ".ai", "architecture");

mkdirSync(MEMORY_DIR, { recursive: true });
mkdirSync(ARCH_DIR, { recursive: true });

const STUB_FILES = [
  "architectural-decisions.md",
  "coding-decisions.md",
  "technical-debt.md",
  "known-limitations.md",
];

for (const f of STUB_FILES) {
  const p = join(MEMORY_DIR, f);
  if (!existsSync(p)) appendFileSync(p, `# ${f.replace(/\.md$/, "").replace(/-/g, " ")}\n\n`);
}

function listPlans(): string[] {
  if (!existsSync(PLANS_DIR)) return [];
  return readdirSync(PLANS_DIR).filter((f) => /^issue-\d+\.md$/.test(f));
}

function main() {
  const plans = listPlans();
  const stamp = new Date().toISOString().slice(0, 10);
  const summaryFile = join(ARCH_DIR, "plan-index.md");
  const lines = [`\n## Merged ${stamp}\n`];
  for (const p of plans) {
    const content = readFileSync(join(PLANS_DIR, p), "utf8");
    const title = (content.match(/^#\s*(.+)$/m) || [_, p])[1];
    lines.push(`- ${p}: ${title}`);
    appendFileSync(join(MEMORY_DIR, "architectural-decisions.md"), `\n- ${stamp}: merged plan ${p} (${title}).\n`);
  }
  appendFileSync(summaryFile, lines.join("\n") + "\n");
  console.log(`[update-memory] indexed ${plans.length} plan(s) into ${summaryFile}`);
}

main();
