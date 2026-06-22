import { toLocalDateTimeString, toVnDateTimeString } from "../../utils/dateFormatter";

export const STAFF_ROLE_OPTIONS = [
  { value: "GIAM_DOC", label: "Giám đốc" },
  { value: "TRO_LY_GIAM_DOC", label: "Trợ lý giám đốc" },
  { value: "LE_TAN", label: "Lễ tân" },
  { value: "TU_VAN", label: "Tư vấn" },
  { value: "KTV", label: "Kỹ thuật viên" },
  { value: "QUAN_LY", label: "Quản lý" },
  { value: "CSKH", label: "CSKH" },
  { value: "CTV_MARKETING", label: "CTV Marketing" },
  { value: "NHAN_VIEN", label: "Nhân viên" },
  { value: "CHUYEN_GIA", label: "Chuyên gia" },
];

export const STAFF_STATUS_OPTIONS = [
  "Thử việc",
  "Đào tạo",
  "Đang làm việc",
  "Nghỉ phép",
  "Tạm ngưng",
  "Nghỉ việc",
];

export const STAFF_SHIFT_DEFINITIONS = [
  { code: "SANG", label: "Ca sáng", fromMinute: 10 * 60, toMinute: 14 * 60 },
  { code: "CHIEU", label: "Ca chiều", fromMinute: 14 * 60, toMinute: 18 * 60 },
  { code: "TOI", label: "Ca tối", fromMinute: 18 * 60, toMinute: 22 * 60 },
];

export const ATTENDANCE_STATUS = {
  NOT_RECORDED: "Chưa chấm",
  IN_PROGRESS: "Đang làm",
  COMPLETED: "Đã ra ca",
  ABSENT: "Vắng",
};

const pad2 = (n) => String(n).padStart(2, "0");

/** Hiển thị số theo chuẩn VN: 8000 → 8.000 */
export const formatVnNumber = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const num = Number(raw.replace(/\./g, "").replace(/,/g, ""));
  if (!Number.isFinite(num)) return raw;
  return num.toLocaleString("vi-VN");
};

/** Parse chuỗi có dấu chấm nghìn → số */
export const parseVnNumber = (value) => {
  const raw = String(value ?? "")
    .replace(/\./g, "")
    .replace(/,/g, "")
    .trim();
  if (!raw) return "";
  const num = Number(raw);
  return Number.isFinite(num) ? num : "";
};

/** Hiển thị/lưu ngày dạng dd/MM/yyyy (không timezone) */
export const formatStaffDateDisplay = (value) => {
  const key = normalizeAttendanceDateKey(value);
  if (!key) return "";
  const [y, m, d] = key.split("-");
  return `${d}/${m}/${y}`;
};

export const formatStaffDateStorage = (value) => formatStaffDateDisplay(value);

export const todayStaffDateKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
};

export const toStaffDateInputValue = (value) => normalizeAttendanceDateKey(value);

export const normalizeAttendanceDateKey = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const vn = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (vn) {
    const d = Number(vn[1]);
    const m = Number(vn[2]);
    const y = Number(vn[3]);
    if (!d || !m || !y) return "";
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;
};

export const normalizeAttendanceShiftCode = (value) => {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";
  if (raw === "SANG" || raw.includes("SANG")) return "SANG";
  if (raw === "CHIEU" || raw.includes("CHIEU")) return "CHIEU";
  if (raw === "TOI" || raw.includes("TOI")) return "TOI";
  return "";
};

export const buildAttendanceRecordKey = (maNhanVien, ngay, caDuKien = "") => {
  const shift = normalizeAttendanceShiftCode(caDuKien);
  return `${String(maNhanVien || "").trim()}|${normalizeAttendanceDateKey(ngay)}|${shift}`;
};

export const getAttendanceShiftLabel = (shiftCode) =>
  STAFF_SHIFT_DEFINITIONS.find((shift) => shift.code === shiftCode)?.label || shiftCode || "Ca trong ngày";

