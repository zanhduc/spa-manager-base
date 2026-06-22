import { useState, useEffect, useCallback, useRef } from "react";
import { useHashRouter } from "./hooks/useHashRouter";
import LoginPage from "./pages/login";
import CreateOrderPage from "./pages/create-order";
import HistoryPage from "./pages/history";
import ProductsPage from "./pages/products";
import TreatmentCatalogsPage from "./pages/treatment-catalogs";
import InventoryPage from "./pages/inventory";
import StockPage from "./pages/stock";
import CustomerProgressPage from "./components/customer-progress";
import StaffManagementPage from "./pages/staff-management";
import QrOxuTestPage from "./pages/qr-oxu-test";
import StatsPage from "./pages/stats";
import FloatingMenu from "./components/FloatingMenu";
import GlobalNoticeBanner from "./components/GlobalNoticeBanner";
import UpcomingAppointmentsBanner from "./components/UpcomingAppointmentsBanner.jsx";
import { ErrorBoundary } from "./components/ErrorBoundary";
import {
  DEVICE_TOKEN_SCOPE,
  DEVICE_TOKEN_STORAGE_KEY,
  UserProvider,
  useUser,
} from "./context";
import { Toaster, toast } from "react-hot-toast";
import {
  applyAppModeToDom,
  writeAppMode,
} from "./utils/appMode";
import {
  clearAllReadCache,
  clearReadCacheByKeys,
  getInvalidationKeysForMutation,
  loginWithDeviceToken,
  loginWithHostAssertion,
  loginWithSessionKey,
  getSyncVersion,
  CACHE_UPDATED_EVENT,
} from "./api";
import { shouldToastRemoteCacheUpdate } from "./utils/cacheToastPolicy.js";
import {
  isRealtimeSyncEnabled,
  startRealtimeSyncListener,
} from "./realtime/firebaseSync";

const REMOTE_SYNC_POLL_MS = 90000;
const REALTIME_INVALIDATION_DEBOUNCE_MS = 180;
const REALTIME_GUARD_POLL_COOLDOWN_MS = 10000;
const REALTIME_POLL_DEDUP_WINDOW_MS = 1500;
const HOST_ASSERTION_TTL_MS = 120000;
const HOST_ASSERTION_MESSAGE_TYPES = new Set([
  "gas.hostAssertionForIframe",
  "gas.hostAssertion",
  "gas.refreshAssertion",
]);
const markPerf = (name, detail = null) => {
  try {
    const perf = window.__SOANHANG_PERF__;
    if (perf && typeof perf.mark === "function") {
      perf.mark(name, detail);
    }
  } catch (_) {
    // Ignore perf logging failures.
  }
};

const toBool = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true";
};

