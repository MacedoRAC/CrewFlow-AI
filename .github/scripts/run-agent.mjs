/**
 * run-agent.mjs
 *
 * Assembles the agent prompt (prompt template + compact repository context +
 * the triggering issue/PR body) and runs it through the headless agent runtime
 * (OpenCode / Claude Code). The agent runtime is the reasoning engine; this
 * script only wires context and I/O, then posts the agent's summary back to
 * GitHub so results are always visible.
 *
 * Environment:
 *   AI_AGENT        agent name (planner, architect, ...)
 *   AI_PROMPT       path to prompt template
 *   AI_CONTEXT_FILE path to generated context json
 *   AI_MODEL        resolved model id (provider/model)
 *   AI_ISSUE_NUMBER / AI_PR_NUMBER / AI_COMMENT_ID
 *   AI_RUNTIME      opencode | claude (informational)
 *   AI_PROVIDER     provider id (informational)
 *   AI_SCAFFOLD     set to "1" to keep the old write-only behaviour when no
 *                   runtime is available (useful for local dry runs).
 */
import { execFileSync, execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const env = process.env;
const isCI = env.GITHUB_ACTIONS === "true";

// Agents whose final message is a human-readable summary worth posting as a
// comment. reviewer/implementer perform their own GitHub actions (reviews,
// opening a PR) via `gh`, so we don't double-post for them.
const SUMMARY_AGENTS = new Set(["planner", "architect", "qa", "revise"]);

function fail(message) {
  console.error(`[agent] ${message}`);
  if (isCI) process.exit(1);
  process.exit(0);
}

function fetchIssueBody() {
  if (!env.AI_ISSUE_NUMBER) return "";
  try {
    return execSync(
      `gh issue view ${env.AI_ISSUE_NUMBER} --json title,body -q '.title + "\\n\\n" + .body'`,
      { encoding: "utf8", env }
    );
  } catch {
    return "";
  }
}

function fetchPrBody() {
  if (!env.AI_PR_NUMBER) return "";
  try {
    return execSync(
      `gh pr view ${env.AI_PR_NUMBER} --json title,body,diff -q '.title + "\\n\\n" + .body'`,
      { encoding: "utf8", env }
    );
  } catch {
    return "";
  }
}

function fetchCommentBody() {
  if (!env.AI_COMMENT_ID || !env.GITHUB_REPOSITORY) return "";
  try {
    return execSync(
      `gh api repos/${env.GITHUB_REPOSITORY}/issues/comments/${env.AI_COMMENT_ID} --jq .body`,
      { encoding: "utf8", env }
    ).trim();
  } catch {
    return "";
  }
}

function buildPrompt() {
  const tmpl = existsSync(env.AI_PROMPT) ? readFileSync(env.AI_PROMPT, "utf8") : "";
  let context = "";
  try {
    context = readFileSync(env.AI_CONTEXT_FILE, "utf8");
  } catch {
    context = "{}";
  }
  const issue = fetchIssueBody();
  const pr = fetchPrBody();
  const comment = fetchCommentBody();
  const commentBlock = comment
    ? `\n<triggering-comment>\n${comment}\n</triggering-comment>\n`
    : "";
  return `${tmpl}

<repository-context>
${context}
</repository-context>

<issue>
${issue}
</issue>

<pull-request>
${pr}
</pull-request>${commentBlock}
<agent-metadata>
agent: ${env.AI_AGENT}
issue: ${env.AI_ISSUE_NUMBER || "n/a"}
pr: ${env.AI_PR_NUMBER || "n/a"}
</agent-metadata>
`;
}

function agentBinary() {
  for (const bin of ["opencode", "claude"]) {
    try {
      execSync(`command -v ${bin}`, { stdio: "ignore" });
      return bin;
    } catch {
      /* try next */
    }
  }
  return null;
}

function invoke(bin, prompt) {
  // Build the headless invocation per runtime. In CI you typically want the
  // agent to apply changes itself, so we enable auto-approval:
  //   - OpenCode: `--auto` auto-approves permissions not explicitly denied.
  //   - Claude Code: `--dangerously-skip-permissions` bypasses all prompts.
  // The prompt is passed as the trailing positional argument.
  const args =
    bin === "opencode"
      ? ["run", "--model", env.AI_MODEL || "default", "--print-logs", "--auto", prompt]
      : ["--print", "--model", env.AI_MODEL || "default", "--dangerously-skip-permissions", prompt];

  return execFileSync(bin, args, {
    encoding: "utf8",
    env,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function postComment(text) {
  const issue = env.AI_ISSUE_NUMBER;
  const pr = env.AI_PR_NUMBER;
  if (!issue && !pr) return;
  if (!text || !text.trim()) return;

  // GitHub caps comment bodies; trim defensively.
  const limit = 65000;
  const body = text.length > limit ? text.slice(0, limit) + "\n\n…(truncated)" : text;
  const target = pr ? "pr" : "issue";
  const num = pr || issue;

  try {
    execFileSync("gh", [target, "comment", String(num), "--body", body], {
      encoding: "utf8",
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    console.log(`[agent] posted summary to ${target} #${num}`);
  } catch (err) {
    console.warn(`[agent] failed to post comment: ${err.message}`);
  }
}

function main() {
  const prompt = buildPrompt();
  const promptFile = join(process.cwd(), ".ai", "context", `prompt-${env.AI_AGENT}.md`);
  writeFileSync(promptFile, prompt);

  const model = env.AI_MODEL || "default";
  if (!model || model === "default") {
    fail(
      `invalid model "${model}". Set a concrete model in .ai/config.yml ` +
        `(e.g. anthropic/claude-sonnet-4-20250514) — the literal "default" will not run.`
    );
  }
  // OpenCode needs a provider/model form; Claude Code uses a bare Anthropic id.
  if (env.AI_RUNTIME === "opencode" && !model.includes("/")) {
    fail(
      `invalid model "${model}" for the opencode runtime. Use provider/model ` +
        `(e.g. anthropic/claude-sonnet-4-20250514).`
    );
  }

  const bin = agentBinary();
  if (!bin) {
    if (env.AI_SCAFFOLD === "1") {
      console.warn(
        `[agent] AI_SCAFFOLD=1: no headless runtime found; prompt preserved at ${promptFile}.`
      );
      return;
    }
    fail(
      `no headless agent runtime (opencode/claude) found on PATH. ` +
        `The workflow must install it (see _ai-dispatch.yml "Install agent runtime"). ` +
        `Prompt preserved at ${promptFile}.`
    );
  }

  console.log(`[agent] invoking ${bin} (model ${model})...`);
  try {
    const result = invoke(bin, prompt);
    console.log(result);
    writeFileSync(promptFile.replace(/prompt-/, "output-"), result);

    if (SUMMARY_AGENTS.has(env.AI_AGENT)) {
      postComment(result);
    }
  } catch (err) {
    // Surface the failure clearly instead of silently passing.
    fail(`[agent] ${bin} invocation failed: ${err.message}`);
  }
}

main();