const attendanceShiftSortOrder = (shiftCode) => {
  const order = { SANG: 1, CHIEU: 2, TOI: 3 };
  return order[shiftCode] || 99;
};

export const findAttendanceRecordForShift = (records = [], shiftCode = "") => {
  const shift = normalizeAttendanceShiftCode(shiftCode);
  const exact = records.find(
    (record) => normalizeAttendanceShiftCode(record?.caDuKien) === shift,
  );
  if (exact) return exact;
  if (!shift) {
    return (
      records.find((record) => !normalizeAttendanceShiftCode(record?.caDuKien)) || null
    );
  }
  const legacy = records.find((record) => {
    const parts = String(record?.caDuKien || "")
      .split(/[,;|]+/)
      .map((item) => normalizeAttendanceShiftCode(item))
      .filter(Boolean);
    return parts.length > 1 && parts.includes(shift);
  });
  return legacy || null;
};

export const buildAttendanceShiftSlots = (
  staffCode,
  dateKey,
  scheduleRows = [],
  attendanceRows = [],
  defaultShiftCodes = [],
) => {
  const code = String(staffCode || "").trim();
  const ngay = normalizeAttendanceDateKey(dateKey);
  if (!code || !ngay) return [];

  const scheduleRow = scheduleRows.find(
    (item) => normalizeAttendanceDateKey(item?.ngay) === ngay,
  );
  const hasScheduleRow = Boolean(scheduleRow);
  const expected = inferStaffExpectedShiftsFromSchedule(code, ngay, scheduleRows);
  const recordsForStaff = attendanceRows.filter(
    (record) =>
      String(record?.maNhanVien || "").trim() === code &&
      normalizeAttendanceDateKey(record?.ngay) === ngay,
  );
  const shiftsFromRecords = recordsForStaff
    .map((record) => normalizeAttendanceShiftCode(record?.caDuKien))
    .filter(Boolean);
  const catalogDefaults = (Array.isArray(defaultShiftCodes) ? defaultShiftCodes : [])
    .map((item) => normalizeAttendanceShiftCode(item))
    .filter(Boolean);

  let shiftCodes;
  if (hasScheduleRow) {
    shiftCodes =
      expected.length > 0
        ? [...new Set([...expected, ...shiftsFromRecords])]
        : shiftsFromRecords.length > 0
          ? [...new Set(shiftsFromRecords)]
          : [];
  } else if (shiftsFromRecords.length > 0) {
    shiftCodes = [...new Set(shiftsFromRecords)];
  } else if (scheduleRows.length > 0) {
    // Đã có module lịch ca: không fallback ca mặc định từ hồ sơ nhân viên.
    shiftCodes = [];
  } else if (catalogDefaults.length > 0) {
    shiftCodes = [...new Set(catalogDefaults)];
  } else {
    shiftCodes = [];
  }

  shiftCodes.sort(
    (a, b) => attendanceShiftSortOrder(a) - attendanceShiftSortOrder(b),
  );

  return shiftCodes.map((shiftCode) => {
    const record = findAttendanceRecordForShift(recordsForStaff, shiftCode);
    return {
      shiftCode,
      shiftLabel: getAttendanceShiftLabel(shiftCode),
      record,
      status: resolveAttendanceDisplayStatus(record),
      recordKey: buildAttendanceRecordKey(code, ngay, shiftCode),
    };
  });
};

export const scheduleCsvIncludesStaffCode = (csv, staffCode) => {
  const code = String(staffCode || "").trim();
  if (!code) return false;
  return String(csv || "")
    .split(",")
    .map((item) => item.trim())
    .includes(code);
};

