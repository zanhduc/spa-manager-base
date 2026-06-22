const CACHE_PREFIX = "soanhang_api_cache_v1:";
const AUTH_USER_STORAGE_KEY = "soanhang.auth.user";
const DEFAULT_OPTIMISTIC_CACHE_TTL_MS = 20000;
const MANUAL_REFRESH_PREFIX = "soanhang_manual_refresh:";
const inflightRefresh = new Map();
const lastRefreshAt = new Map();
const optimisticProtectedKeys = new Map();
let mutationSuccessHook = null;
export const CACHE_INVALIDATED_EVENT = "soanhang_api_cache_invalidated";
export const CACHE_UPDATED_EVENT = "soanhang_api_cache_updated";

function canUseStorage() {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function nowMs() {
  return Date.now();
}

function buildStorageKey(cacheKey) {
  return `${CACHE_PREFIX}${readUserScope()}:${cacheKey}`;
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

function buildManualRefreshKey(cacheKey) {
  return `${MANUAL_REFRESH_PREFIX}${readUserScope()}:${cacheKey}`;
}

function getManualRefreshAt(cacheKey) {
  if (!canUseStorage()) return 0;
  try {
    const raw = window.localStorage.getItem(buildManualRefreshKey(cacheKey));
    return Number(raw || 0);
  } catch (_) {
    return 0;
  }
}

export function setManualRefreshAt(cacheKey, timestamp) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(buildManualRefreshKey(cacheKey), String(timestamp));
  } catch (_) {
    // Ignore storage quota/write issues.
  }
}

function clearManualRefreshAt(cacheKey) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(buildManualRefreshKey(cacheKey));
  } catch (_) {
    // Ignore storage quota/write issues.
  }
}

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

export function readCache(cacheKey, maxAgeMs = 0) {
  if (!canUseStorage()) return null;
  const raw = window.localStorage.getItem(buildStorageKey(cacheKey));
  if (!raw) return null;
  const parsed = safeParse(raw);
  if (!parsed || typeof parsed !== "object") return null;
  if (!Object.prototype.hasOwnProperty.call(parsed, "response")) return null;

  const updatedAt = Number(parsed.updatedAt || 0);
  if (maxAgeMs > 0 && updatedAt > 0 && nowMs() - updatedAt > maxAgeMs) {
    try {
      window.localStorage.removeItem(buildStorageKey(cacheKey));
    } catch (_) {
      // Ignore remove failures.
    }
    return null;
  }

  return parsed;
}

export function isLocalMutationSource(source = "") {
  const normalized = String(source || "").trim().toLowerCase();
  return normalized.startsWith("local_mutation");
}

export function writeCache(cacheKey, response, meta = {}) {
  if (!canUseStorage()) return;
  const payload = {
    response,
    updatedAt: nowMs(),
  };
  try {
    window.localStorage.setItem(
      buildStorageKey(cacheKey),
      JSON.stringify(payload),
    );
    dispatchCacheUpdated(cacheKey, response, meta);
  } catch (_) {
    // Ignore storage quota/write issues to keep business flow stable.
  }
}

function isRemoteInvalidationSource(source = "") {
  const normalized = String(source || "").trim().toLowerCase();
  return (
    normalized.includes("realtime") ||
    normalized.includes("remote_version")
  );
}

function isOptimisticProtected(cacheKey) {
  const expiresAt = Number(optimisticProtectedKeys.get(cacheKey) || 0);
  if (!expiresAt) return false;
  if (nowMs() >= expiresAt) {
    optimisticProtectedKeys.delete(cacheKey);
    return false;
  }
  return true;
}

export function markCacheKeysOptimistic(
  cacheKeys = [],
  ttlMs = DEFAULT_OPTIMISTIC_CACHE_TTL_MS,
) {
  const expiresAt = nowMs() + Math.max(0, Number(ttlMs || 0));
  (Array.isArray(cacheKeys) ? cacheKeys : []).forEach((cacheKey) => {
    const normalized = String(cacheKey || "").trim();
    if (normalized) optimisticProtectedKeys.set(normalized, expiresAt);
  });
}

function collectScopedCacheKeys(prefix) {
  if (!canUseStorage()) return [];
  const normalized = String(prefix || "").trim();
  if (!normalized) return [];
  const storagePrefix = `${CACHE_PREFIX}${readUserScope()}:`;
  const matches = [];
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const storageKey = window.localStorage.key(i);
      if (!storageKey || !storageKey.startsWith(storagePrefix)) continue;
      const logicalKey = storageKey.slice(storagePrefix.length);
      if (logicalKey === normalized || logicalKey.startsWith(`${normalized}:`)) {
        matches.push(logicalKey);
      }
    }
  } catch (_) {
    // Ignore enumeration failures.
  }
  return matches;
}

