import {
  STAFF_SHIFT_DEFINITIONS,
  normalizeAttendanceDateKey,
  scheduleCsvIncludesStaffCode,
} from "./staffConstants";

const pad2 = (n) => String(n).padStart(2, "0");

// Parse VN datetime "HH:mm DD/MM/YYYY" to Date object
const parseVnDateTime = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const date = new Date(parseInt(m[5]), parseInt(m[4]) - 1, parseInt(m[3]), parseInt(m[1]), parseInt(m[2]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const DEFAULT_STAFF_SHIFT_CODES = STAFF_SHIFT_DEFINITIONS.map((shift) => shift.code);

const parseStaffDefaultShiftCodes = (caLamViec = "") =>
  Array.from(
    new Set(
      String(caLamViec || "")
        .split(/[,;|]+/)
        .map((item) => String(item || "").trim().toUpperCase())
        .filter((code) =>
          STAFF_SHIFT_DEFINITIONS.some((shift) => shift.code === code),
        ),
    ),
  );

export const findScheduleRowForDate = (scheduleRows = [], dateKey) => {
  const ngay = normalizeAttendanceDateKey(dateKey);
  if (!ngay) return null;
  return (
    scheduleRows.find((item) => normalizeAttendanceDateKey(item?.ngay) === ngay) || null
  );
};

export const hasScheduleRowForDate = (scheduleRows = [], dateKey) =>
  Boolean(findScheduleRowForDate(scheduleRows, dateKey));

const toDateKeyFromIso = (dateIso) => {
  if (!dateIso) {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  }
  return normalizeAttendanceDateKey(dateIso);
};

export const getStaffShiftCodesForDate = (staff = {}, scheduleRows = [], dateIso = null) => {
  const staffCode = String(staff?.maNhanVien || "").trim();
  const targetDateKey = toDateKeyFromIso(dateIso);
  const daySchedule = findScheduleRowForDate(scheduleRows, targetDateKey);
  const defaultShiftCodes = parseStaffDefaultShiftCodes(staff?.caLamViec);

  if (!staffCode) {
    return defaultShiftCodes.length ? defaultShiftCodes : DEFAULT_STAFF_SHIFT_CODES;
  }

  if (!daySchedule) {
    return defaultShiftCodes.length ? defaultShiftCodes : DEFAULT_STAFF_SHIFT_CODES;
  }

  const shifts = [];
  if (scheduleCsvIncludesStaffCode(daySchedule.caSang, staffCode)) shifts.push("SANG");
  if (scheduleCsvIncludesStaffCode(daySchedule.caChieu, staffCode)) shifts.push("CHIEU");
  if (scheduleCsvIncludesStaffCode(daySchedule.caToi, staffCode)) shifts.push("TOI");
  return shifts;
};

const getShiftDefinitionByCode = (code) =>
  STAFF_SHIFT_DEFINITIONS.find(
    (shift) => shift.code === String(code || "").trim().toUpperCase(),
  ) || null;

export const getStaffShiftLabelForDate = (staff = {}, scheduleRows = [], dateIso = null) => {
  const codes = getStaffShiftCodesForDate(staff, scheduleRows, dateIso);
  if (!codes.length) return "Nghỉ";
  return codes.map((code) => getShiftDefinitionByCode(code)?.label || code).join(", ");
};

const getMinuteOfDay = (value) => {
  const d = parseVnDateTime(value);
  if (!d) return null;
  return d.getHours() * 60 + d.getMinutes();
};

const isSameLocalDate = (a, b) => {
  const da = parseVnDateTime(a);
  const db = parseVnDateTime(b);
  if (!da || !db) return false;
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
};

const getShiftCodeByMinuteOfDay = (minute) => {
  if (!Number.isFinite(minute) || minute < 0) return null;
  if (minute < 14 * 60) return "SANG";
  if (minute < 18 * 60) return "CHIEU";
  return "TOI";
};

export const getStaffShiftViolation = (staff, startIso, endIso, scheduleRows = []) => {
  if (!staff || !String(staff.maNhanVien || "").trim()) return null;
  const startMinute = getMinuteOfDay(startIso);
  const endMinute = getMinuteOfDay(endIso);
  if (startMinute == null || endMinute == null || endMinute <= startMinute) return null;
  if (!isSameLocalDate(startIso, endIso)) {
    return {
      message: "Lịch làm việc nhân viên không hỗ trợ phiên qua ngày.",
      allowedLabel: getStaffShiftLabelForDate(staff, scheduleRows, startIso),
    };
  }
  const staffShiftCodes = getStaffShiftCodesForDate(staff, scheduleRows, startIso);
  const allowed = staffShiftCodes.map(getShiftDefinitionByCode).filter(Boolean);
  const activeShiftCode = getShiftCodeByMinuteOfDay(startMinute);

  if (activeShiftCode && staffShiftCodes.includes(activeShiftCode)) return null;

  const allowedLabelText = allowed.length
    ? allowed
        .map(
          (shift) =>
            `${shift.label} ${pad2(Math.floor(shift.fromMinute / 60))}:00-${pad2(Math.floor(shift.toMinute / 60))}:00`,
        )
        .join(", ")
    : "Nghỉ cả ngày";

  return {
    message: `Nhân viên không có ca làm trong buổi ${getShiftDefinitionByCode(activeShiftCode)?.label?.toLowerCase() || "đã chọn"}.`,
    allowedLabel: allowedLabelText,
  };
};
