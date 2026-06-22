import {
  inferStaffRole,
  normalizeAttendanceDateKey,
  normalizeAttendanceShiftCode,
} from "./staffConstants";

export const CHECKLIST_TYPE_OPTIONS = [
  { value: "DAU_CA", label: "Đầu ca" },
  { value: "CUOI_CA", label: "Cuối ca" },
];

export const CHECKLIST_SUPPORTED_ROLES = ["LE_TAN", "KTV", "QUAN_LY"];

export const SHIFT_CHECKLIST_TEMPLATES = {
  LE_TAN: {
    DAU_CA: [
      { code: "BAT_DEN", label: "Bật đèn khu vực tiếp đón", required: true },
      { code: "BAT_DIEU_HOA", label: "Bật điều hòa", required: true },
      { code: "CHUAN_BI_NUOC", label: "Chuẩn bị nước tiếp khách", required: true },
      { code: "KIEM_TRA_LICH_HEN", label: "Kiểm tra lịch hẹn trong ngày", required: true },
    ],
    CUOI_CA: [
      { code: "CHOT_LICH_HEN", label: "Chốt và cập nhật lịch hẹn ngày mai", required: true },
      { code: "GIAO_TIEN_MAT", label: "Giao ca tiền mặt / doanh thu", required: true },
      { code: "DON_TIEP_DON", label: "Dọn khu tiếp đón", required: true },
    ],
  },
  KTV: {
    DAU_CA: [
      { code: "CHUAN_BI_KHAN", label: "Chuẩn bị khăn, drap", required: true },
      { code: "CHUAN_BI_TINH_DAU", label: "Kiểm tra tinh dầu / dụng cụ", required: true },
      { code: "KIEM_TRA_PHONG", label: "Kiểm tra phòng / giường sạch sẽ", required: true },
      { code: "KIEM_TRA_MAY", label: "Kiểm tra máy móc thiết bị", required: true },
    ],
    CUOI_CA: [
      { code: "DON_DUNG_CU", label: "Dọn dụng cụ, khử khuẩn", required: true },
      { code: "BAO_CAO_VAT_TU", label: "Báo cáo vật tư sắp hết", required: true },
      { code: "BAN_GIAO_PHONG", label: "Bàn giao phòng trạng thái cuối ca", required: true },
    ],
  },
  QUAN_LY: {
    DAU_CA: [
      { code: "KIEM_TRA_TONG_THE", label: "Kiểm tra tổng thể spa", required: true },
      { code: "HOP_DAU_CA", label: "Họp đầu ca với team", required: true },
      { code: "GIAO_KPI", label: "Giao KPI / mục tiêu ca", required: true },
    ],
    CUOI_CA: [
      { code: "TONG_KET_CA", label: "Tổng kết ca", required: true },
      { code: "KIEM_TRA_CHOT_SO", label: "Kiểm tra chốt số", required: true },
      { code: "GHI_CHU_BAN_GIAO", label: "Ghi chú bàn giao ca sau", required: true },
    ],
  },
};

export const buildChecklistRecordKey = (maNhanVien, ngay, caDuKien, loaiChecklist) => {
  const shift = normalizeAttendanceShiftCode(caDuKien);
  const type = String(loaiChecklist || "").trim().toUpperCase();
  return `${String(maNhanVien || "").trim()}|${normalizeAttendanceDateKey(ngay)}|${shift}|${type}`;
};

export const normalizeChecklistType = (value) => {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "DAU_CA" || raw.includes("DAU")) return "DAU_CA";
  if (raw === "CUOI_CA" || raw.includes("CUOI")) return "CUOI_CA";
  return "";
};

export const getChecklistTemplate = (roleCode, checklistType) => {
  const role = String(roleCode || "").trim().toUpperCase();
  const type = normalizeChecklistType(checklistType);
  if (!role || !type) return [];
  return (SHIFT_CHECKLIST_TEMPLATES[role]?.[type] || []).map((item) => ({ ...item }));
};

export const supportsShiftChecklist = (staff = {}) => {
  const role = inferStaffRole(staff);
  return CHECKLIST_SUPPORTED_ROLES.includes(role);
};

export const mergeChecklistItems = (template = [], savedItems = []) => {
  const savedMap = new Map(
    (Array.isArray(savedItems) ? savedItems : []).map((item) => [
      String(item?.code || "").trim(),
      Boolean(item?.checked),
    ]),
  );
  return template.map((item) => ({
    ...item,
    checked: savedMap.has(item.code) ? savedMap.get(item.code) : false,
  }));
};