function removeCacheEntry(cacheKey, meta = {}) {
  if (
    meta?.force !== true &&
    isRemoteInvalidationSource(meta?.source) &&
    isOptimisticProtected(cacheKey)
  ) {
    return false;
  }
  try {
    window.localStorage.removeItem(buildStorageKey(cacheKey));
    return true;
  } catch (_) {
    return false;
  }
}

export function clearCacheByKeys(cacheKeys = [], meta = {}) {
  if (!canUseStorage()) return;
  const uniqueKeys = Array.from(
    new Set(
      (Array.isArray(cacheKeys) ? cacheKeys : [])
        .map((k) => String(k || "").trim())
        .filter(Boolean),
    ),
  );
  const clearedKeys = [];
  uniqueKeys.forEach((cacheKey) => {
    const targets = [cacheKey, ...collectScopedCacheKeys(cacheKey)];
    targets.forEach((targetKey) => {
      if (removeCacheEntry(targetKey, meta) && !clearedKeys.includes(targetKey)) {
        clearedKeys.push(targetKey);
      }
    });
  });
  if (meta?.force === true) {
    uniqueKeys.forEach((cacheKey) => clearManualRefreshAt(cacheKey));
  }
  dispatchCacheInvalidated(clearedKeys, meta);
}

function isSuccessResponse(response) {
  return Boolean(response?.success);
}

function isSameResponse(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (_) {
    return false;
  }
}

export function dispatchCacheUpdated(cacheKey, response, meta = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(CACHE_UPDATED_EVENT, {
      detail: {
        cacheKey,
        response,
        source: String(meta?.source || "").trim(),
        hadChanges: meta?.hadChanges === true,
      },
    }),
  );
}

function dispatchCacheInvalidated(cacheKeys = [], meta = {}) {
  if (typeof window === "undefined") return;
  if (meta?.silentEvent) return;
  const keys = Array.isArray(cacheKeys)
    ? cacheKeys.filter((k) => typeof k === "string" && k.trim())
    : [];
  if (!keys.length) return;

  window.dispatchEvent(
    new CustomEvent(CACHE_INVALIDATED_EVENT, {
      detail: {
        keys,
        mutation: String(meta?.mutation || "").trim(),
        source: String(meta?.source || "").trim(),
      },
    }),
  );
}

function refreshInBackground(cacheKey, fn, args, refreshCooldownMs) {
  if (inflightRefresh.has(cacheKey)) return;

  const now = nowMs();
  const manualRefreshAtStart = getManualRefreshAt(cacheKey);
  if (manualRefreshAtStart > 0 && now - manualRefreshAtStart < refreshCooldownMs) return;

  const last = Number(lastRefreshAt.get(cacheKey) || 0);
  if (refreshCooldownMs > 0 && now - last < refreshCooldownMs) return;

  const runner = (async () => {
    try {
      const fresh = await fn(...args);
      if (!isSuccessResponse(fresh)) return;
      if (isOptimisticProtected(cacheKey)) return;
      if (getManualRefreshAt(cacheKey) > manualRefreshAtStart) return;
      const cached = readCache(cacheKey)?.response;
      if (!isSameResponse(cached, fresh)) {
        writeCache(cacheKey, fresh, {
          source: "background_refresh",
          hadChanges: true,
        });
      }
    } catch (_) {
      // Silent background refresh failure.
    }
  })();

  lastRefreshAt.set(cacheKey, now);
  inflightRefresh.set(cacheKey, runner);
  runner.finally(() => {
    inflightRefresh.delete(cacheKey);
  });
}

export function createLocalFirstReader(cacheKey, fn, options = {}) {
  const ttlMs = Math.max(0, Number(options.ttlMs || 0));
  const refreshCooldownMs = Math.max(
    0,
    Number(options.refreshCooldownMs || 900000),
  );
  const refreshAfterMs = Math.max(
    0,
    Number(
      options.refreshAfterMs ||
        (ttlMs > 0 ? Math.floor(ttlMs * 0.9) : 900000),
    ),
  );
  const backgroundMode =
    options.backgroundMode === "disabled"
      ? "disabled"
      : options.backgroundMode === "always"
        ? "always"
        : "stale-only";

  return async (...args) => {
    // Extract force flag from first argument (supports both { force: true } and legacy API)
    const firstArg = args?.[0];
    const isForce =
      firstArg?.force === true ||
      (typeof firstArg === "boolean" && firstArg === true);

    // Check cache only when NOT forcing refresh
    if (!isForce) {
      const cached = readCache(cacheKey, ttlMs);
      if (cached && cached.response) {
        if (backgroundMode !== "disabled") {
          const ageMs = Math.max(0, nowMs() - Number(cached.updatedAt || 0));
          const shouldRefresh =
            backgroundMode === "always" || ageMs >= refreshAfterMs;
          if (shouldRefresh) {
            refreshInBackground(cacheKey, fn, args, refreshCooldownMs);
          }
        }
        return cached.response;
      }
    }

    // Force refresh: mark timestamp and call API
    if (isForce) {
      setManualRefreshAt(cacheKey, nowMs());
    }

    const fresh = await fn(...args);
    if (isSuccessResponse(fresh)) {
      writeCache(cacheKey, fresh);
    }
    return fresh;
  };
}

