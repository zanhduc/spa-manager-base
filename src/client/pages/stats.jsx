import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  CACHE_KEYS,
  clearReadCacheByKeys,
  getCtBanHistory,
  getOrderHistory,
  getReceiptHistory,
  getStayHistory,
} from "../api";
import { readCache, setManualRefreshAt } from "../api/localCache.js";
import { hasCachedResponse, readCachedList, shouldBlockPanelUI } from "../utils/cacheBootstrap.js";
import { useCacheSync } from "../hooks/useCacheSync.js";
import { normalizeText as foldText, parseNumber, toIsoDate } from "../../core/core";

const fmt = (n) => Number(n || 0).toLocaleString("vi-VN");

const TOP_TAB_OPTIONS = [
  { value: "SERVICE", label: "Dịch vụ" },
  { value: "PACKAGE", label: "Gói trị liệu" },
  { value: "CARD", label: "Thẻ tài khoản" },
];

const toLocalDate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

// Parse VN datetime "HH:mm DD/MM/YYYY" to Date object
const parseVnDateTime = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    return new Date(parseInt(m[5]), parseInt(m[4]) - 1, parseInt(m[3]), parseInt(m[1]), parseInt(m[2]));
  }
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const startOfYear = (date) => new Date(date.getFullYear(), 0, 1);
const addMonths = (date, months) => new Date(date.getFullYear(), date.getMonth() + months, 1);
const getMonthLabel = (isoDate) => {
  if (!isoDate) return "";
  return `${isoDate.slice(5, 7)}/${isoDate.slice(2, 4)}`;
};

const getPeriodRange = (period) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (period === "last12Months") {
    return { start: addMonths(today, -11), end: today };
  }
  if (period === "thisYear") {
    return { start: startOfYear(today), end: today };
  }
  if (period === "thisMonth") {
    return { start: startOfMonth(today), end: today };
  }
  return { start: addDays(today, -6), end: today };
};

const getDayLabel = (isoDate) => {
  if (!isoDate) return "";
  const day = isoDate.slice(8, 10);
  const month = isoDate.slice(5, 7);
  return `${day}/${month}`;
};

const bucketizeRows = (rows, bucketSize, period) => {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const size = Math.max(1, Number(bucketSize) || 1);
  const output = [];
  for (let i = 0; i < rows.length; i += size) {
    const group = rows.slice(i, i + size);
    const first = group[0];
    const last = group[group.length - 1];
    const customerVisits = Math.max(...group.map((x) => Number(x.customerVisits || 0)), 0);
    const revenue = group.reduce((sum, x) => sum + Number(x.revenue || 0), 0);
    let label = first.label;
    if (period === "thisMonth" && group.length > 1) {
      const firstDay = first.iso.slice(8, 10);
      const lastDay = last.iso.slice(8, 10);
      const month = first.iso.slice(5, 7);
      label = `${firstDay}-${lastDay}/${month}`;
    }
    output.push({
      iso: first.iso,
      label,
      customerVisits,
      revenue,
    });
  }
  return output;
};

const getMaxBarsForWidth = (width) => {
  const w = Number(width || 0);
  if (w <= 360) return 6;
  if (w <= 420) return 7;
  if (w <= 768) return 8;
  if (w <= 1024) return 10;
  return 12;
};

const bucketizeForViewport = (rows, maxBars, period) => {
  if (!Array.isArray(rows) || rows.length <= maxBars) return rows;
  const size = Math.ceil(rows.length / Math.max(1, maxBars));
  return bucketizeRows(rows, size, period);
};

const bucketizeThisMonthByWeek = (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const output = [];
  for (let i = 0; i < rows.length; i += 7) {
    const group = rows.slice(i, i + 7);
    const first = group[0];
    const last = group[group.length - 1];
    const firstDay = first.iso.slice(8, 10);
    const lastDay = last.iso.slice(8, 10);
    const month = first.iso.slice(5, 7);
    output.push({
      iso: first.iso,
      label: `${firstDay}-${lastDay}/${month}`,
      customerVisits: Math.max(...group.map((x) => Number(x.customerVisits || 0)), 0),
      revenue: group.reduce((sum, x) => sum + Number(x.revenue || 0), 0),
    });
  }
  return output;
};

