import fs from "node:fs";
import path from "node:path";
import { evaluateDesktopImportCycles } from "./support/audit-desktop-cycles.mjs";
import { evaluatePublicContractSnapshots } from "./support/audit-public-contracts.mjs";

/* Audit configuration boundary */
const root = process.cwd();
const strict = process.argv.includes("--strict");
const configPath = path.join(root, "scripts", "maintainability.config.json");
const config = fs.existsSync(configPath)
  ? JSON.parse(fs.readFileSync(configPath, "utf8"))
  : {};
const configuredIgnores = Array.isArray(config.ignoredSegments)
  ? config.ignoredSegments
  : [];
const ignoredPathIncludes = (config.ignoredPathIncludes ?? []).map((item) =>
  item.replaceAll("\\", "/"),
);
const ignoredSegments = new Set([
  "node_modules",
  ".git",
  ".next",
  ".nuxt",
  ".svelte-kit",
  "dist",
  "dist-bundle",
  "build",
  "out",
  "coverage",
  ".turbo",
  ".vite",
  "target",
  "gen",
  "release",
  ".desktop-runtime",
  ".wrangler",
  ".expo",
  "web-build",
  ...configuredIgnores,
]);
const sourceExtensions = new Set(
  config.sourceExtensions ?? [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".rs",
    ".css",
    ".scss",
  ],
);
const styleExtensions = new Set([".css", ".scss", ".sass", ".less"]);
const generatedPatterns = (
  config.generatedPatterns ?? [
    "dist/",
    "dist-bundle/",
    "/dist/",
    "/build/",
    "/out/",
    "/target/",
    "/gen/",
    ".desktop-runtime",
    "worker-configuration.d.ts",
    "vite-env.d.ts",
    "next-env.d.ts",
    "*.tsbuildinfo",
  ]
).map((pattern) => pattern.replaceAll("\\", "/"));
const allowedGenerated = new Set(
  (config.allowedGenerated ?? []).map((item) => item.replaceAll("\\", "/")),
);
const maxImpl = Number(config.maxImplementationFileLines ?? 1600);
const maxStyle = Number(config.maxStyleFileLines ?? 2000);
const maxAppShell = Number(config.maxAppShellLines ?? 1200);
const maxDesktopMain = Number(config.maxDesktopMainLines ?? 450);
const maxDomainBarrel = Number(config.maxDomainBarrelLines ?? 700);
const specificFileLineBudgets = config.specificFileLineBudgets ?? {};
const nearLineBudgetWarningLines = Number(
  config.nearLineBudgetWarningLines ?? 25,
);
const startupImportRules = config.startupImportRules ?? [];
const contextWidthRules = config.contextWidthRules ?? [];
const routeCssOwnershipRules = config.routeCssOwnershipRules ?? [];
const assetBudgets = config.assetBudgets ?? [];
const publicContractSnapshots = config.publicContractSnapshots ?? [];

function shouldSkipDir(entryName) {
  return ignoredSegments.has(entryName);
}

function walk(directory, files = []) {
  if (!fs.existsSync(directory)) return files;
  const relativeDirectory = path
    .relative(root, directory)
    .replaceAll("\\", "/");
  if (
    ignoredPathIncludes.some(
      (item) => relativeDirectory === item || relativeDirectory.includes(item),
    )
  )
    return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && shouldSkipDir(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(absolute, files);
      continue;
    }
    if (sourceExtensions.has(path.extname(entry.name))) files.push(absolute);
  }
  return files;
}

function lineCount(file) {
  return fs.readFileSync(file, "utf8").split(/\r?\n/).length;
}

