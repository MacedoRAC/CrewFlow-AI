/**
 * discover-files.mts — classify the repository's important source files by type
 * so the agent only receives a structural overview rather than full contents.
 */
import { findFiles, ext, emit } from "./repo.mts";

const important = findFiles((p) => {
  if (!/\.(php|ts|tsx|js|jsx|vue|py|go|rb|java)$/.test(p)) return false;
  if (/(test|spec)\./i.test(p)) return false;
  return (
    p.startsWith("app/") ||
    p.startsWith("src/") ||
    p.startsWith("lib/") ||
    p.startsWith("resources/") ||
    p.startsWith("frontend/") ||
    p.startsWith("components/") ||
    p.startsWith("services/")
  );
});

const byType: Record<string, number> = {};
for (const f of important) byType[ext(f)] = (byType[ext(f)] || 0) + 1;

emit({ important, byType, count: important.length });
