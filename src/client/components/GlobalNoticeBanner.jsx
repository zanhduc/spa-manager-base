import { useState, useEffect } from "react"
import { getGlobalNotice } from "../api/index.js"

const LEVEL_CONFIG = {
  info: {
    wrap: "bg-rose-50/95 text-rose-950 border-t border-rose-300",
    icon: "📣",
  },
  warning: {
    wrap: "bg-amber-50/95 text-amber-900 border-t border-amber-200",
    icon: "⚠️",
  },
  error: {
    wrap: "bg-red-50/95 text-red-900 border-t border-red-200",
    icon: "🚨",
  },
}

const NOTICE_DISMISSED_VERSIONS_KEY = "global_notice_dismissed_versions"

const getNoticeVersionKey = (notice) => {
  const version = String(notice?.version || "").trim()
  if (version) return `v:${version}`
  return `m:${String(notice?.message || "").trim()}`
}

const readDismissedVersionSet = () => {
  try {
    const raw = sessionStorage.getItem(NOTICE_DISMISSED_VERSIONS_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.map((v) => String(v || "").trim()).filter(Boolean))
  } catch (e) {
    return new Set()
  }
}

const writeDismissedVersionSet = (setValue) => {
  try {
    sessionStorage.setItem(
      NOTICE_DISMISSED_VERSIONS_KEY,
      JSON.stringify(Array.from(setValue)),
    )
  } catch (e) {
    // noop
  }
}

export default function GlobalNoticeBanner() {
  const [notice, setNotice] = useState(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const dismissedSet = readDismissedVersionSet()

    getGlobalNotice()
      .then((res) => {
        if (!res) return

        let items = []
        if (Array.isArray(res)) items = res
        else if (typeof res === "string" && res) items = [{ message: res, level: "warning", version: "" }]
        else if (res.message) items = [res]

        const active = items.find((n) => {
          if (!n?.message) return false
          return !dismissedSet.has(getNoticeVersionKey(n))
        })
        if (active) setNotice(active)
      })
      .catch(() => {})
  }, [])

  const remindLater = () => {
    setNotice(null)
  }

  const dismissThisVersion = () => {
    if (!notice) return
    const dismissedSet = readDismissedVersionSet()
    dismissedSet.add(getNoticeVersionKey(notice))
    writeDismissedVersionSet(dismissedSet)
    setNotice(null)
  }

  if (!notice) return null

  const cfg = LEVEL_CONFIG[notice.level] || LEVEL_CONFIG.info
  const hasChangelog = !!notice.changelog

  return (
    <div
      className={`
        global-notice-banner
        fixed bottom-0 left-0 right-0 z-[9999]
        ${cfg.wrap}
        backdrop-blur-xl
        shadow-[0_-2px_12px_rgba(0,0,0,0.15)]
        transition-all duration-300
        px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]
      `}
    >
      <div className="max-w-xl mx-auto">
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <span className="text-base shrink-0 mt-0.5">{cfg.icon}</span>

            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => hasChangelog && setExpanded((e) => !e)}>
              <p className="text-[13px] leading-snug font-medium">
                {notice.message}
                {hasChangelog && (
                  <span className={`inline-block ml-1 text-[10px] opacity-60 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}>
                    ▾
                  </span>
                )}
              </p>
            </div>
          </div>

          {hasChangelog && (
            <div
              className={`overflow-hidden transition-all duration-300 ${
                expanded
                  ? "max-h-[200px] opacity-100 mt-0.5 pt-2.5 border-t border-white/20"
                  : "max-h-0 opacity-0 mt-0 pt-0 border-t border-transparent"
              }`}
            >
              <div className="text-[10px] font-bold uppercase opacity-70 mb-1 tracking-wide">Nội dung cập nhật</div>
              <div className="text-xs leading-relaxed opacity-90 whitespace-pre-line">{notice.changelog}</div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={remindLater}
              className="w-full rounded-lg border border-slate-300 px-2 py-2 text-[11px] font-semibold text-slate-700 transition-all bg-white hover:bg-slate-50 active:scale-95"
            >
              Nhắc tôi sau
            </button>
            <button
              onClick={dismissThisVersion}
              className="w-full rounded-lg border border-red-300 px-2 py-2 text-[11px] font-semibold text-red-700 transition-all bg-red-50 hover:bg-red-100 active:scale-95"
            >
              Từ chối bản này
            </button>
            <button
              onClick={dismissThisVersion}
              className="w-full rounded-lg border border-rose-300 px-2 py-2 text-[11px] font-semibold text-white transition-all bg-rose-700 hover:bg-rose-800 active:scale-95"
            >
              Đồng ý
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}

