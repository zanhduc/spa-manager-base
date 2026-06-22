/**
 * Core Date Utils module với VN Date Format (DD/MM/YYYY)
 *
 * Format quy tắc:
 * - Date: "DD/MM/YYYY" (ví dụ: "16/06/2026")
 * - DateTime: "HH:mm DD/MM/YYYY" (ví dụ: "14:30 16/06/2026")
 */

// ============================================================
// 1. pad2 - pad số thành 2 chữ số
// ============================================================
export const pad2 = (n) => String(n).padStart(2, "0");

// ============================================================
// 2. toUsDate - convert bất kỳ date input nào sang "DD/MM/YYYY" (VN date)
// ============================================================
export const toUsDate = (v) => {
  if (!v && v !== 0) return "";

  // Date object
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return "";
    return `${pad2(v.getMonth() + 1)}/${pad2(v.getDate())}/${v.getFullYear()}`;
  }

  const raw = String(v).trim();
  if (!raw) return "";

  // "YYYY-MM-DD" format (ISO)
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(raw)) {
    const [y, m, d] = raw.split("-");
    return `${pad2(m)}/${pad2(d)}/${y}`;
  }

  // "DD/MM/YYYY" or "DD-MM-YYYY" format (VN)
  const mDMY = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mDMY) {
    const [, d, m, y] = mDMY;
    return `${pad2(m)}/${pad2(d)}/${y}`;
  }

  // "MM/DD/YYYY" already
  const mMDY = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mMDY) {
    return `${pad2(mMDY[1])}/${pad2(mMDY[2])}${mMDY[3] ? `/${mMDY[3]}` : ""}`;
  }

  // Already US format with spaces
  const mUsDate = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mUsDate) {
    return `${pad2(mUsDate[1])}/${pad2(mUsDate[2])}/${mUsDate[3]}`;
  }

  return raw;
};

// ============================================================
// 3. toUsDateTime - convert bất kỳ date input nào sang "HH:mm DD/MM/YYYY" (VN format)
// Hỗ trợ: Date object, HH:mm DD/MM/YYYY, DD/MM/YYYY HH:mm, MM/DD/YYYY HH:mm, ISO...
// ============================================================
export const toUsDateTime = (v) => {
  if (!v && v !== 0) return "";

  // Date object
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return "";
    return `${pad2(v.getHours())}:${pad2(v.getMinutes())} ${pad2(v.getDate())}/${pad2(v.getMonth() + 1)}/${v.getFullYear()}`;
  }

  const raw = String(v).trim();
  if (!raw) return "";

  // Format 1: "HH:mm DD/MM/YYYY" (VN datetime) - đã đúng
  const m1 = raw.match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) {
    const h = m1[1].padStart(2, "0");
    const mi = m1[2];
    const d = m1[3].padStart(2, "0");
    const mo = m1[4].padStart(2, "0");
    const y = m1[5];
    return `${h}:${mi} ${d}/${mo}/${y}`;
  }

  // Format 2: "HH:mm MM/DD/YYYY" (US datetime) -> chuyển sang VN
  const m2 = raw.match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m2) {
    const h = m2[1].padStart(2, "0");
    const mi = m2[2];
    const mo = m2[3].padStart(2, "0"); // US: month
    const d = m2[4].padStart(2, "0");  // US: day
    const y = m2[5];
    return `${h}:${mi} ${d}/${mo}/${y}`;
  }

  // Format 3: "DD/MM/YYYY HH:mm" (VN datetime ngược) -> chuyển sang VN
  const m3 = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m3) {
    const d = m3[1].padStart(2, "0");
    const mo = m3[2].padStart(2, "0");
    const y = m3[3];
    const h = m3[4].padStart(2, "0");
    const mi = m3[5];
    return `${h}:${mi} ${d}/${mo}/${y}`;
  }

  // Format 4: "YYYY-MM-DD HH:mm" (ISO)
  const m4 = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (m4) {
    const y = m4[1];
    const mo = m4[2].padStart(2, "0");
    const d = m4[3].padStart(2, "0");
    const h = m4[4].padStart(2, "0");
    const mi = m4[5];
    return `${h}:${mi} ${d}/${mo}/${y}`;
  }

  // Format 5: "DD/MM/YYYY" (chỉ ngày)
  const m5 = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m5) {
    const d = m5[1].padStart(2, "0");
    const mo = m5[2].padStart(2, "0");
    const y = m5[3];
    return `00:00 ${d}/${mo}/${y}`;
  }

  // Format 6: "MM/DD/YYYY" (US date only)
  const m6 = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m6) {
    const mo = m6[1].padStart(2, "0");
    const d = m6[2].padStart(2, "0");
    const y = m6[3];
    return `00:00 ${d}/${mo}/${y}`;
  }

  // Fallback: try to parse as Date
  try {
    const dt = new Date(raw);
    if (!Number.isNaN(dt.getTime())) {
      return `${pad2(dt.getHours())}:${pad2(dt.getMinutes())} ${pad2(dt.getDate())}/${pad2(dt.getMonth() + 1)}/${dt.getFullYear()}`;
    }
  } catch (_) {}

  return raw;
};

// ============================================================
// 4. parseUsDate - parse "DD/MM/YYYY" thành {day, month, year} (VN date)
// ============================================================
export const parseUsDate = (raw) => {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  const m = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (!m) return null;

  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);

  // Validate month (1-12) and day (1-31)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return { day, month, year };
};

