/**
 * resolve-model.mjs
 *
 * Reads `.ai/config.yml` and prints the model assigned to a given agent.
 * Output is `model=<value>` so it can be consumed via `$GITHUB_OUTPUT`.
 */
import { readFileSync } from "node:fs";

const agent = process.argv[2] || "planner";

function parseYaml(text) {
  // Minimal YAML parser sufficient for the flat `models:` mapping.
  const models = {};
  let inModels = false;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s*#.*$/, "");
    if (/^models\s*:/i.test(line)) {
      inModels = true;
      continue;
    }
    if (inModels) {
      const m = line.match(/^\s*([a-zA-Z0-9_-]+)\s*:\s*(.+?)\s*$/);
      if (m) models[m[1]] = m[2];
      if (line.trim() === "" || !/^\s+/.test(line)) inModels = false;
    }
  }
  return models;
}

let model = "default";
try {
  const cfg = readFileSync(".ai/config.yml", "utf8");
  const models = parseYaml(cfg);
  model = models[agent] || models.default || "default";
} catch {
  model = "default";
}
console.log(`model=${model}`);
