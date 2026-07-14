/**
 * classify-issue.mts — read the current issue body (via gh) and classify it
 * into a category (bug, feature, refactor, tech-debt, docs) plus extract any
 * labels. This drives which parts of the plan the planner emphasises.
 */
import { execSync } from "node:child_process";
import { emit } from "./repo.mts";

function fetchIssue(): { title: string; body: string; labels: string[] } {
  const num = process.env.AI_ISSUE_NUMBER;
  if (!num) return { title: "", body: "", labels: [] };
  try {
    const json = execSync(
      `gh issue view ${num} --json title,body,labels -q '.title + "\\u0000" + .body + "\\u0000" + ([.labels[].name] | join(","))'`,
      { encoding: "utf8", env: process.env }
    );
    const [title, body, labels] = json.split("\u0000");
    return { title, body, labels: labels ? labels.split(",") : [] };
  } catch {
    return { title: "", body: "", labels: [] };
  }
}

const { title, body, labels } = fetchIssue();
const text = `${title}\n${body}`.toLowerCase();

let category = "feature";
if (/bug|broken|error|exception|crash|regression|fails?|not working/.test(text)) category = "bug";
else if (/refactor|cleanup|simplif|restructure/.test(text)) category = "refactor";
else if (/tech[- ]?debt|legacy|hack|temporary|todo|fixme/.test(text)) category = "tech-debt";
else if (/document|docs|readme|guide|explain/.test(text)) category = "docs";

emit({ category, labels, title, hasReproduction: /steps to reproduce|reproduce|expected|actual/i.test(body) });
