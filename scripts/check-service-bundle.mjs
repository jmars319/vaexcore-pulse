#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const resourcesDir = resolve(root, "apps/desktopapp/src-tauri/resources");
const manifestPath = resolve(resourcesDir, "pulse-service-bundle.json");

const requiredFiles = [
  "pulse-api/server.mjs",
  "pulse-analyzer/src/vaexcore_pulse_analyzer/__init__.py",
  "pulse-analyzer/src/vaexcore_pulse_analyzer/server.py",
  "pulse-analyzer/src/vaexcore_pulse_analyzer/service.py",
  "pulse-analyzer/src/vaexcore_pulse_analyzer/pipeline/orchestrator.py",
  "pulse-analyzer/src/vaexcore_pulse_analyzer/storage/session_store.py",
];

const errors = [];

if (!existsSync(manifestPath)) {
  errors.push(`missing service bundle manifest: ${manifestPath}`);
} else {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.schemaVersion !== 1) {
    errors.push("pulse-service-bundle.json schemaVersion must be 1");
  }
  if (manifest.apiEntrypoint !== "pulse-api/server.mjs") {
    errors.push(
      "pulse-service-bundle.json apiEntrypoint must be pulse-api/server.mjs",
    );
  }
  if (manifest.analyzerSource !== "pulse-analyzer/src") {
    errors.push(
      "pulse-service-bundle.json analyzerSource must be pulse-analyzer/src",
    );
  }
}

for (const file of requiredFiles) {
  const path = resolve(resourcesDir, file);
  if (!existsSync(path)) {
    errors.push(`missing bundled helper resource: ${file}`);
    continue;
  }
  if (statSync(path).size === 0) {
    errors.push(`bundled helper resource is empty: ${file}`);
  }
}

const apiBundlePath = resolve(resourcesDir, "pulse-api/server.mjs");
if (existsSync(apiBundlePath)) {
  const apiBundle = readFileSync(apiBundlePath, "utf8");
  for (const workspaceImport of [
    "@vaexcore/pulse-domain",
    "@vaexcore/pulse-profiles",
    "@vaexcore/pulse-shared-types",
  ]) {
    if (apiBundle.includes(workspaceImport)) {
      errors.push(
        `API bundle still contains workspace import ${workspaceImport}`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Pulse service bundle resources are complete.");
