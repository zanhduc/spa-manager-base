import {
  getStaffCatalogStatus,
  normalizeAttendanceDateKey,
  normalizeStaffCatalogStatus,
} from "./staffConstants";

export const LEAVE_STATUS = {
  PENDING: "CHO_DUYET",
  APPROVED: "DA_DUYET",
  REJECTED: "TU_CHOI",
  CANCELLED: "DA_HUY",
};

export const LEAVE_STATUS_OPTIONS = [
  { value: LEAVE_STATUS.PENDING, label: "Chờ duyệt" },
  { value: LEAVE_STATUS.APPROVED, label: "Đã duyệt" },
  { value: LEAVE_STATUS.REJECTED, label: "Từ chối" },
  { value: LEAVE_STATUS.CANCELLED, label: "Đã hủy" },
];

export const LEAVE_REVIEW_ACTION = {
  APPROVE: "APPROVE",
  REJECT: "REJECT",
  CANCEL: "CANCEL",
};

export const normalizeLeaveStatus = (value) => {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw || raw.includes("CHO") || raw.includes("PENDING")) return LEAVE_STATUS.PENDING;
  if (raw.includes("DUYET") || raw === "DA_DUYET" || raw.includes("APPROV")) {
    return LEAVE_STATUS.APPROVED;
  }
  if (raw.includes("TU_CHOI") || raw.includes("REJECT")) return LEAVE_STATUS.REJECTED;
  if (raw.includes("HUY") || raw.includes("CANCEL")) return LEAVE_STATUS.CANCELLED;
  return LEAVE_STATUS.PENDING;
};

export const getLeaveStatusLabel = (status) =>
  LEAVE_STATUS_OPTIONS.find((item) => item.value === normalizeLeaveStatus(status))?.label ||
  status ||
  "—";

export const isActiveLeaveStatus = (status) =>
  normalizeLeaveStatus(status) === LEAVE_STATUS.APPROVED;

export const leaveMatchesDateRange = (record = {}, tuNgay = "", denNgay = "") => {
  const from = normalizeAttendanceDateKey(record?.tuNgay);
  const to = normalizeAttendanceDateKey(record?.denNgay);
  if (!from || !to) return false;
  const rangeFrom = normalizeAttendanceDateKey(tuNgay);
  const rangeTo = normalizeAttendanceDateKey(denNgay);
  if (rangeFrom && to < rangeFrom) return false;
  if (rangeTo && from > rangeTo) return false;
  return true;
};

export const dateKeyInLeaveRange = (dateKey = "", record = {}) => {
  const key = normalizeAttendanceDateKey(dateKey);
  const from = normalizeAttendanceDateKey(record?.tuNgay);
  const to = normalizeAttendanceDateKey(record?.denNgay);
  if (!key || !from || !to) return false;
  return key >= from && key <= to;
};

export const hasApprovedLeaveOnDate = (staffCode = "", leaveRows = [], dateKey = "") => {
  const code = String(staffCode || "").trim();
  if (!code) return false;
  return leaveRows.some(
    (row) =>
      String(row.maNhanVien || "").trim() === code &&
      isActiveLeaveStatus(row.trangThai) &&
      dateKeyInLeaveRange(dateKey, row),
  );
};

export const suggestNextLeaveCode = (records = []) => {
  let max = 0;
  records.forEach((record) => {
    const match = String(record?.maDon || "").match(/NP(\d+)/i);
    if (match) max = Math.max(max, Number(match[1]));
  });
  return `NP${String(max + 1).padStart(6, "0")}`;
};

export const validateLeaveSave = (payload = {}) => {
  const maNhanVien = String(payload.maNhanVien || "").trim();
  const tuNgay = normalizeAttendanceDateKey(payload.tuNgay);
  const denNgay = normalizeAttendanceDateKey(payload.denNgay);
  if (!maNhanVien) return { ok: false, message: "Chọn nhân viên." };
  if (!tuNgay || !denNgay) return { ok: false, message: "Ngày nghỉ không hợp lệ." };
  if (tuNgay > denNgay) return { ok: false, message: "Ngày bắt đầu phải trước ngày kết thúc." };
  if (!String(payload.lyDo || "").trim()) return { ok: false, message: "Nhập lý do nghỉ phép." };
  return { ok: true, tuNgay, denNgay, maNhanVien };
};

export const shouldSyncStaffLeaveStatus = (record = {}, todayKey = "") => {
  if (!isActiveLeaveStatus(record?.trangThai)) return false;
  return dateKeyInLeaveRange(todayKey, record);
};

export const buildLeaveReviewPayload = (record = {}, action = "") => {
  const maDon = String(record?.maDon || "").trim();
  if (!maDon) return { ok: false, message: "Không tìm thấy đơn nghỉ phép." };
  const current = normalizeLeaveStatus(record?.trangThai);
  if (action === LEAVE_REVIEW_ACTION.APPROVE) {
    if (current !== LEAVE_STATUS.PENDING) {
      return { ok: false, message: "Chỉ duyệt đơn đang chờ duyệt." };
    }
    return { ok: true, maDon, trangThai: LEAVE_STATUS.APPROVED };
  }
  if (action === LEAVE_REVIEW_ACTION.REJECT) {
    if (current !== LEAVE_STATUS.PENDING) {
      return { ok: false, message: "Chỉ từ chối đơn đang chờ duyệt." };
    }
    return { ok: true, maDon, trangThai: LEAVE_STATUS.REJECTED };
  }
  if (action === LEAVE_REVIEW_ACTION.CANCEL) {
    if (current === LEAVE_STATUS.CANCELLED || current === LEAVE_STATUS.REJECTED) {
      return { ok: false, message: "Đơn này không thể hủy." };
    }
    return { ok: true, maDon, trangThai: LEAVE_STATUS.CANCELLED };
  }
  return { ok: false, message: "Thao tác không hợp lệ." };
};

export const buildStaffLeaveStatusUpdate = (staff = {}, leaveRows = [], todayKey = "") => {
  const code = String(staff.maNhanVien || "").trim();
  if (!code) return null;
  const today = normalizeAttendanceDateKey(todayKey);
  if (!today) return null;

  const onLeaveToday = hasApprovedLeaveOnDate(code, leaveRows, today);
  const current = normalizeStaffCatalogStatus(getStaffCatalogStatus(staff));

  if (onLeaveToday && current !== "Nghỉ phép") {
    return { ...staff, trangThai: "Nghỉ phép" };
  }
  if (!onLeaveToday && current === "Nghỉ phép") {
    return { ...staff, trangThai: "Đang làm việc" };
  }
  return null;
};

export const buildStaffLeaveStatusUpdates = (staffs = [], leaveRows = [], todayKey = "") =>
  staffs
    .map((staff) => buildStaffLeaveStatusUpdate(staff, leaveRows, todayKey))
    .filter(Boolean);
