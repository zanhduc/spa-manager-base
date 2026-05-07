import { fireAndForgetPrintLog } from "./printLogger";
const PRINT_BRIDGE_CONFIG_KEY = "soanhang.printBridgeConfig";
const PRINT_PREVIEW_CACHE_PREFIX = "soanhang.printPreview.";
const MAX_INLINE_PREVIEW_LENGTH = 1500;
const FORCE_BRIDGE_MODE = true;

const DEFAULT_CONFIG = {
  mode: "bridge",
  endpoint: "http://127.0.0.1:15321",
  printerName: "",
  printerAddress: "",
  token: "",
  timeoutMs: 8000,
};

function normalizeEndpoint(rawEndpoint) {
  const raw = String(rawEndpoint || "").trim();
  if (!raw) return "";
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  try {
    const u = new URL(withScheme);
    return `${u.protocol}//${u.host}`.replace(/\/+$/, "");
  } catch (e) {
    return withScheme.replace(/\/+$/, "");
  }
}

function buildEndpointCandidates(rawEndpoint) {
  const normalized = normalizeEndpoint(rawEndpoint);
  if (!normalized) return [];
  const candidates = [normalized];
  try {
    const u = new URL(normalized);
    if (u.hostname === "127.0.0.1") {
      candidates.push(`${u.protocol}//localhost${u.port ? `:${u.port}` : ""}`);
    } else if (u.hostname === "localhost") {
      candidates.push(`${u.protocol}//127.0.0.1${u.port ? `:${u.port}` : ""}`);
    }
  } catch (e) {
    // noop
  }
  return [...new Set(candidates)];
}

const toBool = (v) => {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true";
};

function isLikelyPrinterAddress(value) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  if (/^(usb|bt|tcp):\/\//i.test(raw)) return true;
  if (/^(\d{1,3}\.){3}\d{1,3}:\d{2,5}$/.test(raw)) return true;
  if (/^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i.test(raw)) return true;
  return false;
}

function printerDetail(config) {
  if (config?.printerAddress) return `address=${config.printerAddress}`;
  if (config?.printerName) return `printer=${config.printerName}`;
  return "printer=(default)";
}

export function readPrintBridgeConfig() {
  try {
    const raw = localStorage.getItem(PRINT_BRIDGE_CONFIG_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw);
    const rawPrinterName = String(parsed?.printerName || "").trim();
    const rawPrinterAddress = String(parsed?.printerAddress || "").trim();
    const migratedAddress = rawPrinterAddress || (isLikelyPrinterAddress(rawPrinterName) ? rawPrinterName : "");
    const migratedName =
      rawPrinterAddress || !isLikelyPrinterAddress(rawPrinterName) ? rawPrinterName : "";
    const resolvedMode = FORCE_BRIDGE_MODE
      ? "bridge"
      : parsed?.mode === "bridge"
        ? "bridge"
        : "browser";
    return {
      mode: resolvedMode,
      endpoint: normalizeEndpoint(
        String(parsed?.endpoint || DEFAULT_CONFIG.endpoint).trim() ||
          DEFAULT_CONFIG.endpoint,
      ),
      printerName: migratedName,
      printerAddress: migratedAddress,
      token: String(parsed?.token || "").trim(),
      timeoutMs: Math.max(1000, Number(parsed?.timeoutMs || DEFAULT_CONFIG.timeoutMs)),
    };
  } catch (e) {
    return { ...DEFAULT_CONFIG };
  }
}

export function writePrintBridgeConfig(next) {
  const merged = {
    ...readPrintBridgeConfig(),
    ...next,
  };
  merged.endpoint = normalizeEndpoint(merged.endpoint || DEFAULT_CONFIG.endpoint);
  if (FORCE_BRIDGE_MODE) merged.mode = "bridge";
  localStorage.setItem(PRINT_BRIDGE_CONFIG_KEY, JSON.stringify(merged));
  return merged;
}

export function buildReceiptHashQuery({
  code,
  size = "58",
  isPreview = false,
  previewData = "",
  previewDataKey = "",
  autoPrint = true,
  autoBack = true,
  dryRun = false,
}) {
  const params = new URLSearchParams();
  params.set("print", String(code || "").trim());
  if (size) params.set("size", String(size));
  if (isPreview) params.set("preview", "true");
  if (previewDataKey) {
    params.set("datakey", String(previewDataKey));
  } else if (previewData) {
    params.set("data", String(previewData));
  }
  if (autoPrint) params.set("autoprint", "1");
  if (autoBack) params.set("autoback", "1");
  if (dryRun) params.set("dryrun", "1");
  return params.toString();
}

