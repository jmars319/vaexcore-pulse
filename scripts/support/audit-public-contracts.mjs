import fs from "node:fs";
import path from "node:path";

function collectTypeScriptExports(entry) {
  const names = [];
  const visited = new Set();

  function collect(file) {
    const resolved = path.resolve(file);
    if (visited.has(resolved) || !fs.existsSync(resolved)) return;
    visited.add(resolved);
    const contents = fs.readFileSync(resolved, "utf8");
    for (const match of contents.matchAll(
      /export\s+\*\s+from\s+["']([^"']+)["']/g,
    )) {
      const specifier = match[1];
      if (!specifier.startsWith(".")) continue;
      collect(path.resolve(path.dirname(resolved), specifier + ".ts"));
    }
    for (const match of contents.matchAll(
      /export\s+(?:type\s+)?\{([^}]+)\}/g,
    )) {
      for (const raw of match[1].split(",")) {
        const parts = raw.trim().split(/\s+as\s+/);
        const name = (parts[1] || parts[0] || "").trim();
        if (name) names.push(name);
      }
    }
    for (const match of contents.matchAll(
      /export\s+(?:declare\s+)?(?:type|interface|const|function|class|enum)\s+([A-Za-z0-9_]+)/g,
    )) {
      names.push(match[1]);
    }
  }

  collect(entry);
  return [...new Set(names)].sort();
}

function currentSharedTypeExports(root) {
  const entry = path.join(root, "packages/shared-types/src/index.ts");
  if (!fs.existsSync(entry)) return [];
  return collectTypeScriptExports(entry);
}

function currentPackageExports(root, packageName) {
  const entry = path.join(root, `packages/${packageName}/src/index.ts`);
  if (!fs.existsSync(entry)) return [];
  return collectTypeScriptExports(entry);
}

function walkRust(directory, files = []) {
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walkRust(absolute, files);
      continue;
    }
    if (entry.name.endsWith(".rs")) files.push(absolute);
  }
  return files;
}

function currentTauriCommands(root) {
  const base = path.join(root, "apps/desktopapp/src-tauri/src");
  const names = [];
  for (const file of walkRust(base)) {
    const contents = fs.readFileSync(file, "utf8");
    for (const match of contents.matchAll(
      /#\[tauri::command\]\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([a-zA-Z0-9_]+)/g,
    )) {
      names.push(match[1]);
    }
  }
  return [...new Set(names)].sort();
}

export function evaluatePublicContractSnapshots(root, snapshots) {
  const violations = [];

  for (const snapshot of snapshots) {
    const file = String(snapshot.file ?? "").replaceAll("\\", "/");
    const absolute = path.join(root, file);
    if (!file || !fs.existsSync(absolute)) {
      violations.push("public contract snapshot is missing: " + file);
      continue;
    }
    const expected = fs
      .readFileSync(absolute, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const current =
      snapshot.kind === "tauriCommands"
        ? currentTauriCommands(root)
        : snapshot.kind === "domainExports"
          ? currentPackageExports(root, "domain")
          : currentSharedTypeExports(root);
    const currentSet = new Set(current);
    const missing = expected.filter((name) => !currentSet.has(name));
    if (missing.length > 0) {
      violations.push(
        (snapshot.kind ?? "contract") +
          " removed or renamed exports: " +
          missing.slice(0, 16).join(", ") +
          (missing.length > 16
            ? " and " + (missing.length - 16) + " more"
            : ""),
      );
    }
  }

  return violations;
}
