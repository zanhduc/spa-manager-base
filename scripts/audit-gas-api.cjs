const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const gasPath = path.join(root, "src/client/api/adapters/gasAdapter.js");
const indexPath = path.join(root, "src/client/api/index.js");
const localPath = path.join(root, "src/client/api/adapters/localAdapter.js");
const gas = fs.readFileSync(gasPath, "utf8");
const index = fs.readFileSync(indexPath, "utf8");
const local = fs.readFileSync(localPath, "utf8");

const callNames = [
  ...new Set(
    [...gas.matchAll(/call\(["']([a-zA-Z0-9_]+)["']/g)].map((m) => m[1]),
  ),
].sort();

const fnDecl = [
  ...gas.matchAll(/^function ([a-zA-Z][a-zA-Z0-9_]*)\(/gm),
].map((m) => m[1]);

const clientOnly = new Set(["gasRun", "gasFetch", "doGet"]);
const publicFns = new Set(
  fnDecl.filter((n) => !n.endsWith("_") && !clientOnly.has(n)),
);

const missingPublic = callNames.filter((n) => !publicFns.has(n));
const underscoreCalls = callNames.filter((n) => n.endsWith("_"));

const queueActions = [
  ...new Set(
    [...gas.matchAll(/runWithLockOrQueue_\(["']([A-Z0-9_]+)["']/g)].map(
      (m) => m[1],
    ),
  ),
].sort();

const dispatchBlock =
  gas.match(/function dispatchQueueAction_[\s\S]*?^}/m)?.[0] || "";
const missingQueue = queueActions.filter(
  (a) => !dispatchBlock.includes(`"${a}"`) && !dispatchBlock.includes(`'${a}'`),
);

const exportBlock =
  gas.match(/export const gasAdapter = \{([\s\S]*?)\n\};/m)?.[1] || "";
const exportKeys = [
  ...exportBlock.matchAll(/^\s+([a-zA-Z0-9_]+):/gm),
].map((m) => m[1]);

const indexAdapterRefs = [
  ...new Set([...index.matchAll(/adapter\.([a-zA-Z0-9_]+)/g)].map((m) => m[1])),
];
const missingInGasAdapter = indexAdapterRefs.filter(
  (k) => !exportKeys.includes(k) && k !== "call",
);

const declaredAll = new Set(fnDecl);
const callSites = [
  ...gas.matchAll(/\b([a-z][a-zA-Z0-9_]*)\(/g),
].map((m) => m[1]);
const undeclaredCalls = [
  ...new Set(
    callSites.filter((name) => {
      if (name.length < 4) return false;
      if (
        [
          "call",
          "catch",
          "then",
          "trim",
          "map",
          "filter",
          "reduce",
          "push",
          "slice",
          "join",
          "some",
          "find",
          "test",
          "exec",
          "match",
          "replace",
          "includes",
          "startsWith",
          "endsWith",
          "parse",
          "stringify",
          "resolve",
          "reject",
          "Promise",
          "String",
          "Number",
          "Math",
          "Date",
          "JSON",
          "Object",
          "Array",
          "Error",
          "Set",
          "Boolean",
        ].includes(name)
      ) {
        return false;
      }
      return !declaredAll.has(name) && !declaredAll.has(`${name}_`);
    }),
  ),
].sort();

const spaConstants = [
  ...new Set([...gas.matchAll(/\b(SPA_[A-Z0-9_]+)\b/g)].map((m) => m[1])),
];
const missingConstants = spaConstants.filter((name) => {
  const decl = new RegExp(`(?:var|const|let)\\s+${name}\\s*=`);
  return !decl.test(gas);
});

const localFnMap = [
  ...local.matchAll(/if \(fnName === ["']([a-zA-Z0-9_]+)["']/g),
].map((m) => m[1]);
const localMissingPublic = callNames.filter(
  (n) => !localFnMap.includes(n) && !local.includes(`fnName === "${n}"`),
);

let exitCode = 0;
const critical = [];
const warnings = [];

const report = (title, items, isCritical = true) => {
  console.log(`\n=== ${title} (${items.length}) ===`);
  if (!items.length) {
    console.log("OK");
    return;
  }
  items.forEach((item) => console.log(`  - ${item}`));
  if (isCritical) {
    critical.push(...items);
    exitCode = 1;
  } else {
    warnings.push(...items);
  }
};

report("call() thiếu public server function", missingPublic);
report("call() dùng tên có hậu tố _", underscoreCalls);
report("queue action chưa có trong dispatchQueueAction_", missingQueue);
report("index.js adapter.* chưa export trong gasAdapter", missingInGasAdapter);
report("SPA_* constant có thể undefined", missingConstants);
report(
  "call() chưa map trong localAdapter (dev mock)",
  localMissingPublic,
  false,
);

if (undeclaredCalls.length) {
  console.log(
    `\n=== Gợi ý kiểm tra call sites chưa khai báo (top 30 / ${undeclaredCalls.length}) ===`,
  );
  undeclaredCalls.slice(0, 30).forEach((n) => console.log(`  - ${n}`));
}

const codePath = path.join(root, "dist/Code.js");
if (fs.existsSync(codePath)) {
  const code = fs.readFileSync(codePath, "utf8");
  const missingInDist = callNames.filter(
    (name) => !new RegExp(`function ${name}\\(`).test(code),
  );
  report("dist/Code.js thiếu public function", missingInDist);
}

process.exit(exitCode);
