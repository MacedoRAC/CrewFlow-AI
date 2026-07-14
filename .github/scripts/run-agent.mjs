/**
 * run-agent.mjs
 *
 * Assembles the agent prompt (prompt template + compact repository context +
 * the triggering issue/PR body) and runs it through the headless agent runtime
 * (OpenCode / Claude Code). The agent runtime is the reasoning engine; this
 * script only wires context and I/O.
 *
 * Environment:
 *   AI_AGENT        agent name (planner, architect, ...)
 *   AI_PROMPT       path to prompt template
 *   AI_CONTEXT_FILE path to generated context json
 *   AI_MODEL        resolved model id
 *   AI_ISSUE_NUMBER / AI_PR_NUMBER / AI_COMMENT_ID
 */
import { execFileSync, execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const env = process.env;

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
  return `${tmpl}

<repository-context>
${context}
</repository-context>

<issue>
${issue}
</issue>

<pull-request>
${pr}
</pull-request>

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
  // agent to apply changes itself, so we enable auto-approval (the `--auto`
  // flag is dangerous in interactive use but required for headless CI).
  const args =
    bin === "opencode"
      ? ["run", "--model", env.AI_MODEL || "default", "--print-logs", "--auto", prompt]
      : ["--print", "--model", env.AI_MODEL || "default", "-p", prompt];

  return execFileSync(bin, args, {
    encoding: "utf8",
    env,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function main() {
  const prompt = buildPrompt();
  const promptFile = join(process.cwd(), ".ai", "context", `prompt-${env.AI_AGENT}.md`);
  writeFileSync(promptFile, prompt);

  const bin = agentBinary();
  if (!bin) {
    console.warn(
      `[agent] no headless agent runtime (opencode/claude) found in this scaffold run. ` +
        `Prompt written to ${promptFile}. Wire this step to your agent CLI in CI.`
    );
    return;
  }

  try {
    const result = invoke(bin, prompt);
    console.log(result);
    writeFileSync(promptFile.replace(/prompt-/, "output-"), result);
  } catch (err) {
    console.error(
      `[agent] ${bin} invocation failed (non-fatal in scaffold). ` +
        `Prompt preserved at ${promptFile}. Error: ${err.message}`
    );
    // Do not hard-fail the workflow: leave the prompt for inspection/retry.
  }
}

main();
