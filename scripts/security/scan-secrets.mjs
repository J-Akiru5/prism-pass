#!/usr/bin/env node
// Dependency-free secret scanner. Scans git-tracked files by default so an
// untracked .env.local never blocks a commit, but --all scans the working tree
// (including untracked files) for a local pre-flight.
//
// Usage:
//   node scripts/security/scan-secrets.mjs            # tracked files
//   node scripts/security/scan-secrets.mjs --all      # working tree
//   node scripts/security/scan-secrets.mjs --json     # machine-readable
//   node scripts/security/scan-secrets.mjs --help
//
// Exit codes: 0 = clean, 1 = potential secret, 2 = scanner error.

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { isScannablePath, scanText } from "./secret-scan.mjs";

const MAX_FILE_BYTES = 1024 * 1024;

function printHelp() {
  console.log(`Prism Pass secret scan

  node scripts/security/scan-secrets.mjs [--all] [--json]

  --all    scan the working tree instead of git-tracked files
  --json   emit JSON findings
  --help   show this message

Patterns: private keys, AWS/GitHub/Stripe/OpenAI/Supabase keys, JWT
service_role claims, and Postgres URLs with inline passwords. Placeholders and
local database URLs are ignored.`);
}

function gitTrackedFiles() {
  const out = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return out.split("\0").filter(Boolean);
}

function walk(dir, root = dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const rel = relative(root, full).replace(/\\/g, "/");
    if (!isScannablePath(rel)) continue;
    if (entry.isDirectory()) walk(full, root, acc);
    else if (entry.isFile()) acc.push(rel);
  }
  return acc;
}

function listFiles(useAll) {
  if (!useAll) {
    try {
      return gitTrackedFiles();
    } catch {
      // Not a git checkout (tarball, CI artefact): fall back to a tree walk.
      return walk(process.cwd());
    }
  }
  return walk(process.cwd());
}

function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--help") || args.has("-h")) {
    printHelp();
    return 0;
  }
  const useAll = args.has("--all");
  const asJson = args.has("--json");
  const started = Date.now();

  let files;
  try {
    files = listFiles(useAll).filter(isScannablePath);
  } catch (error) {
    console.error(`[security] could not list files: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }

  const findings = [];
  let scanned = 0;
  for (const file of files) {
    try {
      if (statSync(file).size > MAX_FILE_BYTES) continue;
      const text = readFileSync(file, "utf8");
      scanned += 1;
      findings.push(...scanText(text, { file }));
    } catch {
      // Deleted between listing and reading, unreadable, or binary: skip.
    }
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(2);
  if (asJson) {
    console.log(JSON.stringify({ scanned, findings }, null, 2));
  } else {
    console.log(`[security] secret scan (${useAll ? "working tree" : "git-tracked files"})`);
    console.log(`[security] scanned ${scanned} text files in ${elapsed}s`);
    if (findings.length === 0) {
      console.log("[security] PASS — no credential-like strings detected.");
    } else {
      console.log(`[security] FAIL — ${findings.length} potential secret${findings.length === 1 ? "" : "s"}:`);
      for (const finding of findings) {
        console.log(`  ${finding.file}:${finding.line}:${finding.column}  ${finding.rule}  ${finding.preview}`);
      }
      console.log("[security] Rotate the credential, remove it from git history, then re-run this scan.");
    }
  }
  return findings.length === 0 ? 0 : 1;
}

process.exit(main());
