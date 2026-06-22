import {
  ATTENDANCE_STATUS,
  inferStaffExpectedShiftsFromSchedule,
  inferStaffRole,
  isRetiredStaffStatus,
  normalizeAttendanceDateKey,
  getStaffCatalogStatus,
} from "./staffConstants";
import { buildStaffKpiRows, resolveStaffKpiDateRange } from "./staffKpiHelpers";
import { calculateNetPayroll, sumViolationDeductions } from "./staffViolationHelpers";

export { resolveStaffKpiDateRange };

export const DEFAULT_BONUS_RATE_BY_ROLE = {
  KTV: 0,
  LE_TAN: 0,
  TU_VAN: 0,
  QUAN_LY: 0,
  MARKETING: 0,
  CSKH: 0,
  NHAN_VIEN: 0,
  CHUYEN_GIA: 0,
  GIAM_DOC: 0,
  TRO_LY_GIAM_DOC: 0,
  CTV_MARKETING: 0,
  DEFAULT: 0,
};

// Số ngày nghỉ phép cho phép mặc định theo loại nhân viên
export const DEFAULT_LEAVE_QUOTA = {
  HANH_CHINH: 26, // NV hành chính: 26 công = 26 ngày nghỉ (Chủ nhật nghỉ)
  KTV: 30, // KTV/KTX: 30 ngày = 60 ca (2 ca/ngày), mỗi ca = 0.5 ngày
};

// Quy đổi: 1 buổi nghỉ = 1/26 lương tháng
export const calculateLeaveDeduction = (luongCoBanThang = 0, soNgayNghi = 0, quota = 0) => {
  if (soNgayNghi <= quota) return 0;
  const buoiNghiVuotQua = soNgayNghi - quota;
  const giaTriMotBuoi = luongCoBanThang / 26;
  return Math.round(giaTriMotBuoi * buoiNghiVuotQua);
};

export const parsePayrollMoney = (value) => Math.max(Number(value || 0), 0);

export const parseBonusRate = (value) => {
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate < 0) return 0;
  return Math.min(rate, 100);
};

export const getStaffBonusRate = (staff = {}) => {
  const explicit = staff?.tyLeThuongDichVu;
  if (explicit !== undefined && explicit !== null && String(explicit).trim() !== "") {
    return parseBonusRate(explicit);
  }
  const role = inferStaffRole(staff);
  return DEFAULT_BONUS_RATE_BY_ROLE[role] ?? DEFAULT_BONUS_RATE_BY_ROLE.DEFAULT;
};

export const getStaffMonthlyBaseSalary = (staff = {}) =>
  parsePayrollMoney(staff?.luongCoBanThang);

