import React from "react"
import ReactDOM from "react-dom/client"
import App from "./app"
import "./styles.css"

const createPerfBridge = () => {
  if (typeof window === "undefined" || typeof performance === "undefined") {
    return null
  }

  const readEnabled = () => {
    try {
      const search = new URLSearchParams(window.location.search)
      if (search.get("perf") === "1") return true
      const hashRaw = String(window.location.hash || "")
      const hashQueryIdx = hashRaw.indexOf("?")
      if (hashQueryIdx >= 0) {
        const hashSearch = new URLSearchParams(hashRaw.slice(hashQueryIdx + 1))
        if (hashSearch.get("perf") === "1") return true
      }
      return window.localStorage?.getItem("soanhang.perf") === "1"
    } catch (e) {
      return false
    }
  }

  const existing = window.__SOANHANG_PERF__
  if (existing && typeof existing.mark === "function") {
    existing.setEnabled?.(readEnabled())
    return existing
  }

  const origin = performance.now()
  const events = []
  const api = {
    enabled: readEnabled(),
    origin,
    events,
    setEnabled(next) {
      api.enabled = !!next
    },
    mark(name, detail = null) {
      if (!api.enabled) return null
      const now = performance.now()
      const entry = {
        name: String(name || ""),
        t: now,
        ms: Number((now - origin).toFixed(1)),
        detail,
      }
      events.push(entry)
      return entry
    },
    summary() {
      if (!events.length) return []
      const first = events[0].t
      return events.map((e, idx) => ({
        idx: idx + 1,
        event: e.name,
        since_first_ms: Number((e.t - first).toFixed(1)),
        since_boot_ms: e.ms,
        detail: e.detail || "",
      }))
    },
    reset() {
      events.length = 0
    },
    print() {
      if (!api.enabled) return []
      const rows = api.summary()
      if (rows.length && typeof console !== "undefined" && console.table) {
        console.table(rows)
      }
      return rows
    },
  }

  window.__SOANHANG_PERF__ = api
  return api
}

const perf = createPerfBridge()
if (perf?.enabled) {
  let inIframe = false
  try {
    inIframe = window.self !== window.top
  } catch (e) {
    inIframe = true
  }
  perf.mark("boot_script_start", {
    inIframe,
    path: window.location.pathname,
    hash: window.location.hash,
  })
}

if (typeof window !== "undefined") {
  window.SOANHANG_PERF_ENABLE = () => {
    try {
      window.localStorage?.setItem("soanhang.perf", "1")
    } catch (e) {
      // Ignore storage failures.
    }
    window.location.reload()
  }
  window.SOANHANG_PERF_DISABLE = () => {
    try {
      window.localStorage?.removeItem("soanhang.perf")
    } catch (e) {
      // Ignore storage failures.
    }
    window.location.reload()
  }
}

const globalStyles = `
  :root {
    --bg: #f8fafc;
    --surface: #ffffff;
    --primary: #2563eb;
    --primary-hover: #1d4ed8;
    --text: #0f172a;
    --text-muted: #64748b;
    --border: #e2e8f0;
    --danger: #ef4444;
  }

  body {
    margin: 0;
    font-family: "Inter", system-ui, -apple-system, sans-serif;
    background-color: var(--bg);
    color: var(--text);
  }

  body.pos-mode {
    background: #f1f5f9;
    touch-action: manipulation;
  }

  body.pos-mode button,
  body.pos-mode [role="button"],
  body.pos-mode a {
    min-height: 44px;
  }

  body.pos-mode input,
  body.pos-mode select,
  body.pos-mode textarea {
    font-size: 16px !important;
  }

  body.pos-mode .global-notice-banner {
    bottom: 78px !important;
  }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes pulseglow {
    0%, 100% { transform: translateY(0); filter: drop-shadow(0 0 0 rgba(0,0,0,0)); }
    50% { transform: translateY(-2px); filter: drop-shadow(0 8px 16px rgba(37,99,235,0.4)); }
  }

  .spinner {
    width: 16px; height: 16px; border-radius: 50%;
    border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
`

const head = document.head || document.getElementsByTagName("head")[0]
if (head) {
  // Cấu hình CSS an toàn cho iframe và mobile (100dvh thay vì 100vh)
  const iframeGlobalStyles = `
    ${globalStyles}
    @supports (height: 100dvh) {
      .h-screen { height: 100dvh !important; }
      .min-h-screen { min-height: 100dvh !important; }
      .max-h-screen { max-height: 100dvh !important; }
    }
  `

  const styleTag = document.createElement("style")
  styleTag.textContent = iframeGlobalStyles
  head.appendChild(styleTag)
  perf?.mark("global_style_injected")

  // Tự động thêm cấu hình viewport chống zoom nếu chạy trong Iframe
  try {
    const isIframe = window.self !== window.top;
    if (isIframe) {
      let viewportMeta = document.querySelector('meta[name="viewport"]');
      if (!viewportMeta) {
        viewportMeta = document.createElement('meta');
        viewportMeta.name = "viewport";
        head.appendChild(viewportMeta);
      }
      viewportMeta.content = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover";
    }
  } catch (e) {
    // Nếu bị block catch ngoại lệ (Same-origin policy), coi như đang trong Iframe
    let viewportMeta = document.querySelector('meta[name="viewport"]');
    if (viewportMeta) {
      viewportMeta.content = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover";
    }
  }
}

perf?.mark("react_render_start")
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
perf?.mark("react_render_end")
if (perf?.enabled) {
  requestAnimationFrame(() => {
    perf.mark("first_animation_frame")
  })
}

const shouldRegisterServiceWorker = (() => {
  if (!("serviceWorker" in navigator)) return false;
  if (!window.isSecureContext) return false;
  try {
    if (window.self !== window.top) return false;
  } catch (e) {
    return false;
  }
  const host = String(window.location.hostname || "").toLowerCase();
  if (
    host.endsWith("script.googleusercontent.com") ||
    host.endsWith("script.google.com")
  ) {
    return false;
  }
  return true;
})();

if (shouldRegisterServiceWorker) {
  window.addEventListener("load", () => {
    perf?.mark("window_load")
    navigator.serviceWorker.register("?sw=1").catch(() => {
      // Ignore registration failure in non-PWA environments.
    });
  });
} else {
  window.addEventListener("load", () => {
    perf?.mark("window_load")
  })
}
