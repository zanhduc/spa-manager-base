import { useState, useEffect } from "react"
import { login, call } from "../api/index.js"
import { getNextOrderFormDefaults } from "../api"
import { DEVICE_TOKEN_SCOPE, DEVICE_TOKEN_STORAGE_KEY } from "../context";
import brandLogo from "../assets/logo-dulia.jpg"

const ORDER_DEFAULTS_CACHE_KEY = "soanhang.orderDefaults"
const BRAND_LOGO_URL = brandLogo

const prefetchOrderDefaults = async () => {
  try {
    const res = await getNextOrderFormDefaults()
    const maPhieu = String(res?.data?.maPhieu || "").trim()
    const ngayBan = String(res?.data?.ngayBan || "").trim()
    if (!maPhieu || !ngayBan) return
    sessionStorage.setItem(
      ORDER_DEFAULTS_CACHE_KEY,
      JSON.stringify({
        maPhieu,
        ngayBan,
        updatedAt: Date.now(),
      }),
    )
  } catch (e) {
    // noop
  }
}

export default function LoginPage({
  onLoginSuccess,
  appMode = "web",
  onChangeAppMode = () => {},
}) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [showPass, setShowPass] = useState(false)
  const [demoAccounts, setDemoAccounts] = useState([])

  useEffect(() => {
    call("getDemoAccounts")
      .then((res) => {
        if (res?.success && Array.isArray(res.data)) {
          setDemoAccounts(res.data)
        }
      })
      .catch(console.error)
  }, [])

  const handleLogin = async (e) => {
    e.preventDefault()

    if (!email || !password) {
      setError("Vui lòng điền đầy đủ thông tin")
      return
    }

    setError("")
    setLoading(true)
    try {
      const res = await login(email, password, DEVICE_TOKEN_SCOPE)
      if (res.success) {
        const token = String(res?.data?.deviceToken || "").trim();
        if (token) {
          localStorage.setItem(DEVICE_TOKEN_STORAGE_KEY, token);
        }
        prefetchOrderDefaults()
        onLoginSuccess(res.data)
      } else {
        setError(res.message)
      }
    } catch (err) {
      setError("Có lỗi xảy ra: " + (err?.message || String(err)))
    } finally {
      setLoading(false)
    }
  }

  const fillDemo = (acc) => {
    setEmail(acc.email)
    setPassword(acc.password)
    setError("")
  }

  return (
    <div className="min-h-screen flex items-start md:items-center justify-center p-4 md:p-6 pb-20 bg-slate-100 font-sans text-slate-800">
      <div className="w-full max-w-md rounded-2xl px-9 py-10 bg-white border border-slate-200 shadow-xl shadow-slate-200/50 animate-[fadeUp_0.4s_ease]">
        <div className="text-center mb-8">
          <img
            src={BRAND_LOGO_URL}
            alt="Dulia logo"
            className="mx-auto mt-4 mb-3 h-24 w-24 rounded-2xl object-cover"
            loading="eager"
            fetchpriority="high"
          />
          <h1 className="text-3xl font-bold bg-gradient-to-br from-rose-700 to-rose-900 bg-clip-text text-transparent">DULI Accounting</h1>
          <p className="text-sm mt-1 text-slate-500">Hệ thống dành riêng cho bạn</p>
          <div className="mt-3 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => onChangeAppMode(appMode === "pos" ? "web" : "pos")}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
                appMode === "pos"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-slate-300 bg-slate-50 text-slate-600"
              }`}
            >
              {appMode === "pos" ? "POS mode: Bật" : "POS mode: Tắt"}
            </button>
          </div>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Tài khoản</label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-sm text-slate-400">✉️</span>
              <input
                id="email"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Nhập tài khoản"
                autoComplete="username"
                className="w-full pl-9 pr-4 py-3 rounded-lg text-sm bg-slate-50 border border-slate-300 text-slate-800 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 transition-all"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Mật khẩu</label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-sm text-slate-400">🔒</span>
              <input
                id="password"
                type={showPass ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-10 py-3 rounded-lg text-sm bg-slate-50 border border-slate-300 text-slate-800 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-3 text-xs text-slate-500 hover:text-slate-700 transition-colors focus:outline-none"
              >
                {showPass ? "Ẩn" : "Hiện"}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm bg-red-50 border border-red-200 text-red-600">
              <span className="shrink-0 text-red-500">⚠️</span> {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 py-3.5 rounded-lg text-white font-semibold text-base flex items-center justify-center gap-2 transition-all disabled:opacity-70 disabled:cursor-not-allowed bg-gradient-to-br from-rose-700 to-rose-900 hover:shadow-lg hover:shadow-rose-700/30 hover:-translate-y-0.5 active:translate-y-0"
          >
            {loading && <span className="spinner border-t-transparent w-4 h-4 border-2" />}
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>

        {demoAccounts.length > 0 && (
          <div className="mt-8 pt-6 text-center border-t border-slate-200">
            <p className="text-xs font-medium mb-3 text-slate-400 uppercase tracking-wider">Tài khoản demo</p>
            <div className="flex flex-wrap gap-2.5 justify-center">
              {demoAccounts.map((acc, i) => {
                let icon = "👤"
                if (acc.role === "admin") icon = "🧑‍💼"
                else if (acc.role === "dev") icon = "🛠️"

                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => fillDemo(acc)}
                    className="px-4 py-2 rounded-full text-xs font-medium bg-slate-50 border border-slate-200 text-slate-600 transition-colors hover:bg-rose-50 hover:text-rose-800 hover:border-rose-200"
                  >
                    {icon} {acc.name || acc.role}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}



