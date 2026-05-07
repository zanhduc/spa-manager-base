const CACHE_PREFIX = "soanhang_api_cache_v1:";
const AUTH_USER_STORAGE_KEY = "soanhang.auth.user";
const inflightRefresh = new Map();
const lastRefreshAt = new Map();
let mutationSuccessHook = null;
export const CACHE_INVALIDATED_EVENT = "soanhang_api_cache_invalidated";

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

export function writeCache(cacheKey, response) {
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
  } catch (_) {
    // Ignore storage quota/write issues to keep business flow stable.
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
    try {
      window.localStorage.removeItem(buildStorageKey(cacheKey));
      clearedKeys.push(cacheKey);
    } catch (_) {
      // Ignore remove failures.
    }
  });
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

function dispatchCacheUpdated(cacheKey, response) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("soanhang_api_cache_updated", {
      detail: {
        cacheKey,
        response,
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
  const last = Number(lastRefreshAt.get(cacheKey) || 0);
  if (refreshCooldownMs > 0 && now - last < refreshCooldownMs) return;

  const runner = (async () => {
    try {
      const fresh = await fn(...args);
      if (!isSuccessResponse(fresh)) return;
      const cached = readCache(cacheKey)?.response;
      if (!isSameResponse(cached, fresh)) {
        writeCache(cacheKey, fresh);
        dispatchCacheUpdated(cacheKey, fresh);
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

    const fresh = await fn(...args);
    if (isSuccessResponse(fresh)) {
      writeCache(cacheKey, fresh);
    }
    return fresh;
  };
}

export function createMutationWithInvalidation(fn, invalidateKeys = []) {
  const mutationName = String(fn?.name || "mutation");
  return async (...args) => {
    const result = await fn(...args);
    if (isSuccessResponse(result)) {
      clearCacheByKeys(invalidateKeys, {
        source: "local_mutation",
        mutation: mutationName,
      });
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
  };
}

export function setMutationSuccessHook(hook) {
  mutationSuccessHook = typeof hook === "function" ? hook : null;
}
