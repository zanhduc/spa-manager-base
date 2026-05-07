/**
 * Core business logic used by local mock adapter.
 */

/**
 * Build rows for DON_HANG sheet.
 * Columns:
 * A STT
 * B NGAY BAN
 * C MA PHIEU
 * D TEN SAN PHAM
 * E DON VI
 * F SO LUONG
 * G GIA VON
 * H DON GIA BAN
 * I THANH TIEN
 * J TONG HOA DON
 * K GHI CHU
 * L TRANG THAI
 */
export function buildOrderRows(orderData) {
  const { orderInfo, products } = orderData;

  const tongHoaDon = products.reduce(
    (sum, p) => sum + (p.soLuong || 0) * (p.donGiaBan || 0),
    0,
  );

  const ngayBan = formatDate(orderInfo.ngayBan);

  return products.map((p, i) => {
    const thanhTien = (p.soLuong || 0) * (p.donGiaBan || 0);
    return [
      "",
      ngayBan,
      orderInfo.maPhieu || "",
      p.tenSanPham || "",
      p.donVi || "",
      p.soLuong || 0,
      p.giaVon || 0,
      p.donGiaBan || 0,
      thanhTien,
      i === 0 ? tongHoaDon : "",
      i === 0 ? orderInfo.ghiChu || "-" : "-",
      orderInfo.trangThai || "Đã thanh toán",
    ];
  });
}

/**
 * Build one row for KHACH sheet.
 * Columns:
 * A STT | B TEN KHACH | C NGAY BAN | D SO DIEN THOAI |
 * E MA PHIEU | F TIEN NO | G TRANG THAI | H GHI CHU
 */
export function buildCustomerRow(orderData) {
  const { orderInfo, products, customer } = orderData;

  const tongHoaDon = products.reduce(
    (sum, p) => sum + (p.soLuong || 0) * (p.donGiaBan || 0),
    0,
  );

  const soTienDaTra = Number(orderInfo.soTienDaTra || 0);
  let tienNo = tongHoaDon;
  if (orderInfo.trangThai === "Đã thanh toán") tienNo = 0;
  if (orderInfo.trangThai === "Trả một phần") {
    tienNo = Math.max(tongHoaDon - Math.max(soTienDaTra, 0), 0);
  }

  const ngayBan = formatDate(orderInfo.ngayBan);

  return [
    "",
    customer?.tenKhach || "",
    ngayBan,
    customer?.soDienThoai || "",
    orderInfo.maPhieu || "",
    tienNo,
    orderInfo.trangThai || "Đã thanh toán",
    orderInfo.ghiChu || "-",
  ];
}

