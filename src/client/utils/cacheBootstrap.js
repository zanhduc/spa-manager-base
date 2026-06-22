import { readCache } from "../api/localCache.js";

export function readCachedList(cacheKey, maxAgeMs = 0) {
  const cached = readCache(cacheKey, maxAgeMs)?.response;
  return Array.isArray(cached?.data) ? cached.data : [];
}

export function hasCachedResponse(cacheKey, maxAgeMs = 0) {
  return Boolean(readCache(cacheKey, maxAgeMs)?.response);
}

export function shouldBlockPanelUI(loading, hasData) {
  return Boolean(loading && !hasData);
}

/** Khi đã có cache, bootstrap chỉ refresh nền — không bật loading chặn UI. */
export function bootstrapSilentAny(...cacheKeys) {
  const keys = cacheKeys.flat().filter(Boolean);
  return keys.some((key) => hasCachedResponse(key));
}

export function readCachedObject(cacheKey, maxAgeMs = 0) {
  const cached = readCache(cacheKey, maxAgeMs)?.response;
  return cached?.data ?? null;
}
