import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = process.cwd();
const strict = process.argv.includes("--strict");
const configPath = path.join(root, "scripts", "maintainability.config.json");
const config = fs.existsSync(configPath)
  ? JSON.parse(fs.readFileSync(configPath, "utf8"))
  : {};
const budgetBytes =
  Number(process.env.BUNDLE_BUDGET_KB ?? config.initialBundleBudgetKb ?? 450) *
  1024;
const routeChunkBudgets = config.routeChunkBudgets ?? [];
const bundleBaselineKb = config.bundleBaselineKb ?? {};
const candidateAssetDirs = config.assetDirs ?? [
  "dist/assets",
  "build/assets",
  "out/assets",
  "apps/webapp/dist/assets",
  "apps/desktop/dist/assets",
  "apps/desktopapp/dist/assets",
  "desktop/shared/src/setup/ui/dist/assets",
];

function sizeRecord(base, file) {
  const absolute = path.join(base, file);
  const raw = fs.readFileSync(absolute);
  return {
    file: path.relative(root, absolute).replaceAll("\\", "/"),
    rawBytes: raw.byteLength,
    gzipBytes: zlib.gzipSync(raw).byteLength,
  };
}

const assets = [];
for (const dir of candidateAssetDirs) {
  const absolute = path.join(root, dir);
  if (!fs.existsSync(absolute)) continue;
  for (const file of fs.readdirSync(absolute)) {
    if (file.endsWith(".js")) assets.push(sizeRecord(absolute, file));
  }
}

if (assets.length === 0) {
  const entryCandidates = config.entryFiles ?? [
    "src/index.ts",
    "src/index.js",
    "src/App.tsx",
    "apps/desktop/src/App.tsx",
    "apps/desktopapp/src/App.tsx",
  ];
  const entries = entryCandidates
    .filter((entry) => fs.existsSync(path.join(root, entry)))
    .map((entry) => ({
      entry,
      lines: fs.readFileSync(path.join(root, entry), "utf8").split(/\r?\n/)
        .length,
    }));
  console.log((config.label ?? path.basename(root)) + " build size report");
  console.log(
    "No built JavaScript assets found. Run the app build first for bundle sizes.",
  );
  for (const entry of entries)
    console.log("- " + entry.entry + ": " + entry.lines + " source lines");
  if (strict && config.requireBuiltAssets === true) process.exit(1);
  process.exit(0);
}

const sorted = assets.sort((a, b) => b.rawBytes - a.rawBytes);
const initialPattern = config.initialChunkPattern
  ? new RegExp(config.initialChunkPattern)
  : /(^|\/)index-[\w-]+\.js$/;
const initial =
  sorted.find((asset) => initialPattern.test(asset.file)) ?? sorted[0];
console.log((config.label ?? path.basename(root)) + " bundle report");
console.log(
  "Initial/largest route chunk: " +
    initial.file +
    " " +
    (initial.rawBytes / 1024).toFixed(2) +
    " kB raw / " +
    (initial.gzipBytes / 1024).toFixed(2) +
    " kB gzip",
);
console.log("Target: " + (budgetBytes / 1024).toFixed(0) + " kB raw");
console.log("");
console.log("Largest JavaScript chunks:");
for (const asset of sorted.slice(0, 12))
  console.log(
    "- " +
      asset.file +
      ": " +
      (asset.rawBytes / 1024).toFixed(2) +
      " kB raw / " +
      (asset.gzipBytes / 1024).toFixed(2) +
      " kB gzip",
  );

function chunkDeltaLabel(name, rawKb) {
  const baseline = Number(bundleBaselineKb[name]);
  if (!Number.isFinite(baseline) || baseline <= 0) return "";
  const delta = rawKb - baseline;
  const prefix = delta >= 0 ? "+" : "";
  return " (" + prefix + delta.toFixed(2) + " kB vs baseline)";
}

const chunkViolations = [];
if (routeChunkBudgets.length > 0) {
  console.log("");
  console.log("Route chunk budgets:");
  for (const budget of routeChunkBudgets) {
    const name = budget.name ?? budget.pattern;
    const pattern = new RegExp(budget.pattern);
    const maxBytes = Number(budget.maxKb) * 1024;
    const matches = sorted.filter((asset) => pattern.test(asset.file));
    if (matches.length === 0) {
      chunkViolations.push(
        "Missing route chunk for " +
          name +
          " using pattern " +
          budget.pattern +
          ".",
      );
      console.log("- " + name + ": missing");
      continue;
    }
    const asset = matches[0];
    const rawKb = asset.rawBytes / 1024;
    const gzipKb = asset.gzipBytes / 1024;
    console.log(
      "- " +
        name +
        ": " +
        rawKb.toFixed(2) +
        " kB raw / " +
        gzipKb.toFixed(2) +
        " kB gzip, target " +
        Number(budget.maxKb).toFixed(0) +
        " kB" +
        chunkDeltaLabel(name, rawKb),
    );
    if (maxBytes > 0 && asset.rawBytes > maxBytes) {
      chunkViolations.push(
        name +
          " chunk exceeds target by " +
          ((asset.rawBytes - maxBytes) / 1024).toFixed(2) +
          " kB (" +
          asset.file +
          ").",
      );
    } else if (
      maxBytes > 0 &&
      maxBytes - asset.rawBytes <=
        Number(config.nearChunkBudgetWarningKb ?? 4) * 1024
    ) {
      console.warn(
        name +
          " chunk is near target: " +
          rawKb.toFixed(2) +
          "/" +
          Number(budget.maxKb).toFixed(0) +
          " kB raw.",
      );
    }
  }
}

if (initial.rawBytes > budgetBytes) {
  const message =
    "Initial/largest route chunk exceeds target by " +
    ((initial.rawBytes - budgetBytes) / 1024).toFixed(2) +
    " kB.";
  if (strict) {
    console.error(message);
    process.exit(1);
  }
  console.warn(message);
}

if (chunkViolations.length > 0) {
  for (const violation of chunkViolations) console.error(violation);
  if (strict) process.exit(1);
}
