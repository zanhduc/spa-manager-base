/**
 * Khớp cache key theo danh sách exact hoặc prefix (vd. staff_attendance:2026-06-15).
 */
export function matchesCacheKey(cacheKey = "", { exactKeys = [], prefixes = [] } = {}) {
  const key = String(cacheKey || "").trim();
  if (!key) return false;
  const exact = (Array.isArray(exactKeys) ? exactKeys : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  if (exact.includes(key)) return true;
  const prefixList = (Array.isArray(prefixes) ? prefixes : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return prefixList.some((prefix) => key === prefix || key.startsWith(`${prefix}:`));
}

export function matchesInvalidationKeys(
  keys = [],
  { exactKeys = [], prefixes = [] } = {},
) {
  if (!Array.isArray(keys)) return false;
  return keys.some((key) => matchesCacheKey(key, { exactKeys, prefixes }));
}