const GUEST_NAME_KEYS = new Set(["khach ghe tham", "khach vang lai", "khach le"]);
const isGuestName = (name) => GUEST_NAME_KEYS.has(foldText(name));
const normalizePhone = (value) => String(value || "").replace(/[^\d]/g, "");
const getCustomerVisitKey = (raw = {}) => {
  const phone = normalizePhone(raw?.soDienThoai);
  if (phone) return `phone:${phone}`;
  const name = foldText(raw?.tenKhach);
  if (!name || isGuestName(name)) return "";
  return `name:${name}`;
};
const STAY_CHECKED_OUT = "CHECKED_OUT";

const getStayCheckoutIso = (stay = {}) => {
  const raw = String(stay?.ketThucThucTe || stay?.batDauAt || "").trim();
  if (!raw) return "";
  if (raw.includes("T")) {
    const parsed = new Date(raw);
    if (Number.isFinite(parsed.getTime())) return toLocalDate(parsed);
  }
  const parsed = parseVnDateTime(raw);
  if (parsed) return toLocalDate(parsed);
  return toIsoDate(raw);
};

const getStayTienGoi = (stay = {}) => Math.max(parseNumber(stay?.tienGoi ?? 0), 0);

const getStayRevenue = (stay = {}) => {
  const tienGoi = getStayTienGoi(stay);
  const tienDichVu = Math.max(parseNumber(stay?.tienDichVu ?? 0), 0);
  return tienGoi + tienDichVu;
};

const isCheckedOutStay = (stay = {}) =>
  String(stay?.trangThaiPhien || "").trim().toUpperCase() === STAY_CHECKED_OUT;

const filterCheckedOutStaysInPeriod = (stays = [], startIso, endIso) =>
  stays.filter((stay) => {
    if (!isCheckedOutStay(stay)) return false;
    const iso = getStayCheckoutIso(stay);
    if (!iso) return false;
    return iso >= startIso && iso <= endIso;
  });

const filterStaysMissingCtBan = (stays = [], ctBanPhieuSet) =>
  stays.filter((stay) => {
    if (!isCheckedOutStay(stay)) return false;
    const maPhien = String(stay?.maPhien || "").trim();
    if (!maPhien || ctBanPhieuSet.has(maPhien)) return false;
    return true;
  });

const getCtBanVisitKey = (raw = {}) => getCustomerVisitKey(raw);
const buildCustomerVisitEvents = (orders = [], ctBanRows = [], checkedOutStays = []) => {
  const events = [];
  const seenPhieu = new Set();

  ctBanRows.forEach((row) => {
    const maPhieu = String(row?.maPhieu || "").trim();
    const key = getCtBanVisitKey(row);
    const iso = toIsoDate(row?.ngayThuTien);
    if (!maPhieu || !key || !iso) return;
    if (seenPhieu.has(maPhieu)) return;
    seenPhieu.add(maPhieu);
    events.push({
      key,
      iso,
      ms: new Date(`${iso}T12:00:00`).getTime(),
      maPhieu,
      source: "ctban",
    });
  });

  checkedOutStays.forEach((stay) => {
    const maPhieu = String(stay?.maPhien || "").trim();
    const key = getCustomerVisitKey(stay);
    const iso = getStayCheckoutIso(stay);
    if (!maPhieu || !key || !iso) return;
    if (seenPhieu.has(maPhieu)) return;
    seenPhieu.add(maPhieu);
    events.push({
      key,
      iso,
      ms: new Date(`${iso}T12:00:00`).getTime(),
      maPhieu,
      source: "stay",
    });
  });

  orders.forEach((order) => {
    const maPhieu = String(order?.maPhieu || "").trim();
    if (maPhieu && seenPhieu.has(maPhieu)) return;
    const key = getCustomerVisitKey(order);
    const iso = normalizeOrderIso(order);
    const ms = getOrderTimeMs(order);
    if (!key || !iso || !ms) return;
    events.push({
      key,
      iso,
      ms,
      maPhieu,
      source: "order",
    });
  });

  return events.sort((a, b) => a.ms - b.ms);
};
const countUniqueCustomersOnDay = (iso, visitEvents = []) => {
  const keys = new Set();
  visitEvents.forEach((event) => {
    if (event.iso !== iso || !event.key) return;
    keys.add(event.key);
  });
  return keys.size;
};
const getOrderTimeMs = (order) => {
  const iso = toIsoDate(order?.ngayBan);
  if (iso) {
    const fromIso = new Date(`${iso}T00:00:00`).getTime();
    if (Number.isFinite(fromIso)) return fromIso;
  }
  return 0;
};

const normalizeOrderIso = (order) => {
  return toIsoDate(order?.ngayBan);
};

const SPA_PHIEU_PREFIXES = ["LT", "BK", "TTK"];