function relative(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function importSpecifiers(contents) {
  return [
    ...contents.matchAll(
      /\bfrom\s+["']([^"']+)["']|import\(["']([^"']+)["']\)|import\s+["']([^"']+)["']/g,
    ),
  ]
    .map((match) =>
      (match[1] ?? match[2] ?? match[3] ?? "").replaceAll("\\", "/"),
    )
    .filter(Boolean);
}

function matchesPattern(file, pattern) {
  if (pattern.startsWith("*.")) return file.endsWith(pattern.slice(1));
  return file === pattern || file.includes(pattern);
}

/* Source inventory boundary */
const sourceRoots = (
  config.sourceRoots ?? [
    "src",
    "app",
    "apps",
    "packages",
    "services",
    "crates",
    "server",
    "desktop",
    "scripts",
  ]
).filter((dir) => fs.existsSync(path.join(root, dir)));
const files = sourceRoots
  .flatMap((directory) => walk(path.join(root, directory)))
  .filter((file, index, all) => all.indexOf(file) === index);
const records = files.map((file) => ({
  file: relative(file),
  ext: path.extname(file),
  lines: lineCount(file),
}));
const implementationRecords = records.filter(
  (record) => !styleExtensions.has(record.ext),
);
const styleRecords = records.filter((record) =>
  styleExtensions.has(record.ext),
);
const generatedRecords = records.filter(
  (record) =>
    generatedPatterns.some((pattern) => matchesPattern(record.file, pattern)) &&
    !allowedGenerated.has(record.file),
);
const blockedImportPatterns = (
  config.blockedImportPatterns ?? [
    "/dist/",
    "dist/",
    "/build/",
    "/out/",
    "/target/",
    "node_modules/",
  ]
).map((pattern) => pattern.replaceAll("\\", "/"));
const allowedGeneratedImportSpecifiers = new Set(
  (config.allowedGeneratedImportSpecifiers ?? []).map((item) =>
    item.replaceAll("\\", "/"),
  ),
);

/* Line budget boundary */
const violations = [];
const warnings = [];
/* Dependency rule boundary */
for (const record of implementationRecords) {
  const isAppShell = /(^|\/)App\.(tsx|jsx|ts|js)$/.test(record.file);
  const isDesktopMain =
    /(^|\/)(main|lib)\.(cjs|mjs|js|ts|rs)$/.test(record.file) &&
    /desktop|tauri|src-tauri/.test(record.file);
  const isDomainBarrel =
    /(^|\/)packages\/(shared-types|domain)\/src\/index\.ts$/.test(record.file);
  const budget =
    Number(specificFileLineBudgets[record.file]) ||
    (isAppShell
      ? maxAppShell
      : isDesktopMain
        ? maxDesktopMain
        : isDomainBarrel
          ? maxDomainBarrel
          : maxImpl);
  if (record.lines > budget)
    violations.push(
      record.file +
        " has " +
        record.lines +
        " lines; budget is " +
        budget +
        ".",
    );
  else if (budget - record.lines <= nearLineBudgetWarningLines) {
    warnings.push(
      record.file +
        " is near its line budget: " +
        record.lines +
        "/" +
        budget +
        ".",
    );
  }
}
for (const record of styleRecords) {
  if (record.lines > maxStyle)
    violations.push(
      record.file +
        " has " +
        record.lines +
        " style lines; budget is " +
        maxStyle +
        ".",
    );
  else if (maxStyle - record.lines <= nearLineBudgetWarningLines) {
    warnings.push(
      record.file +
        " is near its style budget: " +
        record.lines +
        "/" +
        maxStyle +
        ".",
    );
  }
}
if (generatedRecords.length > 0 && config.allowGeneratedArtifacts !== true) {
  violations.push(
    "generated/runtime artifacts in source scan: " +
      generatedRecords
        .slice(0, 12)
        .map((r) => r.file)
        .join(", ") +
      (generatedRecords.length > 12
        ? " and " + (generatedRecords.length - 12) + " more"
        : ""),
  );
}
for (const record of implementationRecords) {
  const contents = fs.readFileSync(path.join(root, record.file), "utf8");
  if (/^\s*\/\/\s*@ts-nocheck\b/m.test(contents)) {
    violations.push(
      record.file + " disables TypeScript checking with @ts-nocheck.",
    );
  }
  for (const specifier of importSpecifiers(contents)) {
    if (
      !allowedGeneratedImportSpecifiers.has(specifier) &&
      blockedImportPatterns.some((pattern) => specifier.includes(pattern))
    ) {
      violations.push(
        record.file +
          " imports from generated or dependency output: " +
          specifier,
      );
    }
  }
}

if (config.enableUnusedLucideImportCheck === true) {
  for (const record of implementationRecords.filter((item) =>
    item.file.startsWith("apps/desktopapp/src/"),
  )) {
    const contents = fs.readFileSync(path.join(root, record.file), "utf8");
    for (const match of contents.matchAll(
      /import\s*\{([^}]+)\}\s*from\s*["']lucide-react["']/gs,
    )) {
      const body = contents.replace(match[0], "");
      const unused = match[1]
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => {
          const parts = item.split(/\s+as\s+/);
          return (parts[1] || parts[0] || "").trim();
        })
        .filter(
          (name) =>
            name &&
            !new RegExp(
              "\\b" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b",
            ).test(body),
        );
      if (unused.length > 0) {
        violations.push(
          record.file +
            " has unused lucide-react import(s): " +
            unused.join(", "),
        );
      }
    }
  }
}

for (const rule of startupImportRules) {
  const file = String(rule.file ?? "").replaceAll("\\", "/");
  const absolute = path.join(root, file);
  if (!file || !fs.existsSync(absolute)) {
    violations.push("startup import rule references missing file: " + file);
    continue;
  }
  const imports = importSpecifiers(fs.readFileSync(absolute, "utf8"));
  const blocked = rule.blockedPatterns ?? [];
  for (const specifier of imports) {
    const hit = blocked.find((pattern) => specifier.includes(pattern));
    if (hit)
      violations.push(
        file +
          " imports startup-blocked module '" +
          specifier +
          "' via pattern '" +
          hit +
          "'.",
      );
  }
}