function cleanupOldPreviewCache(now = Date.now()) {
  try {
    const keys = Object.keys(sessionStorage || {}).filter((k) =>
      String(k).startsWith(PRINT_PREVIEW_CACHE_PREFIX),
    );
    if (!keys.length) return;
    const maxAgeMs = 30 * 60 * 1000;
    keys.forEach((key) => {
      const raw = sessionStorage.getItem(key);
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (!parsed?.createdAt || now - Number(parsed.createdAt) > maxAgeMs) {
          sessionStorage.removeItem(key);
        }
      } catch (e) {
        sessionStorage.removeItem(key);
      }
    });
  } catch (e) {
    // noop
  }
}

function savePreviewToSession(previewData) {
  const value = String(previewData || "");
  if (!value) return "";
  try {
    cleanupOldPreviewCache();
    const key = `${PRINT_PREVIEW_CACHE_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(
      key,
      JSON.stringify({
        createdAt: Date.now(),
        data: value,
      }),
    );
    return key;
  } catch (e) {
    return "";
  }
}

export function getPreviewDataByKey(dataKey) {
  const key = String(dataKey || "").trim();
  if (!key) return "";
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return String(parsed?.data || "");
  } catch (e) {
    return "";
  }
}

function normalizeBrowserPayload(payload) {
  const next = { ...payload };
  const rawPreview = String(payload?.previewData || "");
  const rawDataKey = String(payload?.previewDataKey || "");
  if (rawDataKey) {
    next.previewData = "";
    next.previewDataKey = rawDataKey;
    return next;
  }
  if (!rawPreview) return next;
  if (rawPreview.length > MAX_INLINE_PREVIEW_LENGTH) {
    const dataKey = savePreviewToSession(rawPreview);
    if (dataKey) {
      next.previewData = "";
      next.previewDataKey = dataKey;
      return next;
    }
  }
  return next;
}

export function navigateBrowserPrint(payload) {
  const normalized = normalizeBrowserPayload(payload);
  const query = buildReceiptHashQuery(normalized);
  const targetUrl = `${window.location.origin}${window.location.pathname}?${query}`;
  fireAndForgetPrintLog({
    event: "browser_navigate_receipt",
    code: normalized?.code,
    size: normalized?.size || "58",
    mode: "browser",
    detail: "navigate=location.assign(query)",
  });
  window.location.assign(targetUrl);
}

function buildBridgeReceiptUrl(payload) {
  const code = String(payload?.code || "").trim();
  const size = String(payload?.size || "58").trim();
  const preferredExecUrl = String(import.meta.env.VITE_GAS_WEBAPP_URL || "").trim();
  const baseUrl = preferredExecUrl || `${window.location.origin}${window.location.pathname}`;
  if (!code) {
    const query = buildReceiptHashQuery(payload);
    return `${window.location.origin}${window.location.pathname}?${query}`;
  }
  const params = new URLSearchParams();
  params.set("printText", code);
  if (size) params.set("size", size);
  return `${baseUrl}?${params.toString()}`;
}

function withTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Bridge timeout"));
    }, timeoutMs);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

function rememberWorkingEndpoint(endpoint) {
  const resolved = normalizeEndpoint(endpoint);
  if (!resolved) return;
  try {
    const current = readPrintBridgeConfig();
    const currentEndpoint = normalizeEndpoint(current?.endpoint || "");
    if (currentEndpoint !== resolved) {
      writePrintBridgeConfig({ endpoint: resolved });
    }
  } catch (e) {
    // noop
  }
}

async function requestBridge({
  endpoint,
  path,
  method = "GET",
  token = "",
  timeoutMs = 8000,
  headers = {},
  body,
  expectJson = true,
}) {
  const candidates = buildEndpointCandidates(endpoint);
  if (!candidates.length) throw new Error("Thiếu endpoint bridge");
  const attemptErrors = [];

  for (const base of candidates) {
    try {
      const requestHeaders = {
        ...headers,
        ...(token ? { "X-Bridge-Token": token } : {}),
      };
      const req = fetch(`${base}${path}`, {
        method,
        headers: requestHeaders,
        body,
        cache: "no-store",
      });
      const res = await withTimeout(req, Number(timeoutMs || 8000));
      if (!res.ok) {
        attemptErrors.push(`${base} -> HTTP ${res.status}`);
        continue;
      }
      const text = await res.text();
      let data = text;
      if (expectJson) {
        try {
          data = text ? JSON.parse(text) : {};
        } catch (e) {
          attemptErrors.push(`${base} -> JSON_INVALID`);
          continue;
        }
      }
      rememberWorkingEndpoint(base);
      return { base, data, text, res };
    } catch (e) {
      attemptErrors.push(`${base} -> ${String(e?.message || e || "FAILED")}`);
    }
  }

  throw new Error(
    `Bridge request fail path=${path}. Attempts: ${attemptErrors.join(" | ") || "none"}`,
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitBridgeJobResult({
  endpoint,
  token = "",
  jobId,
  timeoutMs = 20000,
  pollMs = 500,
}) {
  const id = String(jobId || "").trim();
  if (!id) throw new Error("Thiếu jobId từ bridge");
  const startedAt = Date.now();
  let lastStatus = "";
  let lastMessage = "";

  while (Date.now() - startedAt <= timeoutMs) {
    try {
      const { data } = await requestBridge({
        endpoint,
        path: `/jobs/${encodeURIComponent(id)}`,
        method: "GET",
        token,
        timeoutMs: Math.min(5000, timeoutMs),
      });
      const item = data?.item || {};
      const status = String(item?.status || "").trim().toUpperCase();
      const message = String(item?.message || "").trim();
      if (status) lastStatus = status;
      if (message) lastMessage = message;

      if (status === "SUCCESS") return item;
      if (status === "FAILED" || status === "REJECTED") {
        throw new Error(message || `Bridge job ${id} ${status}`);
      }
    } catch (e) {
      const msg = String(e?.message || e || "");
      if (!msg.includes("HTTP 404")) {
        throw e;
      }
    }
    await sleep(pollMs);
  }

  throw new Error(
    `Bridge job timeout jobId=${id} status=${lastStatus || "UNKNOWN"} message=${lastMessage || "-"}`,
  );
}

async function bridgePrint(config, payload) {
  const absoluteUrl = buildBridgeReceiptUrl(payload);
  const endpoint = String(config.endpoint || "").trim();
  if (!endpoint) throw new Error("Thiếu endpoint bridge");
  const { data } = await requestBridge({
    endpoint,
    path: "/print",
    method: "POST",
    token: config.token || "",
    timeoutMs: Number(config.timeoutMs || 8000),
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "receipt-url",
      url: absoluteUrl,
      code: payload.code,
      size: payload.size || "58",
      printerName: config.printerName || undefined,
      printerAddress: config.printerAddress || undefined,
      source: "soanhang-congno",
    }),
  });
  if (data && data.success === false) {
    throw new Error(String(data.message || "Bridge in thất bại"));
  }
  const jobId = String(data?.jobId || "").trim();
  if (!jobId) return data;
  const ackStatus = String(data?.status || "").trim().toUpperCase();
  if (ackStatus === "SUCCESS") return data;
  const waitMs = Math.max(8000, Math.min(60000, Number(config.timeoutMs || 8000) * 3));
  const finalJob = await waitBridgeJobResult({
    endpoint,
    token: config.token || "",
    jobId,
    timeoutMs: waitMs,
    pollMs: 500,
  });
  return {
    ...data,
    status: finalJob?.status || data?.status || "UNKNOWN",
    message: finalJob?.message || data?.message || "",
  };
}

function choosePrinterTarget(printers, currentConfig = {}) {
  const list = Array.isArray(printers) ? printers : [];
  if (!list.length) return { printerName: "", printerAddress: "" };
  const currentAddress = String(currentConfig?.printerAddress || "").trim();
  if (currentAddress && list.includes(currentAddress)) {
    return { printerName: "", printerAddress: currentAddress };
  }
  const currentName = String(currentConfig?.printerName || "").trim();
  if (currentName && list.includes(currentName)) {
    return isLikelyPrinterAddress(currentName)
      ? { printerName: "", printerAddress: currentName }
      : { printerName: currentName, printerAddress: "" };
  }
  const priorityRules = [
    "xprinter",
    "xp-",
    "tm-",
    "epson",
    "pos",
    "thermal",
    "receipt",
    "58",
    "80",
  ];
  const hit = list.find((name) => {
    const lowered = String(name || "").toLowerCase();
    return priorityRules.some((rule) => lowered.includes(rule));
  });
  const selected = hit || list[0] || "";
  if (!selected) return { printerName: "", printerAddress: "" };
  return isLikelyPrinterAddress(selected)
    ? { printerName: "", printerAddress: selected }
    : { printerName: selected, printerAddress: "" };
}

function mapBridgeErrorMessage(error) {
  const raw = String(error?.message || error || "");
  const normalized = raw.toLowerCase();
  if (
    normalized.includes("timeout") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("network")
  ) {
    if (
      normalized.includes("attempts:") &&
      (normalized.includes("127.0.0.1") || normalized.includes("localhost"))
    ) {
      return "Không gọi được bridge từ web (có thể do CORS/PNA hoặc bridge chưa mở đúng trên máy POS).";
    }
    return "Không kết nối được Print Bridge local.";
  }
  if (
    normalized.includes("printer not found") ||
    normalized.includes("not found printer") ||
    normalized.includes("không tìm thấy máy in")
  ) {
    return "Bridge không tìm thấy đúng tên máy in đã cấu hình.";
  }
  if (
    normalized.includes("quyen usb") ||
    normalized.includes("usb permission") ||
    normalized.includes("khong mo duoc usb")
  ) {
    return "Chưa cấp quyền USB cho Bridge. Mở app Bridge trên tablet và cho phép USB.";
  }
  if (normalized.includes("bluetooth dang tat")) {
    return "Bluetooth đang tắt trên tablet.";
  }
  if (normalized.includes("busy") || normalized.includes("offline")) {
    return "Máy in đang bận hoặc offline.";
  }
  return raw || "Bridge in thất bại.";
}

export async function openReceiptWithStrategy(payload, options = {}) {
  const cfg = readPrintBridgeConfig();
  const onInfo = typeof options.onInfo === "function" ? options.onInfo : () => {};
  const baseLog = {
    code: payload?.code,
    size: payload?.size || "58",
    mode: "bridge",
  };

  fireAndForgetPrintLog({
    ...baseLog,
    event: "request_received",
    detail: payload?.isPreview ? "preview=true" : "preview=false",
  });

  if (payload?.isPreview) {
    const previewError = "In nhap khong ho tro bridge lock mode.";
    onInfo("Bản xem trước không hỗ trợ in tự động trên POS.");
    fireAndForgetPrintLog({
      ...baseLog,
      event: "preview_blocked_bridge_lock",
      status: "ERROR",
      message: previewError,
    });
    return {
      mode: "bridge",
      fallback: false,
      blocked: true,
      error: new Error(previewError),
    };
  }

  try {
    const readyConfig = await ensurePrintBridgeReady();
    await bridgePrint(readyConfig, payload);
    fireAndForgetPrintLog({
      ...baseLog,
      event: "bridge_sent",
      detail: printerDetail(readyConfig),
    });
    onInfo("Đã gửi lệnh in qua agent bridge.");
    return { mode: "bridge", fallback: false };
  } catch (error) {
    const friendly = mapBridgeErrorMessage(error);
    console.warn("[print-bridge] failed no fallback:", {
      message: String(error?.message || error),
      payloadCode: payload?.code,
      printerName: cfg.printerName || "(default)",
      printerAddress: cfg.printerAddress || "(default)",
      endpoint: cfg.endpoint,
    });
    onInfo(`${friendly} Vui lòng kiểm tra Bridge và máy in.`);
    fireAndForgetPrintLog({
      ...baseLog,
      event: "bridge_failed_no_fallback",
      status: "ERROR",
      message: String(error?.message || error || "Bridge error"),
      detail: printerDetail(cfg),
    });
    return { mode: "bridge", fallback: false, error };
  }
}

export async function pingPrintBridge(customEndpoint, customToken = "") {
  const cfg = readPrintBridgeConfig();
  const endpoint = String(customEndpoint || cfg.endpoint || "").trim();
  if (!endpoint) throw new Error("Thiếu endpoint bridge");
  const resolvedToken = String(customToken || cfg.token || "").trim();
  await requestBridge({
    endpoint,
    path: "/health",
    method: "GET",
    token: resolvedToken,
    timeoutMs: Number(cfg.timeoutMs || 8000),
    expectJson: false,
  });
  return true;
}

export async function listPrintBridgePrinters(customEndpoint, customToken = "") {
  const cfg = readPrintBridgeConfig();
  const endpoint = String(customEndpoint || cfg.endpoint || "").trim();
  if (!endpoint) throw new Error("Thiếu endpoint bridge");
  const resolvedToken = String(customToken || cfg.token || "").trim();
  const { data } = await requestBridge({
    endpoint,
    path: "/printers",
    method: "GET",
    token: resolvedToken,
    timeoutMs: Number(cfg.timeoutMs || 8000),
  });
  const list = Array.isArray(data?.printers)
    ? data.printers
    : Array.isArray(data)
      ? data
      : [];
  return list
    .map((item) =>
      typeof item === "string" ? item : String(item?.address || item?.name || ""),
    )
    .map((name) => String(name || "").trim())
    .filter(Boolean);
}

export async function getPrintBridgeMetrics(customEndpoint, customToken = "") {
  const cfg = readPrintBridgeConfig();
  const endpoint = String(customEndpoint || cfg.endpoint || "").trim();
  if (!endpoint) throw new Error("Thiếu endpoint bridge");
  const resolvedToken = String(customToken || cfg.token || "").trim();
  const { data } = await requestBridge({
    endpoint,
    path: "/metrics",
    method: "GET",
    token: resolvedToken,
    timeoutMs: Number(cfg.timeoutMs || 8000),
  });
  return data || {};
}

export async function getPrintBridgeLogs(customEndpoint, limit = 30, customToken = "") {
  const cfg = readPrintBridgeConfig();
  const endpoint = String(customEndpoint || cfg.endpoint || "").trim();
  if (!endpoint) throw new Error("Thiếu endpoint bridge");
  const resolvedToken = String(customToken || cfg.token || "").trim();
  const safeLimit = Math.max(1, Math.min(100, Number(limit || 30)));
  const { data } = await requestBridge({
    endpoint,
    path: `/logs?limit=${safeLimit}`,
    method: "GET",
    token: resolvedToken,
    timeoutMs: Number(cfg.timeoutMs || 8000),
  });
  return Array.isArray(data?.items) ? data.items : [];
}

let bridgeSetupPromise = null;
let bridgeSetupDone = false;

export async function ensurePrintBridgeReady(options = {}) {
  if (bridgeSetupDone && !options?.force) {
    return readPrintBridgeConfig();
  }
  if (bridgeSetupPromise && !options?.force) {
    return bridgeSetupPromise;
  }
  bridgeSetupPromise = (async () => {
    const current = writePrintBridgeConfig({ mode: "bridge" });
    const endpoint = String(current.endpoint || DEFAULT_CONFIG.endpoint).trim();
    await pingPrintBridge(endpoint);
    const printers = await listPrintBridgePrinters(endpoint);
    const selected = choosePrinterTarget(printers, current);
    const next = writePrintBridgeConfig({
      mode: "bridge",
      endpoint,
      printerName: selected.printerName,
      printerAddress: selected.printerAddress,
    });
    bridgeSetupDone = true;
    fireAndForgetPrintLog({
      event: "bridge_autosetup_success",
      code: "-",
      size: "-",
      mode: "bridge",
      detail: printerDetail(next),
    });
    return next;
  })()
    .catch((error) => {
      fireAndForgetPrintLog({
        event: "bridge_autosetup_failed",
        code: "-",
        size: "-",
        mode: "bridge",
        status: "ERROR",
        message: String(error?.message || error || "Bridge autosetup failed"),
      });
      throw error;
    })
    .finally(() => {
      bridgeSetupPromise = null;
    });
  return bridgeSetupPromise;
}

export function parsePrintFlags(paramsLike) {
  const params = paramsLike instanceof URLSearchParams ? paramsLike : new URLSearchParams(paramsLike || "");
  return {
    autoPrint: toBool(params.get("autoprint")),
    autoBack: toBool(params.get("autoback")),
    dryRun: toBool(params.get("dryrun")),
  };
}
