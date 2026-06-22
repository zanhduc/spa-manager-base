import {
  getStaffCatalogStatus,
  inferStaffRole,
  isRetiredStaffStatus,
  normalizeAttendanceDateKey,
  normalizeStaffCatalogStatus,
} from "./staffConstants";

export const STAY_STATUS_CHECKED_OUT = "CHECKED_OUT";
export const STAY_STATUS_NO_SHOW = "NO_SHOW";
export const SATISFACTION_MIN_SCORE = 1;
export const SATISFACTION_MAX_SCORE = 5;
export const SATISFACTION_POSITIVE_THRESHOLD = 4;

// Helper: Convert date string → YYYYMMDD number for correct comparison
// Hỗ trợ cả dd/MM/yyyy và yyyy-MM-dd
export const dateToNumber = (dateStr) => {
  if (!dateStr) return 0;
  const raw = String(dateStr).trim();
  if (!raw) return 0;

  // Format: dd/MM/yyyy → 20260620
  const parts1 = raw.split("/");
  if (parts1.length === 3) {
    return parseInt(parts1[2] + parts1[1] + parts1[0], 10);
  }

  // Format: yyyy-MM-dd → 20260620
  const parts2 = raw.split("-");
  if (parts2.length >= 3) {
    return parseInt(parts2[0] + parts2[1] + parts2[2], 10);
  }

  return 0;
};

// Legacy helper: Convert dd/MM/yyyy → YYYYMMDD number (giữ lại cho tương thích)
export const dateVnToNumber = (dateStr) => {
  return dateToNumber(dateStr);
};

export const normalizeSatisfactionScore = (value) => {
  const score = Math.round(Number(value));
  if (!Number.isFinite(score)) return null;
  if (score < SATISFACTION_MIN_SCORE || score > SATISFACTION_MAX_SCORE) return null;
  return score;
};

export const getStaySatisfactionScore = (stay = {}) =>
  normalizeSatisfactionScore(stay?.diemHaiLongKhach);

export const isPositiveSatisfactionScore = (score) =>
  score !== null && score >= SATISFACTION_POSITIVE_THRESHOLD;

export const getStaySessionDateKey = (stay = {}) => {
  const ended = normalizeAttendanceDateKey(stay?.ketThucThucTe);
  if (ended) return ended;
  return normalizeAttendanceDateKey(stay?.batDauAt);
};

export const buildStayCustomerKey = (stay = {}) => {
  const phone = String(stay?.soDienThoai || "").replace(/\D/g, "");
  if (phone.length >= 9) return `phone:${phone}`;
  const name = String(stay?.tenKhach || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
  if (name) return `name:${name}`;
  return "";
};

export const isCompletedStay = (stay = {}) =>
  String(stay?.trangThaiPhien || "").trim().toUpperCase() === STAY_STATUS_CHECKED_OUT;

export const isNoShowStay = (stay = {}) =>
  String(stay?.trangThaiPhien || "").trim().toUpperCase() === STAY_STATUS_NO_SHOW;

export const isBookingRelatedStay = (stay = {}) => {
  const status = String(stay?.trangThaiPhien || "").trim().toUpperCase();
  return ["BOOKED", "IN_HOUSE", STAY_STATUS_CHECKED_OUT, STAY_STATUS_NO_SHOW].includes(status);
};

export const getStayServiceRevenue = (stay = {}) =>
  Math.max(Number(stay?.tienDichVu || 0), 0);

/**
 * Tính doanh số chia theo buổi cho KTV.
 * - Nếu là gói combo (tongBuoiCombo > 1): giaGoi / tongBuoiCombo
 * - Nếu là dịch vụ lẻ: tienDichVu (hoặc giaGoi nếu có)
 */
export const getStayComboRevenueShare = (stay = {}) => {
  const giaGoi = Number(stay?.giaGoi || 0);
  const tongBuoiCombo = Number(stay?.tongBuoiCombo || 1);
  if (giaGoi > 0 && tongBuoiCombo > 1) {
    return Math.round(giaGoi / tongBuoiCombo);
  }
  return Math.max(Number(stay?.tienDichVu || 0), 0);
};

export const getStayTotalRevenue = (stay = {}) => {
  const tong = Math.max(Number(stay?.tongThanhToan || 0), 0);
  if (tong > 0) return tong;
  return getStayServiceRevenue(stay) + Math.max(Number(stay?.tienGoi || 0), 0);
};

export const stayMatchesDateRange = (stay = {}, tuNgay = "", denNgay = "") => {
  const dateKey = getStaySessionDateKey(stay);
  if (!dateKey) return false;
  // Hỗ trợ cả dd/MM/yyyy và yyyy-MM-dd → convert to YYYYMMDD number
  const dateNum = dateToNumber(dateKey);
  const fromNum = dateToNumber(tuNgay);
  const toNum = dateToNumber(denNgay);
  if (fromNum && dateNum < fromNum) return false;
  if (toNum && dateNum > toNum) return false;
  return true;
};

const defaultMonthRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const toKey = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return { tuNgay: toKey(start), denNgay: toKey(end) };
};

