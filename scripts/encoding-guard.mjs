import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const TEXT_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".ts",
  ".tsx",
  ".json",
  ".md",
  ".html",
  ".css",
  ".gs",
]);
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "coverage",
  "playwright-report",
  "test-results",
  ".git",
]);

const collectFiles = (dir, files = []) => {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      collectFiles(fullPath, files);
      continue;
    }
    const ext = entry.slice(entry.lastIndexOf("."));
    if (TEXT_EXTENSIONS.has(ext)) files.push(fullPath);
  }
  return files;
};

const failures = [];

for (const filePath of collectFiles(ROOT)) {
  const buffer = readFileSync(filePath);
  if (buffer.includes(0x00)) {
    failures.push(`${relative(ROOT, filePath)}: contains NUL byte`);
    continue;
  }
  const text = buffer.toString("utf8");
  if (text.includes("\uFFFD")) {
    failures.push(`${relative(ROOT, filePath)}: contains UTF-8 replacement character`);
    continue;
  }
  if (Buffer.from(text, "utf8").compare(buffer) !== 0) {
    failures.push(`${relative(ROOT, filePath)}: invalid UTF-8 sequence`);
  }
}

if (failures.length) {
  console.error("Encoding guard failed:");
  failures.forEach((line) => console.error(` - ${line}`));
  process.exit(1);
}

console.log(`Encoding guard passed (${collectFiles(ROOT).length} text files checked).`);
