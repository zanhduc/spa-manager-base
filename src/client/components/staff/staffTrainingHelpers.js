import {
  getStaffCatalogStatus,
  normalizeAttendanceDateKey,
  normalizeStaffCatalogStatus,
} from "./staffConstants";

export const TRAINING_TYPE = {
  ONBOARDING: "HOI_NHAP",
  SPECIALTY: "CHUYEN_MON",
};

export const TRAINING_TYPE_OPTIONS = [
  { value: TRAINING_TYPE.ONBOARDING, label: "Hội nhập (1 ngày)" },
  { value: TRAINING_TYPE.SPECIALTY, label: "Chuyên môn (3–7 ngày)" },
];

export const TRAINING_STATUS = {
  SCHEDULED: "DA_LEN_LICH",
  COMPLETED: "HOAN_THANH",
  CANCELLED: "HUY",
};

export const TRAINING_STATUS_OPTIONS = [
  { value: TRAINING_STATUS.SCHEDULED, label: "Đã lên lịch" },
  { value: TRAINING_STATUS.COMPLETED, label: "Hoàn thành" },
  { value: TRAINING_STATUS.CANCELLED, label: "Hủy" },
];

export const normalizeTrainingType = (value) => {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";
  if (raw.includes("HOI") || raw.includes("NHAP") || raw.includes("ONBOARD")) {
    return TRAINING_TYPE.ONBOARDING;
  }
  if (raw.includes("CHUYEN") || raw.includes("MON") || raw.includes("SPECIAL")) {
    return TRAINING_TYPE.SPECIALTY;
  }
  return "";
};

export const normalizeTrainingStatus = (value) => {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return TRAINING_STATUS.SCHEDULED;
  if (raw.includes("HOAN") || raw.includes("COMPLETE")) return TRAINING_STATUS.COMPLETED;
  if (raw.includes("HUY") || raw.includes("CANCEL")) return TRAINING_STATUS.CANCELLED;
  return TRAINING_STATUS.SCHEDULED;
};

export const getTrainingTypeLabel = (value) =>
  TRAINING_TYPE_OPTIONS.find((item) => item.value === normalizeTrainingType(value))?.label ||
  value ||
  "—";

export const getTrainingStatusLabel = (value) =>
  TRAINING_STATUS_OPTIONS.find((item) => item.value === normalizeTrainingStatus(value))?.label ||
  value ||
  "—";

export const trainingMatchesDateRange = (record = {}, tuNgay = "", denNgay = "") => {
  const from = normalizeAttendanceDateKey(record?.tuNgay);
  const to = normalizeAttendanceDateKey(record?.denNgay);
  if (!from || !to) return false;
  const rangeFrom = normalizeAttendanceDateKey(tuNgay);
  const rangeTo = normalizeAttendanceDateKey(denNgay);
  if (rangeFrom && to < rangeFrom) return false;
  if (rangeTo && from > rangeTo) return false;
  return true;
};

export const suggestNextTrainingCode = (records = []) => {
  let max = 0;
  records.forEach((record) => {
    const match = String(record?.maDaoTao || "").match(/DT(\d+)/i);
    if (match) max = Math.max(max, Number(match[1]));
  });
  return `DT${String(max + 1).padStart(6, "0")}`;
};

export const validateTrainingSave = (payload = {}) => {
  const maNhanVien = String(payload.maNhanVien || "").trim();
  const loaiDaoTao = normalizeTrainingType(payload.loaiDaoTao);
  const tuNgay = normalizeAttendanceDateKey(payload.tuNgay);
  const denNgay = normalizeAttendanceDateKey(payload.denNgay);
  if (!maNhanVien) return { ok: false, message: "Chọn nhân viên." };
  if (!loaiDaoTao) return { ok: false, message: "Chọn loại đào tạo." };
  if (!tuNgay || !denNgay) return { ok: false, message: "Ngày đào tạo không hợp lệ." };
  if (tuNgay > denNgay) return { ok: false, message: "Ngày bắt đầu phải trước ngày kết thúc." };
  if (!String(payload.noiDung || "").trim()) return { ok: false, message: "Nhập nội dung đào tạo." };
  return { ok: true, maNhanVien, loaiDaoTao, tuNgay, denNgay };
};

export const resolveStaffStatusAfterTrainingComplete = (staff = {}, training = {}) => {
  if (normalizeTrainingStatus(training?.trangThai) !== TRAINING_STATUS.COMPLETED) return null;
  const current = normalizeStaffCatalogStatus(getStaffCatalogStatus(staff));
  const type = normalizeTrainingType(training?.loaiDaoTao);
  if (type === TRAINING_TYPE.ONBOARDING && current === "Thử việc") {
    return "Đào tạo";
  }
  if (
    type === TRAINING_TYPE.SPECIALTY &&
    (current === "Thử việc" || current === "Đào tạo")
  ) {
    return "Đang làm việc";
  }
  return null;
};
