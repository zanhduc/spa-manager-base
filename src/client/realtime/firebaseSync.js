import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import {
  doc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

const AUTH_USER_STORAGE_KEY = "soanhang.auth.user";
const SESSION_STORAGE_KEY = "soanhang.realtime.session_id";
const LAST_SIGNAL_STORAGE_PREFIX = "soanhang.realtime.last_signal:";
const SIGNAL_COLLECTION = "soanhang_sync_signals";
const SIGNAL_KEY_CARRY_WINDOW_MS = 20000;

let singleton = null;

function canUseBrowser() {
  return typeof window !== "undefined";
}

function normalizeKeyPart(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function deriveProjectKeyFromGasUrl() {
  const raw = String(import.meta.env.VITE_GAS_WEBAPP_URL || "").trim();
  if (!raw) return "";
  const m = raw.match(/\/s\/([^/]+)\/exec/i);
  if (!m || !m[1]) return "";
  return normalizeKeyPart(m[1]);
}

function getConfiguredProjectKey() {
  const manual = normalizeKeyPart(import.meta.env.VITE_REALTIME_PROJECT_KEY);
  if (manual) return manual;
  const derived = deriveProjectKeyFromGasUrl();
  if (derived) return derived;
  return "";
}

function readCurrentUserEmail() {
  if (!canUseBrowser() || !window.localStorage) return "";
  try {
    const raw = window.localStorage.getItem(AUTH_USER_STORAGE_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return String(parsed?.user?.email || "").trim().toLowerCase();
  } catch (_) {
    return "";
  }
}

function readStorageItem(storage, key) {
  try {
    return String(storage?.getItem(key) || "").trim();
  } catch (_) {
    return "";
  }
}

function writeStorageItem(storage, key, value) {
  try {
    storage?.setItem(key, String(value || ""));
  } catch (_) {
    // Ignore storage failures.
  }
}

function getLastSignalStorageKey(projectKey) {
  return `${LAST_SIGNAL_STORAGE_PREFIX}${projectKey}`;
}

function readPersistedLastSignalId(projectKey) {
  if (!canUseBrowser()) return "";
  const key = getLastSignalStorageKey(projectKey);
  return readStorageItem(window.localStorage, key);
}

function persistLastSignalId(projectKey, signalId) {
  if (!canUseBrowser()) return;
  if (!signalId) return;
  const key = getLastSignalStorageKey(projectKey);
  writeStorageItem(window.localStorage, key, signalId);
}

function getSessionId() {
  if (!canUseBrowser()) {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  const fromSessionStorage = readStorageItem(
    window.sessionStorage,
    SESSION_STORAGE_KEY,
  );
  if (fromSessionStorage) return fromSessionStorage;

  const generated = `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  writeStorageItem(window.sessionStorage, SESSION_STORAGE_KEY, generated);
  return generated;
}

function readFirebaseConfig() {
  const apiKey = String(import.meta.env.VITE_FIREBASE_API_KEY || "").trim();
  const projectId = String(import.meta.env.VITE_FIREBASE_PROJECT_ID || "").trim();
  const appId = String(import.meta.env.VITE_FIREBASE_APP_ID || "").trim();
  const authDomain = String(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "").trim();
  const storageBucket = String(
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  ).trim();
  const messagingSenderId = String(
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  ).trim();

  if (!apiKey || !projectId || !appId) return null;
  return {
    apiKey,
    projectId,
    appId,
    authDomain: authDomain || `${projectId}.firebaseapp.com`,
    storageBucket: storageBucket || undefined,
    messagingSenderId: messagingSenderId || undefined,
  };
}

function getSingleton() {
  if (singleton !== null) return singleton;
  if (!canUseBrowser()) {
    singleton = { enabled: false, reason: "not_browser" };
    return singleton;
  }

  const cfg = readFirebaseConfig();
  if (!cfg) {
    singleton = { enabled: false, reason: "missing_firebase_config" };
    return singleton;
  }

  try {
    const app = getApps().length ? getApp() : initializeApp(cfg);
    const db = getFirestore(app);
    const auth = getAuth(app);
    const projectKey = getConfiguredProjectKey();
    if (!projectKey) {
      singleton = { enabled: false, reason: "missing_project_key" };
      return singleton;
    }
    const sessionId = getSessionId();
    const persistedLastSignalId = readPersistedLastSignalId(projectKey);
    singleton = {
      enabled: true,
      auth,
      db,
      projectKey,
      sessionId,
      signalRef: doc(db, SIGNAL_COLLECTION, projectKey),
      lastSeenSignalId: persistedLastSignalId,
      recentInvalidateEntries: [],
    };
    return singleton;
  } catch (e) {
    singleton = {
      enabled: false,
      reason: "firebase_init_failed",
      error: e,
    };
    return singleton;
  }
}

function buildSignalId(data) {
  const nonce = String(data?.nonce || "").trim();
  const ts = Number(data?.updatedAtMs || 0);
  if (!nonce && !ts) return "";
  return `${nonce}:${ts}`;
}

function mergeRecentInvalidateKeys(state, keys = []) {
  const now = Date.now();
  const incoming = Array.isArray(keys)
    ? keys.map((k) => String(k || "").trim()).filter(Boolean)
    : [];
  if (!state || !incoming.length) return incoming.slice(0, 30);

  const prev = Array.isArray(state.recentInvalidateEntries)
    ? state.recentInvalidateEntries
    : [];
  const alive = prev.filter(
    (entry) =>
      entry &&
      typeof entry.key === "string" &&
      entry.key &&
      Number(entry.at || 0) > 0 &&
      now - Number(entry.at) <= SIGNAL_KEY_CARRY_WINDOW_MS,
  );

  const next = [...alive];
  incoming.forEach((key) => {
    next.push({ key, at: now });
  });

  state.recentInvalidateEntries = next.slice(-120);
  return Array.from(new Set(next.map((entry) => entry.key))).slice(0, 30);
}

export function isRealtimeSyncEnabled() {
  return Boolean(getSingleton()?.enabled);
}

async function ensureRealtimeAuth(state) {
  if (!state?.enabled || !state?.auth) return false;
  if (state.auth.currentUser) return true;
  try {
    await signInAnonymously(state.auth);
    return Boolean(state.auth.currentUser);
  } catch (_) {
    return false;
  }
}

export async function publishRealtimeMutationSignal(meta = {}) {
  const state = getSingleton();
  if (!state?.enabled) return { success: false, disabled: true };
  const authOk = await ensureRealtimeAuth(state);
  if (!authOk) return { success: false, message: "realtime_auth_failed" };

  const invalidateKeys = mergeRecentInvalidateKeys(state, meta.invalidateKeys);

  const now = Date.now();
  const signal = {
    nonce: `${now}-${Math.random().toString(36).slice(2, 10)}`,
    updatedAtMs: now,
    updatedAt: serverTimestamp(),
    actorSessionId: state.sessionId,
    actorEmail: String(meta.actorEmail || readCurrentUserEmail() || "")
      .trim()
      .toLowerCase(),
    mutation: String(meta.mutation || "").trim().slice(0, 120),
    invalidateKeys,
  };

  await setDoc(state.signalRef, signal, { merge: true });
  state.lastSeenSignalId = buildSignalId(signal);
  persistLastSignalId(state.projectKey, state.lastSeenSignalId);
  return { success: true };
}

export function startRealtimeSyncListener({ onRemoteSignal, onReady, onError }) {
  const state = getSingleton();
  if (!state?.enabled || typeof onRemoteSignal !== "function") {
    return () => {};
  }

  let skipFirst = true;
  let active = true;
  let stop = () => {};

  ensureRealtimeAuth(state)
    .then((authOk) => {
      if (!active) return;
      if (!authOk) {
        if (typeof onError === "function") onError("realtime_auth_failed");
        return;
      }
      if (typeof onReady === "function") onReady();
      stop = onSnapshot(
        state.signalRef,
        (snap) => {
          const data = snap?.data();
          if (!data) return;
          const signalId = buildSignalId(data);
          if (!signalId) return;

          if (skipFirst) {
            skipFirst = false;
            const prevSignalId = state.lastSeenSignalId;
            state.lastSeenSignalId = signalId;
            persistLastSignalId(state.projectKey, signalId);
            if (
              signalId !== prevSignalId &&
              String(data.actorSessionId || "") !== state.sessionId
            ) {
              onRemoteSignal({
                mutation: String(data.mutation || ""),
                invalidateKeys: Array.isArray(data.invalidateKeys)
                  ? data.invalidateKeys
                      .map((k) => String(k || "").trim())
                      .filter(Boolean)
                  : [],
                actorEmail: String(data.actorEmail || ""),
                updatedAtMs: Number(data.updatedAtMs || 0),
              });
            }
            return;
          }

          if (signalId === state.lastSeenSignalId) return;
          state.lastSeenSignalId = signalId;
          persistLastSignalId(state.projectKey, signalId);
          if (String(data.actorSessionId || "") === state.sessionId) return;

          onRemoteSignal({
            mutation: String(data.mutation || ""),
            invalidateKeys: Array.isArray(data.invalidateKeys)
              ? data.invalidateKeys
                  .map((k) => String(k || "").trim())
                  .filter(Boolean)
              : [],
            actorEmail: String(data.actorEmail || ""),
            updatedAtMs: Number(data.updatedAtMs || 0),
          });
        },
        () => {
          if (typeof onError === "function") {
            onError("realtime_listener_failed");
          }
        },
      );
    })
    .catch(() => {
      if (typeof onError === "function") onError("realtime_bootstrap_failed");
    });

  return () => {
    active = false;
    stop();
  };
}
