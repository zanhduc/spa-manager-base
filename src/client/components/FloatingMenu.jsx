import { useState, useEffect } from "react";
import {
  DEVICE_TOKEN_SCOPE,
  DEVICE_TOKEN_STORAGE_KEY,
  useUser,
} from "../context";
import {
  getAppSetting,
  revokeDeviceToken,
  setAppSetting,
} from "../api/index.js";
import brandLogo from "../assets/logo-dulia.jpg";

const BRAND_LOGO_URL = brandLogo;

export default function FloatingMenu({
  currentPath,
  onNavigate,
  appMode = "web",
  onChangeAppMode = () => {},
}) {
  const { user, logout } = useUser();
  const isPosMode = appMode === "pos";
  const [isOpen, setIsOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  if (!user) return null;

  useEffect(() => {
    if (isPosMode) {
      setIsVisible(true);
      return;
    }
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      if (currentScrollY < 50) {
        setIsVisible(true);
      } else if (currentScrollY > lastScrollY) {
        setIsVisible(false);
        setIsOpen(false);
      } else {
        setIsVisible(true);
      }

      setLastScrollY(currentScrollY);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [lastScrollY, isPosMode]);

  useEffect(() => {
    if (!isOpen) return;
    const close = (e) => {
      if (!e.target.closest("#mega-menu-container")) setIsOpen(false);
    };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [isOpen]);

  // Lấy cấu hình bật/tắt nhập kho từ localStorage, sau đó lấy từ server để đồng bộ
  const [showInventory, setShowInventory] = useState(() => {
    return localStorage.getItem("enable_inventory") === "true";
  });

  useEffect(() => {
    const fetchSetting = async () => {
      try {
        const res = await getAppSetting("enable_inventory");
        if (res?.success && res.data) {
          const val = res.data === "true";
          setShowInventory(val);
          localStorage.setItem("enable_inventory", String(val));
          window.dispatchEvent(
            new CustomEvent("inventory_setting_changed", { detail: val }),
          );
        }
      } catch (e) {
        console.error("Lỗi khi tải cài đặt kho:", e);
      }
    };
    fetchSetting();
  }, []);

  const toggleInventory = async () => {
    const newState = !showInventory;
    setShowInventory(newState);
    localStorage.setItem("enable_inventory", String(newState));
    window.dispatchEvent(
      new CustomEvent("inventory_setting_changed", { detail: newState }),
    );
    try {
      await setAppSetting({ key: "enable_inventory", value: newState });
    } catch (e) {
      console.error("Lỗi khi lưu cài đặt kho:", e);
    }
  };

  const menuItems = [
    { id: "create-order", label: "Quản lý phòng", icon: "🏨" },
    { id: "history", label: "Lịch sử lưu trú", icon: "🕘" },
    { id: "products", label: "Quản lý sản phẩm", icon: "📦" },
    ...(showInventory
      ? [
          { id: "stock", label: "Tồn kho", icon: "🏢" },
          { id: "inventory", label: "Nhập hàng (Chi tiêu gia đình)", icon: "📥" },
        ]
      : []),
    { id: "debt", label: "Quản lý công nợ", icon: "📒" },
    { id: "stats", label: "Thống kê", icon: "📊" },
    // { id: "print-diagnostic", label: "Tự kiểm tra in", icon: "🖨️" },
  ];

  const handleNav = (id) => {
    setIsOpen(false);
    onNavigate(id);
  };

  const handleLogout = async () => {
    const token = String(localStorage.getItem(DEVICE_TOKEN_STORAGE_KEY) || "").trim();
    if (token) {
      try {
        await revokeDeviceToken(token, DEVICE_TOKEN_SCOPE);
      } catch (e) {
        // Silent fallback to local logout.
      }
    }
    localStorage.removeItem(DEVICE_TOKEN_STORAGE_KEY);
    logout();
  };

  const posTabs = [
    { id: "create-order", label: "Phòng", icon: "🏨" },
    { id: "history", label: "Lưu trú", icon: "🕘" },
    { id: "debt", label: "Công nợ", icon: "📒" },
    { id: "print-diagnostic", label: "In", icon: "🖨️" },
  ];

  return (
    <>
      <div
        id="mega-menu-container"
        className={`fixed top-4 right-4 z-[9000] flex flex-col items-end ${isPosMode ? "" : "md:hidden"}`}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
          className={`w-12 h-12 rounded-full flex items-center justify-center bg-white shadow-[0_4px_20px_rgba(0,0,0,0.12)] border border-slate-100 transition-all duration-300 ${
            isVisible
              ? "translate-y-0 opacity-100 scale-100"
              : "-translate-y-16 opacity-0 scale-90 pointer-events-none"
          } ${isOpen ? "ring-4 ring-rose-500/20" : "hover:scale-105"}`}
        >
          <div className="relative w-5 h-4">
            <span
              className={`absolute left-0 w-full h-0.5 bg-slate-700 rounded-full transition-all duration-300 ${isOpen ? "top-1.5 rotate-45" : "top-0"}`}
            />
            <span
              className={`absolute left-0 w-full h-0.5 bg-slate-700 rounded-full transition-all duration-300 ${isOpen ? "opacity-0" : "top-1.5 opacity-100"}`}
            />
            <span
              className={`absolute left-0 w-full h-0.5 bg-slate-700 rounded-full transition-all duration-300 ${isOpen ? "top-1.5 -rotate-45" : "top-3"}`}
            />
          </div>
        </button>

        <div
          className={`absolute top-14 right-0 w-64 bg-white/95 backdrop-blur-xl rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-white/20 overflow-hidden transition-all duration-300 origin-top-left ${
            isOpen
              ? "scale-100 opacity-100 translate-y-0"
              : "scale-90 opacity-0 -translate-y-2 pointer-events-none"
          }`}
        >
          <div className="p-3 border-b border-slate-100 space-y-2.5">
            <div className="flex items-center gap-2.5">
              <img
                src={BRAND_LOGO_URL}
                alt="Dulia logo"
                className="h-12 w-12 rounded-lg object-cover"
                loading="eager"
                fetchpriority="high"
              />
              <div className="min-w-0">
                <p className="font-bold text-slate-800 truncate">
                  {user.name || "Tài khoản của bạn"}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {user.email || user.username}
                </p>
              </div>
            </div>
            <span className="inline-block px-2 py-0.5 text-[10px] font-bold text-rose-800 bg-rose-100 rounded-full uppercase tracking-wider">
              {user.role}
            </span>
          </div>

          <div className="p-2 max-h-[60vh] overflow-y-auto">
            {menuItems.map((item) => {
              const isActive = currentPath === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNav(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${
                    isActive
                      ? "bg-rose-50 text-rose-800 font-bold"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium"
                  }`}
                >
                  <span
                    className={`text-xl ${isActive ? "drop-shadow-sm" : "grayscale opacity-70"}`}
                  >
                    {item.icon}
                  </span>
                  <span className="text-sm">{item.label}</span>
                  {isActive && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-rose-700" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="p-2 border-t border-slate-100 bg-slate-50/50 space-y-1">
            <div className="px-3 py-2 flex items-center justify-between rounded-xl hover:bg-slate-100/50 transition-colors">
              <span className="text-[13px] font-medium text-slate-600">
                Bật tính năng Nhập kho
              </span>
              <button
                onClick={toggleInventory}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  showInventory ? "bg-emerald-500" : "bg-slate-300"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    showInventory ? "translate-x-4.5" : "translate-x-1"
                  }`}
                  style={{
                    transform: showInventory
                      ? "translateX(18px)"
                      : "translateX(4px)",
                  }}
                />
              </button>
            </div>
            {/* <button
              onClick={() => onChangeAppMode(isPosMode ? "web" : "pos")}
              className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl font-semibold transition-colors text-sm ${
                isPosMode
                  ? "text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                  : "text-slate-700 bg-slate-100 hover:bg-slate-200"
              }`}
            >
              {isPosMode ? "POS mode: Bật" : "POS mode: Tắt"}
            </button> */}
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-red-600 font-semibold hover:bg-red-50 transition-colors text-sm"
            >
              Đăng xuất
            </button>
          </div>
        </div>
      </div>

      <aside
        className={`fixed left-4 top-4 bottom-4 z-[8000] w-64 flex-col rounded-3xl border border-slate-200 bg-white/95 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.08)] ${
          isPosMode ? "hidden" : "hidden md:flex"
        }`}
      >
        <div className="p-4 border-b border-slate-100 space-y-3">
          <div className="flex items-center gap-3">
            <img
              src={BRAND_LOGO_URL}
              alt="Dulia logo"
              className="h-16 w-16 rounded-xl object-cover"
              loading="eager"
              fetchpriority="high"
            />
            <div className="min-w-0">
              <p className="font-bold text-slate-800 truncate">
                {user.name || "Tài khoản của bạn"}
              </p>
              <p className="text-xs text-slate-500 truncate">
                {user.email || user.username}
              </p>
            </div>
          </div>
          <span className="inline-block px-2 py-0.5 text-[10px] font-bold text-rose-800 bg-rose-100 rounded-full uppercase tracking-wider">
            {user.role}
          </span>
        </div>

        <div className="flex-1 p-3 overflow-y-auto">
          {menuItems.map((item) => {
            const isActive = currentPath === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNav(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all mb-1 ${
                  isActive
                    ? "bg-rose-50 text-rose-800 font-bold"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium"
                }`}
              >
                <span
                  className={`text-xl ${isActive ? "drop-shadow-sm" : "grayscale opacity-70"}`}
                >
                  {item.icon}
                </span>
                <span className="text-sm">{item.label}</span>
                {isActive && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-rose-700" />
                )}
              </button>
            );
          })}
        </div>

        <div className="p-3 border-t border-slate-100 bg-slate-50/60 space-y-2">
          <div className="px-3 py-2 flex items-center justify-between rounded-xl hover:bg-slate-100/50 transition-colors">
            <span className="text-[13px] font-medium text-slate-600">
              Bật tính năng Nhập kho
            </span>
            <button
              onClick={toggleInventory}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                showInventory ? "bg-emerald-500" : "bg-slate-300"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  showInventory ? "translate-x-4.5" : "translate-x-1"
                }`}
                style={{
                  transform: showInventory
                    ? "translateX(18px)"
                    : "translateX(4px)",
                }}
              />
            </button>
          </div>
          <button
            onClick={() => onChangeAppMode(isPosMode ? "web" : "pos")}
            className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl font-semibold transition-colors text-sm ${
              isPosMode
                ? "text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                : "text-slate-700 bg-slate-100 hover:bg-slate-200"
            }`}
          >
            {isPosMode ? "POS mode: Bật" : "POS mode: Tắt"}
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-red-600 font-semibold hover:bg-red-50 transition-colors text-sm"
          >
            Đăng xuất
          </button>
        </div>
      </aside>

      {isPosMode && (
        <nav className="fixed bottom-0 left-0 right-0 z-[9100] border-t border-slate-200 bg-white/95 backdrop-blur-xl px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto grid w-full max-w-3xl grid-cols-4 gap-2">
            {posTabs.map((item) => {
              const isActive = currentPath === item.id;
              return (
                <button
                  key={`pos-tab-${item.id}`}
                  onClick={() => handleNav(item.id)}
                  className={`rounded-xl px-2 py-2.5 text-center transition-colors ${
                    isActive
                      ? "bg-rose-50 text-rose-700"
                      : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <div className="text-lg leading-none">{item.icon}</div>
                  <div className="mt-1 text-[11px] font-semibold">
                    {item.label}
                  </div>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
}