export const parseChecklistItemsJson = (value) => {
  if (Array.isArray(value)) return value;
  const raw = String(value || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
};

export const serializeChecklistItems = (items = []) =>
  JSON.stringify(
    (Array.isArray(items) ? items : []).map((item) => ({
      code: String(item?.code || "").trim(),
      label: String(item?.label || "").trim(),
      checked: Boolean(item?.checked),
      required: item?.required !== false,
    })),
  );

export const calculateChecklistProgress = (items = []) => {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return { total: 0, checked: 0, required: 0, requiredChecked: 0, percent: 0 };
  const requiredItems = list.filter((item) => item?.required !== false);
  const checked = list.filter((item) => item?.checked).length;
  const requiredChecked = requiredItems.filter((item) => item?.checked).length;
  const total = list.length;
  const required = requiredItems.length;
  const percent = required > 0 ? (requiredChecked / required) * 100 : checked > 0 ? 100 : 0;
  return { total, checked, required, requiredChecked, percent };
};

export const resolveChecklistCompletionStatus = (items = []) => {
  const progress = calculateChecklistProgress(items);
  if (!progress.total) return "Chưa có mẫu";
  if (progress.required > 0 && progress.requiredChecked >= progress.required) return "Hoàn thành";
  if (progress.checked > 0) return "Đang làm";
  return "Chưa làm";
};

export const validateChecklistSave = (payload = {}, staff = {}) => {
  const maNhanVien = String(payload?.maNhanVien || staff?.maNhanVien || "").trim();
  const ngay = normalizeAttendanceDateKey(payload?.ngay);
  const caDuKien = normalizeAttendanceShiftCode(payload?.caDuKien);
  const loaiChecklist = normalizeChecklistType(payload?.loaiChecklist);
  if (!maNhanVien) return { ok: false, message: "Chọn nhân viên thực hiện checklist." };
  if (!ngay) return { ok: false, message: "Ngày checklist không hợp lệ." };
  if (!caDuKien) return { ok: false, message: "Chọn ca làm việc." };
  if (!loaiChecklist) return { ok: false, message: "Chọn loại checklist đầu ca / cuối ca." };
  const role = inferStaffRole(staff);
  if (!CHECKLIST_SUPPORTED_ROLES.includes(role)) {
    return { ok: false, message: "Vai trò nhân viên chưa có checklist vận hành." };
  }
  const template = getChecklistTemplate(role, loaiChecklist);
  const items = mergeChecklistItems(template, payload?.items);
  const progress = calculateChecklistProgress(items);
  if (progress.required > 0 && progress.requiredChecked < progress.required) {
    return {
      ok: false,
      message: "Cần tick đủ các mục bắt buộc trước khi lưu checklist.",
    };
  }
  return {
    ok: true,
    data: {
      maNhanVien,
      ngay,
      caDuKien,
      loaiChecklist,
      chucVu: role,
      items,
      itemsJson: serializeChecklistItems(items),
      ghiChu: String(payload?.ghiChu || "").trim(),
    },
  };
};

export const resolveChecklistItemsForRecord = (record = {}, staff = null) => {
  const role = String(record?.chucVu || inferStaffRole(staff) || "").trim().toUpperCase();
  const template = getChecklistTemplate(role, record?.loaiChecklist);
  return mergeChecklistItems(template, parseChecklistItemsJson(record?.itemsJson));
};

export const buildDailyChecklistSummary = (records = [], dateKey = "", staffs = []) => {
  const ngay = normalizeAttendanceDateKey(dateKey);
  const staffList = Array.isArray(staffs) ? staffs : [];
  const rows = (Array.isArray(records) ? records : []).filter(
    (record) => normalizeAttendanceDateKey(record?.ngay) === ngay,
  );
  let completed = 0;
  let partial = 0;
  rows.forEach((record) => {
    const staff = staffList.find(
      (item) => String(item?.maNhanVien || "").trim() === String(record?.maNhanVien || "").trim(),
    );
    const items = resolveChecklistItemsForRecord(record, staff);
    const status = resolveChecklistCompletionStatus(items);
    if (status === "Hoàn thành") completed += 1;
    else if (status === "Đang làm") partial += 1;
  });
  return {
    total: rows.length,
    completed,
    partial,
    pending: Math.max(rows.length - completed - partial, 0),
  };
};
