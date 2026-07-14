/**
 * discover-services.mts — locate service classes / modules and summarise the
 * public methods they expose so the agent understands reusable behaviour.
 */
import { findFiles, readFile, emit } from "./repo.mts";

const candidates = findFiles(
  (p) =>
    /\.(php|ts|tsx|js)$/.test(p) &&
    /(Services?\/|\/services\/|Service\.(php|ts|tsx|js)$)/i.test(p) &&
    !/(test|spec)/i.test(p)
);

interface ServiceInfo {
  file: string;
  class: string | null;
  methods: string[];
}

function parse(file: string, content: string) {
  const classMatch = content.match(/(?:class|abstract class)\s+(\w+)/);
  const methods = (content.match(/(?:public|static)?\s*function\s+(\w+)\s*\(/g) || [])
    .map((m) => m.replace(/.*function\s+/, "").replace(/\s*\($/, ""));
  return { class: classMatch ? classMatch[1] : null, methods };
}

const services: ServiceInfo[] = candidates.slice(0, 80).map((file) => {
  const content = readFile(file) || "";
  const { class: cls, methods } = parse(file, content);
  return { file, class: cls, methods };
});

emit({ services, count: services.length });
