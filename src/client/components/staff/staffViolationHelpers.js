import {
  inferStaffRole,
  normalizeAttendanceDateKey,
} from "./staffConstants";
import { parsePayrollMoney } from "./staffPayrollHelpers";

export const VIOLATION_STATUS = {
  ACTIVE: "AP_DUNG",
  CANCELLED: "DA_HUY",
};

export const VIOLATION_LEVEL_OPTIONS = [
  { value: "NHAC_NHO", label: "Nhắc nhở" },
  { value: "KHIEN_TRACH", label: "Khiển trách" },
  { value: "TRU_THUONG", label: "Trừ thưởng / trừ tiền" },
  { value: "DINH_CHI", label: "Đình chỉ (ghi nhận + có thể trừ tiền)" },
];

export const normalizeViolationLevel = (value) => {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";
  if (raw === "NHAC_NHO" || raw.includes("NHAC")) return "NHAC_NHO";
  if (raw === "KHIEN_TRACH" || raw.includes("KHIEN")) return "KHIEN_TRACH";
  if (raw === "TRU_THUONG" || raw.includes("TRU")) return "TRU_THUONG";
  if (raw === "DINH_CHI" || raw.includes("DINH")) return "DINH_CHI";
  return "";
};

export const normalizeViolationStatus = (value) => {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw || raw === VIOLATION_STATUS.ACTIVE || raw.includes("AP_DUNG")) {
    return VIOLATION_STATUS.ACTIVE;
  }
  if (raw === VIOLATION_STATUS.CANCELLED || raw.includes("HUY")) {
    return VIOLATION_STATUS.CANCELLED;
  }
  return VIOLATION_STATUS.ACTIVE;
};

export const getViolationLevelLabel = (level) =>
  VIOLATION_LEVEL_OPTIONS.find((item) => item.value === normalizeViolationLevel(level))
    ?.label || level || "—";

export const isActiveViolation = (record = {}) =>
  normalizeViolationStatus(record?.trangThai) === VIOLATION_STATUS.ACTIVE;

export const suggestNextViolationCode = (records = []) => {
  let max = 0;
  records.forEach((record) => {
    const match = String(record?.maViPham || "").match(/VP(\d+)/i);
    if (match) max = Math.max(max, Number(match[1]));
  });
  return `VP${String(max + 1).padStart(6, "0")}`;
};

export const violationMatchesDateRange = (record = {}, tuNgay = "", denNgay = "") => {
  const ngay = normalizeAttendanceDateKey(record?.ngay);
  if (!ngay) return false;
  const from = normalizeAttendanceDateKey(tuNgay);
  const to = normalizeAttendanceDateKey(denNgay);
  if (from && ngay < from) return false;
  if (to && ngay > to) return false;
  return true;
};

export const getViolationDeductionAmount = (record = {}) => {
  if (!isActiveViolation(record)) return 0;
  return parsePayrollMoney(record?.mucTru);
};

export const sumViolationDeductions = (
  staffCode,
  violationRows = [],
  tuNgay = "",
  denNgay = "",
) => {
  const code = String(staffCode || "").trim();
  if (!code) return { mucTru: 0, soVu: 0 };
  let mucTru = 0;
  let soVu = 0;
  violationRows.forEach((record) => {
    if (String(record?.maNhanVien || "").trim() !== code) return;
    if (!violationMatchesDateRange(record, tuNgay, denNgay)) return;
    const amount = getViolationDeductionAmount(record);
    if (amount <= 0) return;
    mucTru += amount;
    soVu += 1;
  });
  return { mucTru, soVu };
};

export const calculateNetPayroll = ({
  luongCoBan = 0,
  thuong = 0,
  truViPham = 0,
} = {}) => {
  const gross = parsePayrollMoney(luongCoBan) + parsePayrollMoney(thuong);
  const deduction = parsePayrollMoney(truViPham);
  return {
    thuNhapGross: gross,
    truViPham: deduction,
    tongLuong: Math.max(0, gross - deduction),
  };
};

export const validateViolationSave = (payload = {}, staff = {}, existingRecords = []) => {
  const maNhanVien = String(payload?.maNhanVien || staff?.maNhanVien || "").trim();
  const ngay = normalizeAttendanceDateKey(payload?.ngay);
  const capDo = normalizeViolationLevel(payload?.capDo);
  const noiDung = String(payload?.noiDung || "").trim();
  const mucTru = parsePayrollMoney(payload?.mucTru);
  const maViPham =
    String(payload?.maViPham || "").trim() ||
    suggestNextViolationCode(existingRecords);

  if (!maNhanVien) return { ok: false, message: "Chọn nhân viên vi phạm." };
  if (!ngay) return { ok: false, message: "Ngày vi phạm không hợp lệ." };
  if (!capDo) return { ok: false, message: "Chọn mức xử lý vi phạm." };
  if (!noiDung) return { ok: false, message: "Cần mô tả nội dung vi phạm." };
  if (capDo === "TRU_THUONG" && mucTru <= 0) {
    return { ok: false, message: "Mức 'Trừ thưởng' cần nhập số tiền trừ lớn hơn 0." };
  }

  return {
    ok: true,
    data: {
      maViPham,
      maNhanVien,
      ngay,
      capDo,
      noiDung,
      mucTru,
      trangThai: VIOLATION_STATUS.ACTIVE,
      ghiChu: String(payload?.ghiChu || "").trim(),
    },
  };
};
