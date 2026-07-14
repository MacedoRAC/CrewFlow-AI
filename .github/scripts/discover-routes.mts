/**
 * discover-routes.mts — extract route definitions for both Laravel (PHP) and
 * frontend routers (Vue/React/TS) so the agent knows available endpoints.
 */
import { findFiles, readFile, exists, emit } from "./repo.mts";

const routeFiles = findFiles(
  (p) =>
    /routes?\.(php|ts|tsx|js)$/i.test(p) ||
    /\/routes\//.test(p) ||
    /router\.(ts|tsx|js)$/.test(p)
);

interface RouteInfo {
  file: string;
  routes: string[];
}

function parseLaravel(content: string): string[] {
  return (content.match(/Route::(get|post|put|patch|delete|resource|apiResource)\(\s*['"]([^'"]+)['"]/g) || [])
    .map((m) => m.replace(/Route::/, "").replace(/\(\s*['"]/, " ").replace(/['"].*$/, ""));
}

function parseFrontend(content: string): string[] {
  return (content.match(/(path|route|to)\s*:\s*['"]([^'"]+)['"]/g) || [])
    .map((m) => m.replace(/.*['"]/, "").replace(/['"].*$/, ""));
}

const routes: RouteInfo[] = routeFiles.map((file) => {
  const content = readFile(file) || "";
  const items = /\.php$/.test(file) ? parseLaravel(content) : parseFrontend(content);
  return { file, routes: items };
});

const apiResources = exists("routes/api.php");

emit({ routes, apiResources, count: routes.reduce((n, r) => n + r.routes.length, 0) });