export const iterateDateKeysInRange = (tuNgay = "", denNgay = "") => {
  const startKey = normalizeAttendanceDateKey(tuNgay);
  const endKey = normalizeAttendanceDateKey(denNgay);
  if (!startKey || !endKey || startKey > endKey) return [];
  const keys = [];
  const cursor = new Date(`${startKey}T12:00:00`);
  const end = new Date(`${endKey}T12:00:00`);
  while (cursor <= end) {
    keys.push(normalizeAttendanceDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
};

export const countScheduledShiftsInRange = (
  staffCode,
  scheduleRows = [],
  tuNgay = "",
  denNgay = "",
) => {
  const code = String(staffCode || "").trim();
  if (!code) return { totalShifts: 0, scheduledDays: 0 };
  let totalShifts = 0;
  let scheduledDays = 0;
  iterateDateKeysInRange(tuNgay, denNgay).forEach((dateKey) => {
    const shifts = inferStaffExpectedShiftsFromSchedule(code, dateKey, scheduleRows);
    if (shifts.length > 0) {
      totalShifts += shifts.length;
      scheduledDays += 1;
    }
  });
  return { totalShifts, scheduledDays };
};

export const hasAnyScheduleInRange = (
  staffCode,
  scheduleRows = [],
  tuNgay = "",
  denNgay = "",
) => {
  const { scheduledDays } = countScheduledShiftsInRange(staffCode, scheduleRows, tuNgay, denNgay);
  return scheduledDays > 0;
};

export const isCompletedAttendanceRecord = (record = {}) => {
  const status = String(record?.trangThai || "").trim();
  if (status === ATTENDANCE_STATUS.COMPLETED || status === "Đã ra ca") return true;
  return Boolean(String(record?.checkOutAt || "").trim());
};

export const isAbsentAttendanceRecord = (record = {}) => {
  const status = String(record?.trangThai || "").trim();
  return status === ATTENDANCE_STATUS.ABSENT;
};

export const countAbsentShiftsInRange = (
  staffCode,
  attendanceRows = [],
  tuNgay = "",
  denNgay = "",
) => {
  const code = String(staffCode || "").trim();
  if (!code) return 0;
  const from = normalizeAttendanceDateKey(tuNgay);
  const to = normalizeAttendanceDateKey(denNgay);
  return attendanceRows.filter((record) => {
    if (String(record?.maNhanVien || "").trim() !== code) return false;
    const ngay = normalizeAttendanceDateKey(record?.ngay);
    if (!ngay || (from && ngay < from) || (to && ngay > to)) return false;
    return isAbsentAttendanceRecord(record);
  }).length;
};

/**
 * Tính số ngày nghỉ phép từ chấm công
 * - KTV (KTV/LE_TAN/TU_VAN): mỗi ca Absent = 0.5 ngày, quota = 30 ngày
 * - Hành chính: mỗi ngày Absent = 1 ngày, quota = 26 ngày
 */
export const countLeaveDaysFromAttendance = (
  staffCode,
  attendanceRows = [],
  scheduleRows = [],
  tuNgay = "",
  denNgay = "",
  role = "",
) => {
  const code = String(staffCode || "").trim();
  if (!code) return { ngayNghi: 0, quota: 0 };

  const from = normalizeAttendanceDateKey(tuNgay);
  const to = normalizeAttendanceDateKey(denNgay);

  // Xác định quota theo vai trò
  const isKtv = role === "KTV" || role === "LE_TAN" || role === "TU_VAN";
  const quota = isKtv ? DEFAULT_LEAVE_QUOTA.KTV : DEFAULT_LEAVE_QUOTA.HANH_CHINH;

  // Lấy danh sách ngày trong kỳ
  const dateKeys = iterateDateKeysInRange(tuNgay, denNgay);

  let ngayNghi = 0;

  dateKeys.forEach((ngay) => {
    // Lấy các bản ghi chấm công trong ngày đó
    const recordsInDay = attendanceRows.filter((record) => {
      if (String(record?.maNhanVien || "").trim() !== code) return false;
      const recordNgay = normalizeAttendanceDateKey(record?.ngay);
      return recordNgay === ngay;
    });

    // Đếm số ca Absent trong ngày
    const absentShifts = recordsInDay.filter((r) => isAbsentAttendanceRecord(r)).length;

    if (absentShifts > 0) {
      if (isKtv) {
        // KTV: mỗi ca = 0.5 ngày
        ngayNghi += absentShifts * 0.5;
      } else {
        // Hành chính: 1 ngày có Absent = 1 ngày nghỉ
        ngayNghi += 1;
      }
    }
  });

  // Làm tròn .5
  ngayNghi = Math.round(ngayNghi * 2) / 2;

  return { ngayNghi, quota };
};

export const countCompletedShiftsInRange = (
  staffCode,
  attendanceRows = [],
  tuNgay = "",
  denNgay = "",
) => {
  const code = String(staffCode || "").trim();
  if (!code) return 0;
  const from = normalizeAttendanceDateKey(tuNgay);
  const to = normalizeAttendanceDateKey(denNgay);
  return attendanceRows.filter((record) => {
    if (String(record?.maNhanVien || "").trim() !== code) return false;
    const ngay = normalizeAttendanceDateKey(record?.ngay);
    if (!ngay || (from && ngay < from) || (to && ngay > to)) return false;
    return isCompletedAttendanceRecord(record);
  }).length;
};

/**
 * Tính lương cơ bản: trả full lương cơ bản tháng cho nhân viên.
 * (Bỏ logic nhân tỷ lệ công ca để tránh hiểu thị sai - chỉ trừ vi phạm)
 */
export const calculateBasicSalaryPayout = ({
  luongCoBanThang = 0,
} = {}) => {
  const monthlyBase = parsePayrollMoney(luongCoBanThang);
  return {
    luongCoBan: monthlyBase,
    tyLeCong: 1,
    missingSchedule: false,
  };
};

export const calculateServiceBonus = (doanhSoDichVu = 0, tyLeThuong = 0) =>
  Math.round(parsePayrollMoney(doanhSoDichVu) * (parseBonusRate(tyLeThuong) / 100));

export const buildStaffPayrollRows = (
  staffs = [],
  stays = [],
  attendanceRows = [],
  scheduleRows = [],
  violationRows = [],
  filters = {},
) => {
  const { tuNgay, denNgay } = resolveStaffKpiDateRange(filters);
  const roleFilter = String(filters.chucVu || "ALL").trim().toUpperCase();

  const kpiRows = buildStaffKpiRows(staffs, stays, {
    tuNgay,
    denNgay,
    chucVu: "ALL",
  });
  const kpiByCode = new Map(kpiRows.map((row) => [row.maNhanVien, row]));

  const rows = staffs
    .filter((staff) => !isRetiredStaffStatus(getStaffCatalogStatus(staff)))
    .filter((staff) => {
      if (roleFilter === "ALL") return true;
      return inferStaffRole(staff) === roleFilter;
    })
    .map((staff) => {
      const code = String(staff.maNhanVien || "").trim();
      const kpi = kpiByCode.get(code) || {
        doanhSoDichVu: 0,
        phienHoanThanh: 0,
      };
      const luongCoBanThang = getStaffMonthlyBaseSalary(staff);
      const tyLeThuong = getStaffBonusRate(staff);
      // Xác định quota nghỉ phép dựa trên vai trò
      const role = inferStaffRole(staff);
      const isKtv = role === "KTV" || role === "LE_TAN" || role === "TU_VAN";
      const leaveQuota = isKtv ? DEFAULT_LEAVE_QUOTA.KTV : DEFAULT_LEAVE_QUOTA.HANH_CHINH;
      // Đếm số ngày nghỉ từ chấm công
      const { ngayNghi, quota } = countLeaveDaysFromAttendance(
        code,
        attendanceRows,
        scheduleRows,
        tuNgay,
        denNgay,
        role,
      );
      // Full lương cơ bản tháng
      const basic = calculateBasicSalaryPayout({ luongCoBanThang });
      const thuong = calculateServiceBonus(kpi.doanhSoDichVu, tyLeThuong);
      const violation = sumViolationDeductions(code, violationRows, tuNgay, denNgay);
      // Tính trừ nghỉ phép dựa trên số ngày nghỉ thực từ attendance
      const leaveDeduction = calculateLeaveDeduction(luongCoBanThang, ngayNghi, quota);
      const totalTru = violation.mucTru + leaveDeduction;
      const net = calculateNetPayroll({
        luongCoBan: basic.luongCoBan,
        thuong,
        truViPham: totalTru,
      });

      return {
        maNhanVien: code,
        tenNhanVien: String(staff.tenNhanVien || "").trim() || code,
        chucVu: role,
        luongCoBanThang,
        leaveQuota: quota,
        ngayNghiPhep: ngayNghi,
        luongCoBan: basic.luongCoBan,
        doanhSoDichVu: kpi.doanhSoDichVu,
        phienHoanThanh: kpi.phienHoanThanh,
        tyLeThuong,
        thuong,
        thuNhapGross: net.thuNhapGross,
        truViPham: net.truViPham,
        leaveDeduction,
        soVuViPham: violation.soVu,
        tongLuong: net.tongLuong,
        tuNgay,
        denNgay,
      };
    })
    .sort((a, b) => {
      if (b.tongLuong !== a.tongLuong) return b.tongLuong - a.tongLuong;
      return String(a.tenNhanVien).localeCompare(String(b.tenNhanVien), "vi");
    });

  return rows.map((row, index) => ({ ...row, hang: index + 1 }));
};
