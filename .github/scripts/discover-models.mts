/**
 * discover-models.mts — find Eloquent/Laravel models (and generic data models)
 * and extract their class name plus declared properties/fillable fields.
 */
import { findFiles, readFile, emit } from "./repo.mts";

const candidates = findFiles(
  (p) =>
    /\.(php|ts|tsx)$/.test(p) &&
    /(Models?\b|entities?\/|\/models\/)/i.test(p) &&
    !/(test|spec)/i.test(p)
);

interface ModelInfo {
  file: string;
  class: string | null;
  table: string | null;
  fillable: string[];
}

function parseClass(file: string, content: string): string | null {
  const m = content.match(/(?:class|interface|type)\s+(\w+)/);
  return m ? m[1] : null;
}

function parseFillable(content: string): string[] {
  const m = content.match(/protected\s+\$fillable\s*=\s*\[(.*?)\]/s);
  if (!m) return [];
  return (m[1].match(/'([^']+)'|"([^"]+)"/g) || []).map((s) => s.replace(/['"]/g, ""));
}

function parseTable(content: string): string | null {
  const m = content.match(/\$table\s*=\s*['"]([^'"]+)['"]/);
  return m ? m[1] : null;
}

const models: ModelInfo[] = candidates.slice(0, 80).map((file) => {
  const content = readFile(file) || "";
  return {
    file,
    class: parseClass(file, content),
    table: parseTable(content),
    fillable: parseFillable(content),
  };
});

emit({ models, count: models.length });
