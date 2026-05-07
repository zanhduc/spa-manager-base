const APP_MODE_STORAGE_KEY = "soanhang.appMode";
const VALID_MODES = ["web", "pos"];

const normalizeMode = (value) => {
  const mode = String(value || "").trim().toLowerCase();
  return VALID_MODES.includes(mode) ? mode : "";
};

const parseModeFromHash = (hashValue) => {
  const raw = String(hashValue || "").replace(/^#\/?/, "");
  if (!raw.includes("?")) return "";
  const query = raw.slice(raw.indexOf("?") + 1);
  return normalizeMode(new URLSearchParams(query).get("mode"));
};

export function isLikelyTabletPosDevice() {
  const ua = String(navigator.userAgent || "").toLowerCase();
  const touchPoints = Number(navigator.maxTouchPoints || 0);
  const isAndroid = ua.includes("android");
  const isTabletHint =
    ua.includes("tablet") ||
    (isAndroid && !ua.includes("mobile")) ||
    (touchPoints >= 5 && Math.max(window.innerWidth, window.innerHeight) >= 900);
  return isTabletHint;
}

export function readAppMode() {
  const searchMode = normalizeMode(
    new URLSearchParams(window.location.search).get("mode"),
  );
  if (searchMode) return searchMode;

  const hashMode = parseModeFromHash(window.location.hash);
  if (hashMode) return hashMode;

  try {
    const storedMode = normalizeMode(localStorage.getItem(APP_MODE_STORAGE_KEY));
    if (storedMode) return storedMode;
  } catch (e) {
    // ignore storage read failure
  }

  return isLikelyTabletPosDevice() ? "pos" : "web";
}

export function writeAppMode(mode) {
  const next = normalizeMode(mode) || "web";
  try {
    localStorage.setItem(APP_MODE_STORAGE_KEY, next);
  } catch (e) {
    // ignore storage write failure
  }
  return next;
}

export function toggleAppMode(currentMode) {
  return writeAppMode(currentMode === "pos" ? "web" : "pos");
}

export function applyAppModeToDom(mode) {
  const next = normalizeMode(mode) || "web";
  document.documentElement.setAttribute("data-app-mode", next);
  if (next === "pos") {
    document.body.classList.add("pos-mode");
  } else {
    document.body.classList.remove("pos-mode");
  }
  return next;
}