export const inferStaffExpectedShiftsFromSchedule = (staffCode, dateKey, scheduleRows = []) => {
  const code = String(staffCode || "").trim();
  const ngay = normalizeAttendanceDateKey(dateKey);
  if (!code || !ngay) return [];
  const row = scheduleRows.find((item) => normalizeAttendanceDateKey(item?.ngay) === ngay);
  if (!row) return [];
  const shifts = [];
  if (scheduleCsvIncludesStaffCode(row.caSang, code)) shifts.push("SANG");
  if (scheduleCsvIncludesStaffCode(row.caChieu, code)) shifts.push("CHIEU");
  if (scheduleCsvIncludesStaffCode(row.caToi, code)) shifts.push("TOI");
  return shifts;
};

export const formatExpectedShiftLabel = (shiftCodes = []) => {
  if (!shiftCodes.length) return "Không có ca";
  return shiftCodes
    .map((code) => STAFF_SHIFT_DEFINITIONS.find((shift) => shift.code === code)?.label || code)
    .join(", ");
};

export const resolveAttendanceDisplayStatus = (record = null) => {
  const explicit = String(record?.trangThai || "").trim();
  if (explicit) return explicit;
  if (String(record?.checkOutAt || "").trim()) return ATTENDANCE_STATUS.COMPLETED;
  if (String(record?.checkInAt || "").trim()) return ATTENDANCE_STATUS.IN_PROGRESS;
  return ATTENDANCE_STATUS.NOT_RECORDED;
};

export const isRetiredStaffStatus = (value) => {
  const normalized = normalizeLookup(value);
  return normalized.includes("nghi viec") || normalized.includes("ngung lam viec");
};

export const validateAttendanceAction = (action, record = null) => {
  const normalizedAction = String(action || "").trim().toUpperCase();
  const status = resolveAttendanceDisplayStatus(record);
  const hasCheckIn = Boolean(String(record?.checkInAt || "").trim());
  const hasCheckOut = Boolean(String(record?.checkOutAt || "").trim());

  if (normalizedAction === "CHECK_IN") {
    if (status === ATTENDANCE_STATUS.ABSENT) {
      return { ok: false, message: "Nhân viên đã được đánh dấu vắng trong ngày này." };
    }
    if (hasCheckIn && !hasCheckOut) {
      return { ok: false, message: "Nhân viên đang trong ca, chưa check-out." };
    }
    if (hasCheckOut) {
      return { ok: false, message: "Nhân viên đã hoàn thành ca trong ngày này." };
    }
    return { ok: true };
  }

  if (normalizedAction === "CHECK_OUT") {
    if (!hasCheckIn) return { ok: false, message: "Nhân viên chưa check-in." };
    if (hasCheckOut) return { ok: false, message: "Nhân viên đã check-out." };
    return { ok: true };
  }

  if (normalizedAction === "MARK_ABSENT") {
    if (hasCheckIn) return { ok: false, message: "Nhân viên đã check-in, không thể đánh dấu vắng." };
    if (status === ATTENDANCE_STATUS.ABSENT) {
      return { ok: false, message: "Nhân viên đã được đánh dấu vắng." };
    }
    return { ok: true };
  }

  if (normalizedAction === "CLEAR_ABSENT") {
    if (status !== ATTENDANCE_STATUS.ABSENT) {
      return { ok: false, message: "Chỉ hủy được khi ca đang đánh dấu vắng." };
    }
    if (hasCheckIn || hasCheckOut) {
      return { ok: false, message: "Ca đã có dữ liệu chấm công, không thể hủy vắng." };
    }
    return { ok: true };
  }

  if (normalizedAction === "UPDATE_NOTE") {
    return { ok: true };
  }

  if (normalizedAction === "UPDATE_TIMES") {
    return { ok: true };
  }

  return { ok: false, message: "Thao tác chấm công không hợp lệ." };
};