export function formatDate(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// --- Utils & Formatters ---

export const formatMoney = (n) => Number(n || 0).toLocaleString("vi-VN");

export const parseNumber = (v) => Number(String(v ?? "").replace(/[^\d.-]/g, "")) || 0;

export const normalizeText = (v) =>
  String(v || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");

export const toTitleCase = (v) =>
  String(v || "")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => {
      if (!word) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");

export const moneyMeaning = (value) => {
  const n = parseNumber(value);
  if (!n) return "0 đồng";
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} triệu`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} nghìn`;
  }
  return `${n.toLocaleString("vi-VN")} đồng`;
};

// --- Date Helpers ---

export const pad2 = (n) => String(n).padStart(2, "0");

export const toIsoDate = (v) => {
  const raw = String(v || "").trim();
  if (!raw) return "";
  const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return "";
};

export const toLocalIso = (date) => {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}-${m}-${d}`;
};

export const formatShortDate = (date) => {
  const d = pad2(date.getDate());
  const m = pad2(date.getMonth() + 1);
  return `${d}/${m}`;
};

export const startOfWeek = (date) => {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d;
};

export const getTodayInputDate = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().split("T")[0];
};

export const parseFlexibleDateParts = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;

  let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m)
    return { d: Number(m[3]), m: Number(m[2]), y: Number(m[1]), hasYear: true };

  m = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    const yRaw = m[3];
    if (!yRaw) return { d, m: mo, y: null, hasYear: false };
    const y = yRaw.length === 2 ? Number(`20${yRaw}`) : Number(yRaw);
    return { d, m: mo, y, hasYear: true };
  }

  const digits = raw.replace(/\D/g, "");
  if (/^\d+$/.test(raw)) {
    if (digits.length === 8) {
      if (Number(digits.slice(0, 4)) >= 1900) {
        return {
          d: Number(digits.slice(6, 8)),
          m: Number(digits.slice(4, 6)),
          y: Number(digits.slice(0, 4)),
          hasYear: true,
        };
      }
      return {
        d: Number(digits.slice(0, 2)),
        m: Number(digits.slice(2, 4)),
        y: Number(digits.slice(4, 8)),
        hasYear: true,
      };
    }
    if (digits.length === 6) {
      return {
        d: Number(digits.slice(0, 2)),
        m: Number(digits.slice(2, 4)),
        y: Number(`20${digits.slice(4, 6)}`),
        hasYear: true,
      };
    }
    if (digits.length === 4) {
      return {
        d: Number(digits.slice(0, 2)),
        m: Number(digits.slice(2, 4)),
        y: null,
        hasYear: false,
      };
    }
  }

  return null;
};

export const isValidCalendarDate = (parts) => {
  if (!parts) return false;
  const d = Number(parts.d);
  const m = Number(parts.m);
  if (!d || !m || m < 1 || m > 12 || d < 1 || d > 31) return false;
  if (!parts.hasYear || !parts.y) return true;
  const dt = new Date(parts.y, m - 1, d);
  return (
    dt.getFullYear() === parts.y &&
    dt.getMonth() === m - 1 &&
    dt.getDate() === d
  );
};

export const buildDateTokens = (parts) => {
  if (!parts || !isValidCalendarDate(parts)) return new Set();
  const d = pad2(parts.d);
  const m = pad2(parts.m);
  const tokens = new Set([`${d}/${m}`, `${d}-${m}`, `${d}${m}`]);
  if (!parts.hasYear || !parts.y) return tokens;
  const y = String(parts.y);
  const yy = y.slice(-2);
  tokens.add(`${d}/${m}/${y}`);
  tokens.add(`${d}-${m}-${y}`);
  tokens.add(`${d}/${m}/${yy}`);
  tokens.add(`${d}-${m}-${yy}`);
  tokens.add(`${y}-${m}-${d}`);
  tokens.add(`${y}${m}${d}`);
  tokens.add(`${d}${m}${y}`);
  tokens.add(`${d}${m}${yy}`);
  return tokens;
};

export const getDateSearchMeta = (queryValue) => {
  const raw = String(queryValue || "").trim();
  const looksLikeDate = /[\/\-.]/.test(raw) || /^\d{4,8}$/.test(raw);
  if (!raw || !looksLikeDate) {
    return { isDateQuery: false, isValid: true, tokens: new Set() };
  }
  const parts = parseFlexibleDateParts(raw);
  const valid = isValidCalendarDate(parts);
  return {
    isDateQuery: true,
    isValid: valid,
    tokens: valid ? buildDateTokens(parts) : new Set(),
  };
};

export const hasDateTokenMatch = (orderDateValue, queryTokens) => {
  if (!queryTokens || !queryTokens.size) return true;
  const parts = parseFlexibleDateParts(orderDateValue);
  const tokens = buildDateTokens(parts);
  if (!tokens.size) return false;
  for (const token of queryTokens) {
    if (tokens.has(token)) return true;
  }
  return false;
};

// --- Business Logic ---

export const isGuestCustomer = (name) => normalizeText(name) === "khach ghe tham";

export const getStatusCode = (status) => {
  const key = normalizeText(status).replace(/\s+/g, " ");
  if (!key) return "PAID";
  if (key.includes("tra mot phan") || key.includes("tra 1 phan"))
    return "PARTIAL";
  if (key === "no" || key.includes(" no ")) return "DEBT";
  if (key.includes("da thanh toan")) return "PAID";
  if (key.includes("da huy")) return "CANCELLED";
  return "PAID";
};

export const calculateStats = ({
  sourceOrders,
  trendMode,
  trendWeekPreset,
  trendQuarter,
  trendYear,
  customFrom,
  customTo,
  isDesktop,
  topProductsPeriod = "all",
}) => {
  const revenue = sourceOrders.reduce(
    (sum, o) => sum + parseNumber(o.tongHoaDon),
    0,
  );
  const profit = sourceOrders.reduce((sum, o) => {
    const orderProfit = (o.products || []).reduce((acc, p) => {
      const qty = parseNumber(p.soLuong);
      const sell = parseNumber(p.donGiaBan);
      const cost = parseNumber(p.giaVon);
      return acc + (sell - cost) * qty;
    }, 0);
    return sum + orderProfit;
  }, 0);

  const statusCounts = { PAID: 0, PARTIAL: 0, DEBT: 0 };
  sourceOrders.forEach((o) => {
    statusCounts[getStatusCode(o.trangThai)] += 1;
  });

  const revenueByDate = {};
  const profitByDate = {};
  const revenueByMonth = {};
  const profitByMonth = {};
  const revenueByYear = {};
  const profitByYear = {};
  sourceOrders.forEach((o) => {
    const iso = toIsoDate(o.ngayBan);
    if (!iso) return;
    const orderTotal = parseNumber(o.tongHoaDon);
    const orderProfit = (o.products || []).reduce((acc, p) => {
      const qty = parseNumber(p.soLuong);
      const sell = parseNumber(p.donGiaBan);
      const cost = parseNumber(p.giaVon);
      return acc + (sell - cost) * qty;
    }, 0);
    const monthKey = iso.slice(0, 7);
    const yearKey = iso.slice(0, 4);
    revenueByDate[iso] = (revenueByDate[iso] || 0) + orderTotal;
    profitByDate[iso] = (profitByDate[iso] || 0) + orderProfit;
    revenueByMonth[monthKey] = (revenueByMonth[monthKey] || 0) + orderTotal;
    profitByMonth[monthKey] = (profitByMonth[monthKey] || 0) + orderProfit;
    revenueByYear[yearKey] = (revenueByYear[yearKey] || 0) + orderTotal;
    profitByYear[yearKey] = (profitByYear[yearKey] || 0) + orderProfit;
  });

  let periodLabels = [];
  let periodRevenue = [];
  let periodProfit = [];
  let periodRangeLabel = "";
  let currentStart, currentEnd;
  
  if (trendMode === "week") {
    const dayNames = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
    if (trendWeekPreset === "last7") {
      currentEnd = new Date();
      currentEnd.setHours(0, 0, 0, 0);
      currentStart = new Date(currentEnd);
      currentStart.setDate(currentStart.getDate() - 6);
      for (let i = 0; i < 7; i += 1) {
        const d = new Date(currentStart);
        d.setDate(currentStart.getDate() + i);
        const iso = toLocalIso(d);
        periodLabels.push(formatShortDate(d));
        periodRevenue.push(revenueByDate[iso] || 0);
        periodProfit.push(profitByDate[iso] || 0);
      }
      periodRangeLabel = `7 ngày qua · ${formatShortDate(currentStart)} - ${formatShortDate(currentEnd)}`;
    } else if (trendWeekPreset === "custom" || normalizeText(trendWeekPreset) === "tuy chon") {
      currentStart = new Date(customFrom + "T00:00:00");
      currentEnd = new Date(customTo + "T00:00:00");
      if (currentStart > currentEnd) {
        const tmp = currentStart;
        currentStart = currentEnd;
        currentEnd = tmp;
      }
      let diffDays = Math.round((currentEnd - currentStart) / 86400000);
      
      if (!isDesktop && diffDays > 6) {
        diffDays = 6;
        currentEnd = new Date(currentStart);
        currentEnd.setDate(currentStart.getDate() + 6);
      }

      for (let i = 0; i <= diffDays; i += 1) {
        const d = new Date(currentStart);
        d.setDate(currentStart.getDate() + i);
        const iso = toLocalIso(d);
        periodLabels.push(formatShortDate(d));
        periodRevenue.push(revenueByDate[iso] || 0);
        periodProfit.push(profitByDate[iso] || 0);
      }
      periodRangeLabel = `${formatShortDate(currentStart)} - ${formatShortDate(currentEnd)}`;
    } else {
      const weekStartBase = startOfWeek(new Date());
      const targetWeekStart = new Date(weekStartBase);
      targetWeekStart.setDate(targetWeekStart.getDate() - 7);
      currentStart = targetWeekStart;
      const targetWeekEnd = new Date(targetWeekStart);
      targetWeekEnd.setDate(targetWeekEnd.getDate() + 6);
      currentEnd = targetWeekEnd;
      for (let i = 0; i < 7; i += 1) {
        const d = new Date(targetWeekStart);
        d.setDate(targetWeekStart.getDate() + i);
        const iso = toLocalIso(d);
        const dayIdx = (d.getDay() + 6) % 7;
        periodLabels.push(dayNames[dayIdx]);
        periodRevenue.push(revenueByDate[iso] || 0);
        periodProfit.push(profitByDate[iso] || 0);
      }
      periodRangeLabel = `${formatShortDate(targetWeekStart)} - ${formatShortDate(targetWeekEnd)}`;
    }
  } else if (trendMode === "month") {
    const today = new Date();
    const numMonths = isDesktop ? 12 : 6;
    for (let i = numMonths - 1; i >= 0; i -= 1) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
      periodLabels.push(`T${d.getMonth() + 1}/${d.getFullYear() % 100}`);
      periodRevenue.push(revenueByMonth[key] || 0);
      periodProfit.push(profitByMonth[key] || 0);
    }
    const firstMonth = new Date(
      today.getFullYear(),
      today.getMonth() - (numMonths - 1),
      1,
    );
    const lastMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    currentStart = firstMonth;
    currentEnd = lastMonth;
    periodRangeLabel = `${numMonths} tháng gần nhất`;
  } else if (trendMode === "quarter") {
    if (isDesktop) {
      periodLabels = ["Quý 1", "Quý 2", "Quý 3", "Quý 4"];
      periodRevenue = [];
      periodProfit = [];
      for (let q = 1; q <= 4; q++) {
        const qMonths = [1, 2, 3].map((v) => v + (q - 1) * 3);
        let qRev = 0,
          qProf = 0;
        qMonths.forEach((m) => {
          qRev +=
            revenueByMonth[`${trendYear}-${pad2(m)}`] || 0;
          qProf +=
            profitByMonth[`${trendYear}-${pad2(m)}`] || 0;
        });
        periodRevenue.push(qRev);
        periodProfit.push(qProf);
      }
      currentStart = new Date(trendYear, 0, 1);
      currentEnd = new Date(trendYear, 11, 31);
      periodRangeLabel = `Năm ${trendYear}`;
    } else {
      const qMonths = [1, 2, 3].map((v) => v + (trendQuarter - 1) * 3);
      currentStart = new Date(trendYear, qMonths[0] - 1, 1);
      currentEnd = new Date(trendYear, qMonths[2], 0);
      periodLabels = qMonths.map((m) => `T${m}`);
      periodRevenue = qMonths.map(
        (m) =>
          revenueByMonth[`${trendYear}-${pad2(m)}`] || 0,
      );
      periodProfit = qMonths.map(
        (m) =>
          profitByMonth[`${trendYear}-${pad2(m)}`] || 0,
      );
      periodRangeLabel = `Quý ${trendQuarter} năm ${trendYear}`;
    }
  } else {
    const endYear = new Date().getFullYear();
    const startYear = endYear - 4;
    currentStart = new Date(endYear, 0, 1);
    currentEnd = new Date(endYear, 11, 31);
    periodLabels = Array.from({ length: 5 }, (_, i) => String(startYear + i));
    periodRevenue = periodLabels.map((y) => revenueByYear[y] || 0);
    periodProfit = periodLabels.map((y) => profitByYear[y] || 0);
    periodRangeLabel = `${startYear} - ${endYear}`;
  }

  let curRevenue = 0;
  let curProfit = 0;
  let curOrders = 0;

  let summaryStart, summaryEnd, summaryPrevStart, summaryPrevEnd;
  const today = new Date();

  if (trendMode === "week") {
    summaryStart = new Date(today);
    summaryEnd = new Date(today);
    summaryPrevStart = new Date(today);
    summaryPrevStart.setDate(today.getDate() - 1);
    summaryPrevEnd = summaryPrevStart;
  } else if (trendMode === "month" || trendMode === "quarter") {
    summaryStart = new Date(today.getFullYear(), today.getMonth(), 1);
    summaryEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    summaryPrevEnd = new Date(summaryStart.getTime() - 86400000);
    summaryPrevStart = new Date(
      summaryPrevEnd.getFullYear(),
      summaryPrevEnd.getMonth(),
      1,
    );
  } else {
    summaryStart = new Date(today.getFullYear(), 0, 1);
    summaryEnd = new Date(today.getFullYear(), 11, 31);
    summaryPrevStart = new Date(today.getFullYear() - 1, 0, 1);
    summaryPrevEnd = new Date(today.getFullYear() - 1, 11, 31);
  }

  if (summaryStart && summaryEnd) {
    const curStartIso = toLocalIso(summaryStart);
    const curEndIso = toLocalIso(summaryEnd);
    sourceOrders.forEach((o) => {
      const iso = toIsoDate(o.ngayBan);
      if (!iso) return;
      if (iso >= curStartIso && iso <= curEndIso) {
        curRevenue += parseNumber(o.tongHoaDon);
        curProfit += (o.products || []).reduce(
          (acc, p) =>
            acc + (parseNumber(p.donGiaBan) - parseNumber(p.giaVon)) * parseNumber(p.soLuong),
          0,
        );
        curOrders += 1;
      }
    });
  }

  let prevRevenue = 0,
    prevProfit = 0,
    prevOrders = 0;
  if (summaryPrevStart && summaryPrevEnd) {
    const prevStartIso = toLocalIso(summaryPrevStart);
    const prevEndIso = toLocalIso(summaryPrevEnd);
    sourceOrders.forEach((o) => {
      const iso = toIsoDate(o.ngayBan);
      if (!iso) return;
      if (iso >= prevStartIso && iso <= prevEndIso) {
        prevRevenue += parseNumber(o.tongHoaDon);
        prevProfit += (o.products || []).reduce(
          (acc, p) =>
            acc + (parseNumber(p.donGiaBan) - parseNumber(p.giaVon)) * parseNumber(p.soLuong),
          0,
        );
        prevOrders += 1;
      }
    });
  }

  const pctChange = (cur, prev) =>
    prev === 0
      ? cur > 0
        ? 100
        : 0
      : Math.round(((cur - prev) / Math.abs(prev)) * 100);
  const revenueDelta = pctChange(curRevenue, prevRevenue);
  const profitDelta = pctChange(curProfit, prevProfit);
  const ordersDelta = pctChange(curOrders, prevOrders);

  const productMap = {};
  
  const todayDate = new Date();
  let filterDate = null;
  if (topProductsPeriod === "week") {
    filterDate = new Date(todayDate);
    filterDate.setDate(todayDate.getDate() - 7);
  } else if (topProductsPeriod === "month") {
    filterDate = new Date(todayDate);
    filterDate.setMonth(todayDate.getMonth() - 1);
  } else if (topProductsPeriod === "year") {
    filterDate = new Date(todayDate);
    filterDate.setFullYear(todayDate.getFullYear() - 1);
  }

  const filterIso = filterDate ? toLocalIso(filterDate) : null;

  sourceOrders.forEach((o) => {
    const iso = toIsoDate(o.ngayBan);
    if (filterIso && iso && iso < filterIso) return;

    (o.products || []).forEach((p) => {
      const key = `${p.tenSanPham}||${p.donVi || ""}`;
      const qty = parseNumber(p.soLuong);
      const lineTotal = qty * parseNumber(p.donGiaBan);
      if (!productMap[key]) {
        productMap[key] = { value: 0, qty: 0 };
      }
      productMap[key].value += lineTotal;
      productMap[key].qty += qty;
    });
  });
  const topProducts = Object.entries(productMap)
    .map(([key, data]) => {
      const [tenSanPham, donVi] = key.split("||");
      return { tenSanPham, donVi, value: data.value, qty: data.qty };
    })
    .sort((a, b) => b.value - a.value);

  return {
    revenue,
    profit,
    statusCounts,
    periodLabels,
    periodRevenue,
    periodProfit,
    periodRangeLabel,
    topProducts,
    curRevenue,
    curProfit,
    curOrders,
    revenueDelta,
    profitDelta,
    ordersDelta,
  };
};
