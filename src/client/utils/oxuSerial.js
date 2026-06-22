import { openOxuSerialPopup, recoverOxuSerialPopup } from "./OxuSerialPopup";

const BAUD_RATE = 115200;
const DEFAULT_BRIDGE_URL = "https://dulia.io.vn/oxu-serial.html";
const BRIDGE_SEND_TIMEOUT_MS = 120000;
const BRIDGE_PING_TIMEOUT_MS = 8000;
const OXU_GRANTED_STORAGE_KEY = "spa.oxu_com_granted.v1";
const BRIDGE_POPUP_NAME = "oxu_serial_bridge";
const NEED_GESTURE_HINT =
  "Bấm «Chọn cổng COM» trong popup OXU vừa mở; sau khi kết nối, app sẽ gửi QR qua popup này.";
const POPUP_BLOCKED_HINT =
  "Không mở được popup OXU. Cho phép popup trên trình duyệt, rồi bấm lại tab Chuyển khoản hoặc nút gửi QR.";

let sharedPort = null;
let bridgePopup = null;
let inlinePopup = null;
/** Cached after first probe — avoids repeated serial policy violations in GAS iframe. */
let directSerialPolicyBlocked = null;
let bridgeReady = (() => {
  try {
    return localStorage.getItem(OXU_GRANTED_STORAGE_KEY) === "1";
  } catch (_) {
    return false;
  }
})();

export const OXU_BAUD_RATE = BAUD_RATE;

/** Production GAS iframe: luôn dùng bridge, không gọi Web Serial trực tiếp. */
export const mustUseOxuHostBridge = () => {
  if (directSerialPolicyBlocked === true) return true;
  if (directSerialPolicyBlocked === false) return false;
  return detectSerialPolicyBlockedSync() === true;
};

export const isWebSerialSupported = () =>
  typeof navigator !== "undefined" && typeof navigator.serial !== "undefined";

export const isSerialPolicyBlocked = (error) =>
  /permissions policy|disallow/i.test(String(error?.message || error || ""));

export const isBridgeUserGestureRequired = (errorOrMessage) =>
  /user gesture|Chọn cổng COM|thao tác tay|NEED_GESTURE/i.test(
    String(errorOrMessage?.message || errorOrMessage || ""),
  );

export const markOxuComGranted = (granted = true) => {
  try {
    if (granted) {
      localStorage.setItem(OXU_GRANTED_STORAGE_KEY, "1");
    } else {
      localStorage.removeItem(OXU_GRANTED_STORAGE_KEY);
    }
  } catch (_) {
    // noop
  }
};

export const resolveOxuBridgeUrl = (embed = false) => {
  const configured = String(import.meta.env.VITE_OXU_BRIDGE_URL || "").trim();
  const base = (() => {
    if (configured) return configured.replace(/\?.*$/, "");
    try {
      const referrer = String(document.referrer || "").trim();
      if (referrer) {
        const origin = new URL(referrer).origin;
        if (/^https?:\/\//i.test(origin) && !/script\.google/i.test(origin)) {
          return `${origin}/oxu-serial.html`;
        }
      }
    } catch (_) {
      // fallback below
    }
    return DEFAULT_BRIDGE_URL.replace(/\?.*$/, "");
  })();

  return embed ? `${base}?embed=1` : base;
};

export const resolveOxuHostOrigin = () => {
  const configured = String(import.meta.env.VITE_OXU_HOST_ORIGIN || "").trim();
  if (configured) return configured.replace(/\/+$/, "");

  try {
    const referrer = String(document.referrer || "").trim();
    if (referrer) {
      const origin = new URL(referrer).origin;
      if (/^https?:\/\//i.test(origin) && !/script\.google/i.test(origin)) {
        return origin;
      }
    }
  } catch (_) {
    // fallback below
  }

  try {
    if (typeof window !== "undefined" && window.top && window.top !== window) {
      return new URL(window.top.location.href).origin;
    }
  } catch (_) {
    // cross-origin iframe (GAS)
  }

  return "https://dulia.io.vn";
};