for (const rule of contextWidthRules) {
  const file = String(rule.file ?? "").replaceAll("\\", "/");
  const absolute = path.join(root, file);
  if (!file || !fs.existsSync(absolute)) {
    violations.push("context width rule references missing file: " + file);
    continue;
  }
  const typeName = String(rule.typeName ?? "");
  const maxKeys = Number(rule.maxKeys ?? 80);
  const contents = fs.readFileSync(absolute, "utf8");
  const startMarker = "export type " + typeName + " = {";
  const start = contents.indexOf(startMarker);
  const end = start >= 0 ? contents.indexOf("\n};", start) : -1;
  if (start < 0 || end < 0) {
    violations.push(file + " is missing context type " + typeName + ".");
    continue;
  }
  const body = contents.slice(start + startMarker.length, end);
  const keyCount = body
    .split(/\r?\n/)
    .filter((line) => /^\s*[A-Za-z0-9_]+[?:]?:/.test(line)).length;
  if (keyCount > maxKeys)
    violations.push(
      typeName +
        " in " +
        file +
        " has " +
        keyCount +
        " fields; budget is " +
        maxKeys +
        ".",
    );
  else if (maxKeys - keyCount <= Number(rule.nearWarningKeys ?? 8))
    warnings.push(
      typeName +
        " in " +
        file +
        " is near width budget: " +
        keyCount +
        "/" +
        maxKeys +
        ".",
    );
}

for (const rule of routeCssOwnershipRules) {
  const cssFile = String(rule.cssFile ?? "").replaceAll("\\", "/");
  const allowedImporters = new Set(
    (rule.allowedImporters ?? []).map((item) => item.replaceAll("\\", "/")),
  );
  for (const record of implementationRecords) {
    if (!record.file.startsWith("apps/desktopapp/src/")) continue;
    const imports = importSpecifiers(
      fs.readFileSync(path.join(root, record.file), "utf8"),
    );
    const importsCss = imports.some((specifier) => {
      const normalized = specifier.replace(/^\.\.\//, "").replace(/^\.\//, "");
      return (
        specifier.endsWith(cssFile) ||
        normalized.endsWith(cssFile) ||
        specifier.endsWith(path.basename(cssFile))
      );
    });
    if (importsCss && !allowedImporters.has(record.file)) {
      violations.push(
        cssFile +
          " is imported by " +
          record.file +
          "; allowed importers: " +
          [...allowedImporters].join(", "),
      );
    }
  }
}

for (const budget of assetBudgets) {
  const file = String(budget.file ?? "").replaceAll("\\", "/");
  const absolute = path.join(root, file);
  const maxBytes = Number(budget.maxKb ?? 0) * 1024;
  if (!file || !fs.existsSync(absolute)) {
    violations.push("asset budget references missing file: " + file);
    continue;
  }
  const bytes = fs.statSync(absolute).size;
  if (maxBytes > 0 && bytes > maxBytes) {
    violations.push(
      file +
        " is " +
        (bytes / 1024).toFixed(1) +
        " kB; asset budget is " +
        Number(budget.maxKb).toFixed(1) +
        " kB.",
    );
  } else if (
    maxBytes > 0 &&
    maxBytes - bytes <= Number(config.nearAssetBudgetWarningKb ?? 16) * 1024
  ) {
    warnings.push(
      file +
        " is near its asset budget: " +
        (bytes / 1024).toFixed(1) +
        "/" +
        Number(budget.maxKb).toFixed(1) +
        " kB.",
    );
  }
}

violations.push(
  ...evaluatePublicContractSnapshots(root, publicContractSnapshots),
);

if (config.enableDesktopImportCycleCheck === true) {
  violations.push(
    ...evaluateDesktopImportCycles({
      implementationRecords,
      importSpecifiers,
      relative,
      root,
    }),
  );
}

console.log((config.label ?? path.basename(root)) + " maintainability audit");
console.log("");
console.log("Largest implementation files:");
for (const record of implementationRecords
  .sort((a, b) => b.lines - a.lines)
  .slice(0, 12))
  console.log("- " + record.file + ": " + record.lines + " lines");
console.log("");
console.log("Largest style files:");
for (const record of styleRecords.sort((a, b) => b.lines - a.lines).slice(0, 8))
  console.log("- " + record.file + ": " + record.lines + " lines");
console.log("");
console.log("Generated/runtime findings: " + generatedRecords.length);
for (const record of generatedRecords.slice(0, 8))
  console.log("- " + record.file);

if (warnings.length > 0) {
  console.log("");
  console.log("Near-budget warnings:");
  for (const warning of warnings.slice(0, 16)) console.log("- " + warning);
  if (warnings.length > 16)
    console.log("- " + (warnings.length - 16) + " more warnings");
}

if (violations.length > 0) {
  console.log("");
  console.log("Maintainability budget violations:");
  for (const violation of violations) console.log("- " + violation);
  if (strict) process.exit(1);
}