// ============================================================
// 5. parseUsDateTime - parse "HH:mm DD/MM/YYYY" thành {hour, minute, day, month, year} (VN)
// ============================================================
export const parseUsDateTime = (raw) => {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  
  // "HH:mm DD/MM/YYYY" (VN format)
  const m = trimmed.match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (!m) return null;

  const hour = Number(m[1]);
  const minute = Number(m[2]);
  const day = Number(m[3]);     // VN: day trước month
  const month = Number(m[4]);   // VN: month sau day
  const year = Number(m[5]);

  // Validate ranges
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return { hour, minute, day, month, year };
};

// ============================================================
// 6. compareDate - so sánh 2 date string US format
// ============================================================
export const compareDate = (a, b) => {
  const isoA = toIsoDate(a);
  const isoB = toIsoDate(b);

  if (!isoA && !isoB) return 0;
  if (!isoA) return -1;
  if (!isoB) return 1;

  // Convert to YYYYMMDD number for comparison
  const numA = Number(isoA.replace(/-/g, ""));
  const numB = Number(isoB.replace(/-/g, ""));

  if (numA < numB) return -1;
  if (numA > numB) return 1;
  return 0;
};

// ============================================================
// 7. isDateInRange - kiểm tra date có trong khoảng [start, end]
// ============================================================
export const isDateInRange = (dateStr, startStr, endStr) => {
  if (!dateStr) return false;

  const dateNum = compareDate(dateStr, startStr);
  const endNum = compareDate(endStr, startStr);

  // date >= start AND date <= end
  return dateNum >= 0 && dateNum <= endNum;
};

// ============================================================
// 8. toIsoDate - chuyển "DD/MM/YYYY" hoặc "HH:mm DD/MM/YYYY" thành "YYYY-MM-DD" (để so sánh)
// ============================================================
export const toIsoDate = (v) => {
  if (!v && v !== 0) return "";

  // Date object
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return "";
    return `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}`;
  }

  const raw = String(v).trim();
  if (!raw) return "";

  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  // "HH:mm MM/DD/YYYY" format - extract date part
  const mDt = raw.match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mDt) {
    const [, , , m, d, y] = mDt;
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }

  // "MM/DD/YYYY" format
  const mMDY = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mMDY) {
    return `${mMDY[3]}-${pad2(mMDY[1])}-${pad2(mMDY[2])}`;
  }

  // "DD/MM/YYYY" or "DD-MM-YYYY" (VN format)
  const mDMY = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mDMY) {
    return `${mDMY[3]}-${pad2(mDMY[2])}-${pad2(mDMY[1])}`;
  }

  return "";
};

// ============================================================
// 9. getTimeMs - lấy milliseconds từ date string (VN format: HH:mm DD/MM/YYYY)
// ============================================================
export const getTimeMs = (v) => {
  if (!v) return 0;

  // Date object
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? 0 : v.getTime();
  }

  const raw = String(v).trim();

  // Parse VN datetime "HH:mm DD/MM/YYYY"
  const mDt = raw.match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mDt) {
    const [, h, mi, d, mo, y] = mDt;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
    return Number.isNaN(dt.getTime()) ? 0 : dt.getTime();
  }

  // Parse VN date "DD/MM/YYYY"
  const mDate = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mDate) {
    const [, d, mo, y] = mDate;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d));
    return Number.isNaN(dt.getTime()) ? 0 : dt.getTime();
  }

  // Try parsing as Date directly
  try {
    const dt = new Date(raw);
    return Number.isNaN(dt.getTime()) ? 0 : dt.getTime();
  } catch (_) {
    return 0;
  }
};

// ============================================================
// 10. formatToUsDate - format Date object to US string "MM/DD/YYYY"
// ============================================================
export const formatToUsDate = (date) => {
  if (!date || Number.isNaN(date.getTime())) return "";
  return `${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}/${date.getFullYear()}`;
};

// ============================================================
// 11. formatToVnDateTime - format Date object to VN datetime string "HH:mm DD/MM/YYYY"
// ============================================================
export const formatToVnDateTime = (date) => {
  if (!date || Number.isNaN(date.getTime())) return "";
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())} ${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
};

// ============================================================
// Test cases (dev only - remove in production)
// ============================================================
/*
toUsDate("2026-06-16") // => "06/16/2026"
toUsDate("16/06/2026") // => "06/16/2026"
toUsDate(new Date(2026, 5, 16)) // => "06/16/2026"
toUsDateTime("2026-06-16 14:30") // => "14:30 06/16/2026"
toUsDateTime("16/06/2026 14:30") // => "14:30 06/16/2026"
compareDate("06/15/2026", "06/16/2026") // => -1
compareDate("06/16/2026", "06/15/2026") // => 1
compareDate("06/15/2026", "06/15/2026") // => 0
isDateInRange("06/15/2026", "06/01/2026", "06/30/2026") // => true
isDateInRange("06/15/2026", "06/16/2026", "06/30/2026") // => false
toIsoDate("06/16/2026") // => "2026-06-16"
toIsoDate("14:30 06/16/2026") // => "2026-06-16"
getTimeMs("14:30 06/16/2026") // => timestamp
*/
