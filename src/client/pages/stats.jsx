import { useEffect, useMemo, useRef, useState } from "react";
import { CACHE_INVALIDATED_EVENT, CACHE_KEYS, getOrderHistory } from "../api";
import toast from "react-hot-toast";
import {
  formatMoney as fmt,
  parseNumber as toNum,
  normalizeText as foldText,
  toLocalIso,
  getStatusCode,
  toIsoDate,
  calculateStats,
  formatShortDate,
  startOfWeek,
} from "../../core/core";

const buildSparkPath = (values, width, height) => {
  if (!values.length) return "";
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = width / Math.max(values.length - 1, 1);
  return values
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * height;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
};

const makeMockOrders = () => {
  const baseProducts = [
    {
      tenSanPham: "Nước suối Aquafina 500ml",
      donVi: "Chai",
      donGiaBan: 10000,
      giaVon: 6000,
    },
    {
      tenSanPham: "Mì gói Hảo Hảo",
      donVi: "Gói",
      donGiaBan: 5000,
      giaVon: 3500,
    },
    { tenSanPham: "Bánh Oreo", donVi: "Gói", donGiaBan: 15000, giaVon: 10000 },
    {
      tenSanPham: "Coca Cola lon 330ml",
      donVi: "Lon",
      donGiaBan: 12000,
      giaVon: 8000,
    },
  ];
  const today = new Date();
  const orders = [];
  for (let i = 0; i < 180; i += 1) {
    const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    const count = Math.floor(Math.random() * 4);
    for (let j = 0; j < count; j += 1) {
      const pCount = 1 + Math.floor(Math.random() * 3);
      const products = Array.from({ length: pCount }).map(() => {
        const p = baseProducts[Math.floor(Math.random() * baseProducts.length)];
        const soLuong = 1 + Math.floor(Math.random() * 4);
        return {
          tenSanPham: p.tenSanPham,
          donVi: p.donVi,
          soLuong,
          giaVon: p.giaVon,
          donGiaBan: p.donGiaBan,
        };
      });
      const tongHoaDon = products.reduce(
        (sum, p) => sum + toNum(p.soLuong) * toNum(p.donGiaBan),
        0,
      );
      orders.push({
        maPhieu: `MOCK-${i}-${j}`,
        ngayBan: toLocalIso(d),
        tenKhach: "Khách demo",
        tienNo: 0,
        tongHoaDon,
        ghiChu: "-",
        trangThai: "Đã thanh toán",
        products,
      });
    }
  }
  return orders;
};

const getPeriodKey = (dateIso, mode, targetYear, quarterMonths) => {
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return "unknown";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  if (mode === "day") return `${y}-${m}-${day}`;
  if (mode === "quarter") {
    if (targetYear && y !== targetYear) return "out";
    const monthIndex = d.getMonth() + 1;
    if (!quarterMonths || quarterMonths.indexOf(monthIndex) === -1)
      return "out";
    return `M${String(monthIndex).padStart(2, "0")}`;
  }
  return `${y}`;
};

const formatPeriodLabel = (label, mode) => {
  if (!label) return "";
  if (mode === "day") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(label)) {
      return `${label.slice(8, 10)}/${label.slice(5, 7)}`;
    }
    return label;
  }
  if (mode === "quarter") {
    const match = label.match(/^M(\d{2})$/);
    if (match) return `Tháng ${parseInt(match[1], 10)}`;
  }
  return label;
};

const getScaleConfig = (values) => {
  const max = Math.max(...values.map((v) => Math.abs(v || 0)), 0);
  if (max >= 1_000_000_000) return { divisor: 1_000_000_000, unit: "tỷ đồng" };
  if (max >= 1_000_000) return { divisor: 1_000_000, unit: "triệu đồng" };
  if (max >= 1_000) return { divisor: 1_000, unit: "nghìn đồng" };
  return { divisor: 1, unit: "đồng" };
};

const formatScaled = (value, scale) => {
  const scaled = value / scale.divisor;
  const decimals = Math.abs(scaled) >= 100 ? 0 : 1;
  const formatted = scaled.toLocaleString("vi-VN", {
    maximumFractionDigits: decimals,
  });
  return formatted;
};

