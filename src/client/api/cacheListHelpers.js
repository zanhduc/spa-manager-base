import { readCache, writeCache } from "./localCache.js";

export function readCachedDataList(cacheKey) {
  const cached = readCache(cacheKey)?.response;
  return cached?.success && Array.isArray(cached.data) ? cached.data : [];
}

export function writeCachedListResponse(cacheKey, data, meta = {}) {
  const cached = readCache(cacheKey)?.response;
  const next = {
    success: true,
    ...(cached && typeof cached === "object" ? cached : {}),
    data: Array.isArray(data) ? data : [],
  };
  writeCache(cacheKey, next, meta);
  return next;
}

export function upsertCachedListItem(cacheKey, item, idField = "id", meta = {}) {
  const id = String(item?.[idField] || "").trim();
  if (!id) return null;
  const existing = readCachedDataList(cacheKey);
  let found = false;
  const data = existing.map((row) => {
    if (String(row?.[idField] || "").trim() !== id) return row;
    found = true;
    return { ...row, ...item };
  });
  if (!found) data.push(item);
  return writeCachedListResponse(cacheKey, data, meta);
}

export function removeCachedListItem(cacheKey, idField, id, meta = {}) {
  const normalizedId = String(id || "").trim();
  if (!normalizedId) return null;
  const data = readCachedDataList(cacheKey).filter(
    (row) => String(row?.[idField] || "").trim() !== normalizedId,
  );
  return writeCachedListResponse(cacheKey, data, meta);
}