export const resolveStaffKpiDateRange = (filters = {}) => {
  const tuNgay = normalizeAttendanceDateKey(filters.tuNgay);
  const denNgay = normalizeAttendanceDateKey(filters.denNgay);
  if (tuNgay && denNgay) return { tuNgay, denNgay };
  return defaultMonthRange();
};

const attributeStayToLeTan = (stay = {}, leTanCodes = [], staffs = []) => {
  if (leTanCodes.length === 0) return "";
  const code = String(stay.maNhanVien || "").trim();
  const staff = staffs.find((item) => String(item.maNhanVien || "").trim() === code);
  if (staff && inferStaffRole(staff) === "LE_TAN") return code;
  const customerKey = buildStayCustomerKey(stay);
  const dateKey = getStaySessionDateKey(stay);
  const hashSeed = `${customerKey}|${dateKey}`;
  let hash = 0;
  for (let i = 0; i < hashSeed.length; i += 1) {
    hash = (hash + hashSeed.charCodeAt(i)) % leTanCodes.length;
  }
  return leTanCodes[hash] || leTanCodes[0];
};

const isRetainedWorkingStaff = (staff = {}) => {
  if (isRetiredStaffStatus(getStaffCatalogStatus(staff))) return false;
  const status = normalizeStaffCatalogStatus(getStaffCatalogStatus(staff));
  return status !== "Tạm ngưng" && status !== "Nghỉ việc";
};

const rankRows = (rows, primaryKey, secondaryKey) => {
  rows.sort((a, b) => {
    if (b[primaryKey] !== a[primaryKey]) return b[primaryKey] - a[primaryKey];
    if (secondaryKey && b[secondaryKey] !== a[secondaryKey]) {
      return b[secondaryKey] - a[secondaryKey];
    }
    return String(a.tenNhanVien).localeCompare(String(b.tenNhanVien), "vi");
  });
  return rows.map((row, index) => ({ ...row, hang: index + 1 }));
};

export const buildKtvKpiRows = (staffs = [], stays = [], filters = {}) => {
  const { tuNgay, denNgay } = resolveStaffKpiDateRange(filters);
  const roleFilter = String(filters.chucVu || "KTV").trim().toUpperCase();

  const eligibleStaffs = staffs.filter((staff) => {
    if (roleFilter === "ALL") return true;
    return inferStaffRole(staff) === roleFilter;
  });

  const rowMap = new Map();
  eligibleStaffs.forEach((staff) => {
    const code = String(staff.maNhanVien || "").trim();
    if (!code) return;
    rowMap.set(code, {
      maNhanVien: code,
      tenNhanVien: String(staff.tenNhanVien || "").trim() || code,
      chucVu: inferStaffRole(staff),
      doanhSoDichVu: 0,
      phienHoanThanh: 0,
      haiLongTongDiem: 0,
      haiLongSoPhieu: 0,
      haiLongDat: 0,
      customerVisits: new Map(),
    });
  });

  const eligibleCodes = new Set(rowMap.keys());

  stays.forEach((stay) => {
    if (!isCompletedStay(stay)) return;
    const code = String(stay.maNhanVien || "").trim();
    if (!eligibleCodes.has(code)) return;
    if (!stayMatchesDateRange(stay, tuNgay, denNgay)) return;

    const row = rowMap.get(code);
    row.doanhSoDichVu += getStayComboRevenueShare(stay);
    row.phienHoanThanh += 1;
    const satisfactionScore = getStaySatisfactionScore(stay);
    if (satisfactionScore !== null) {
      row.haiLongTongDiem += satisfactionScore;
      row.haiLongSoPhieu += 1;
      if (isPositiveSatisfactionScore(satisfactionScore)) row.haiLongDat += 1;
    }
    const customerKey = buildStayCustomerKey(stay);
    if (customerKey) {
      row.customerVisits.set(customerKey, (row.customerVisits.get(customerKey) || 0) + 1);
    }
  });

  const rows = [...rowMap.values()].map((row) => {
    const khachPhucVu = row.customerVisits.size;
    let khachQuayLai = 0;
    row.customerVisits.forEach((count) => {
      if (count >= 2) khachQuayLai += 1;
    });
    const tyLeKhachQuayLai = khachPhucVu > 0 ? (khachQuayLai / khachPhucVu) * 100 : 0;
    const diemHaiLongTrungBinh =
      row.haiLongSoPhieu > 0 ? row.haiLongTongDiem / row.haiLongSoPhieu : 0;
    const tyLeHaiLongKhach =
      row.haiLongSoPhieu > 0 ? (row.haiLongDat / row.haiLongSoPhieu) * 100 : 0;
    return {
      maNhanVien: row.maNhanVien,
      tenNhanVien: row.tenNhanVien,
      chucVu: row.chucVu,
      kpiProfile: "KTV",
      doanhSoDichVu: row.doanhSoDichVu,
      phienHoanThanh: row.phienHoanThanh,
      soPhieuHaiLong: row.haiLongSoPhieu,
      diemHaiLongTrungBinh,
      tyLeHaiLongKhach,
      khachPhucVu,
      khachQuayLai,
      tyLeKhachQuayLai,
      tuNgay,
      denNgay,
    };
  });

  return rankRows(rows, "doanhSoDichVu", "phienHoanThanh");
};

