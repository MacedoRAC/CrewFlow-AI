/**
 * resolve-model.mjs
 *
 * Reads `.ai/config.yml` and prints the model assigned to a given agent, in the
 * `provider/model` form OpenCode expects. A bare model id (no `/`) is prefixed
 * with the provider; the literal value `default` (or a missing value) is
 * replaced with a sensible per-provider default so the workflow never launches
 * the agent with an invalid `default` model.
 *
 * Usage: node resolve-model.mjs <agent> [provider] [runtime]
 * Output: model=<value>  (consumed via $GITHUB_OUTPUT)
 *
 * For the `claude` runtime the model must be a bare Anthropic id (e.g.
 * `claude-sonnet-4-20250514`) — Claude Code does not accept a `provider/`
 * prefix and is Anthropic-only, so the provider is forced to `anthropic` and
 * any prefix is stripped.
 */
import { readFileSync } from "node:fs";

const agent = process.argv[2] || "planner";
let provider = (process.argv[3] || "anthropic").toLowerCase();
const runtime = (process.argv[4] || "opencode").toLowerCase();

if (runtime === "claude") provider = "anthropic";

// Provider -> a concrete, widely available default model.
const DEFAULT_MODELS = {
  anthropic: "anthropic/claude-sonnet-4-20250514",
  openai: "openai/gpt-4o",
  google: "google/gemini-1.5-pro",
  gemini: "google/gemini-1.5-pro",
  groq: "groq/llama-3.3-70b-versatile",
  openrouter: "openrouter/anthropic/claude-sonnet-4",
  opencode: "opencode/claude-sonnet-4-20250514",
  "opencode-go": "opencode-go/claude-sonnet-4-20250514",
  "opencode-zen": "opencode/claude-sonnet-4-20250514",
  zen: "opencode/claude-sonnet-4-20250514",
  deepseek: "deepseek/deepseek-chat",
  mistral: "mistral/mistral-large-latest",
  xai: "xai/grok-2-latest",
};

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

if (!model || model === "default") {
  model = DEFAULT_MODELS[provider] || `${provider}/default`;
}

// Ensure a provider prefix so OpenCode can route the request. Claude Code
// expects a bare Anthropic id, so strip the prefix for that runtime.
if (runtime === "claude") {
  model = model.includes("/") ? model.split("/").slice(1).join("/") : model;
} else if (!model.includes("/")) {
  model = `${provider}/${model}`;
}

console.log(`model=${model}`);