function PillSelect({
  value,
  options,
  onChange,
  buttonClassName = "",
  dropdownAlign = "left",
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = options.find((opt) => opt.value === value) || options[0];

  useEffect(() => {
    const onDocClick = (e) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("touchstart", onDocClick);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("touchstart", onDocClick);
    };
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`rounded-full border border-rose-200 bg-white px-4 py-2 pr-9 text-xs font-semibold text-rose-700 shadow-sm ring-1 ring-rose-100 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-500/30 ${buttonClassName}`}
      >
        {current?.label}
        <span
          className={`absolute right-3 top-1/2 -translate-y-1/2 text-rose-500 text-[11px] transition-transform ${open ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>
      {open && (
        <div
          className={`absolute ${dropdownAlign === "right" ? "right-0" : "left-0"} z-30 mt-2 w-36 rounded-xl border border-rose-200 bg-white p-1 shadow-xl`}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${
                opt.value === current?.value
                  ? "bg-rose-50 text-rose-700 font-semibold"
                  : "text-slate-700 hover:bg-rose-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
export default function StatsPage() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [trendMode, setTrendMode] = useState("week");
  const [trendWeekPreset, setTrendWeekPreset] = useState("last7");
  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().slice(0, 10);
  });
  const [customTo, setCustomTo] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [trendQuarter, setTrendQuarter] = useState(() =>
    Math.floor((new Date().getMonth() + 2) / 3),
  );
  const [trendYear, setTrendYear] = useState(() => new Date().getFullYear());
  const [isDesktop, setIsDesktop] = useState(true);
  const [topProductsPeriod, setTopProductsPeriod] = useState("all");
  const loadOrders = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const res = await getOrderHistory();
      if (res?.success && Array.isArray(res.data)) setOrders(res.data);
      else {
        setOrders([]);
        if (res?.message) toast.error(res.message);
      }
    } catch (e) {
      setOrders([]);
      toast.error("Không tải được dữ liệu thống kê");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    setIsDesktop(window.innerWidth >= 768);
    const handleResize = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    loadOrders();
  }, []);

  useEffect(() => {
    const onInvalidated = (event) => {
      const keys = event?.detail?.keys;
      if (!Array.isArray(keys)) return;
      if (!keys.includes(CACHE_KEYS.orderHistory)) return;
      loadOrders({ silent: true });
    };
    window.addEventListener(CACHE_INVALIDATED_EVENT, onInvalidated);
    return () =>
      window.removeEventListener(CACHE_INVALIDATED_EVENT, onInvalidated);
  }, []);

  const sourceOrders = useMemo(() => {
    if (orders.length) return orders;
    return makeMockOrders();
  }, [orders]);

  const availableYears = useMemo(() => {
    const years = new Set();
    sourceOrders.forEach((o) => {
      const iso = toIsoDate(o.ngayBan);
      if (iso) years.add(Number(iso.slice(0, 4)));
    });
    years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [sourceOrders]);

  useEffect(() => {
    if (!availableYears.includes(trendYear)) {
      setTrendYear(availableYears[0] || new Date().getFullYear());
    }
  }, [availableYears, trendYear]);

  const stats = useMemo(
    () =>
      calculateStats({
        sourceOrders,
        trendMode,
        trendWeekPreset,
        trendQuarter,
        trendYear,
        customFrom,
        customTo,
        isDesktop,
        topProductsPeriod,
      }),
    [
      sourceOrders,
      trendMode,
      trendWeekPreset,
      trendQuarter,
      trendYear,
      customFrom,
      customTo,
      isDesktop,
      topProductsPeriod,
    ],
  );

  const periodMax = Math.max(...stats.periodRevenue, ...stats.periodProfit, 1);
  const periodScale = getScaleConfig([
    ...stats.periodRevenue,
    ...stats.periodProfit,
  ]);
  const colCount = stats.periodLabels.length;
  const isDense = colCount >= 7;
  const totalStatus =
    stats.statusCounts.PAID +
      stats.statusCounts.PARTIAL +
      stats.statusCounts.DEBT || 1;
  const paidPct = (stats.statusCounts.PAID / totalStatus) * 100;
  const partialPct = (stats.statusCounts.PARTIAL / totalStatus) * 100;

  const getPeriodLabel = () => {
    switch (trendMode) {
      case "week":
        return "hôm nay";
      case "month":
      case "quarter":
        return "tháng này";
      case "year":
        return "năm nay";
      default:
        return "kỳ này";
    }
  };
  const periodLabelText = getPeriodLabel();

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-50 to-rose-50/30">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6 md:py-8 pb-24">
        <div className="mb-6 md:mb-8">
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 leading-tight">
            Thống kê
          </h1>
          <p className="mt-2 text-sm md:text-base text-slate-500">
            Tổng quan doanh thu, lợi nhuận và hiệu suất bán hàng.
          </p>
        </div>

        <section className="grid gap-3 md:grid-cols-3 mb-4">
          <div className="rounded-2xl border border-rose-200 bg-rose-50/60 px-4 py-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
              Doanh thu {periodLabelText}
            </p>
            <p className="mt-1 text-2xl font-black text-rose-700">
              {fmt(stats.curRevenue)}
            </p>
            {stats.revenueDelta !== 0 && (
              <p
                className={`mt-1 text-xs font-bold ${stats.revenueDelta > 0 ? "text-emerald-600" : "text-rose-600"}`}
              >
                {stats.revenueDelta > 0 ? "↑" : "↓"}{" "}
                {Math.abs(stats.revenueDelta)}% so với kỳ trước
              </p>
            )}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Lợi nhuận {periodLabelText}
            </p>
            <p
              className={`mt-1 text-2xl font-black ${stats.curProfit >= 0 ? "text-emerald-600" : "text-rose-600"}`}
            >
              {fmt(stats.curProfit)}
            </p>
            {stats.profitDelta !== 0 && (
              <p
                className={`mt-1 text-xs font-bold ${stats.profitDelta > 0 ? "text-emerald-600" : "text-rose-600"}`}
              >
                {stats.profitDelta > 0 ? "↑" : "↓"}{" "}
                {Math.abs(stats.profitDelta)}% so với kỳ trước
              </p>
            )}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Đơn hàng {periodLabelText}
            </p>
            <p className="mt-1 text-2xl font-black text-slate-900">
              {stats.curOrders}
            </p>
            {stats.ordersDelta !== 0 && (
              <p
                className={`mt-1 text-xs font-bold ${stats.ordersDelta > 0 ? "text-emerald-600" : "text-rose-600"}`}
              >
                {stats.ordersDelta > 0 ? "↑" : "↓"}{" "}
                {Math.abs(stats.ordersDelta)}% so với kỳ trước
              </p>
            )}
          </div>
        </section>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
            Đang tải dữ liệu thống kê...
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm md:text-base font-bold text-slate-800">
                      Doanh thu theo kỳ
                    </h2>
                    <p className="mt-1 text-xs font-semibold text-rose-700">
                      {stats.periodRangeLabel}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Đơn vị: {periodScale.unit}
                    </p>
                  </div>
                  <PillSelect
                    value={trendMode}
                    onChange={(val) => setTrendMode(val)}
                    options={[
                      { value: "week", label: "Tuần" },
                      { value: "month", label: "Tháng" },
                      { value: "quarter", label: "Quý" },
                      { value: "year", label: "Năm" },
                    ]}
                    buttonClassName="min-w-[96px] justify-center"
                    dropdownAlign="right"
                  />
                </div>
                {trendMode === "week" && (
                  <div className="flex flex-wrap items-center gap-2">
                    <PillSelect
                      value={trendWeekPreset}
                      onChange={(val) => setTrendWeekPreset(val)}
                      options={[
                        { value: "last7", label: "7 ngày qua" },
                        { value: "prevWeek", label: "Tuần trước" },
                        { value: "custom", label: "Tùy chọn" },
                      ]}
                      buttonClassName="min-w-[118px] justify-center"
                    />
                    {trendWeekPreset === "custom" && (
                      <>
                        <input
                          type="date"
                          value={customFrom}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCustomFrom(val);
                            if (!isDesktop && val) {
                              const dFrom = new Date(val + "T00:00:00");
                              const dTo = new Date(customTo + "T00:00:00");
                              if (dTo - dFrom > 6 * 86400000) {
                                dFrom.setDate(dFrom.getDate() + 6);
                                setCustomTo(toLocalIso(dFrom));
                              }
                            }
                          }}
                          className="rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 shadow-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                        />
                        <span className="text-xs text-slate-400">→</span>
                        <input
                          type="date"
                          value={customTo}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCustomTo(val);
                            if (!isDesktop && val) {
                              const dTo = new Date(val + "T00:00:00");
                              const dFrom = new Date(customFrom + "T00:00:00");
                              if (dTo - dFrom > 6 * 86400000) {
                                dTo.setDate(dTo.getDate() - 6);
                                setCustomFrom(toLocalIso(dTo));
                              }
                            }
                          }}
                          className="rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 shadow-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                        />
                      </>
                    )}
                  </div>
                )}
                {trendMode === "quarter" && (
                  <div className="flex items-center gap-2">
                    {!isDesktop && (
                      <PillSelect
                        value={trendQuarter}
                        onChange={(val) => setTrendQuarter(val)}
                        options={[
                          { value: 1, label: "Quý 1" },
                          { value: 2, label: "Quý 2" },
                          { value: 3, label: "Quý 3" },
                          { value: 4, label: "Quý 4" },
                        ]}
                        buttonClassName="min-w-[90px] justify-center"
                      />
                    )}
                    <PillSelect
                      value={trendYear}
                      onChange={(val) => setTrendYear(val)}
                      options={availableYears.map((year) => ({
                        value: year,
                        label: String(year),
                      }))}
                      buttonClassName="min-w-[82px] justify-center"
                    />
                  </div>
                )}
              </div>
              <div className="mt-4 h-64 rounded-2xl bg-gradient-to-br from-rose-50 to-white border border-rose-100 p-2 sm:p-5 overflow-hidden">
                <div
                  className={`flex h-full items-end justify-around gap-0 ${colCount <= 5 ? "max-w-md mx-auto" : ""}`}
                >
                  {stats.periodRevenue.map((v, idx) => {
                    const profitValue = stats.periodProfit[idx] || 0;
                    const profitBarH =
                      profitValue > 0
                        ? Math.max(24, (profitValue / periodMax) * 180)
                        : 4;
                    const revenueBarH =
                      v > 0 ? Math.max(24, (v / periodMax) * 180) : 4;
                    return (
                      <div
                        key={`period-${idx}`}
                        className="flex-1 min-w-0 px-[1px] sm:px-1"
                      >
                        <div className="flex flex-col items-center gap-1">
                          <div
                            className={`flex items-end justify-center gap-[2px] sm:gap-1 ${trendMode === "quarter" ? "w-[80%]" : "w-full"}`}
                          >
                            <div className="flex flex-col items-center gap-0.5 flex-1 min-w-0">
                              <span className="text-center tabular-nums text-[6px] sm:text-[8px] font-semibold text-emerald-600 truncate w-full">
                                {formatScaled(profitValue, periodScale)}
                              </span>
                              <div
                                className={`w-full rounded-sm sm:rounded-md ${profitValue > 0 ? "bg-gradient-to-t from-emerald-600 to-emerald-300" : "bg-slate-200"}`}
                                style={{ height: `${profitBarH}px` }}
                              />
                            </div>
                            <div className="flex flex-col items-center gap-0.5 flex-1 min-w-0">
                              <span className="text-center tabular-nums text-[6px] sm:text-[8px] font-semibold text-rose-600 truncate w-full">
                                {formatScaled(v, periodScale)}
                              </span>
                              <div
                                className={`w-full rounded-sm sm:rounded-md ${v > 0 ? "bg-gradient-to-t from-rose-600 to-rose-300" : "bg-slate-200"}`}
                                style={{ height: `${revenueBarH}px` }}
                              />
                            </div>
                          </div>
                          <span className="text-[7px] sm:text-[10px] text-slate-500 truncate w-full text-center">
                            {stats.periodLabels[idx]}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mt-3 flex items-center justify-center gap-6 text-xs text-slate-500">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  Lãi
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                  Doanh thu
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-sm md:text-base font-bold text-slate-800">
                  Trạng thái thanh toán
                </h2>
                <span className="text-xs text-slate-400">Tỷ lệ</span>
              </div>
              <div className="mt-4 flex items-center gap-4">
                <div
                  className="h-24 w-24 rounded-full"
                  style={{
                    background: `conic-gradient(#10b981 0 ${paidPct}%, #8b5cf6 ${paidPct}% ${paidPct + partialPct}%, #f59e0b ${paidPct + partialPct}% 100%)`,
                  }}
                />
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Đã thanh toán: {stats.statusCounts.PAID}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-violet-500" />
                    Trả một phần: {stats.statusCounts.PARTIAL}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    Nợ: {stats.statusCounts.DEBT}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h2 className="text-sm md:text-base font-bold text-slate-800">
                  Top sản phẩm bán chạy theo doanh thu
                </h2>
                <div className="flex justify-start sm:justify-end">
                  <PillSelect
                    value={topProductsPeriod}
                    onChange={(val) => setTopProductsPeriod(val)}
                    options={[
                      { value: "week", label: "1 tuần qua" },
                      { value: "month", label: "1 tháng qua" },
                      { value: "year", label: "1 năm qua" },
                      { value: "all", label: "Tất cả" },
                    ]}
                    buttonClassName="min-w-[100px] justify-center !py-1 !text-xs !bg-slate-50 !border-slate-200 hover:bg-slate-100 !text-slate-600 focus:ring-slate-200"
                    dropdownAlign="left"
                  />
                </div>{" "}
              </div>
              <div className="mt-4 space-y-3">
                {stats.topProducts.length === 0 && (
                  <p className="text-sm text-slate-500">Chưa có dữ liệu.</p>
                )}
                {stats.topProducts.map((p) => (
                  <div key={`${p.tenSanPham}-${p.donVi}`} className="space-y-1">
                    <div className="flex items-center justify-between text-sm gap-2">
                      <span className="font-semibold text-slate-800 flex-1 truncate">
                        {p.tenSanPham}
                      </span>
                      <span className="text-rose-700 font-bold whitespace-nowrap">
                        {fmt(p.value)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-rose-500 to-rose-700"
                        style={{
                          width: `${(p.value / Math.max(stats.topProducts[0]?.value || 1, 1)) * 100}%`,
                        }}
                      />
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {p.qty} {p.donVi?.toLowerCase() || ""}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
