import { useCallback, useEffect, useRef, useState } from "react";
import {
  CACHE_INVALIDATED_EVENT,
  CACHE_UPDATED_EVENT,
  readCache,
} from "../api/localCache.js";
import { hasCachedResponse } from "../utils/cacheBootstrap.js";

/**
 * useCachedQuery - Local-First Data Hook
 * 
 * Pattern: UI reads from cache immediately on mount → API runs in background
 * Event handlers only update state, NEVER trigger API calls directly
 * 
 * @param {Function} apiFn - API function to call (should be wrapped with createLocalFirstReader)
 * @param {string} cacheKey - Cache key for event matching
 * @param {Object} options
 * @param {Function} options.select - Selector function to transform response
 */
export function useCachedQuery(apiFn, cacheKey = "", options = {}) {
  const selectRef = useRef(
    typeof options.select === "function" ? options.select : null,
  );
  selectRef.current =
    typeof options.select === "function" ? options.select : null;

  // Initialize state from cache immediately (no async needed)
  const [data, setData] = useState(() => {
    if (!cacheKey) return null;
    const cached = readCache(cacheKey)?.response || null;
    const select = selectRef.current;
    return select ? select(cached) : cached;
  });

  const [isLoading, setIsLoading] = useState(() => {
    if (!cacheKey) return true;
    return !hasCachedResponse(cacheKey);
  });

  /**
   * Apply response to state - ONLY updates state, no API calls
   */
  const applyResponse = useCallback((response) => {
    if (!response) return;
    if (response.success === false) return;
    const select = selectRef.current;
    setData(select ? select(response) : response);
  }, []);

  /**
   * Refresh function - calls API with force: true, used by UI triggers (button click, etc.)
   * NOT used by event handlers to prevent stack overflow
   * @param {boolean} force - If true, bypasses cache and fetches fresh data
   */
  const refresh = useCallback(async (force = true) => {
    const fn = apiFnRef.current;
    if (typeof fn !== "function") return;
    try {
      const res = await fn({ force });
      if (res) applyResponse(res);
    } catch (_) {
      // Silent refresh failure; cached data remains visible.
    }
  }, [applyResponse]);

  // Keep API function ref stable
  const apiFnRef = useRef(apiFn);
  apiFnRef.current = apiFn;

  /**
   * Effect 1: Initial API call on mount or when apiFn changes
   * This runs once per mount and sets up the initial data
   */
  useEffect(() => {
    if (typeof apiFnRef.current !== "function") return undefined;
    let cancelled = false;
    const hasCache = Boolean(cacheKey && hasCachedResponse(cacheKey));
    if (!hasCache) setIsLoading(true);
    
    apiFnRef.current()
      .then((res) => {
        if (!cancelled && res) applyResponse(res);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cacheKey, applyResponse]);

  /**
   * Effect 2: Listen to CACHE_UPDATED_EVENT
   * 
   * ⚠️ IMPORTANT: This handler ONLY updates state from cache
   * ⚠️ NEVER calls API here to prevent stack overflow loops
   */
  useEffect(() => {
    if (!cacheKey) return undefined;
    
    const onCacheUpdated = (event) => {
      // Only handle our cache key
      if (event?.detail?.cacheKey !== cacheKey) return;
      
      // Read from cache and update state (NOT call API)
      const response = event.detail?.response;
      if (response) {
        applyResponse(response);
      }
    };

    window.addEventListener(CACHE_UPDATED_EVENT, onCacheUpdated);
    return () => {
      window.removeEventListener(CACHE_UPDATED_EVENT, onCacheUpdated);
    };
  }, [cacheKey, applyResponse]);

  /**
   * Effect 3: Listen to CACHE_INVALIDATED_EVENT
   * 
   * When cache is invalidated:
   * 1. Read fresh data from cache
   * 2. If cache has data → update state from cache
   * 3. If cache miss → call API
   * 
   * ⚠️ This prevents infinite loops by checking cache before API call
   */
  useEffect(() => {
    if (!cacheKey) return undefined;
    
    const onInvalidated = (event) => {
      const keys = event?.detail?.keys;
      if (!Array.isArray(keys) || !keys.includes(cacheKey)) return;
      
      // Try to read from cache first (avoids unnecessary API calls)
      const cached = readCache(cacheKey)?.response;
      if (cached && cached.success !== false) {
        applyResponse(cached);
      } else {
        // Cache miss → call API
        refresh();
      }
    };

    window.addEventListener(CACHE_INVALIDATED_EVENT, onInvalidated);
    return () => {
      window.removeEventListener(CACHE_INVALIDATED_EVENT, onInvalidated);
    };
  }, [cacheKey, applyResponse, refresh]);

  return { data, isLoading, refresh, setData };
}
