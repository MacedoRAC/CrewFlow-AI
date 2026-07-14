/**
 * discover-tests.mts — locate test suites (PHPUnit/Pest, Jest/Vitest) and map
 * them by directory so the agent can find nearby tests for affected code.
 */
import { findFiles, emit } from "./repo.mts";

// Tests live in test directories, so we must not apply the default ignore set
// that skips "tests"/"test" folders.
const noTestIgnore = new Set([".git", "node_modules", "vendor", "dist", "build", ".ai", "coverage", ".next", "public", "storage", "bootstrap"]);

const phpTests = findFiles((p) => /\/Tests?\//.test(p) && /\.php$/.test(p), undefined, noTestIgnore);
const jsTests = findFiles(
  (p) => (/(test|spec)\.(ts|tsx|js|jsx)$/.test(p) || /\/(__tests__|tests?)\//.test(p)) && /\.(ts|tsx|js|jsx)$/.test(p),
  undefined,
  noTestIgnore
);

emit({
  php: phpTests,
  js: jsTests,
  count: phpTests.length + jsTests.length,
});