const GAS_HOST_RE =
  /(^|\.)((script\.google(usercontent)?)|googleusercontent)\.com$/i;

const detectSerialPolicyBlockedSync = () => {
  if (typeof document === "undefined" || typeof window === "undefined") return null;
  try {
    if (document.permissionsPolicy && !document.permissionsPolicy.allowsFeature("serial")) {
      return true;
    }
  } catch (_) {
    // noop
  }
  try {
    if (GAS_HOST_RE.test(String(window.location.hostname || ""))) return true;
  } catch (_) {
    // noop
  }
  try {
    if (window.top && window.top !== window && window.location.origin !== window.top.location.origin) {
      return true;
    }
  } catch (_) {
    return true;
  }
  return null;
};

if (typeof window !== "undefined") {
  const blocked = detectSerialPolicyBlockedSync();
  if (blocked === true) {
    directSerialPolicyBlocked = true;
  }
}

export const isOxuComGrantedLocally = () => {
  try {
    return localStorage.getItem(OXU_GRANTED_STORAGE_KEY) === "1";
  } catch (_) {
    return false;
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const createBridgeRequestId = () =>
  `oxu-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const OXU_DEBUG_PREFIX = "[OXU postMessage]";

const normalizeOrigin = (origin) => String(origin || "").trim().replace(/\/+$/, "");

const oxuDebugLog = (stage, details = {}) => {
  try {
    console.log(OXU_DEBUG_PREFIX, stage, details);
  } catch (_) {
    // noop
  }
};

const getWindowOrigin = (targetWindow) => {
  try {
    if (!targetWindow || targetWindow === window) return "";
    const href = String(targetWindow.location?.href || "");
    if (!href) return "";
    return new URL(href).origin;
  } catch (_) {
    return "";
  }
};

const getInlinePopupTargetOrigin = () => normalizeOrigin(window.location?.origin || "");

const getBridgePopupTargetOrigin = () => {
  try {
    return normalizeOrigin(new URL(resolveOxuBridgeUrl(false)).origin);
  } catch (_) {
    return normalizeOrigin(resolveOxuHostOrigin());
  }
};

const isTrustedOxuMessageOrigin = (origin) => {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  const allowed = [
    getInlinePopupTargetOrigin(),
    normalizeOrigin(resolveOxuHostOrigin()),
    getBridgePopupTargetOrigin(),
  ].filter(Boolean);
  return allowed.includes(normalized);
};

const postMessageToTarget = (target, payload, targetOrigin, channel = "unknown") => {
  if (!target || target === window) return false;
  try {
    target.postMessage(payload, targetOrigin);
    oxuDebugLog("send", {
      channel,
      type: payload?.type || "",
      targetOrigin,
      requestId: payload?.requestId || payload?.payload?.requestId || "",
    });
    return true;
  } catch (error) {
    oxuDebugLog("send_error", {
      channel,
      type: payload?.type || "",
      targetOrigin,
      requestId: payload?.requestId || payload?.payload?.requestId || "",
      message: String(error?.message || error || ""),
    });
    return false;
  }
};

const isBridgePopupOnBridgePage = (popup = bridgePopup) => {
  if (!popup || popup.closed) return false;
  try {
    const href = String(popup.location?.href || "");
    if (!href || href === "about:blank") return false;
    return /oxu-serial\.html/i.test(href);
  } catch (_) {
    // Cross-origin while loading — only trust windows we opened ourselves.
    return popup === bridgePopup;
  }
};

const clearStaleBridgePopupRef = () => {
  if (!bridgePopup || bridgePopup.closed) {
    bridgePopup = null;
    return;
  }
  if (!isBridgePopupOnBridgePage(bridgePopup)) {
    try {
      bridgePopup.close();
    } catch (_) {
      // noop
    }
    bridgePopup = null;
  }
};

const isBridgePopupAlive = () => {
  clearStaleBridgePopupRef();
  return isBridgePopupOnBridgePage(bridgePopup);
};

if (typeof window !== "undefined") {
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (!isTrustedOxuMessageOrigin(event.origin)) {
      if (String(data.type || "").startsWith("OXU_")) {
        oxuDebugLog("receive_ignored_origin", {
          type: data.type,
          origin: event.origin,
          requestId: data.requestId || "",
        });
      }
      return;
    }

    if (String(data.type || "").startsWith("OXU_")) {
      oxuDebugLog("receive", {
        type: data.type,
        origin: event.origin,
        requestId: data.requestId || "",
      });
    }

    if (data.type === "OXU_BRIDGE_READY") {
      if (data.ok) {
        bridgeReady = true;
        markOxuComGranted(true);
      } else if (!isOxuComGrantedLocally()) {
        bridgeReady = false;
      }
      return;
    }

    if (data.type === "OXU_SEND_RESULT" && data.ok) {
      bridgeReady = true;
      markOxuComGranted(true);
    }
  });
}

const waitForBridgeMessage = (
  type,
  requestId,
  { timeoutMs = BRIDGE_SEND_TIMEOUT_MS, allowPending = false, sourceWindow = null } = {},
) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener("message", onMessage);
      oxuDebugLog("wait_timeout", {
        type,
        requestId,
        timeoutMs,
        sourceRequired: !!sourceWindow,
      });
      reject(new Error("Hết thời gian chờ cổng COM OXU."));
    }, timeoutMs);

    const onMessage = (event) => {
      const data = event.data;
      if (!data || typeof data !== "object" || data.type !== type) return;
      if (!isTrustedOxuMessageOrigin(event.origin)) {
        oxuDebugLog("wait_ignored_origin", {
          type,
          requestId,
          origin: event.origin,
          actualType: data.type,
        });
        return;
      }
      if (sourceWindow && event.source !== sourceWindow) {
        oxuDebugLog("wait_ignored_source", {
          type,
          requestId,
          origin: event.origin,
          actualType: data.type,
        });
        return;
      }
      if (requestId && data.requestId && data.requestId !== requestId) return;

      if (allowPending && !data.ok && (data.pending || data.needsUserGesture)) {
        oxuDebugLog("wait_pending", {
          type,
          requestId,
          origin: event.origin,
          message: data.message || "",
        });
        return;
      }

      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      oxuDebugLog("wait_resolved", {
        type,
        requestId,
        origin: event.origin,
        ok: data.ok,
        ready: data.ready,
        message: data.message || "",
      });
      resolve(data);
    };

    window.addEventListener("message", onMessage);
  });

export const isDirectSerialUsable = async () => {
  if (!isWebSerialSupported()) return false;
  if (directSerialPolicyBlocked === true) return false;
  if (directSerialPolicyBlocked === false) return true;

  const syncBlocked = detectSerialPolicyBlockedSync();
  if (syncBlocked === true) {
    directSerialPolicyBlocked = true;
    return false;
  }

  try {
    await navigator.serial.getPorts();
    directSerialPolicyBlocked = false;
    return true;
  } catch (error) {
    if (isSerialPolicyBlocked(error)) {
      directSerialPolicyBlocked = true;
      return false;
    }
    return false;
  }
};

const RELAY_MAX_ANCESTORS = 12;

const postOxuRelayEnvelope = (envelope) => {
  const hostOrigin = resolveOxuHostOrigin();
  let posted = false;

  /** GAS nests userCodeAppPanel — parent/top may be googleusercontent, not dulia.io.vn. */
  const relayThroughParentChain = () => {
    let ancestor = window;
    for (let depth = 0; depth < RELAY_MAX_ANCESTORS; depth += 1) {
      let parent = null;
      try {
        parent = ancestor.parent;
      } catch (_) {
        break;
      }
      if (!parent || parent === ancestor) break;

      const parentOrigin = getWindowOrigin(parent);
      if (parentOrigin) {
        posted = postMessageToTarget(parent, envelope, parentOrigin, `relay-parent-${depth + 1}`) || posted;
      } else {
        posted = postMessageToTarget(parent, envelope, hostOrigin, `relay-parent-host-origin-${depth + 1}`) || posted;
        posted = postMessageToTarget(parent, envelope, "*", `relay-parent-fallback-star-${depth + 1}`) || posted;
      }
      ancestor = parent;
    }
  };

  if (mustUseOxuHostBridge()) {
    relayThroughParentChain();
    return posted;
  }

  const topOrigin = getWindowOrigin(window.top) || hostOrigin;
  posted = postMessageToTarget(window.top, envelope, topOrigin, "relay-top") || posted;
  try {
    if (window.parent && window.parent !== window.top) {
      const parentOrigin = getWindowOrigin(window.parent) || hostOrigin;
      posted = postMessageToTarget(window.parent, envelope, parentOrigin, "relay-parent") || posted;
    }
  } catch (_) {
    posted = postMessageToTarget(window.parent, envelope, hostOrigin, "relay-parent-catch") || posted;
  }

  return posted;
};

const isRunningInHostIframe = () => {
  try {
    return Boolean(window.top && window.top !== window);
  } catch (_) {
    return true;
  }
};

const postOxuRelaySync = (payload) => {
  const requestId = payload.requestId || createBridgeRequestId();
  const envelope = {
    type: "OXU_RELAY",
    requestId,
    payload: { ...payload, requestId },
  };
  postOxuRelayEnvelope(envelope);
  return requestId;
};

/** Gọi đồng bộ ngay khi user click (trước mọi await). */
export const primeOxuBridgePopupSync = () => {
  if (typeof window === "undefined") return null;

  if (mustUseOxuHostBridge()) {
    if (!getInlinePopupRef()) {
      inlinePopup = openOxuSerialPopup();
    }
    return inlinePopup;
  }

  if (isBridgePopupAlive()) return bridgePopup;
  return openBridgePopupSyncLocal();
};

const getInlinePopupRef = () => {
  if (inlinePopup && !inlinePopup.closed) return inlinePopup;
  inlinePopup = recoverOxuSerialPopup();
  if (inlinePopup && !inlinePopup.closed) return inlinePopup;
  inlinePopup = null;
  return null;
};

const ensureInlinePopup = () => {
  const existing = getInlinePopupRef();
  if (existing) return existing;
  inlinePopup = openOxuSerialPopup();
  return inlinePopup;
};

/** Đẩy QR/payload checkout lên popup OXU inline (QR-first UI). */
export const syncOxuPopupCheckoutView = (payload = {}) => {
  if (typeof window === "undefined") return false;
  const popup = ensureInlinePopup();
  if (!popup) return false;
  const requestId = createBridgeRequestId();
  return postMessageToTarget(
    popup,
    {
      type: "OXU_SET_QR",
      requestId,
      qrImageUrl: String(payload.qrImageUrl || "").trim(),
      command: String(payload.command || "").trim(),
      amountLabel: String(payload.amountLabel || "").trim(),
      bankLabel: String(payload.bankLabel || "").trim(),
      accountLabel: String(payload.accountLabel || "").trim(),
    },
    getInlinePopupTargetOrigin(),
    "inline-popup-set-qr",
  );
};

const pingInlinePopup = async () => {
  const popup = getInlinePopupRef();
  if (!popup) return false;
  const requestId = createBridgeRequestId();
  try {
    postMessageToTarget(
      popup,
      { type: "OXU_PING", requestId },
      getInlinePopupTargetOrigin(),
      "inline-popup-ping",
    );
    const pong = await waitForBridgeMessage("OXU_PONG", requestId, {
      timeoutMs: BRIDGE_PING_TIMEOUT_MS,
      sourceWindow: popup,
    });
    if (pong.ready) {
      bridgeReady = true;
      markOxuComGranted(true);
    }
    return !!pong.ready;
  } catch (_) {
    return false;
  }
};

const sendViaInlinePopup = async (command) => {
  const popup = ensureInlinePopup();
  if (!popup) {
    throw new Error(POPUP_BLOCKED_HINT);
  }

  const requestId = createBridgeRequestId();
  postMessageToTarget(
    popup,
    { type: "OXU_SEND", command, requestId },
    getInlinePopupTargetOrigin(),
    "inline-popup-send",
  );

  const result = await waitForBridgeMessage("OXU_SEND_RESULT", requestId, {
    allowPending: true,
    timeoutMs: BRIDGE_SEND_TIMEOUT_MS,
    sourceWindow: popup,
  });

  if (result.ok) {
    bridgeReady = true;
    markOxuComGranted(true);
    return;
  }

  if (result.needsUserGesture || result.pending || isBridgeUserGestureRequired(result.message)) {
    throw new Error("NEED_GESTURE");
  }

  throw new Error(result.message || "Gửi COM qua popup inline thất bại.");
};

const openBridgePopupSyncLocal = () => {
  clearStaleBridgePopupRef();
  if (isBridgePopupAlive()) return bridgePopup;

  const url = resolveOxuBridgeUrl(false);
  const features =
    "width=520,height=420,left=" +
    Math.max(0, (screen.width - 520) / 2) +
    ",top=" +
    Math.max(0, (screen.height - 420) / 2) +
    ",menubar=no,toolbar=no,location=no,status=no";

  let popup = window.open(url, BRIDGE_POPUP_NAME, features);
  if (!popup) {
    popup = window.open("about:blank", BRIDGE_POPUP_NAME, features);
    if (popup) {
      try {
        popup.location.href = url;
      } catch (_) {
        // noop
      }
    }
  }

  if (popup) {
    bridgePopup = popup;
    return popup;
  }

  return null;
};

const showHostGestureBar = (message = POPUP_BLOCKED_HINT) => {
  return message;
};

const postViaHostRelay = async (payload, { allowPending = false, timeoutMs } = {}) => {
  const requestId = payload.requestId || createBridgeRequestId();
  const envelope = {
    type: "OXU_RELAY",
    requestId,
    payload: { ...payload, requestId },
  };

  if (!postOxuRelayEnvelope(envelope)) {
    throw new Error("NO_RELAY");
  }

  const responseType = payload.type === "OXU_PING" ? "OXU_PONG" : "OXU_SEND_RESULT";
  return waitForBridgeMessage(responseType, requestId, {
    timeoutMs:
      timeoutMs ||
      (payload.type === "OXU_PING" ? BRIDGE_PING_TIMEOUT_MS : BRIDGE_SEND_TIMEOUT_MS),
    allowPending,
  });
};

const pingSilentBridge = async () => {
  try {
    const pong = await postViaHostRelay(
      { type: "OXU_PING", requestId: createBridgeRequestId() },
      { timeoutMs: BRIDGE_PING_TIMEOUT_MS },
    );
    bridgeReady = !!pong.ready;
    if (bridgeReady) {
      markOxuComGranted(true);
    }
    return bridgeReady;
  } catch (_) {
    return false;
  }
};

const GAS_BRIDGE_ACK_TIMEOUT_MS = 3500;

const sendViaHostRelay = async (command) => {
  const requestId = createBridgeRequestId();

  try {
    const result = await postViaHostRelay(
      { type: "OXU_SEND", command, requestId },
      {
        allowPending: !mustUseOxuHostBridge(),
        timeoutMs: mustUseOxuHostBridge() ? GAS_BRIDGE_ACK_TIMEOUT_MS : BRIDGE_SEND_TIMEOUT_MS,
      },
    );

    if (result.ok) {
      bridgeReady = true;
      markOxuComGranted(true);
      return;
    }

    if (result.needsUserGesture || result.pending || isBridgeUserGestureRequired(result.message)) {
      throw new Error("NEED_GESTURE");
    }

    throw new Error(result.message || "Gửi COM qua bridge ẩn thất bại.");
  } catch (error) {
    if (isBridgeUserGestureRequired(error)) {
      throw error;
    }
    if (mustUseOxuHostBridge()) {
      // GAS sandbox thường chặn phản hồi từ dulia.io.vn — lệnh có thể đã tới embed/popup.
      bridgeReady = true;
      markOxuComGranted(true);
      return;
    }
    throw error;
  }
};

const openBridgePopup = ({ focus = true } = {}) => {
  clearStaleBridgePopupRef();

  if (isRunningInHostIframe()) {
    postOxuRelaySync({
      type: "OXU_OPEN_POPUP",
      url: resolveOxuBridgeUrl(false),
    });
    return bridgePopup;
  }

  const popup = openBridgePopupSyncLocal();
  if (!popup) {
    throw new Error(POPUP_BLOCKED_HINT);
  }

  if (focus) {
    try {
      popup.focus();
    } catch (_) {
      // noop
    }
  }

  return popup;
};

const postToBridgePopup = async (payload, { openIfMissing = true } = {}) => {
  if (isRunningInHostIframe()) {
    postOxuRelaySync({
      type: "OXU_POPUP_SEND",
      inner: payload,
    });
    return null;
  }

  const popup = isBridgePopupAlive()
    ? bridgePopup
    : openIfMissing
      ? openBridgePopup({ focus: false })
      : null;
  if (!popup) {
    showHostGestureBar();
    throw new Error("NEED_GESTURE");
  }
  await sleep(bridgeReady ? 100 : 700);
  postMessageToTarget(
    popup,
    payload,
    getBridgePopupTargetOrigin(),
    "bridge-popup-send",
  );
  return popup;
};

const pingBridgePopup = async () => {
  if (isRunningInHostIframe()) {
    return pingSilentBridge();
  }

  if (!isBridgePopupAlive()) {
    return false;
  }

  const requestId = createBridgeRequestId();
  try {
    await postToBridgePopup({ type: "OXU_PING", requestId }, { openIfMissing: false });
    const pong = await waitForBridgeMessage("OXU_PONG", requestId, {
      timeoutMs: BRIDGE_PING_TIMEOUT_MS,
      sourceWindow: bridgePopup,
    });
    bridgeReady = !!pong.ready;
    if (bridgeReady) {
      markOxuComGranted(true);
    }
    return bridgeReady;
  } catch (_) {
    return false;
  }
};

const sendViaBridgePopup = async (command) => {
  const requestId = createBridgeRequestId();
  await postToBridgePopup({
    type: "OXU_SEND",
    command,
    requestId,
  });

  const result = await waitForBridgeMessage("OXU_SEND_RESULT", requestId, {
    allowPending: true,
    timeoutMs: BRIDGE_SEND_TIMEOUT_MS,
    sourceWindow: bridgePopup,
  });

  if (result.ok) {
    bridgeReady = true;
    markOxuComGranted(true);
    return;
  }

  if (result.needsUserGesture || result.pending || isBridgeUserGestureRequired(result.message)) {
    throw new Error("NEED_GESTURE");
  }

  throw new Error(result.message || "Gửi COM qua popup thất bại.");
};

const sendOxuComCommandViaBridge = async (command) => {
  clearStaleBridgePopupRef();

  const sendDirectToInlinePopup = async () => {
    try {
      await sendViaInlinePopup(command);
      return true;
    } catch (error) {
      if (isBridgeUserGestureRequired(error)) {
        throw new Error(NEED_GESTURE_HINT);
      }
      if (/chặn popup|POPUP_BLOCKED|Không mở được popup/i.test(String(error?.message || ""))) {
        throw new Error(POPUP_BLOCKED_HINT);
      }
      throw error;
    }
  };

  if (bridgeReady || isOxuComGrantedLocally()) {
    await sendDirectToInlinePopup();
    return;
  }

  if (await pingInlinePopup()) {
    try {
      await sendViaInlinePopup(command);
      return;
    } catch (error) {
      if (!isBridgeUserGestureRequired(error)) {
        throw error;
      }
    }
  }

  await sendDirectToInlinePopup();
};

const sendViaHostPopupRelay = async (command) => {
  postOxuRelaySync({
    type: "OXU_OPEN_POPUP",
    url: resolveOxuBridgeUrl(false),
  });

  const requestId = createBridgeRequestId();
  postOxuRelaySync({
    type: "OXU_POPUP_SEND",
    inner: { type: "OXU_SEND", command, requestId },
  });

  if (mustUseOxuHostBridge()) {
    // Apps Script may drop host -> GAS postMessage replies. Treat dispatch to the
    // top-level OXU popup as success; popup/host UI handles COM setup failures.
    bridgeReady = true;
    markOxuComGranted(true);
    return;
  }

  const result = await waitForBridgeMessage("OXU_SEND_RESULT", requestId, {
    allowPending: true,
    timeoutMs: BRIDGE_SEND_TIMEOUT_MS,
  });

  if (result.ok) {
    bridgeReady = true;
    markOxuComGranted(true);
    return;
  }

  if (result.needsUserGesture || result.pending || isBridgeUserGestureRequired(result.message)) {
    throw new Error("NEED_GESTURE");
  }

  throw new Error(result.message || "Gửi COM qua host popup thất bại.");
};

export const hasGrantedOxuSerialPort = async () => {
  if (!isWebSerialSupported()) return false;

  if (mustUseOxuHostBridge()) {
    if (bridgeReady) return true;
    if (await pingSilentBridge()) return true;
    if (await pingInlinePopup()) return true;
    if (isOxuComGrantedLocally()) return true;
    return false;
  }

  const directUsable = await isDirectSerialUsable();
  if (directUsable) {
    try {
      const ports = await navigator.serial.getPorts();
      if (ports.length > 0) return true;
    } catch (_) {
      // noop
    }
  }

  return false;
};

export async function connectOxuSerialPort({ requestNew = false } = {}) {
  if (!isWebSerialSupported()) {
    throw new Error("Trình duyệt không hỗ trợ Web Serial. Hãy dùng Chrome hoặc Edge.");
  }

  if (mustUseOxuHostBridge()) {
    if (bridgeReady || (await pingSilentBridge()) || (await pingInlinePopup())) {
      return { bridge: true };
    }
    primeOxuBridgePopupSync();
    throw new Error(NEED_GESTURE_HINT);
  }

  const directUsable = await isDirectSerialUsable();
  if (!directUsable) {
    if (bridgeReady || (await pingSilentBridge())) {
      return { bridge: true };
    }
    primeOxuBridgePopupSync();
    throw new Error(NEED_GESTURE_HINT);
  }

  if (!sharedPort || requestNew) {
    const grantedPorts = await navigator.serial.getPorts();
    if (!requestNew && grantedPorts.length > 0) {
      sharedPort = grantedPorts[0];
    } else {
      sharedPort = await navigator.serial.requestPort();
    }
  }

  if (!sharedPort.readable) {
    await sharedPort.open({ baudRate: BAUD_RATE });
  }

  markOxuComGranted(true);
  return sharedPort;
};

/** Tách chuỗi ghép `JUMP(1);SET_TXT(...);QBAR(...);` thành từng lệnh riêng. */
export function splitOxuComCommands(command) {
  return String(command || "")
    .trim()
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
}

export async function sendOxuComCommand(command, options = {}) {
  const parts = splitOxuComCommands(command);
  if (!parts.length) throw new Error("Lệnh COM trống.");

  if (mustUseOxuHostBridge()) {
    await sendOxuComCommandViaBridge(command);
    return;
  }

  const directUsable = await isDirectSerialUsable();
  if (!directUsable) {
    await sendOxuComCommandViaBridge(command);
    return;
  }

  const port = await connectOxuSerialPort(options);
  const encoder = new TextEncoder();
  const writer = port.writable.getWriter();
  const delayMs = Number.isFinite(Number(options.delayMs))
    ? Math.max(0, Number(options.delayMs))
    : 40;

  try {
    for (let i = 0; i < parts.length; i += 1) {
      await writer.write(encoder.encode(`${parts[i]};\r\n`));
      if (delayMs > 0 && i < parts.length - 1) {
        await sleep(delayMs);
      }
    }
  } finally {
    writer.releaseLock();
  }

  markOxuComGranted(true);
}

export async function disconnectOxuSerialPort() {
  if (!sharedPort) return;
  try {
    if (sharedPort.readable) await sharedPort.close();
  } finally {
    sharedPort = null;
  }
}
