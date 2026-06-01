import fs from "node:fs";
import path from "node:path";

export function evaluateDesktopImportCycles({
  implementationRecords,
  importSpecifiers,
  relative,
  root,
}) {
  const appFiles = implementationRecords
    .filter((record) =>
      /^apps\/desktopapp\/src\/.*\.(ts|tsx)$/.test(record.file),
    )
    .map((record) => path.join(root, record.file));
  const fileSet = new Set(appFiles.map((file) => path.resolve(file)));
  const extensions = [".ts", ".tsx"];

  function resolveRelativeImport(fromFile, specifier) {
    if (!specifier.startsWith(".")) return null;
    const base = path.resolve(path.dirname(fromFile), specifier);
    for (const extension of extensions) {
      if (fileSet.has(base + extension)) return base + extension;
    }
    for (const extension of extensions) {
      const indexFile = path.join(base, "index" + extension);
      if (fileSet.has(indexFile)) return indexFile;
    }
    return null;
  }

  const graph = new Map();
  for (const file of appFiles) {
    const imports = importSpecifiers(fs.readFileSync(file, "utf8"))
      .map((specifier) => resolveRelativeImport(file, specifier))
      .filter(Boolean);
    graph.set(path.resolve(file), imports);
  }

  const seen = new Set();
  const stack = [];
  const onStack = new Set();
  const cycles = [];

  function visit(file) {
    seen.add(file);
    onStack.add(file);
    stack.push(file);
    for (const dependency of graph.get(file) ?? []) {
      if (!seen.has(dependency)) visit(dependency);
      else if (onStack.has(dependency)) {
        const index = stack.indexOf(dependency);
        cycles.push(stack.slice(index).concat(dependency));
      }
    }
    stack.pop();
    onStack.delete(file);
  }

  for (const file of graph.keys()) if (!seen.has(file)) visit(file);
  if (cycles.length === 0) return [];

  return [
    "apps/desktopapp/src import cycles found: " +
      cycles
        .slice(0, 3)
        .map((cycle) => cycle.map((file) => relative(file)).join(" -> "))
        .join("; "),
  ];
}
