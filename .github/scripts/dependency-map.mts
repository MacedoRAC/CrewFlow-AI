/**
 * dependency-map.mts — read composer.json and package.json to summarise the
 * declared dependencies, helping the agent avoid reinventing existing packages.
 */
import { safeJson, emit } from "./repo.mts";

const composer = safeJson<{ require?: Record<string, string>; "require-dev"?: Record<string, string> }>("composer.json");
const pkg = safeJson<{ dependencies?: Record<string, string>; devDependencies?: Record<string, string> }>("package.json");

emit({
  composer: {
    require: composer?.require || {},
    requireDev: composer?.["require-dev"] || {},
  },
  npm: {
    dependencies: pkg?.dependencies || {},
    devDependencies: pkg?.devDependencies || {},
  },
});
