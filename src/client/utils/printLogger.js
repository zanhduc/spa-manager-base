import { logAction } from "../api";

const USER_STORAGE_KEY = "soanhang.auth.user";

function readUserName() {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) return "unknown";
    const parsed = JSON.parse(raw);
    const user = parsed?.user || {};
    const name = String(user?.name || user?.email || "").trim();
    return name || "unknown";
  } catch (e) {
    return "unknown";
  }
}

function compact(value, maxLen = 120) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
}

export async function logPrintEvent({
  event,
  code,
  size,
  mode,
  status = "SUCCESS",
  message = "",
  detail = "",
}) {
  const safeEvent = compact(event, 40) || "unknown_event";
  const safeCode = compact(code, 40) || "-";
  const safeSize = compact(size, 10) || "-";
  const safeMode = compact(mode, 20) || "-";
  const safeMessage = compact(message, 180);
  const safeDetail = compact(detail, 220);

  const parts = [
    `[PRINT] ${safeEvent}`,
    `code=${safeCode}`,
    `size=${safeSize}`,
    `mode=${safeMode}`,
  ];
  if (safeDetail) parts.push(safeDetail);

  return logAction({
    userName: readUserName(),
    changeDescription: parts.join(" | "),
    status: String(status || "SUCCESS").toUpperCase() === "ERROR" ? "ERROR" : "SUCCESS",
    errorMessage: safeMessage,
  });
}

export function fireAndForgetPrintLog(payload) {
  Promise.resolve()
    .then(() => logPrintEvent(payload))
    .catch(() => {
      // Do not block printing flow if logging fails.
    });
}