export const getAttendanceButtonState = (record = null) => ({
  checkIn: validateAttendanceAction("CHECK_IN", record),
  checkOut: validateAttendanceAction("CHECK_OUT", record),
  markAbsent: validateAttendanceAction("MARK_ABSENT", record),
  clearAbsent: validateAttendanceAction("CLEAR_ABSENT", record),
  updateNote: validateAttendanceAction("UPDATE_NOTE", record),
});

/** Vai trò được gán vào phiên trị liệu trên create-order */
export const SESSION_STAFF_ROLE_CODES = ["KTV", "CHUYEN_GIA"];

const normalizeLookup = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");

const normalizeRole = (value) => {
  const raw = normalizeLookup(value);
  if (!raw) return "";
  if (raw.includes("giam doc")) return "GIAM_DOC";
  if (raw.includes("tro ly giam doc")) return "TRO_LY_GIAM_DOC";
  if (raw.includes("le tan") || raw === "lt") return "LE_TAN";
  if (raw.includes("tu van") || raw === "tv") return "TU_VAN";
  if (raw.includes("ctv marketing") || raw.includes("cong tac vien marketing")) return "CTV_MARKETING";
  if (raw.includes("cskh")) return "CSKH";
  if (raw.includes("chuyen gia") || raw === "cg") return "CHUYEN_GIA";
  if (raw.includes("nhan vien") || raw === "nv") return "NHAN_VIEN";
  if (raw.includes("ky thuat vien") || raw.includes("ktv")) return "KTV";
  if (raw.includes("quan ly") || raw === "ql") return "QUAN_LY";
  return String(value || "").trim().toUpperCase();
};

export const inferStaffRole = (staff = {}) => {
  const explicit = normalizeRole(staff?.chucVu || "");
  if (explicit) return explicit;
  const note = normalizeLookup(staff?.ghiChu || "");
  if (note.includes("giam doc")) return "GIAM_DOC";
  if (note.includes("tro ly giam doc")) return "TRO_LY_GIAM_DOC";
  if (note.includes("le tan") || note.includes("lt")) return "LE_TAN";
  if (note.includes("tu van") || note.includes("tv")) return "TU_VAN";
  if (note.includes("ctv marketing") || note.includes("cong tac vien marketing")) return "CTV_MARKETING";
  if (note.includes("cskh")) return "CSKH";
  if (note.includes("chuyen gia")) return "CHUYEN_GIA";
  if (note.includes("nhan vien")) return "NHAN_VIEN";
  if (note.includes("ky thuat vien") || note.includes("ktv") || note.includes("dieu phoi")) return "KTV";
  if (note.includes("quan ly") || note.includes("ql")) return "QUAN_LY";
  return "";
};

export const getStaffRoleLabel = (codeOrStaff) => {
  const key =
    typeof codeOrStaff === "object" && codeOrStaff !== null
      ? inferStaffRole(codeOrStaff)
      : normalizeRole(codeOrStaff);
  if (!key) return "Chưa gán vai trò";
  return STAFF_ROLE_OPTIONS.find((item) => item.value === key)?.label || key;
};

export const getStaffCatalogStatus = (staff = {}) =>
  String(staff?.trangThai || staff?.trangThaiNhanVien || "").trim();

/** Chuẩn hóa trạng thái legacy (vd. Ngưng làm việc → Nghỉ việc) cho lọc/hiển thị */
export const normalizeStaffCatalogStatus = (value) => {
  const raw = String(value || "").trim();
  const normalized = normalizeLookup(raw);
  if (!normalized) return "";
  if (normalized.includes("ngung lam viec") || normalized.includes("nghi viec")) return "Nghỉ việc";
  if (normalized.includes("tam ngung")) return "Tạm ngưng";
  if (normalized.includes("nghi phep")) return "Nghỉ phép";
  if (normalized.includes("thu viec")) return "Thử việc";
  if (normalized.includes("dao tao")) return "Đào tạo";
  if (normalized.includes("dang lam")) return "Đang làm việc";
  return raw;
};

