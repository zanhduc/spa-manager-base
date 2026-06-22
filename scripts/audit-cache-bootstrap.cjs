const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const clientRoot = path.join(root, "src/client");

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(jsx|js)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

const files = walk(clientRoot).filter(
  (file) =>
    file.includes(`${path.sep}pages${path.sep}`) ||
    file.includes(`${path.sep}components${path.sep}`),
);

const violations = [];

const ALLOW_UNCONDITIONAL_LOADING = new Set(["src/client/pages/login.jsx"]);
const ALLOW_MOUNT_LOAD = new Set(["src/client/pages/receipt.jsx"]);

for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, "/");
  const src = fs.readFileSync(file, "utf8");

  const cacheBootstrapLoading = /useState\(\(\)\s*=>\s*![\w.]+\(/.test(src);
  const usesShouldBlock = src.includes("shouldBlockPanelUI");
  const blocksOnRawLoading =
    /\{loading\s*\?/.test(src) ||
    /\{isLoading\s*\?/.test(src) ||
    /blockPanel\s*=\s*loading/.test(src);

  if (cacheBootstrapLoading && blocksOnRawLoading && !usesShouldBlock) {
    violations.push({
      file: rel,
      rule: "cache-bootstrap-ui",
      message:
        "Có loading từ cache bootstrap nhưng chưa dùng shouldBlockPanelUI(loading, hasData).",
    });
  }

  const mountLoads = [
    ...src.matchAll(
      /useEffect\(\(\)\s*=>\s*\{[\s\S]*?\b(load[A-Za-z]*|refresh[A-Za-z]*)\(([^)]*)\)/g,
    ),
  ];

  for (const match of mountLoads) {
    const fnName = match[1];
    const args = match[2] || "";
    if (fnName === "refreshSchedules") continue;
    if (/silent\s*:/.test(args)) continue;
    if (/hasCached|bootstrapSilent|Bootstrap/.test(args)) continue;
    if (args.trim() === "") {
      if (ALLOW_MOUNT_LOAD.has(rel)) continue;
      violations.push({
        file: rel,
        rule: "mount-load-silent",
        message: `useEffect mount gọi ${fnName}() không silent trong khi file dùng cache bootstrap.`,
      });
    }
  }

  if (/setLoading\(true\)/.test(src) && !/if\s*\(\s*!silent/.test(src)) {
    if (ALLOW_UNCONDITIONAL_LOADING.has(rel)) continue;
    violations.push({
      file: rel,
      rule: "unconditional-loading",
      message: "setLoading(true) có thể chạy khi refresh nền — cần guard !silent.",
    });
  }
}

if (violations.length) {
  console.error("audit-cache-bootstrap: FAIL");
  for (const item of violations) {
    console.error(`- [${item.rule}] ${item.file}: ${item.message}`);
  }
  process.exit(1);
}

console.log(`audit-cache-bootstrap: OK (${files.length} files scanned)`);
