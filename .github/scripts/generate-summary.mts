/**
 * generate-summary.mts — aggregate the discovery outputs into a short natural
 * language summary the planner prompt can embed at the top of its context.
 */
import { findFiles, exists, emit } from "./repo.mts";

const php = findFiles((p) => /\.php$/.test(p) && !/vendor/.test(p)).length;
const ts = findFiles((p) => /\.(ts|tsx)$/.test(p)).length;
const vue = findFiles((p) => /\.vue$/.test(p)).length;
const js = findFiles((p) => /\.(js|jsx)$/.test(p) && !/node_modules/.test(p)).length;

const framework = [];
if (exists("composer.json")) framework.push("Laravel/PHP");
if (exists("package.json")) framework.push("Node");
if (vue) framework.push("Vue");

const summary = [
  `Repository contains ${php} PHP, ${ts} TS/TSX, ${vue} Vue, ${js} JS files.`,
  `Detected stack: ${framework.join(", ") || "unknown"}.`,
].join(" ");

emit({ summary, counts: { php, ts, vue, js }, framework });