export const matchesStaffStatusFilter = (staff = {}, statusFilter = "ALL") => {
  if (statusFilter === "ALL") return true;
  const status = getStaffCatalogStatus(staff);
  return (
    status === statusFilter ||
    normalizeStaffCatalogStatus(status) === statusFilter ||
    normalizeStaffCatalogStatus(statusFilter) === normalizeStaffCatalogStatus(status)
  );
};

export const isBlockingStaffStatus = (value) => {
  const normalized = normalizeLookup(value);
  if (!normalized) return false;
  if (normalized === "offline") return true;
  if (normalized.includes("nghi viec") || normalized.includes("ngung lam viec")) return true;
  if (normalized.includes("tam ngung") || normalized.includes("nghi phep")) return true;
  if (normalized.includes("ngung lam")) return true;
  return false;
};

export const isWorkingStaffStatus = (value) => {
  const normalized = normalizeLookup(value);
  if (!normalized) return false;
  return (
    normalized === "dang lam viec" ||
    normalized === "thu viec" ||
    normalized === "dao tao" ||
    normalized.includes("dang lam") ||
    normalized.includes("hoat dong")
  );
};

export const canAssignStaffToSession = (staff = {}) => {
  const role = inferStaffRole(staff);
  return Boolean(role && SESSION_STAFF_ROLE_CODES.includes(role));
};

export const formatStaffShiftLabel = (caLamViec = "", staffShiftDefinitions = STAFF_SHIFT_DEFINITIONS) => {
  const codes = String(caLamViec || "")
    .split(/[,;|]+/)
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
  if (!codes.length) return "Chưa gán ca";
  return codes
    .map((code) => staffShiftDefinitions.find((shift) => shift.code === code)?.label || code)
    .join(", ");
};

export const suggestNextStaffCode = (staffs = []) => {
  let max = 0;
  staffs.forEach((staff) => {
    const match = String(staff.maNhanVien || "").match(/NV(\d+)/i);
    if (match) max = Math.max(max, Number(match[1]));
  });
  return `NV${String(max + 1).padStart(6, "0")}`;
};

export const buildStaffForm = (staff = {}, staffs = [], options = {}) => {
  const shifts = new Set(
    String(staff.caLamViec || "")
      .split(/[,;|]+/)
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean),
  );
  const joinDate = toStaffDateInputValue(staff.ngayVaoLam);
  return {
    maNhanVien: String(staff.maNhanVien || "").trim() || suggestNextStaffCode(staffs),
    tenNhanVien: String(staff.tenNhanVien || "").trim(),
    chucVu: inferStaffRole(staff) || normalizeRole(staff.chucVu || ""),
    soDienThoai: String(staff.soDienThoai || "").trim(),
    ngayVaoLam: joinDate || (options.isNew ? todayStaffDateKey() : ""),
    trangThai: String(staff.trangThai || STAFF_STATUS_OPTIONS[2]).trim(),
    shiftSang: shifts.has("SANG"),
    shiftChieu: shifts.has("CHIEU"),
    shiftToi: shifts.has("TOI"),
    ghiChu: String(staff.ghiChu || "").trim(),
    luongCoBanThang:
      staff.luongCoBanThang === "" || staff.luongCoBanThang === undefined
        ? ""
        : formatVnNumber(staff.luongCoBanThang),
    tyLeThuongDichVu: String(staff.tyLeThuongDichVu ?? "").trim(),
  };
};

const attendanceNowVn = () => toVnDateTimeString(new Date());
const attendanceNowTimeVn = () => {
  const d = new Date();
  const pad = (n) => String(n).length < 2 ? '0' + n : n;
  return pad(d.getHours()) + ":" + pad(d.getMinutes());
};

