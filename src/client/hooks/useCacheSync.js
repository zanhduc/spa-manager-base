import { useEffect, useRef } from "react";
import {
  CACHE_INVALIDATED_EVENT,
  CACHE_UPDATED_EVENT,
  readCache,
} from "../api/localCache.js";
import { readCachedList } from "../utils/cacheBootstrap.js";
import { matchesCacheKey, matchesInvalidationKeys } from "../utils/cacheSyncHelpers.js";

/** Đọc mảng từ cache response — dùng trước khi gọi fetch nền. */
export function readCachedListData(cacheKey = "") {
  const key = String(cacheKey || "").trim();
  if (!key) return [];
  const data = readCache(key)?.response?.data;
  return Array.isArray(data) ? data : readCachedList(key);
}

/**
 * useCacheSync - Cache Event Sync Hook
 * 
 * ⚠️ IMPORTANT: Event handlers should ONLY update state from cache
 * ⚠️ NEVER call API functions directly from these handlers
 * 
 * Pattern:
 * - onCacheUpdated: Read from cache → update state
 * - onCacheInvalidated: Read from cache → update state (or call API only if cache miss)
 * 
 * @param {Object} options
 * @param {string[]} options.cacheKeys - Exact cache keys to match
 * @param {string[]} options.cacheKeyPrefixes - Cache key prefixes to match (e.g. "staff_attendance" matches "staff_attendance:2026-06-15")
 * @param {Function} options.onCacheUpdated - Called when CACHE_UPDATED_EVENT matches
 * @param {Function} options.onCacheInvalidated - Called when CACHE_INVALIDATED_EVENT matches
 * @param {boolean} options.enabled - Enable/disable the sync
 */
export function useCacheSync({
  cacheKeys = [],
  cacheKeyPrefixes = [],
  onCacheUpdated,
  onCacheInvalidated,
  enabled = true,
}) {
  const keysKey = [...cacheKeys, ...cacheKeyPrefixes].join("|");

  const onUpdatedRef = useRef(onCacheUpdated);
  const onInvalidatedRef = useRef(onCacheInvalidated);

  useEffect(() => {
    onUpdatedRef.current = onCacheUpdated;
    onInvalidatedRef.current = onCacheInvalidated;
  }, [onCacheUpdated, onCacheInvalidated]);

  useEffect(() => {
    if (!enabled) return undefined;
    const exactKeys = cacheKeys
      .map((key) => String(key || "").trim())
      .filter(Boolean);
    const prefixes = cacheKeyPrefixes
      .map((key) => String(key || "").trim())
      .filter(Boolean);
    if (!exactKeys.length && !prefixes.length) return undefined;

    const matchOptions = { exactKeys, prefixes };

    /**
     * Handle CACHE_UPDATED_EVENT
     * 
     * ⚠️ Callbacks should read from cache and update state ONLY
     * ⚠️ DO NOT call API functions here to prevent stack overflow
     */
    const handleUpdated = (event) => {
      const cacheKey = String(event?.detail?.cacheKey || "").trim();
      if (!matchesCacheKey(cacheKey, matchOptions)) return;
      if (typeof onUpdatedRef.current === "function") {
        onUpdatedRef.current(event.detail || {}, cacheKey);
      }
    };

    /**
     * Handle CACHE_INVALIDATED_EVENT
     * 
     * ⚠️ Callbacks should read from cache first
     * ⚠️ Only call API if cache miss (use readCache() to check)
     */
    const handleInvalidated = (event) => {
      const keys = event?.detail?.keys;
      if (!matchesInvalidationKeys(keys, matchOptions)) return;
      if (typeof onInvalidatedRef.current === "function") {
        onInvalidatedRef.current(keys, event?.detail || {});
      }
    };

    window.addEventListener(CACHE_UPDATED_EVENT, handleUpdated);
    window.addEventListener(CACHE_INVALIDATED_EVENT, handleInvalidated);
    return () => {
      window.removeEventListener(CACHE_UPDATED_EVENT, handleUpdated);
      window.removeEventListener(CACHE_INVALIDATED_EVENT, handleInvalidated);
    };
  }, [keysKey, enabled]);
}
