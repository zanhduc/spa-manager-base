const DRAFT_PREFIX = "spa.form_draft.v1:";
const AUTH_USER_STORAGE_KEY = "soanhang.auth.user";
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const FORM_DRAFT_KEYS = Object.freeze({
  staffCatalog: "staff.catalog",
  staffSchedule: "staff.schedule",
  productEditor: "products.editor",
  treatmentCatalog: "treatment.catalog",
  bookingCheckin: "create-order.booking",
});

function canUseStorage() {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function readUserScope() {
  if (!canUseStorage()) return "guest";
  try {
    const raw = window.localStorage.getItem(AUTH_USER_STORAGE_KEY);
    if (!raw) return "guest";
    const parsed = JSON.parse(raw);
    const email = String(parsed?.user?.email || "").trim().toLowerCase();
    return email || "guest";
  } catch (_) {
    return "guest";
  }
}

function buildStorageKey(draftKey) {
  return `${DRAFT_PREFIX}${readUserScope()}:${String(draftKey || "").trim()}`;
}

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

export function readFormDraft(draftKey, maxAgeMs = DEFAULT_TTL_MS) {
  if (!canUseStorage() || !draftKey) return null;
  const raw = window.localStorage.getItem(buildStorageKey(draftKey));
  if (!raw) return null;
  const parsed = safeParse(raw);
  if (!parsed || typeof parsed !== "object") return null;
  const savedAt = Number(parsed.savedAt || 0);
  if (maxAgeMs > 0 && savedAt > 0 && Date.now() - savedAt > maxAgeMs) {
    clearFormDraft(draftKey);
    return null;
  }
  return parsed.value ?? null;
}

export function writeFormDraft(draftKey, value, meta = {}) {
  if (!canUseStorage() || !draftKey) return;
  try {
    window.localStorage.setItem(
      buildStorageKey(draftKey),
      JSON.stringify({
        value,
        savedAt: Date.now(),
        page: String(meta?.page || "").trim(),
      }),
    );
  } catch (_) {
    // Ignore quota errors — draft is best-effort.
  }
}

export function clearFormDraft(draftKey) {
  if (!canUseStorage() || !draftKey) return;
  try {
    window.localStorage.removeItem(buildStorageKey(draftKey));
  } catch (_) {
    // noop
  }
}