export const buildOptimisticAttendanceRecord = (action, payload = {}, existing = null) => {
  const normalizedAction = String(action || "").trim().toUpperCase();
  const maNhanVien = String(payload.maNhanVien || "").trim();
  const ngay = normalizeAttendanceDateKey(payload.ngay);
  const caDuKien = normalizeAttendanceShiftCode(payload.caDuKien);
  const nowVn = attendanceNowVn();
  const nowTime = attendanceNowTimeVn();
  const base = {
    maNhanVien,
    ngay,
    caDuKien,
    checkInAt: String(existing?.checkInAt || "").trim(),
    checkOutAt: String(existing?.checkOutAt || "").trim(),
    trangThai: resolveAttendanceDisplayStatus(existing),
    ghiChu: String(payload.ghiChu ?? existing?.ghiChu ?? "").trim(),
    updatedAt: nowVn,
  };

  if (normalizedAction === "CHECK_IN") {
    base.checkInAt = nowTime;
    base.checkOutAt = "";
    base.trangThai = ATTENDANCE_STATUS.IN_PROGRESS;
  } else if (normalizedAction === "CHECK_OUT") {
    base.checkOutAt = nowTime;
    base.trangThai = ATTENDANCE_STATUS.COMPLETED;
  } else if (normalizedAction === "MARK_ABSENT") {
    base.checkInAt = "";
    base.checkOutAt = "";
    base.trangThai = ATTENDANCE_STATUS.ABSENT;
  } else if (normalizedAction === "CLEAR_ABSENT") {
    base.checkInAt = "";
    base.checkOutAt = "";
    base.trangThai = ATTENDANCE_STATUS.NOT_RECORDED;
  } else if (normalizedAction === "UPDATE_NOTE") {
    base.ghiChu = String(payload.ghiChu ?? "").trim();
  } else if (normalizedAction === "UPDATE_TIMES") {
    if (payload.checkInAt !== undefined) base.checkInAt = String(payload.checkInAt).trim();
    if (payload.checkOutAt !== undefined) base.checkOutAt = String(payload.checkOutAt).trim();
    if (payload.trangThai !== undefined) base.trangThai = String(payload.trangThai).trim();
    if (payload.ghiChu !== undefined) base.ghiChu = String(payload.ghiChu).trim();
  }

  return base;
};

export const upsertAttendanceRows = (rows = [], nextRecord = null) => {
  if (!nextRecord?.maNhanVien || !nextRecord?.ngay) return rows;
  const key = buildAttendanceRecordKey(
    nextRecord.maNhanVien,
    nextRecord.ngay,
    nextRecord.caDuKien,
  );
  const list = [...rows];
  const index = list.findIndex(
    (row) =>
      buildAttendanceRecordKey(row.maNhanVien, row.ngay, row.caDuKien) === key,
  );
  if (index >= 0) list[index] = { ...list[index], ...nextRecord };
  else list.push(nextRecord);
  return list;
};

export const normalizeStaffPayload = (form = {}) => ({
  maNhanVien: String(form.maNhanVien || "").trim(),
  tenNhanVien: String(form.tenNhanVien || "").trim(),
  chucVu: normalizeRole(form.chucVu || ""),
  soDienThoai: String(form.soDienThoai || "").trim(),
  ngayVaoLam: formatStaffDateStorage(form.ngayVaoLam),
  trangThai: String(form.trangThai || STAFF_STATUS_OPTIONS[2]).trim(),
  caLamViec: [
    form.shiftSang ? "SANG" : "",
    form.shiftChieu ? "CHIEU" : "",
    form.shiftToi ? "TOI" : "",
  ]
    .filter(Boolean)
    .join(","),
  ghiChu: String(form.ghiChu || "").trim(),
  luongCoBanThang: Math.max(Number(parseVnNumber(form.luongCoBanThang) || 0), 0),
  tyLeThuongDichVu:
    String(form.tyLeThuongDichVu ?? "").trim() === ""
      ? ""
      : Math.min(Math.max(Number(form.tyLeThuongDichVu || 0), 0), 100),
});