const normalizePhieuCode = (value) => String(value || "").trim().toUpperCase();

const isSpaPhieu = (maPhieu) => {
  const code = normalizePhieuCode(maPhieu);
  if (!code) return false;
  return SPA_PHIEU_PREFIXES.some((prefix) => code.startsWith(prefix));
};

/** DON_HANG chỉ dùng cho bán lẻ quầy (DH*). Phiên spa (LT*) không đọc từ đây. */
const isRetailOrder = (order) => {
  const maPhieu = normalizePhieuCode(order?.maPhieu);
  if (!maPhieu || isSpaPhieu(maPhieu)) return false;
  return maPhieu.startsWith("DH");
};

const buildCtBanPhieuSet = (rows = []) => {
  const set = new Set();
  rows.forEach((row) => {
    const maPhieu = String(row?.maPhieu || "").trim();
    if (maPhieu) set.add(maPhieu);
  });
  return set;
};

const filterRetailOrders = (orders, ctBanPhieuSet) =>
  orders.filter((order) => {
    if (!isRetailOrder(order)) return false;
    const maPhieu = String(order?.maPhieu || "").trim();
    if (maPhieu && ctBanPhieuSet.has(maPhieu)) return false;
    return true;
  });

const filterRetailOrdersInPeriod = (orders, ctBanPhieuSet, startIso, endIso) =>
  filterRetailOrders(orders, ctBanPhieuSet).filter((order) => {
    const iso = normalizeOrderIso(order);
    if (!iso) return false;
    return iso >= startIso && iso <= endIso;
  });

const filterPeriodCtBan = (rows, startIso, endIso) => {
  const filtered = rows.filter((row) => {
    const iso = toIsoDate(row?.ngayThuTien);
    if (!iso) return false;
    return iso >= startIso && iso <= endIso;
  });
  return filtered;
};

const getCtBanRowRevenue = (row = {}) => parseNumber(row?.doanhThu);

const getCtBanRowProfit = (row = {}) => {
  if (row?.loiNhuan != null && String(row.loiNhuan).trim() !== "") {
    return parseNumber(row.loiNhuan);
  }
  const revenue = getCtBanRowRevenue(row);
  const unitCost = parseNumber(row?.giaVon);
  const qty = Math.max(parseNumber(row?.soLuong), 1);
  return revenue - unitCost * qty;
};

const sumCtBanRevenueOnIso = (rows, iso) =>
  rows.reduce((sum, row) => {
    if (toIsoDate(row?.ngayThuTien) !== iso) return sum;
    return sum + getCtBanRowRevenue(row);
  }, 0);

const sumCtBanRevenueOnMonth = (rows, monthPrefix) =>
  rows.reduce((sum, row) => {
    const iso = toIsoDate(row?.ngayThuTien);
    if (!iso || !iso.startsWith(monthPrefix)) return sum;
    return sum + getCtBanRowRevenue(row);
  }, 0);

const sumStayRevenueOnIso = (stays, iso) =>
  stays.reduce((sum, stay) => {
    if (getStayCheckoutIso(stay) !== iso) return sum;
    return sum + getStayRevenue(stay);
  }, 0);

const sumStayRevenueOnMonth = (stays, monthPrefix) =>
  stays.reduce((sum, stay) => {
    const iso = getStayCheckoutIso(stay);
    if (!iso || !iso.startsWith(monthPrefix)) return sum;
    return sum + getStayRevenue(stay);
  }, 0);

const calcRetailOrderCost = (order) =>
  (order?.products || []).reduce((itemSum, item) => {
    const qty = parseNumber(item?.soLuong);
    const cost = parseNumber(item?.giaVon);
    return itemSum + cost * qty;
  }, 0);

const calcRetailOrderProfit = (order) =>
  (order?.products || []).reduce((itemSum, item) => {
    const qty = parseNumber(item?.soLuong);
    const price = parseNumber(item?.donGiaBan);
    const cost = parseNumber(item?.giaVon);
    return itemSum + (price - cost) * qty;
  }, 0);

const classifyTopItem = (name) => {
  const key = foldText(name);
  if (key.includes("the")) return "CARD";
  if (key.includes("goi") || key.includes("lieu trinh") || key.includes("combo")) {
    return "PACKAGE";
  }
  return "SERVICE";
};

const classifyCtBanItem = (row = {}) => {
  const nguonThu = String(row?.nguonThu || "").trim().toUpperCase();
  if (nguonThu === "GOI_DIEU_TRI") return "PACKAGE";
  if (nguonThu.includes("THE")) return "CARD";
  return "SERVICE";
};