function resolveKeysToClear(invalidateKeys = [], preserveCacheKeys = []) {
  const preserve = new Set(
    (Array.isArray(preserveCacheKeys) ? preserveCacheKeys : [])
      .map((key) => String(key || "").trim())
      .filter(Boolean),
  );
  return (Array.isArray(invalidateKeys) ? invalidateKeys : []).filter(
    (key) => !preserve.has(String(key || "").trim()),
  );
}

export function createMutationWithInvalidation(fn, invalidateKeys = [], options = {}) {
  const mutationName = String(options?.mutationName || fn?.name || "mutation").trim();
  const optimisticCacheTtlMs =
    Number(options?.optimisticCacheTtlMs || DEFAULT_OPTIMISTIC_CACHE_TTL_MS) ||
    DEFAULT_OPTIMISTIC_CACHE_TTL_MS;
  const preserveCacheKeys = Array.isArray(options?.preserveCacheKeys)
    ? options.preserveCacheKeys
    : [];

  return async (...args) => {
    if (typeof options?.optimisticFn === "function") {
      let optResult = { success: true, isOptimistic: true };
      try {
        optResult = options.optimisticFn(...args) || optResult;
        if (isSuccessResponse(optResult)) {
          const deferEvent = Boolean(options?.deferEvent);
          markCacheKeysOptimistic(
            [...invalidateKeys, ...preserveCacheKeys],
            optimisticCacheTtlMs,
          );
          if (typeof options?.afterSuccess === "function") {
            try { options.afterSuccess(optResult, args); } catch (_) {}
          }
          if (!deferEvent) {
            dispatchCacheInvalidated(invalidateKeys, {
              source: "local_mutation_optimistic",
              mutation: mutationName,
            });
          }
        }
      } catch (_) {}

      (async () => {
        try {
          const result = await fn(...args);
          if (isSuccessResponse(result)) {
            if (typeof options?.afterSuccess === "function") {
              try { options.afterSuccess(result, args); } catch (_) {}
            }
            markCacheKeysOptimistic(
              [...invalidateKeys, ...preserveCacheKeys],
              optimisticCacheTtlMs,
            );
            const keysToClear = resolveKeysToClear(invalidateKeys, preserveCacheKeys);
            clearCacheByKeys(keysToClear, {
              source: "local_mutation_real",
              mutation: mutationName,
            });
            if (typeof mutationSuccessHook === "function") {
              Promise.resolve(mutationSuccessHook({ mutationName, invalidateKeys: [...invalidateKeys] })).catch(() => {});
            }
          } else {
            clearCacheByKeys(invalidateKeys, { source: "local_mutation_revert", mutation: mutationName, force: true });
            if (typeof options?.onBackgroundError === "function") options.onBackgroundError(result, args);
          }
        } catch (err) {
          clearCacheByKeys(invalidateKeys, { source: "local_mutation_revert", mutation: mutationName, force: true });
          if (typeof options?.onBackgroundError === "function") options.onBackgroundError({ success: false, message: err?.message }, args);
        }
      })();

      return optResult;
    }

    try {
      const result = await fn(...args);
      if (isSuccessResponse(result)) {
        const deferEvent = Boolean(options?.deferEvent);
        clearCacheByKeys(invalidateKeys, {
          source: "local_mutation",
          mutation: mutationName,
          silentEvent: deferEvent,
        });
        if (typeof options?.afterSuccess === "function") {
          try {
            options.afterSuccess(result, args);
          } catch (_) {
            // Cache priming is best-effort; mutation result remains authoritative.
          }
        }
        if (deferEvent) {
          dispatchCacheInvalidated(invalidateKeys, {
            source: "local_mutation",
            mutation: mutationName,
          });
        }
        if (typeof mutationSuccessHook === "function") {
          Promise.resolve(
            mutationSuccessHook({
              mutationName,
              invalidateKeys: [...invalidateKeys],
            }),
          ).catch(() => {
            // Silent hook failure so business flow is not blocked.
          });
        }
      }
      return result;
    } catch (err) {
      throw err;
    }
  };
}

export function setMutationSuccessHook(hook) {
  mutationSuccessHook = typeof hook === "function" ? hook : null;
}