export const buildLeTanKpiRows = (staffs = [], stays = [], filters = {}) => {
  const { tuNgay, denNgay } = resolveStaffKpiDateRange(filters);
  const leTanStaffs = staffs.filter((staff) => inferStaffRole(staff) === "LE_TAN");
  const leTanCodes = leTanStaffs
    .map((staff) => String(staff.maNhanVien || "").trim())
    .filter(Boolean);

  const rowMap = new Map();
  leTanStaffs.forEach((staff) => {
    const code = String(staff.maNhanVien || "").trim();
    if (!code) return;
    rowMap.set(code, {
      maNhanVien: code,
      tenNhanVien: String(staff.tenNhanVien || "").trim() || code,
      chucVu: "LE_TAN",
      doanhSoDichVu: 0,
      soDatLich: 0,
      phienDenHen: 0,
      phienNoShow: 0,
      customerVisits: new Map(),
    });
  });

  stays.forEach((stay) => {
    if (!isBookingRelatedStay(stay)) return;
    if (!stayMatchesDateRange(stay, tuNgay, denNgay)) return;
    const code = attributeStayToLeTan(stay, leTanCodes, staffs);
    if (!code || !rowMap.has(code)) return;
    const row = rowMap.get(code);
    row.soDatLich += 1;
    // Lễ tân được hưởng doanh số từ các buổi phục vụ đã hoàn thành
    if (isCompletedStay(stay)) {
      row.doanhSoDichVu += getStayComboRevenueShare(stay);
      row.phienDenHen += 1;
    }
    if (isNoShowStay(stay)) row.phienNoShow += 1;
    if (isCompletedStay(stay)) {
      const customerKey = buildStayCustomerKey(stay);
      if (customerKey) {
        row.customerVisits.set(customerKey, (row.customerVisits.get(customerKey) || 0) + 1);
      }
    }
  });

  const rows = [...rowMap.values()].map((row) => {
    const khachPhucVu = row.customerVisits.size;
    let khachQuayLai = 0;
    row.customerVisits.forEach((count) => {
      if (count >= 2) khachQuayLai += 1;
    });
    const tyLeDenHen =
      row.phienDenHen + row.phienNoShow > 0
        ? (row.phienDenHen / (row.phienDenHen + row.phienNoShow)) * 100
        : 0;
    const tyLeKhachQuayLai = khachPhucVu > 0 ? (khachQuayLai / khachPhucVu) * 100 : 0;
    return {
      maNhanVien: row.maNhanVien,
      tenNhanVien: row.tenNhanVien,
      chucVu: row.chucVu,
      kpiProfile: "LE_TAN",
      doanhSoDichVu: row.doanhSoDichVu,
      soDatLich: row.soDatLich,
      phienDenHen: row.phienDenHen,
      phienNoShow: row.phienNoShow,
      tyLeDenHen,
      khachPhucVu,
      khachQuayLai,
      tyLeKhachQuayLai,
      tuNgay,
      denNgay,
    };
  });

  return rankRows(rows, "doanhSoDichVu", "tyLeDenHen");
};

export const buildQuanLyKpiRows = (staffs = [], stays = [], filters = {}) => {
  const { tuNgay, denNgay } = resolveStaffKpiDateRange(filters);
  const quanLyStaffs = staffs.filter((staff) => inferStaffRole(staff) === "QUAN_LY");
  const employedStaff = staffs.filter((staff) => !isRetiredStaffStatus(getStaffCatalogStatus(staff)));
  const retainedStaff = employedStaff.filter((staff) => isRetainedWorkingStaff(staff));
  const spaRevenue = stays.reduce((sum, stay) => {
    if (!isCompletedStay(stay)) return sum;
    if (!stayMatchesDateRange(stay, tuNgay, denNgay)) return sum;
    return sum + getStayTotalRevenue(stay);
  }, 0);
  const tyLeGiuChanNs =
    employedStaff.length > 0 ? (retainedStaff.length / employedStaff.length) * 100 : 0;

  const rows = quanLyStaffs.map((staff) => {
    const code = String(staff.maNhanVien || "").trim();
    return {
      maNhanVien: code,
      tenNhanVien: String(staff.tenNhanVien || "").trim() || code,
      chucVu: "QUAN_LY",
      kpiProfile: "QUAN_LY",
      doanhThu: spaRevenue,
      nsDangLam: retainedStaff.length,
      nsTong: employedStaff.length,
      tyLeGiuChanNs,
      tuNgay,
      denNgay,
    };
  });

  return rankRows(rows, "doanhThu", "tyLeGiuChanNs");
};

export const buildStaffKpiRows = (staffs = [], stays = [], filters = {}) => {
  const roleFilter = String(filters.chucVu || "KTV").trim().toUpperCase();
  if (roleFilter === "LE_TAN") return buildLeTanKpiRows(staffs, stays, filters);
  if (roleFilter === "QUAN_LY") return buildQuanLyKpiRows(staffs, stays, filters);
  return buildKtvKpiRows(staffs, stays, filters);
};
