/**
 * Loading Component - dùng chung cho mọi API call
 *
 * Usage:
 *   <Loading />                        - spinner nhỏ inline
 *   <Loading size="lg" />              - spinner lớn
 *   <Loading overlay />                - full-screen overlay
 *   <Loading text="Đang tải..." />     - có text
 */
export default function Loading({ size = "md", overlay = false, text = "" }) {
  const sizes = {
    sm: "w-4 h-4 border-2",
    md: "w-6 h-6 border-2",
    lg: "w-10 h-10 border-3",
  }

  const spinner = (
    <div className="flex flex-col items-center justify-center gap-2">
      <div
        className={`${sizes[size] || sizes.md} rounded-full border-rose-500/30 border-t-rose-500 animate-spin`}
      />
      {text && (
        <span className="text-xs text-slate-500 font-medium">{text}</span>
      )}
    </div>
  )

  if (overlay) {
    return (
      <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-white/60 backdrop-blur-sm">
        {spinner}
      </div>
    )
  }

  return spinner
}