const formatSummaryAmount = (amount) => {
  const num = Number(amount || 0);
  const abs = Math.abs(num);
  if (abs >= 1_000_000) {
    return `${(num / 1_000_000).toLocaleString("vi-VN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} triệu`;
  }
  return `${fmt(num)} đ`;
};

function Segment({ value, options, onChange }) {
  const getGridClass = () => {
    if (options.length >= 4) return "grid grid-cols-2 sm:grid-cols-4";
    if (options.length === 3) return "grid grid-cols-3";
    if (options.length === 2) return "grid grid-cols-2";
    return "flex flex-wrap";
  };

  return (
    <div className="w-full">
      <div className={`${getGridClass()} rounded-full border border-slate-200 bg-slate-100 p-1 gap-1`}>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold transition md:px-4 ${
              value === opt.value
                ? "bg-rose-600 text-white"
                : "text-slate-600 hover:bg-white hover:text-slate-900"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SimpleBars({
  rows,
  colorClass = "bg-rose-600",
  emptyText = "Chưa có dữ liệu",
  showAllLabels = false,
  showValueLabels = false,
}) {
  const maxValue = Math.max(...rows.map((x) => Number(x.value || 0)), 0);
  const denseMode = !showAllLabels && rows.length >= 8;
  const fmtBar = (n) => {
    const val = Number(n || 0);
    const abs = Math.abs(val);
    if (abs >= 1_000_000) return `${(val / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}tr`;
    if (abs >= 1_000) return `${Math.round(val / 1_000)}k`;
    return fmt(val);
  };
  if (!rows.length || maxValue <= 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
        {emptyText}
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 md:p-4">
      <div
        className="grid h-44 items-end gap-1.5 sm:h-48 sm:gap-2"
        style={{ gridTemplateColumns: `repeat(${Math.max(rows.length, 1)}, minmax(0, 1fr))` }}
      >
        {rows.map((row, idx) => {
          const heightPct = Math.max(6, Math.round((Number(row.value || 0) / maxValue) * 100));
          const xLabelStep = denseMode ? Math.ceil(rows.length / 6) : 1;
          const showXLabel =
            showAllLabels || !denseMode || idx % xLabelStep === 0 || idx === rows.length - 1;
          const shouldShowValue = showValueLabels;
          return (
            <div
              key={row.label}
              className="min-w-0 flex flex-col items-center gap-2"
            >
              <div className="h-4 text-[11px] font-semibold text-slate-500">
                {shouldShowValue ? fmtBar(row.value) : ""}
              </div>
              <div className="flex h-36 w-full items-end">
                <div className={`w-full rounded-t-md ${colorClass}`} style={{ height: `${heightPct}%` }} />
              </div>
              <div
                className={`h-5 w-full text-center text-xs text-slate-500 ${
                  denseMode ? "text-[11px]" : "text-xs"
                } ${showAllLabels ? "whitespace-nowrap" : "truncate"}`}
              >
                {showXLabel ? row.label : ""}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const hasStatsBootstrap = () =>
  hasCachedResponse(CACHE_KEYS.orderHistory) ||
  hasCachedResponse(CACHE_KEYS.receiptHistory) ||
  hasCachedResponse(CACHE_KEYS.ctBanHistory) ||
  hasCachedResponse(CACHE_KEYS.stayHistory);

export default function StatsPage() {
  const [loading, setLoading] = useState(() => !hasStatsBootstrap());
  const [orders, setOrders] = useState(() => readCachedList(CACHE_KEYS.orderHistory));
  const [receiptRows, setReceiptRows] = useState(() => readCachedList(CACHE_KEYS.receiptHistory));
  const [ctBanRows, setCtBanRows] = useState(() => readCachedList(CACHE_KEYS.ctBanHistory));
  const [stayRows, setStayRows] = useState(() => readCachedList(CACHE_KEYS.stayHistory));
  const [period, setPeriod] = useState("last7");
  const [topTab, setTopTab] = useState("SERVICE");
  const [refreshing, setRefreshing] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 1024 : window.innerWidth,
  );
  const lastRefreshTimeRef = useRef(0);
  const isMobile = viewportWidth < 768;
  const isDesktopWide = viewportWidth >= 1280;
  const periodOptions = useMemo(
    () => [
      { value: "last7", label: "7 ngày qua" },
      { value: "last12Months", label: isMobile ? "6 tháng qua" : "12 tháng qua" },
      { value: "thisMonth", label: "Tháng này" },
      { value: "thisYear", label: "Năm nay" },
    ],
    [isMobile],
  );

  const loadDashboardData = async ({ silent = false, force = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const now = Date.now();
      if (force) {
        setManualRefreshAt(CACHE_KEYS.orderHistory, now);
        setManualRefreshAt(CACHE_KEYS.receiptHistory, now);
        setManualRefreshAt(CACHE_KEYS.ctBanHistory, now);
        setManualRefreshAt(CACHE_KEYS.stayHistory, now);
      }
      const [orderRes, receiptRes, ctBanRes, stayRes] = await Promise.all([
        getOrderHistory({ force }),
        getReceiptHistory({ force }),
        getCtBanHistory({ force }),
        getStayHistory({ trangThai: STAY_CHECKED_OUT, force }),
      ]);
      console.log("[Stats] getCtBanHistory response:", ctBanRes);
      if (orderRes?.success && Array.isArray(orderRes.data)) setOrders(orderRes.data);
      if (receiptRes?.success && Array.isArray(receiptRes.data)) setReceiptRows(receiptRes.data);
      if (ctBanRes?.success && Array.isArray(ctBanRes.data)) {
        console.log("[Stats] ctBanRows before set:", ctBanRes.data.length, "rows");
        setCtBanRows(ctBanRes.data);
      }
      if (stayRes?.success && Array.isArray(stayRes.data)) setStayRows(stayRes.data);
    } catch (error) {
      toast.error("Không tải được dữ liệu tổng quan");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleRefresh = useCallback(async () => {
    const now = Date.now();
    if (now - lastRefreshTimeRef.current < 2000) {
      toast.error("Vui lòng chờ lần tải trước hoàn thành");
      return;
    }
    lastRefreshTimeRef.current = now;
    setRefreshing(true);
    const startTime = Date.now();
    try {
      // Sử dụng loadDashboardData với force: true
      await loadDashboardData({ force: true, silent: false });
      toast.success(`Đã tải xong trong ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    } catch (error) {
      toast.error("Lỗi tải dữ liệu");
    } finally {
      setRefreshing(false);
    }
  }, [loadDashboardData]);

  useEffect(() => {
    void loadDashboardData({ silent: hasStatsBootstrap() });
  }, []);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth || 1024);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const applyDashboardFromCache = useCallback(() => {
    const orderData = readCache(CACHE_KEYS.orderHistory)?.response?.data;
    const receiptData = readCache(CACHE_KEYS.receiptHistory)?.response?.data;
    const ctBanData = readCache(CACHE_KEYS.ctBanHistory)?.response?.data;
    const stayData = readCache(CACHE_KEYS.stayHistory)?.response?.data;
    if (Array.isArray(orderData)) setOrders(orderData);
    if (Array.isArray(receiptData)) setReceiptRows(receiptData);
    if (Array.isArray(ctBanData)) setCtBanRows(ctBanData);
    if (Array.isArray(stayData)) setStayRows(stayData);
  }, []);

  useCacheSync({
    cacheKeys: [
      CACHE_KEYS.orderHistory,
      CACHE_KEYS.receiptHistory,
      CACHE_KEYS.ctBanHistory,
      CACHE_KEYS.stayHistory,
    ],
    onCacheUpdated: (detail, cacheKey) => {
      const data = detail?.response?.data;
      if (!Array.isArray(data)) return;
      if (cacheKey === CACHE_KEYS.orderHistory) setOrders(data);
      if (cacheKey === CACHE_KEYS.receiptHistory) setReceiptRows(data);
      if (cacheKey === CACHE_KEYS.ctBanHistory) setCtBanRows(data);
      if (cacheKey === CACHE_KEYS.stayHistory) setStayRows(data);
    },
    onCacheInvalidated: (keys) => {
      const shouldReload =
        keys.includes(CACHE_KEYS.orderHistory) ||
        keys.includes(CACHE_KEYS.receiptHistory) ||
        keys.includes(CACHE_KEYS.ctBanHistory) ||
        keys.includes(CACHE_KEYS.stayHistory);
      if (!shouldReload) return;
      // Rule 17: Chỉ đọc từ cache và update state, KHÔNG gọi API
      applyDashboardFromCache();
    },
  });

  const summary = useMemo(() => {
    const { start, end } = getPeriodRange(period);
    const startIso = toLocalDate(start);
    const endIso = toLocalDate(end);
    console.log("[Stats] summary useMemo:", { period, startIso, endIso, ctBanRowsCount: ctBanRows.length });

    const periodCtBan = filterPeriodCtBan(ctBanRows, startIso, endIso);
    console.log("[Stats] periodCtBan after filter:", periodCtBan.length, "from", ctBanRows.length);
    const ctBanPhieuSet = buildCtBanPhieuSet(ctBanRows);
    const checkedOutStaysAll = stayRows.filter(isCheckedOutStay);
    // Lấy tất cả stays (không filter trạng thái) cho việc đếm khách cũ quay lại
    const allStaysForVisitTracking = stayRows;
    const periodStaysMissingCtBan = filterStaysMissingCtBan(
      filterCheckedOutStaysInPeriod(checkedOutStaysAll, startIso, endIso),
      ctBanPhieuSet,
    );
    const periodRetailOrders = filterRetailOrdersInPeriod(
      orders,
      ctBanPhieuSet,
      startIso,
      endIso,
    );

    const retailOrdersAll = filterRetailOrders(orders, ctBanPhieuSet);
    const allVisitEvents = buildCustomerVisitEvents(
      retailOrdersAll,
      ctBanRows,
      allStaysForVisitTracking, // Sử dụng tất cả stays thay vì chỉ checkedOut
    );
    const firstVisitByCustomer = new Map();
    allVisitEvents.forEach((event) => {
      if (!event.key || firstVisitByCustomer.has(event.key)) return;
      firstVisitByCustomer.set(event.key, event.ms);
    });

    const periodVisitEvents = allVisitEvents.filter(
      (event) => event.iso >= startIso && event.iso <= endIso,
    );
    const periodStartMs = new Date(`${startIso}T00:00:00`).getTime();
    const newCustomersInPeriod = new Set();
    const returningCustomersInPeriod = new Set();
    const countedPeriodVisits = new Set();
    periodVisitEvents.forEach((event) => {
      const visitKey = event.maPhieu || `${event.iso}::${event.key}`;
      if (countedPeriodVisits.has(visitKey) || !event.key) return;
      countedPeriodVisits.add(visitKey);
      const firstVisitMs = Number(firstVisitByCustomer.get(event.key) || 0);
      if (!firstVisitMs) return;
      if (firstVisitMs >= periodStartMs) {
        newCustomersInPeriod.add(event.key);
      } else {
        returningCustomersInPeriod.add(event.key);
      }
    });
    const newCustomerCount = newCustomersInPeriod.size;
    const returningCustomerCount = returningCustomersInPeriod.size;

    const ctBanRevenue = periodCtBan.reduce((sum, row) => sum + getCtBanRowRevenue(row), 0);
    const ctBanProfit = periodCtBan.reduce((sum, row) => sum + getCtBanRowProfit(row), 0);
    const stayFallbackRevenue = periodStaysMissingCtBan.reduce(
      (sum, stay) => sum + getStayRevenue(stay),
      0,
    );
    const spaRevenue = ctBanRevenue + stayFallbackRevenue;
    const ctBanCost = ctBanRevenue - ctBanProfit;
    const spaCost = ctBanCost;
    const spaProfit = ctBanProfit + stayFallbackRevenue;

    const retailRevenue = periodRetailOrders.reduce(
      (sum, order) => sum + parseNumber(order?.tongHoaDon),
      0,
    );
    const retailCost = periodRetailOrders.reduce(
      (sum, order) => sum + calcRetailOrderCost(order),
      0,
    );
    const retailProfit = periodRetailOrders.reduce(
      (sum, order) => sum + calcRetailOrderProfit(order),
      0,
    );

    const netRevenue = spaRevenue + retailRevenue;
    const grossCost = spaCost + retailCost;
    const grossProfit = spaProfit + retailProfit;
    const totalCollected = netRevenue;

    const periodReceipts = receiptRows.filter((row) => {
      const iso = toIsoDate(row?.ngayNhap);
      if (!iso) return false;
      return iso >= startIso && iso <= endIso;
    });

    const receiptTotalByCode = {};
    periodReceipts.forEach((row) => {
      const maPhieu = String(row?.maPhieu || "").trim();
      if (!maPhieu) return;
      const amount = Math.max(
        parseNumber(row?.tongTienPhieu),
        parseNumber(row?.thanhTien),
      );
      receiptTotalByCode[maPhieu] = Math.max(
        parseNumber(receiptTotalByCode[maPhieu]),
        amount,
      );
    });
    const totalExpense = Object.values(receiptTotalByCode).reduce(
      (sum, amount) => sum + parseNumber(amount),
      0,
    );

    const thuChi = totalCollected - totalExpense;

    let dateRows = [];
    if (period === "last12Months" || period === "thisYear") {
      const months = [];
      const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
      const lastMonth = new Date(end.getFullYear(), end.getMonth(), 1);
      while (cursor <= lastMonth) {
        const monthIso = toLocalDate(cursor);
        const monthPrefix = monthIso.slice(0, 7);
        const monthOrders = periodRetailOrders.filter((order) => {
          const iso = normalizeOrderIso(order);
          return iso && iso.startsWith(monthPrefix);
        });
        const monthVisitKeys = new Set();
        allVisitEvents.forEach((event) => {
          if (!event.iso?.startsWith(monthPrefix) || !event.key) return;
          monthVisitKeys.add(event.key);
        });
        const monthCtBanRevenue = sumCtBanRevenueOnMonth(periodCtBan, monthPrefix);
        const monthStayRevenue = sumStayRevenueOnMonth(periodStaysMissingCtBan, monthPrefix);
        const monthRetailRevenue = monthOrders.reduce(
          (sum, order) => sum + parseNumber(order?.tongHoaDon),
          0,
        );
        months.push({
          iso: monthIso,
          label: getMonthLabel(monthIso),
          customerVisits: monthVisitKeys.size,
          revenue: monthCtBanRevenue + monthStayRevenue + monthRetailRevenue,
        });
        cursor.setMonth(cursor.getMonth() + 1);
      }
      dateRows = months;
    } else {
      for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
        const iso = toLocalDate(cursor);
        const dayOrders = periodRetailOrders.filter((order) => normalizeOrderIso(order) === iso);
        const customerVisits = countUniqueCustomersOnDay(iso, allVisitEvents);
        const dayCtBanRevenue = sumCtBanRevenueOnIso(periodCtBan, iso);
        const dayStayRevenue = sumStayRevenueOnIso(periodStaysMissingCtBan, iso);
        const dayRetailRevenue = dayOrders.reduce(
          (sum, order) => sum + parseNumber(order?.tongHoaDon),
          0,
        );
        const dayRevenue = dayCtBanRevenue + dayStayRevenue + dayRetailRevenue;
        dateRows.push({
          iso,
          label: getDayLabel(iso),
          customerVisits,
          revenue: dayRevenue,
        });
      }
      if (period === "thisMonth" && isMobile) {
        // Mobile: gom theo tuan de de doc, van giu ro ngay bat dau-ket thuc.
        dateRows = bucketizeThisMonthByWeek(dateRows);
      }
    }

    const topMap = {};
    const addTopItem = (type, name, qty, revenue, donVi = "") => {
      if (!name) return;
      const key = `${type}||${name}`;
      if (!topMap[key]) {
        topMap[key] = { type, name, revenue: 0, qty: 0, donVi };
      }
      topMap[key].qty += parseNumber(qty);
      topMap[key].revenue += parseNumber(revenue);
    };

    periodRetailOrders.forEach((order) => {
      (order?.products || []).forEach((item) => {
        const name = String(item?.tenSanPham || "").trim();
        if (!name) return;
        const type = classifyTopItem(name);
        const qty = parseNumber(item?.soLuong);
        const revenue = qty * parseNumber(item?.donGiaBan);
        addTopItem(type, name, qty, revenue, item?.donVi || "");
      });
    });

    periodCtBan.forEach((row) => {
      const type = classifyCtBanItem(row);
      const name =
        type === "PACKAGE"
          ? String(row?.tenGoi || row?.tenSanPham || "").trim()
          : String(row?.tenSanPham || row?.tenGoi || "").trim();
      const qty = parseNumber(row?.soLuong) || 1;
      const revenue = getCtBanRowRevenue(row);
      if (revenue <= 0) return;
      addTopItem(type, name, qty, revenue, type === "PACKAGE" ? "gói" : "");
    });

    periodStaysMissingCtBan.forEach((stay) => {
      const tienGoi = getStayTienGoi(stay);
      const packageName = String(stay?.tenGoi || stay?.tenDichVu || "").trim();
      if (tienGoi > 0 && packageName) {
        addTopItem("PACKAGE", packageName, 1, tienGoi, "gói");
      }
      (stay?.serviceItems || []).forEach((item) => {
        const name = String(item?.tenSanPham || "").trim();
        const revenue = parseNumber(item?.thanhTien);
        if (!name || revenue <= 0) return;
        addTopItem("SERVICE", name, parseNumber(item?.soLuong) || 1, revenue, item?.donVi || "");
      });
    });

    const topRows = Object.values(topMap)
      .filter((row) => row.type === topTab)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    if (period === "last12Months" && isMobile && dateRows.length > 6) {
      // Mobile chi hien thi 6 thang gan nhat.
      dateRows = dateRows.slice(-6);
    }

    const shouldKeepAllMonthLabels =
      isDesktopWide && (period === "last12Months" || period === "thisYear");
    const maxBars = getMaxBarsForWidth(viewportWidth);
    const compactRows = shouldKeepAllMonthLabels
      ? dateRows
      : bucketizeForViewport(dateRows, maxBars, period);

    return {
      startIso,
      endIso,
      netRevenue,
      grossCost,
      grossProfit,
      totalCollected,
      totalExpense,
      thuChi,
      newCustomerCount,
      returningCustomerCount,
      customerSeries: compactRows.map((x) => ({ label: x.label, value: x.customerVisits })),
      revenueSeries: compactRows.map((x) => ({ label: x.label, value: x.revenue })),
      topRows,
    };
  }, [orders, receiptRows, ctBanRows, stayRows, period, topTab, viewportWidth, isDesktopWide, isMobile]);

  const blockDashboard = shouldBlockPanelUI(
    loading || refreshing,
    orders.length > 0 ||
      receiptRows.length > 0 ||
      ctBanRows.length > 0 ||
      stayRows.length > 0,
  );

  return (
    <main className="app-page bg-gradient-to-br from-slate-50 via-rose-50/30 to-rose-100/30 pb-28">
      <div className="app-shell">
        <div className="mb-4 md:mb-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h1 className="text-3xl font-black text-slate-900">Tổng quan</h1>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 shadow-sm hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {refreshing ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-rose-700/80 border-r-transparent" />
              ) : null}
              {refreshing ? "Đang tải..." : "Tải lại"}
            </button>
          </div>
        </div>

        <div className="mb-4 md:mb-5">
          <Segment value={period} options={periodOptions} onChange={setPeriod} />
        </div>

        {blockDashboard ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">
            Đang tải dữ liệu tổng quan...
          </div>
        ) : (
          <>
            <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 md:mb-5">
              <div className="rounded-2xl border border-rose-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Doanh thu thuần</p>
                <p className="mt-2 text-xl font-black text-rose-700 sm:text-2xl">
                  {formatSummaryAmount(summary.netRevenue)}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Vốn</p>
                <p className="mt-2 text-xl font-black text-slate-900 sm:text-2xl">
                  {formatSummaryAmount(summary.grossCost)}
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lãi</p>
                <p className="mt-2 text-xl font-black text-emerald-600 sm:text-2xl">
                  {formatSummaryAmount(summary.grossProfit)}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Khách mới</p>
                <p className="mt-2 text-xl font-black text-slate-900 sm:text-2xl">{summary.newCustomerCount} khách</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Khách cũ quay lại</p>
                <p className="mt-2 text-xl font-black text-slate-900 sm:text-2xl">{summary.returningCustomerCount} khách</p>
              </div>
            </div>

            <div className="mb-4 grid gap-4 2xl:grid-cols-2 md:mb-5">
              <div>
                <h2 className="mb-2 text-lg font-bold text-slate-800">Lượng khách</h2>
                <SimpleBars
                  rows={summary.customerSeries}
                  colorClass="bg-rose-600"
                  emptyText="Chưa có dữ liệu khách."
                  showAllLabels={isDesktopWide && (period === "last12Months" || period === "thisYear")}
                  showValueLabels={isMobile}
                />
              </div>
              <div>
                <h2 className="mb-2 text-lg font-bold text-slate-800">Doanh thu thuần</h2>
                <SimpleBars
                  rows={summary.revenueSeries}
                  colorClass="bg-emerald-600"
                  emptyText="Chưa có dữ liệu doanh thu."
                  showAllLabels={isDesktopWide && (period === "last12Months" || period === "thisYear")}
                  showValueLabels
                />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-slate-800">Top bán nhiều</h2>
                <Segment value={topTab} options={TOP_TAB_OPTIONS} onChange={setTopTab} />
              </div>
              {summary.topRows.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  Chưa có dữ liệu phù hợp cho nhóm đang chọn.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {summary.topRows.map((row, index) => (
                    <div key={`${row.type}-${row.name}`} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-800">
                          {index + 1}. {row.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {fmt(row.qty)} {String(row.donVi || "").toLowerCase()}
                        </p>
                      </div>
                      <p className="shrink-0 text-base font-bold text-slate-900">{fmt(row.revenue)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