const getHashSearchParams = (hashValue) => {
  const hash = String(hashValue || "").replace(/^#\/?/, "").trim();
  if (!hash) return new URLSearchParams();
  const queryIndex = hash.indexOf("?");
  if (queryIndex >= 0) {
    return new URLSearchParams(hash.slice(queryIndex + 1));
  }
  return new URLSearchParams(hash);
};

const normalizeOrigin = (value) => String(value || "").trim().replace(/\/+$/, "");

const getReferrerOrigin = () => {
  try {
    if (!document.referrer) return "";
    return normalizeOrigin(new URL(document.referrer).origin);
  } catch (_) {
    return "";
  }
};

const getAllowedHostOrigins = () => {
  const configured = String(import.meta.env.VITE_IFRAME_HOST_ORIGINS || "")
    .split(",")
    .map((item) => normalizeOrigin(item))
    .filter(Boolean);
  if (configured.length) return configured;
  const referrerOrigin = getReferrerOrigin();
  return referrerOrigin ? [referrerOrigin] : [];
};

const isAllowedHostOrigin = (origin) => {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  const allowed = getAllowedHostOrigins();
  if (!allowed.length) return false;
  return allowed.includes(normalized);
};

const buildPrintParams = (source) => {
  const code = String(source?.code || "").trim();
  if (!code) return null;
  return {
    code,
    size: source?.size || "",
    isPreview: !!source?.isPreview,
    previewDataStr: source?.previewDataStr || "",
    previewDataKey: source?.previewDataKey || "",
    autoPrint: !!source?.autoPrint,
    autoBack: !!source?.autoBack,
    dryRun: !!source?.dryRun,
  };
};

const getPrintParamsFromLocalUrl = () => {
  const hashParams = getHashSearchParams(window.location.hash);
  const searchParams = new URLSearchParams(window.location.search);
  return buildPrintParams({
    code: hashParams.get("print") || searchParams.get("print"),
    size: hashParams.get("size") || searchParams.get("size"),
    isPreview:
      hashParams.has("preview") ||
      searchParams.has("preview") ||
      toBool(searchParams.get("preview")) ||
      toBool(hashParams.get("preview")),
    previewDataStr: hashParams.get("data") || searchParams.get("data") || "",
    previewDataKey:
      hashParams.get("datakey") || searchParams.get("datakey") || "",
    autoPrint:
      toBool(hashParams.get("autoprint")) ||
      toBool(searchParams.get("autoprint")),
    autoBack:
      toBool(hashParams.get("autoback")) || toBool(searchParams.get("autoback")),
    dryRun: toBool(hashParams.get("dryrun")) || toBool(searchParams.get("dryrun")),
  });
};

const getPrintParamsFromGasLocation = (location) => {
  const hashParams = getHashSearchParams(location?.hash || "");
  return buildPrintParams({
    code: hashParams.get("print") || location?.parameter?.print,
    size: hashParams.get("size") || location?.parameter?.size,
    isPreview:
      hashParams.has("preview") ||
      toBool(hashParams.get("preview")) ||
      toBool(location?.parameter?.preview),
    previewDataStr: hashParams.get("data") || location?.parameter?.data || "",
    previewDataKey:
      hashParams.get("datakey") || location?.parameter?.datakey || "",
    autoPrint:
      toBool(hashParams.get("autoprint")) ||
      toBool(location?.parameter?.autoprint),
    autoBack:
      toBool(hashParams.get("autoback")) ||
      toBool(location?.parameter?.autoback),
    dryRun:
      toBool(hashParams.get("dryrun")) || toBool(location?.parameter?.dryrun),
  });
};

function AppContent() {
  const { user, setUser } = useUser();
  const { currentPath, navigate } = useHashRouter();
  const [initDone, setInitDone] = useState(false);
  const [printParams, setPrintParams] = useState(null);
  const [appMode, setAppModeState] = useState("web");
  const [autoLoginChecked, setAutoLoginChecked] = useState(false);
  const [realtimeActive, setRealtimeActive] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(() => {
    if (typeof document === "undefined") return true;
    return document.visibilityState === "visible";
  });
  const lastSyncVersionRef = useRef("");
  const pollSyncVersionNowRef = useRef(async () => {});
  const lastGuardPollAtRef = useRef(0);
  const syncVersionInFlightRef = useRef(false);
  const lastRealtimeSignalAtRef = useRef(0);
  const pendingInvalidationKeysRef = useRef(new Set());
  const invalidationFlushTimerRef = useRef(null);
  const perfInitDoneLoggedRef = useRef(false);
  const perfUserReadyLoggedRef = useRef(false);
  const perfLoginVisibleLoggedRef = useRef(false);
  const hostAssertionLoginInFlightRef = useRef(false);
  const lastHostAssertionFingerprintRef = useRef("");
  const isPosMode = appMode === "pos";

  useEffect(() => {
    markPerf("app_content_mount");
  }, []);

  useEffect(() => {
    if (!initDone || perfInitDoneLoggedRef.current) return;
    perfInitDoneLoggedRef.current = true;
    markPerf("app_init_done", { hasPrintParams: !!printParams });
    requestAnimationFrame(() => {
      markPerf("app_first_ready_frame");
      try {
        window.__SOANHANG_PERF__?.print?.();
      } catch (_) {
        // Ignore perf summary print failures.
      }
    });
  }, [initDone, printParams]);

  useEffect(() => {
    if (initDone && !user && !perfLoginVisibleLoggedRef.current) {
      perfLoginVisibleLoggedRef.current = true;
      markPerf("login_screen_visible");
      return;
    }
    if (user) {
      perfLoginVisibleLoggedRef.current = false;
    }
  }, [initDone, user]);

  useEffect(() => {
    if (!user) {
      perfUserReadyLoggedRef.current = false;
      return;
    }
    if (perfUserReadyLoggedRef.current) return;
    perfUserReadyLoggedRef.current = true;
    markPerf("user_authenticated", { role: String(user?.role || "") });
  }, [user]);

  useEffect(() => {
    if (!initDone || !user) return;
    const route = String(currentPath || "");
    markPerf("route_switch", { route });
    requestAnimationFrame(() => {
      markPerf("route_frame_ready", { route });
    });
  }, [currentPath, initDone, user]);

  useEffect(() => {
    if (!user) return undefined;
    const onCacheUpdated = (event) => {
      const detail = event?.detail || {};
      if (!shouldToastRemoteCacheUpdate(detail)) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      const cacheKey = String(detail.cacheKey || "").trim();
      if (!cacheKey) return;
      toast("Có dữ liệu mới được cập nhật", {
        id: `remote-cache-${cacheKey}`,
        duration: 2500,
      });
    };
    window.addEventListener(CACHE_UPDATED_EVENT, onCacheUpdated);
    return () => window.removeEventListener(CACHE_UPDATED_EVENT, onCacheUpdated);
  }, [user]);

  useEffect(() => {
    if (!realtimeActive) return;
    markPerf("realtime_listener_ready");
  }, [realtimeActive]);

  const flushPendingInvalidation = useCallback((meta = {}) => {
    const keys = Array.from(pendingInvalidationKeysRef.current);
    pendingInvalidationKeysRef.current.clear();
    if (invalidationFlushTimerRef.current) {
      window.clearTimeout(invalidationFlushTimerRef.current);
      invalidationFlushTimerRef.current = null;
    }
    if (!keys.length) return;
    clearReadCacheByKeys(keys, meta);
  }, []);

  const enqueueInvalidationKeys = useCallback((keys = [], meta = {}) => {
    keys.forEach((k) => {
      const normalized = String(k || "").trim();
      if (normalized) pendingInvalidationKeysRef.current.add(normalized);
    });
    if (!pendingInvalidationKeysRef.current.size) return;

    if (invalidationFlushTimerRef.current) {
      window.clearTimeout(invalidationFlushTimerRef.current);
    }
    invalidationFlushTimerRef.current = window.setTimeout(() => {
      flushPendingInvalidation(meta);
    }, REALTIME_INVALIDATION_DEBOUNCE_MS);
  }, [flushPendingInvalidation]);

  useEffect(() => {
    const next = writeAppMode("web");
    setAppModeState(next);
    applyAppModeToDom(next);
  }, []);

  useEffect(() => {
    applyAppModeToDom(appMode);
  }, [appMode]);

  useEffect(() => {
    const onVisibilityChange = () => {
      setIsPageVisible(document.visibilityState === "visible");
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    let didInit = false;

    const finishInit = () => {
      if (!didInit && mounted) {
        didInit = true;
        setInitDone(true);
      }
    };

    const applyLocalParams = () => {
      const localPrintParams = getPrintParamsFromLocalUrl();
      if (mounted) setPrintParams(localPrintParams);
      return localPrintParams;
    };

    const resolvePrintParams = ({ init = false } = {}) => {
      const localParams = applyLocalParams();
      if (localParams) {
        if (init) finishInit();
        return;
      }

      if (typeof google !== "undefined" && google?.script?.url?.getLocation) {
        google.script.url.getLocation((location) => {
          if (!mounted) return;
          const gasParams = getPrintParamsFromGasLocation(location);
          setPrintParams(gasParams);
          if (init) finishInit();
        });
        return;
      }

      if (mounted) setPrintParams(null);
      if (init) finishInit();
    };

    resolvePrintParams({ init: true });

    const onHashChanged = () => resolvePrintParams({ init: false });
    window.addEventListener("hashchange", onHashChanged);
    window.addEventListener("popstate", onHashChanged);

    return () => {
      mounted = false;
      window.removeEventListener("hashchange", onHashChanged);
      window.removeEventListener("popstate", onHashChanged);
    };
  }, []);

  useEffect(() => {
    if (!initDone) return;
    if (user) {
      setAutoLoginChecked(true);
      return;
    }
    if (autoLoginChecked) return;

    let cancelled = false;
    const tryAutoLogin = async () => {
      const token = String(
        localStorage.getItem(DEVICE_TOKEN_STORAGE_KEY) || "",
      ).trim();
      try {
        if (token) {
          const res = await loginWithDeviceToken(token, DEVICE_TOKEN_SCOPE);
          if (cancelled) return;
          if (res?.success && res?.data) {
            const nextToken = String(res?.data?.deviceToken || token).trim();
            if (nextToken) {
              localStorage.setItem(DEVICE_TOKEN_STORAGE_KEY, nextToken);
            }
            setUser(res.data);
            return;
          }
          localStorage.removeItem(DEVICE_TOKEN_STORAGE_KEY);
        }

        const sessionRes = await loginWithSessionKey(DEVICE_TOKEN_SCOPE);
        if (cancelled) return;
        if (sessionRes?.success && sessionRes?.data) {
          const sessionToken = String(sessionRes?.data?.deviceToken || "").trim();
          if (sessionToken) {
            localStorage.setItem(DEVICE_TOKEN_STORAGE_KEY, sessionToken);
          }
          setUser(sessionRes.data);
        }
      } catch (_) {
        // Silent to avoid blocking manual login fallback.
      } finally {
        if (!cancelled) setAutoLoginChecked(true);
      }
    };

    tryAutoLogin();
    return () => {
      cancelled = true;
    };
  }, [autoLoginChecked, initDone, setUser, user]);

  useEffect(() => {
    if (!initDone) return;

    const onHostAssertion = async (event) => {
      if (user) return;
      if (event.source === window) return;
      if (!isAllowedHostOrigin(event.origin)) return;

      const msg = event.data;
      if (!msg || typeof msg !== "object") return;
      if (!HOST_ASSERTION_MESSAGE_TYPES.has(String(msg.type || ""))) return;

      const assertion = String(msg.assertion || "").trim();
      const nonce = String(msg.nonce || "").trim();
      const ts = Number(msg.ts || 0);
      if (!assertion || !nonce || !Number.isFinite(ts)) return;
      if (Math.abs(Date.now() - ts) > HOST_ASSERTION_TTL_MS) return;

      const fingerprint = `${assertion}|${nonce}|${ts}`;
      if (lastHostAssertionFingerprintRef.current === fingerprint) return;
      if (hostAssertionLoginInFlightRef.current) return;

      hostAssertionLoginInFlightRef.current = true;
      try {
        const res = await loginWithHostAssertion(
          assertion,
          DEVICE_TOKEN_SCOPE,
          nonce,
          ts,
        );
        if (res?.success && res?.data) {
          const nextToken = String(res?.data?.deviceToken || "").trim();
          if (nextToken) {
            localStorage.setItem(DEVICE_TOKEN_STORAGE_KEY, nextToken);
          }
          lastHostAssertionFingerprintRef.current = fingerprint;
          setUser(res.data);
          setAutoLoginChecked(true);
        }
      } catch (_) {
        // Keep silent to avoid interrupting manual login fallback.
      } finally {
        hostAssertionLoginInFlightRef.current = false;
      }
    };

    window.addEventListener("message", onHostAssertion);
    return () => {
      window.removeEventListener("message", onHostAssertion);
    };
  }, [initDone, setUser, user]);

  useEffect(() => {
    if (!user || !isPosMode) return;
    if (!("wakeLock" in navigator) || !window.isSecureContext) return;
    let released = false;
    let wakeLock = null;

    const requestWakeLock = async () => {
      if (released) return;
      try {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => {
          wakeLock = null;
        });
      } catch (e) {
        // Ignore unsupported/blocked wake lock.
      }
    };

    requestWakeLock();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && !wakeLock) {
        requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (wakeLock) {
        wakeLock.release().catch(() => {});
      }
    };
  }, [user, isPosMode]);

  useEffect(() => {
    if (!user) {
      lastSyncVersionRef.current = "";
      setRealtimeActive(false);
      return;
    }

    let disposed = false;

    const pollVersion = async ({ force = false } = {}) => {
      if (!force && document.visibilityState !== "visible") return;
      if (syncVersionInFlightRef.current) return;
      syncVersionInFlightRef.current = true;
      try {
        const res = await getSyncVersion();
        if (disposed || !res?.success) return;
        const nextVersion = String(res?.data?.version || "").trim();
        if (!nextVersion) return;

        const prevVersion = lastSyncVersionRef.current;
        if (!prevVersion) {
          lastSyncVersionRef.current = nextVersion;
          return;
        }

        if (nextVersion !== prevVersion) {
          lastSyncVersionRef.current = nextVersion;
          if (Date.now() - lastRealtimeSignalAtRef.current <= REALTIME_POLL_DEDUP_WINDOW_MS) {
            return;
          }
          flushPendingInvalidation({
            source: "remote_version_poll_flush",
          });
          clearAllReadCache({
            source: "remote_version_poll",
          });
        }
      } catch (_) {
        // Keep polling silent to avoid interrupting user flow.
      } finally {
        syncVersionInFlightRef.current = false;
      }
    };
    pollSyncVersionNowRef.current = pollVersion;

    pollVersion();
    const timer = window.setInterval(pollVersion, REMOTE_SYNC_POLL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        pollVersion();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      disposed = true;
      pollSyncVersionNowRef.current = async () => {};
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      setRealtimeActive(false);
      return;
    }
    if (!isPageVisible) {
      setRealtimeActive(false);
      return;
    }
    if (!isRealtimeSyncEnabled()) {
      setRealtimeActive(false);
      return;
    }
    let disposed = false;
    let stopListening = null;

    stopListening = startRealtimeSyncListener({
      onReady: () => {
        if (!disposed) setRealtimeActive(true);
      },
      onError: () => {
        if (!disposed) setRealtimeActive(false);
      },
      onRemoteSignal: ({ mutation, invalidateKeys }) => {
        if (disposed) return;
        lastRealtimeSignalAtRef.current = Date.now();
        const directKeys = Array.isArray(invalidateKeys)
          ? invalidateKeys.filter((k) => typeof k === "string" && k.trim())
          : [];
        const keys = directKeys.length
          ? directKeys
          : getInvalidationKeysForMutation(mutation);
        if (keys.length) {
          enqueueInvalidationKeys(keys, {
            source: "realtime_signal",
            mutation: String(mutation || ""),
          });
          return;
        }
        flushPendingInvalidation({
          source: "realtime_signal_unknown_mutation_flush",
          mutation: String(mutation || ""),
        });
        // Fallback broad refresh only when mutation metadata is unusable.
        clearAllReadCache({
          source: "realtime_signal_unknown_mutation",
          mutation: String(mutation || ""),
        });
        const now = Date.now();
        if (
          now - lastGuardPollAtRef.current >=
          REALTIME_GUARD_POLL_COOLDOWN_MS
        ) {
          lastGuardPollAtRef.current = now;
          pollSyncVersionNowRef.current({ force: true }).catch(() => {});
        }
      },
    });

    return () => {
      disposed = true;
      flushPendingInvalidation({ source: "realtime_listener_cleanup_flush" });
      if (typeof stopListening === "function") {
        stopListening();
      }
      if (invalidationFlushTimerRef.current) {
        window.clearTimeout(invalidationFlushTimerRef.current);
        invalidationFlushTimerRef.current = null;
      }
      pendingInvalidationKeysRef.current.clear();
    };
  }, [user, isPageVisible, enqueueInvalidationKeys, flushPendingInvalidation]);

  if (!initDone || (!user && !autoLoginChecked)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center">
          <div className="w-8 h-8 rounded-full border-4 border-slate-200 border-b-rose-600 animate-spin"></div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginPage
        onLoginSuccess={setUser}
      />
    );
  }

  if (["admin", "user"].includes(user.role)) {
    const renderPage = () => {
      switch (currentPath) {
        case "create-order":
          return <CreateOrderPage user={user} appMode={appMode} />;
        case "history":
          return <HistoryPage user={user} appMode={appMode} />;
        case "products":
          return <ProductsPage user={user} appMode={appMode} />;
        case "treatment-catalogs":
          return <TreatmentCatalogsPage user={user} appMode={appMode} />;
        case "inventory":
          return <InventoryPage user={user} appMode={appMode} />;
        case "stock":
          return <StockPage user={user} appMode={appMode} />;
        case "customer-progress":
          return <CustomerProgressPage user={user} appMode={appMode} />;
        case "staff-management":
          return <StaffManagementPage user={user} appMode={appMode} />;
        case "stats":
          return <StatsPage user={user} appMode={appMode} />;
        case "qr-oxu-test":
          return <QrOxuTestPage user={user} appMode={appMode} />;
        default:
          return <StatsPage user={user} appMode={appMode} />;
      }
    };

    return (
      <div className={`min-h-screen ${isPosMode ? "bg-slate-100 pb-24" : "bg-slate-50"}`}>
        <UpcomingAppointmentsBanner />
        <GlobalNoticeBanner />
        <div className={isPosMode ? "" : "md:pl-72"}>
          {renderPage()}
        </div>
        <FloatingMenu
          currentPath={currentPath}
          onNavigate={navigate}
          appMode={appMode}
        />
      </div>
    );
  }

  return (
    <div className="p-8 text-center text-red-500">Không có quyền truy cập</div>
  );
}

export default function App() {
  return (
    <UserProvider>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 2500,
          style: {
            borderRadius: "12px",
            border: "1px solid #f1f5f9",
            background: "#ffffff",
            color: "#0f172a",
          },
        }}
      />
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
    </UserProvider>
  );
}

