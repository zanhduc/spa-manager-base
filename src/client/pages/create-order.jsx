import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { toVnDateTimeString, parseLocalString } from "../utils/dateFormatter";
import { History, Calendar } from "lucide-react";
import MultiDatePicker from "../components/MultiDatePicker";
import { CustomDropdown } from "../components/CustomDropdown";
import { useConfirm } from "../components/ConfirmDialog";
import {
  CACHE_INVALIDATED_EVENT,
  CACHE_KEYS,
  CACHE_UPDATED_EVENT,
  clearReadCacheByKeys,
  addTreatmentServiceItem,
  createSpaBookingWithItems,
  startTreatmentSessionWithItems,
  completeTreatmentSession,
  createTreatmentBed,
  deleteTreatmentBed,
  getCustomerCatalog,
  getProductCatalog,
  getSpaStaff,
  getTreatmentBeds,
  getTreatmentHistory,
  getTreatmentPackages,
  updateRoomStatus,
  updateTreatmentBed,
  updateTreatmentServiceItem,
  deleteTreatmentServiceItem,
  markTreatmentNoShow,
  logAction,
  updateTreatmentSessionTime,
  getSpaStaffSchedules,
  getBankConfig,
} from "../api";
import { readCache } from "../api/localCache.js";
import { mergeTreatmentSessionPatch } from "../api/spaCheckoutCacheHelpers.js";
import { useCachedQuery } from "../hooks/useCachedQuery.js";
import { useCacheSync } from "../hooks/useCacheSync.js";
import {
  hasCachedResponse,
  readCachedList,
  shouldBlockPanelUI,
} from "../utils/cacheBootstrap.js";
import {
  clearFormDraft,
  FORM_DRAFT_KEYS,
  readFormDraft,
  writeFormDraft,
} from "../utils/formDraftCache.js";
import { validateSessionScheduleConflicts } from "../utils/sessionScheduleValidators.js";
import {
  buildTimelineDays,
  buildTimelineRows,
  doesStayOverlapWindow,
  formatTimeOnly,
  getTimelineBlockMetrics,
  getTimelineNowMarker,
  prepareCanonicalTimelineStays,
} from "./create-order.timeline";
import {
  canAssignStaffToSession,
  getStaffCatalogStatus,
  getStaffRoleLabel,
  isBlockingStaffStatus,
} from "../components/staff/staffConstants";
import {
  getStaffShiftLabelForDate,
  getStaffShiftViolation,
} from "../components/staff/staffScheduleHelpers";
import { TimelineWorkspace } from "../components/create-order.timeline-view.jsx";
import {
  prepareCheckoutQrExperience,
  syncCheckoutQrToOxuPopup,
} from "../utils/checkoutQrOxu";
import { primeOxuBridgePopupSync } from "../utils/oxuSerial";

const mapActiveCatalogItems = (items) =>
  (Array.isArray(items) ? items : [])
    .map((item, idx) => ({
      ...item,
      maSanPham:
        String(item?.maSanPham || "").trim() ||
        `SP${String(idx + 1).padStart(4, "0")}`,
    }))
    .filter((x) => String(x.active ?? true) !== "false");

const hasCreateOrderBootstrap = () =>
  hasCachedResponse(CACHE_KEYS.stayHistory) ||
  hasCachedResponse(CACHE_KEYS.rooms) ||
  hasCachedResponse(CACHE_KEYS.staffCatalog) ||
  hasCachedResponse(CACHE_KEYS.productCatalog);

const ROOM_STATUS = {
  AVAILABLE: "Sẵn sàng",
  IN_HOUSE: "Đang trị liệu",
  CLEANING: "Đang tạm dừng",

  MAINTENANCE: "Ngưng sử dụng",
};

const STATUS_OPTIONS = [
  ROOM_STATUS.AVAILABLE,
  ROOM_STATUS.IN_HOUSE,
  ROOM_STATUS.CLEANING,
  ROOM_STATUS.MAINTENANCE,
];

const fmt = (n) => Number(n || 0).toLocaleString("vi-VN");
const pad2 = (n) => String(n).padStart(2, "0");
const WEEKDAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

// Parse VN datetime "HH:mm DD/MM/YYYY" to milliseconds
const parseVnDateTimeMs = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const m = raw.match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    return new Date(parseInt(m[5]), parseInt(m[4]) - 1, parseInt(m[3]), parseInt(m[1]), parseInt(m[2])).getTime();
  }
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d.getTime() : 0;
};

// Get date part "YYYY-MM-DD" from VN datetime "HH:mm DD/MM/YYYY"
const getDatePartFromVnDateTime = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const m = raw.match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const d = m[3].padStart(2, "0");
    const mo = m[4].padStart(2, "0");
    const y = m[5];
    return `${y}-${mo}-${d}`;
  }
  return raw.slice(0, 10); // fallback
};

const toDateKey = (value) => {
  const ms = parseVnDateTimeMs(value);
  if (!ms) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const normalizeScheduleDateKey = (value) => {
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
  return toDateKey(raw);
};
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
const addDays = (d, days) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
const weekRange = (date) => {
  const d = new Date(date);
  const day = d.getDay() || 7;
  const from = startOfDay(addDays(d, 1 - day));
  const to = endOfDay(addDays(from, 6));
  return { from, to };
};
const toHourLabel = (date) => `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
const clamp = (num, min, max) => Math.min(max, Math.max(min, num));
const TIMELINE_SLOT_HEIGHT = 44;
const ROOM_TIMELINE_PAGE_SIZE = 8;
const TIME_SEGMENTS = [
  { key: "night", icon: "🌙", title: "00:00 - 06:30", fromHour: 0, toHour: 6 },
  { key: "morning", icon: "☀️", title: "07:00 - 11:30", fromHour: 7, toHour: 11 },
  { key: "afternoon", icon: "🌤️", title: "12:00 - 18:30", fromHour: 12, toHour: 18 },
  { key: "evening", icon: "🌃", title: "19:00 - 23:30", fromHour: 19, toHour: 23 },
];
const BOOKING_CONFIRM_WINDOW_HOURS = 4;
const SESSION_STATUS = {
  BOOKED: "BOOKED",
  IN_HOUSE: "IN_HOUSE",
  CHECKED_OUT: "CHECKED_OUT",
  NO_SHOW: "NO_SHOW",
};
const SESSION_STATUS_LABELS = {
  BOOKED: "Đã hẹn trước",
  IN_HOUSE: "Đang trị liệu",
  CHECKED_OUT: "Đã kết thúc",
  NO_SHOW: "Không đến",
  CANCELLED: "Đã huỷ",
};
const getSessionStatusLabel = (status) =>
  SESSION_STATUS_LABELS[String(status || "").trim().toUpperCase()] || String(status || "").trim() || "Không rõ";
/**
 * Chuyển đổi Date object thành object { date, hour, minute } cho DateTimePicker
 */
const dateToPickerValue = (date) => {
  if (!date) return { date: "", hour: "00", minute: "00" };
  
  // Parse VN datetime "HH:mm DD/MM/YYYY"
  const raw = String(date).trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const hour = m[1].padStart(2, "0");
    const minute = m[2];
    const day = m[3].padStart(2, "0");
    const month = m[4].padStart(2, "0");
    const year = m[5];
    return { date: `${year}-${month}-${day}`, hour, minute };
  }
  
  // Fallback: standard Date parsing
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return { date: "", hour: "00", minute: "00" };
  const pad = (n) => String(n).padStart(2, "0");
  const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hour = pad(d.getHours());
  const minute = pad(d.getMinutes());
  return { date: dateStr, hour, minute };
};

/**
 * Chuyển đổi từ picker value sang ISO string
 */
const pickerValueToIso = (pickerValue) => {
  const { date, hour, minute } = pickerValue || {};
  if (!date) return "";
  const h = String(hour || "00").padStart(2, "0");
  const m = String(minute || "00").padStart(2, "0");
  const dateStr = `${String(date).slice(0, 10)}T${h}:${m}:00`;
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return "";
  return toVnDateTimeString(parsed);
};

/**
 * Tính số giờ/buổi giữa 2 thời điểm
 * Trả về { quantity, isValid, error }
 */
const calculateDuration = (checkinIso, checkoutIso, pricingType) => {
  const checkinDate = parseLocalString(checkinIso);
  const checkoutDate = parseLocalString(checkoutIso);
  const checkinMs = checkinDate?.getTime();
  const checkoutMs = checkoutDate?.getTime();
  
  if (!Number.isFinite(checkinMs) || !Number.isFinite(checkoutMs)) {
    return { quantity: 0, isValid: false, error: "Thời gian không hợp lệ" };
  }
  
  if (checkoutMs <= checkinMs) {
    return { quantity: 0, isValid: false, error: "Giờ kết thúc phải sau giờ bắt đầu" };
  }
  
  const diffMs = checkoutMs - checkinMs;
  const quantityMinutes = Math.max(Math.round(diffMs / 60000), 1);
  return {
    quantity: quantityMinutes,
    quantityMinutes,
    quantityHours: quantityMinutes / 60,
    displayLabel: formatDurationLabel(diffMs, pricingType),
    isValid: true,
    error: null,
  };
};

const toDisplayDate = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--/--/----";
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
};
const toWeekdayDateLabel = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  return `${WEEKDAY_LABELS[d.getDay()]} ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
};
const normalizePhone = (value) => String(value || "").replace(/[^\d]/g, "");
const normalizeCustomerName = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim();
const formatDurationLabel = (diffMs, pricingType) => {
  const totalMinutes = Math.max(Math.round(Number(diffMs || 0) / 60000), 0);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  if (pricingType === "THEO_BUOI") {
    const parts = [];
    if (days > 0) parts.push(`${days} ngày`);
    if (hours > 0) parts.push(`${hours} giờ`);
    if (minutes > 0 || parts.length === 0) parts.push(`${minutes} phút`);
    return parts.join(" ");
  }
  const parts = [];
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours > 0) parts.push(`${totalHours} giờ`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes} phút`);
  return parts.join(" ");
};
const getStayStartAt = (stay) => stay?.batDauAt || "";
const getStayExpectedEndAt = (stay) => stay?.ketThucDuKien || "";
const getStayActualEndAt = (stay) => stay?.ketThucThucTe || "";
const getStayEndAt = (stay) => getStayActualEndAt(stay) || getStayExpectedEndAt(stay) || "";

const safeTimeMs = (dateStr) => {
  if (!dateStr) return 0;
  const d = parseLocalString(dateStr);
  return d ? d.getTime() : 0;
};

const getStayDurationMinutes = (stay) => {
  const explicit = Math.max(Number(stay?.thoiLuongPhut || 0), 0);
  if (explicit > 0) return explicit;
  const startMs = new Date(getStayStartAt(stay)).getTime();
  const endMs = new Date(getStayEndAt(stay)).getTime();
  if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
    return Math.round((endMs - startMs) / 60000);
  }
  return 0;
};
const getStayExpectedEndMs = (stay) => new Date(getStayExpectedEndAt(stay) || "").getTime();
const getStayPackageAmount = (stay) =>
  Math.max(Number(stay?.tienGoi ?? 0), 0);
const getStayGrandTotal = (stay) =>
  Math.max(
    Number(
      stay?.tongThanhToan ??
        (getStayPackageAmount(stay) + Number(stay?.tienDichVu || 0)),
    ),
    0,
  );
const getStayStatus = (stay) => String(stay?.trangThaiPhien || "").trim().toUpperCase();
const isStayPlannable = (stay) =>
  [SESSION_STATUS.BOOKED, SESSION_STATUS.IN_HOUSE].includes(getStayStatus(stay));
const canStayCheckout = (stay) => getStayStatus(stay) === SESSION_STATUS.IN_HOUSE;
const isStayReadOnly = (stay) =>
  [SESSION_STATUS.CHECKED_OUT, SESSION_STATUS.NO_SHOW].includes(getStayStatus(stay));
const normalizeSessionState = (stay = {}) => {
  const batDauAt = String(stay.batDauAt || "").trim();
  const ketThucDuKien = String(stay.ketThucDuKien || "").trim();
  const ketThucThucTe = String(stay.ketThucThucTe || "").trim();
  const tienGoi = getStayPackageAmount(stay);
  const tongThanhToan = getStayGrandTotal({ ...stay, batDauAt, ketThucDuKien, ketThucThucTe, tienGoi });
  return {
    ...stay,
    batDauAt,
    ketThucDuKien,
    ketThucThucTe,
    thoiLuongPhut: Math.max(Number(stay.thoiLuongPhut || getStayDurationMinutes(stay) || 0), 0),
    giaGoi: Math.max(Number(stay.giaGoi ?? 0), 0),
    tienGoi,
    tongThanhToan,
  };
};
const getStayIdentityKey = (stay = {}) =>
  String(stay?.maPhien || stay?.maLichHen || "").trim();
const DUE_PROMPT_DELAY_STORAGE_KEY = "spa_due_prompt_delays";
const readDelayedDuePromptKeys = () => {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.sessionStorage.getItem(DUE_PROMPT_DELAY_STORAGE_KEY);
    const parsed = JSON.parse(raw || "[]");
    return new Set(Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim()).filter(Boolean) : []);
  } catch {
    return new Set();
  }
};
const persistDelayedDuePromptKeys = (keys) => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      DUE_PROMPT_DELAY_STORAGE_KEY,
      JSON.stringify(Array.from(keys || []).filter(Boolean)),
    );
  } catch {
    // Ignore storage failures; in-memory suppression still works.
  }
};
const prepareTimelineStays = prepareCanonicalTimelineStays;
const getCustomerIdentityKey = (customer = {}) => {
  const phone = normalizePhone(customer.soDienThoai);
  if (phone) return `phone:${phone}`;
  const name = normalizeCustomerName(customer.tenKhach);
  return name ? `name:${name}` : "";
};
const getProgressTrackedSessionStates = () => [
  SESSION_STATUS.BOOKED,
  SESSION_STATUS.IN_HOUSE,
  SESSION_STATUS.CHECKED_OUT,
];
const resolveTreatmentProgressCandidates = ({
  stays = [],
  maGoi = "",
  tenKhach = "",
  soDienThoai = "",
}) => {
  const packageCode = String(maGoi || "").trim();
  const customerKey = getCustomerIdentityKey({ tenKhach, soDienThoai });
  if (!packageCode || !customerKey) return null;
  const trackedStates = getProgressTrackedSessionStates();
  const grouped = new Map();
  stays.forEach((stay) => {
    if (!trackedStates.includes(getStayStatus(stay))) return;
    if (String(stay.maGoi || "").trim() !== packageCode) return;
    if (getCustomerIdentityKey(stay) !== customerKey) return;
    const progressCode = String(stay.maTienTrinh || "").trim();
    if (!progressCode) return;
    const current = grouped.get(progressCode) || [];
    current.push(stay);
    grouped.set(progressCode, current);
  });
  const candidates = [];
  grouped.forEach((sessions, maTienTrinh) => {
    const sortedSessions = [...sessions].sort((a, b) => {
      const sessionDelta = Number(a?.buoiThu || 0) - Number(b?.buoiThu || 0);
      if (sessionDelta !== 0) return sessionDelta;
      return safeTimeMs(getStayStartAt(a)) - safeTimeMs(getStayStartAt(b));
    });
    const latest = sortedSessions[sortedSessions.length - 1];
    const totalSessions = Math.max(Number(latest?.tongBuoiCombo || 1), 1);
    const currentSessionNumber = Math.max(Number(latest?.buoiThu || sortedSessions.length || 1), 1);
    const remainingSessions = Math.max(totalSessions - currentSessionNumber, 0);
    if (remainingSessions <= 0) return;
    candidates.push({
      maTienTrinh,
      tongBuoiCombo: totalSessions,
      buoiDaDung: currentSessionNumber,
      buoiTiepTheo: currentSessionNumber + 1,
      buoiConLai: remainingSessions,
      lichGanNhat: latest,
      seThuTienGoi: false,
    });
  });
  return candidates.sort(
    (a, b) =>
      safeTimeMs(getStayStartAt(b?.lichGanNhat)) - safeTimeMs(getStayStartAt(a?.lichGanNhat)),
  );
};
const resolveOngoingPackages = ({ stays = [], tenKhach = "", soDienThoai = "", packageOptions = [] }) => {
  const customerKey = getCustomerIdentityKey({ tenKhach, soDienThoai });
  if (!customerKey) return [];
  const trackedStates = getProgressTrackedSessionStates();
  const grouped = new Map();
  stays.forEach((stay) => {
    if (!trackedStates.includes(getStayStatus(stay))) return;
    if (getCustomerIdentityKey(stay) !== customerKey) return;
    const progressCode = String(stay.maTienTrinh || "").trim();
    if (!progressCode) return;
    const current = grouped.get(progressCode) || [];
    current.push(stay);
    grouped.set(progressCode, current);
  });
  const results = [];
  grouped.forEach((sessions, maTienTrinh) => {
    const sortedSessions = [...sessions].sort((a, b) => {
      const sessionDelta = Number(a?.buoiThu || 0) - Number(b?.buoiThu || 0);
      if (sessionDelta !== 0) return sessionDelta;
      return safeTimeMs(getStayStartAt(a)) - safeTimeMs(getStayStartAt(b));
    });
    const latest = sortedSessions[sortedSessions.length - 1];
    const packageCode = String(latest?.maGoi || "").trim();
    if (!packageCode) return;
    const totalSessions = Math.max(Number(latest?.tongBuoiCombo || 1), 1);
    const currentSessionNumber = Math.max(Number(latest?.buoiThu || sortedSessions.length || 1), 1);
    const remainingSessions = Math.max(totalSessions - currentSessionNumber, 0);
    if (remainingSessions <= 0) return;
    const pkg = packageOptions.find((p) => String(p.maGoi) === packageCode);
    if (!pkg) return;
    results.push({
      maTienTrinh,
      maGoi: pkg.maGoi,
      tenGoi: pkg.tenGoi || pkg.tenDichVu,
      tongBuoiCombo: totalSessions,
      buoiDaDung: currentSessionNumber,
      buoiConLai: remainingSessions,
    });
  });
  return results.sort((a, b) => b.buoiConLai - a.buoiConLai);
};
const resolveTreatmentProgressPreview = ({
  stays = [],
  maGoi = "",
  tenKhach = "",
  soDienThoai = "",
}) => {
  const packageCode = String(maGoi || "").trim();
  const candidates =
    resolveTreatmentProgressCandidates({
      stays,
      maGoi,
      tenKhach,
      soDienThoai,
    }) || [];
  const bestMatch = candidates[0] || null;
  if (bestMatch) return { ...bestMatch, candidates };
  return {
    maTienTrinh: "",
    tongBuoiCombo: Math.max(Number(stays.find((stay) => String(stay.maGoi || "").trim() === packageCode)?.tongBuoiCombo || 1), 1),
    buoiDaDung: 0,
    buoiTiepTheo: 1,
    buoiConLai: 0,
    lichGanNhat: null,
    seThuTienGoi: true,
    candidates,
  };
};
const getRoomOptionLabel = (room = {}) =>
  `${room.tenGiuong || room.maGiuong || "Giường"} • ${room.maGiuong || "-"} • ${
    room.trangThaiGiuong || ROOM_STATUS.AVAILABLE
  }`;
const buildBedPayload = (payload = {}) => ({
  maGiuong: String(payload.maGiuong || "").trim(),
  tenGiuong: String(payload.tenGiuong || "").trim(),
  loaiGiuong: String(payload.loaiGiuong || "").trim(),
  trangThaiGiuong: String(payload.trangThaiGiuong || ROOM_STATUS.AVAILABLE).trim(),
  soKhachToiDa: Math.max(Number(payload.soKhachToiDa || 1), 1),
  ghiChu: String(payload.ghiChu || "").trim(),
});


function DateFilterPopover({ selectedDate, dateMode, onChangeDate, onChangeDateMode }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const dateKey = toDateKey(selectedDate);
  const selectedDateObj = useMemo(() => {
    const d = new Date(selectedDate || toVnDateTimeString(new Date()));
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }, [selectedDate]);
  const selectedWeek = useMemo(() => weekRange(selectedDateObj), [selectedDateObj]);
  const displayValue =
    dateMode === "WEEK"
      ? `${toDisplayDate(selectedWeek.from)} - ${toDisplayDate(selectedWeek.to)}`
      : toDisplayDate(selectedDateObj);
  const modeOptions = [
    { value: "DAY", label: "Theo ngày" },
    { value: "WEEK", label: "Theo tuần" },
  ];

  useEffect(() => {
    const onDocClick = (event) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const applyToday = () => onChangeDate(toDateKey(new Date()));
  const applyYesterday = () => onChangeDate(toDateKey(addDays(new Date(), -1)));

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700"
      >
        <span className="truncate text-left">{displayValue}</span>
        <span className="text-xs text-slate-500">▾</span>
      </button>
      {open ? (
        <div className="absolute z-[9800] mt-1 w-[320px] max-w-[calc(100vw-24px)] rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Bộ lọc ngày</p>
          <div className="mb-2">
            <CustomDropdown
              value={dateMode}
              options={modeOptions}
              onChange={(next) => onChangeDateMode(String(next))}
              buttonClassName="py-2"
            />
          </div>
          <input
            type="date"
            value={dateKey}
            onChange={(e) => onChangeDate(e.target.value)}
            className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          {dateMode === "WEEK" ? (
            <p className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs font-semibold text-rose-700">
              Tuần đang chọn: {toDisplayDate(selectedWeek.from)} - {toDisplayDate(selectedWeek.to)}
            </p>
          ) : null}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={applyYesterday}
              className="rounded-lg border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-700"
            >
              Hôm qua
            </button>
            <button
              type="button"
              onClick={applyToday}
              className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-2 text-xs font-semibold text-rose-700"
            >
              Hôm nay
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-700"
            >
              Xong
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Component DateTimePicker - Gộp ngày giờ phút thành 1 bộ chọn đẹp
 * Giờ theo chuẩn 24h
 */
function DateTimePicker({ value, onChange, label, minDate, disabled, testId }) {
  const pickerValue = useMemo(() => dateToPickerValue(value), [value]);
  
  const handleChange = (field, newValue) => {
    const updated = { ...pickerValue, [field]: newValue };
    const iso = pickerValueToIso(updated);
    onChange(iso);
  };
  
  // Tạo danh sách giờ (00-23)
  const hours = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 24; i++) {
      arr.push(String(i).padStart(2, "0"));
    }
    return arr;
  }, []);
  
  // Tạo danh sách phút (00-59), không làm tròn theo bước cố định
  const minutes = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 60; i += 1) {
      arr.push(String(i).padStart(2, "0"));
    }
    return arr;
  }, []);
  
  return (
    <div className="space-y-1" data-testid={testId}>
      {label && (
        <label className="text-xs font-semibold text-slate-600">{label}</label>
      )}
      <div className="grid grid-cols-[minmax(150px,0.82fr)_90px_112px] gap-2">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ngày</p>
          <input
            type="date"
            value={pickerValue.date}
            min={minDate}
            onChange={(e) => handleChange("date", e.target.value)}
            disabled={disabled}
            data-testid={testId ? `${testId}-date` : undefined}
            className="min-w-0 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm disabled:bg-slate-100"
          />
        </div>
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Giờ</p>
          <CustomDropdown
            value={pickerValue.hour}
            onChange={(next) => handleChange("hour", String(next))}
            disabled={disabled}
            className="w-full"
            options={hours.map((h) => ({ value: h, label: `${h}h` }))}
            buttonClassName="py-2 text-sm font-semibold"
            buttonTestId={testId ? `${testId}-hour` : undefined}
          />
        </div>
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Phút</p>
          <CustomDropdown
            value={pickerValue.minute}
            onChange={(next) => handleChange("minute", String(next))}
            disabled={disabled}
            className="w-full"
            options={minutes.map((m) => ({ value: m, label: `${m} phút` }))}
            buttonClassName="py-2 text-sm font-semibold"
            buttonTestId={testId ? `${testId}-minute` : undefined}
          />
        </div>
      </div>
    </div>
  );
}

const prettyTime = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString("vi-VN");
};
const minutesBetween = (fromMs, toMs) =>
  Math.round((toMs - fromMs) / (60 * 1000));
const getRoomBookingAlert = (bookedStays = [], nowMs = Date.now()) => {
  if (!Array.isArray(bookedStays) || bookedStays.length === 0) return null;
  const sorted = [...bookedStays]
    .map((stay) => ({
      stay,
      checkinMs: new Date(getStayStartAt(stay) || 0).getTime(),
    }))
    .filter((x) => Number.isFinite(x.checkinMs))
    .sort((a, b) => a.checkinMs - b.checkinMs);
  if (!sorted.length) return null;
  const dueNow = [...sorted].reverse().find((x) => x.checkinMs <= nowMs);
  if (dueNow) {
    return {
      type: "DUE_NOW",
      stay: dueNow.stay,
      checkinMs: dueNow.checkinMs,
      minutesUntil: minutesBetween(nowMs, dueNow.checkinMs),
    };
  }
  const next = sorted[0];
  const minutesUntil = minutesBetween(nowMs, next.checkinMs);
  if (minutesUntil <= BOOKING_CONFIRM_WINDOW_HOURS * 60) {
    return {
      type: "UPCOMING_SOON",
      stay: next.stay,
      checkinMs: next.checkinMs,
      minutesUntil,
    };
  }
  return {
    type: "UPCOMING_LATER",
    stay: next.stay,
    checkinMs: next.checkinMs,
    minutesUntil,
  };
};
const getStayOverdueMinutes = (stay, nowMs = Date.now()) => {
  if (getStayStatus(stay) !== SESSION_STATUS.IN_HOUSE) return 0;
  if (String(getStayActualEndAt(stay) || "").trim()) return 0;
  const expectedEndMs = getStayExpectedEndMs(stay);
  if (!Number.isFinite(expectedEndMs) || nowMs <= expectedEndMs) return 0;
  return Math.max(0, minutesBetween(expectedEndMs, nowMs));
};
const isDueOrOverdueBooking = (stay, nowMs = Date.now()) => {
  if (getStayStatus(stay) !== SESSION_STATUS.BOOKED) return false;
  const startMs = new Date(getStayStartAt(stay) || "").getTime();
  return Number.isFinite(startMs) && startMs <= nowMs;
};
const getStayTimelineTimeLabel = (stay, nowMs = Date.now()) => {
  const startLabel = formatTimeOnly(getStayStartAt(stay));
  if (getStayOverdueMinutes(stay, nowMs) > 0) {
    return `${startLabel} - đang làm`;
  }
  return `${startLabel} - ${formatTimeOnly(getStayEndAt(stay))}`;
};
const getStayTimelineMetaLabel = (stay, durationMinutes, nowMs = Date.now()) => {
  const overdueMinutes = getStayOverdueMinutes(stay, nowMs);
  if (overdueMinutes > 0) {
    return `${getStayTimelineTimeLabel(stay, nowMs)} • QG ${overdueMinutes}P`;
  }
  return `${getStayTimelineTimeLabel(stay, nowMs)} • ${durationMinutes}P`;
};
const getRoomTimelineHeaderState = ({
  room,
  activeStay,
  bookingAlert,
  nowMs = Date.now(),
}) => {
  const overdueMinutes = activeStay ? getStayOverdueMinutes(activeStay, nowMs) : 0;
  if (overdueMinutes > 0) {
    return {
      label: `Quá giờ ${overdueMinutes} phút`,
      tone: "border-red-200 bg-red-50 text-red-700",
    };
  }
  if (activeStay) {
    return {
      label: "Đang trị liệu",
      tone: "border-sky-200 bg-sky-50 text-sky-700",
    };
  }
  if (bookingAlert?.type === "DUE_NOW") {
    return {
      label: "Đến giờ hẹn",
      tone: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }
  if (bookingAlert?.type === "UPCOMING_SOON") {
    return {
      label: "Sắp có lịch",
      tone: "border-pink-200 bg-pink-50 text-pink-700",
    };
  }
  if (room?.trangThaiGiuong === ROOM_STATUS.CLEANING) {
    return {
      label: ROOM_STATUS.CLEANING,
      tone: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }
  if (room?.trangThaiGiuong === ROOM_STATUS.MAINTENANCE) {
    return {
      label: ROOM_STATUS.MAINTENANCE,
      tone: "border-slate-300 bg-slate-100 text-slate-700",
    };
  }
  return {
    label: ROOM_STATUS.AVAILABLE,
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };
};
const buildBookingCheckInPayload = (stay = {}) => ({
  maGiuong: String(stay.maGiuong || "").trim(),
  tenKhach: String(stay.tenKhach || "").trim(),
  soDienThoai: String(stay.soDienThoai || "").trim(),
  maNhanVien: String(stay.maNhanVien || "").trim(),
  maGoi: String(stay.maGoi || "").trim(),
  tenGoi: String(stay.tenGoi || stay.tenDichVu || "").trim(),
  maDv: String(stay.maDv || "").trim(),
  tenDichVu: String(stay.tenDichVu || stay.tenGoi || "").trim(),
  batDauAt: String(getStayStartAt(stay) || "").trim(),
  ketThucDuKien: String(getStayExpectedEndAt(stay) || "").trim(),
  thoiLuongPhut: Math.max(Number(stay.thoiLuongPhut || 0), 0),
  giaGoi: Math.max(Number(stay.giaGoi || 0), 0),
  tienGoi: Math.max(Number(stay.tienGoi ?? 0), 0),
  ghiChu: String(stay.ghiChu || "").trim(),
  maPhien: String(stay.maPhien || "").trim(),
  maLichHen: String(stay.maLichHen || "").trim(),
  serviceItems: [],
});
const getStayPromptKey = (stay = {}) =>
  String(stay.maPhien || stay.maLichHen || "").trim();

const cardTone = (status) => {
  if (status === ROOM_STATUS.AVAILABLE)
    return "border-slate-200 bg-white";
  if (status === ROOM_STATUS.IN_HOUSE) return "border-rose-300 bg-rose-50/80 shadow-rose-100";
  if (status === ROOM_STATUS.CLEANING)
    return "border-amber-200 bg-amber-50/70";
  if (status === ROOM_STATUS.MAINTENANCE)
    return "border-slate-300 bg-slate-100/80";
  return "border-slate-300 bg-slate-100/80";
};

const statusBadgeTone = (status) => {
  if (status === ROOM_STATUS.AVAILABLE)
    return "border-emerald-100 bg-emerald-50 text-emerald-700";
  if (status === ROOM_STATUS.IN_HOUSE)
    return "border-rose-100 bg-rose-50 text-rose-700";
  if (status === ROOM_STATUS.CLEANING)
    return "border-amber-100 bg-amber-50 text-amber-700";
  if (status === ROOM_STATUS.MAINTENANCE)
    return "border-slate-300 bg-slate-200 text-slate-700";
  return "border-slate-200 bg-slate-200 text-slate-700";
};

function SectionTitle({ children }) {
  return (
    <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">
      {children}
    </h2>
  );
}

function RoomCard({
  room,
  stay,
  bookedStays = [],
  bookingAlert = null,
  onQuickCheckIn,
  onCreateBooking,
  onOpenStay,
  onStatusChange,
  onNoShow,
}) {
  const isInHouse = room.trangThaiGiuong === ROOM_STATUS.IN_HOUSE;
  const isPaused = room.trangThaiGiuong === ROOM_STATUS.CLEANING;
  const isMaintenance = room.trangThaiGiuong === ROOM_STATUS.MAINTENANCE;
  const dueBooking = bookingAlert?.type === "DUE_NOW" ? bookingAlert.stay : null;
  const primaryActionLabel = isInHouse
    ? "Xử lý phiên"
    : isMaintenance
      ? "Đang bảo trì"
    : dueBooking
      ? "Nhận khách hẹn"
      : isPaused
        ? "Mở lại sẵn sàng"
        : "Mở phiên mới";
  const canRunPrimaryAction = isMaintenance ? false : isInHouse ? !!stay : true;
  const secondaryOptions = [
    { value: "", label: "Hành động" },
    { value: "BOOKING", label: "Đặt lịch" },
    ...(isInHouse || isPaused || isMaintenance
      ? []
      : [{ value: "PAUSE", label: "Tạm dừng giường" }]),
    ...(isPaused || isMaintenance
      ? [{ value: "AVAILABLE", label: "Đưa về sẵn sàng" }]
      : []),
    ...(dueBooking ? [{ value: "NO_SHOW", label: "Khách không đến" }] : []),
  ];

  const handlePrimaryAction = () => {
    if (isInHouse) {
      if (stay) onOpenStay(room, stay);
      return;
    }
    if (isPaused) {
      onStatusChange(room, ROOM_STATUS.AVAILABLE);
      return;
    }
    onQuickCheckIn(room, bookedStays, dueBooking || null);
  };

  const handleSecondaryAction = (value) => {
    const next = String(value || "");
    if (!next) return;
    if (next === "BOOKING") {
      onCreateBooking(room, bookedStays);
      return;
    }
    if (next === "PAUSE") {
      onStatusChange(room, ROOM_STATUS.CLEANING);
      return;
    }
    if (next === "AVAILABLE") {
      onStatusChange(room, ROOM_STATUS.AVAILABLE);
      return;
    }
    if (next === "NO_SHOW" && dueBooking) {
      onNoShow(dueBooking);
    }
  };

  const appointmentTone =
    bookingAlert?.type === "DUE_NOW"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : bookingAlert?.type === "UPCOMING_SOON"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <article
      className={`rounded-2xl border p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${cardTone(room.trangThaiGiuong)}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-black text-slate-800">{room.tenGiuong}</p>
          <p className="text-xs text-slate-500">
            {room.maGiuong} • {room.loaiGiuong || "-"}
          </p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusBadgeTone(room.trangThaiGiuong)}`}>
          {room.trangThaiGiuong}
        </span>
      </div>

      {isInHouse && stay && (
        <div className="mt-3 rounded-xl border border-rose-200 bg-white/85 px-3 py-2 text-xs text-slate-700">
          <p>
            <strong>Khách:</strong> {stay.tenKhach || "-"}
          </p>
          <p>
            <strong>Nhân viên:</strong> {stay.tenNhanVien || "Chưa gán"}
          </p>
          <p>
            <strong>Bắt đầu:</strong> {prettyTime(getStayStartAt(stay))}
          </p>
          <p>
            <strong>Dự kiến kết thúc:</strong> {prettyTime(getStayExpectedEndAt(stay))}
          </p>
          {getStayOverdueMinutes(stay) > 0 ? (
            <p className="font-semibold text-red-600">
              <strong>Quá giờ:</strong> {getStayOverdueMinutes(stay)} phút
            </p>
          ) : null}
          <p>
            <strong>Gói trị liệu:</strong> {stay.tenGoi || stay.tenDichVu || "-"}
          </p>
          <p>
            <strong>Tổng hiện tại:</strong> {fmt(stay.tongThanhToan)}
          </p>
        </div>
      )}

      {bookingAlert ? (
        <div className={`mt-3 rounded-xl border px-3 py-2 text-xs ${appointmentTone}`}>
          <p className="font-bold">
            {bookingAlert.type === "DUE_NOW"
              ? "Đến giờ khách hẹn"
              : bookingAlert.type === "UPCOMING_SOON"
                ? "Lịch hẹn trong 4 tiếng tới"
                : "Lịch hẹn kế tiếp"}
          </p>
          <p className="mt-0.5">
            {prettyTime(getStayStartAt(bookingAlert?.stay))} • {bookingAlert?.stay?.tenKhach || "Khách đã hẹn"}
          </p>
          {bookingAlert.type === "UPCOMING_SOON" ? (
            <p className="mt-0.5 font-semibold">
              Nếu mở walk-in lúc này, hệ thống sẽ hỏi xác nhận trước.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-white/70 px-3 py-2 text-xs text-slate-500">
          Chưa có lịch hẹn kế tiếp trên giường này.
        </div>
      )}

      <div className="mt-3 grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-2">
        <button
          type="button"
          disabled={!canRunPrimaryAction}
          onClick={handlePrimaryAction}
          className={`rounded-xl px-3 py-2.5 text-xs font-bold shadow-sm transition active:translate-y-px ${
            canRunPrimaryAction
              ? "border border-rose-200 bg-rose-600 text-white hover:bg-rose-700"
              : "border border-slate-200 bg-slate-100 text-slate-400"
          }`}
        >
          {primaryActionLabel}
        </button>
        <CustomDropdown
          value=""
          onChange={handleSecondaryAction}
          className="text-xs"
          buttonClassName="py-2.5 text-xs font-semibold"
          options={secondaryOptions}
        />
      </div>
    </article>
  );
}

const buildBookingDraftKey = (mode = "BOOKING", roomCode = "") =>
  `${FORM_DRAFT_KEYS.bookingCheckin}:${String(mode || "BOOKING").trim()}:${String(roomCode || "global").trim()}`;

function CheckinModal({
  mode = "BOOKING",
  room,
  bookingStay,
  bookingCandidates = [],
  allStays = [],
  onClose,
  onSubmit,
  onCreateBooking,
  loading,
  initialValues,
  staffOptions = [],
  customerHints = [],
  packageOptions = [],
  roomOptions = [],
  productOptions = [],
}) {
  const isInstantMode = mode === "INSTANT";
  const defaultRoomCode = String(room?.maGiuong || initialValues?.maGiuong || "").trim();
  const bookingDraftKey = buildBookingDraftKey(mode, defaultRoomCode);
  const savedBookingDraft =
    !bookingStay && !initialValues?.maPhien
      ? readFormDraft(bookingDraftKey)
      : null;
  const bookingDraftTimerRef = useRef(null);
  const { data: scheduleData } = useCachedQuery(getSpaStaffSchedules, CACHE_KEYS.staffSchedules);
  const schedules = scheduleData?.data || [];
  const mapPendingItem = (item = {}) => {
    const found = productOptions.find(
      (product) =>
        String(product.maSanPham || "").trim() === String(item.maSanPham || "").trim(),
    );
    return {
      maSanPham: String(item.maSanPham || found?.maSanPham || "").trim(),
      tenSanPham: String(item.tenSanPham || found?.tenSanPham || "").trim(),
      soLuong: Math.max(Number(item.soLuong || 1), 1),
      donGia: Math.max(Number(item.donGia || found?.donGiaBan || 0), 0),
      donVi: String(item.donVi || found?.donVi || "").trim(),
      ghiChu: String(item.ghiChu || "").trim(),
    };
  };
  const [form, setForm] = useState(() => ({
    tenKhach: String(bookingStay?.tenKhach || savedBookingDraft?.form?.tenKhach || "").trim(),
    soDienThoai: String(bookingStay?.soDienThoai || savedBookingDraft?.form?.soDienThoai || "").trim(),
    maNhanVien: String(bookingStay?.maNhanVien || savedBookingDraft?.form?.maNhanVien || "").trim(),
    maGiuong: defaultRoomCode || String(savedBookingDraft?.form?.maGiuong || "").trim(),
    maGoi: String(bookingStay?.maGoi || initialValues?.maGoi || savedBookingDraft?.form?.maGoi || "").trim(),
    batDauAt:
      initialValues?.batDauAt ||
      bookingStay?.batDauAt ||
      savedBookingDraft?.form?.batDauAt ||
      toVnDateTimeString(new Date()),
    ketThucDuKien:
      initialValues?.ketThucDuKien ||
      bookingStay?.ketThucDuKien ||
      savedBookingDraft?.form?.ketThucDuKien ||
      toVnDateTimeString(new Date(Date.now() + 60 * 60000)),
    ghiChu: String(bookingStay?.ghiChu || savedBookingDraft?.form?.ghiChu || "").trim(),
    tienCoc: Number(savedBookingDraft?.form?.tienCoc || 0),
    lichTrinhChiTiet: Array.isArray(savedBookingDraft?.form?.lichTrinhChiTiet) ? savedBookingDraft.form.lichTrinhChiTiet : [],
  }));
  const [extraForm, setExtraForm] = useState(() => ({
    maSanPham: String(savedBookingDraft?.extraForm?.maSanPham || "").trim(),
    soLuong: Math.max(Number(savedBookingDraft?.extraForm?.soLuong || 1), 1),
    donGia: Math.max(Number(savedBookingDraft?.extraForm?.donGia || 0), 0),
    ghiChu: String(savedBookingDraft?.extraForm?.ghiChu || "").trim(),
  }));
  const [progressMode, setProgressMode] = useState(
    () => String(savedBookingDraft?.progressMode || "NEW"),
  );
  const [selectedProgressCode, setSelectedProgressCode] = useState(
    () => String(savedBookingDraft?.selectedProgressCode || "").trim(),
  );
  const progressSelectionKeyRef = useRef("");
  const [pendingItems, setPendingItems] = useState(() => {
    if (Array.isArray(savedBookingDraft?.pendingItems) && savedBookingDraft.pendingItems.length) {
      return savedBookingDraft.pendingItems.map((item) => mapPendingItem(item));
    }
    if (Array.isArray(initialValues?.serviceItems)) {
      return initialValues.serviceItems.map((item) => mapPendingItem(item));
    }
    if (Array.isArray(bookingStay?.serviceItems)) {
      return bookingStay.serviceItems.map((item) => mapPendingItem(item));
    }
    return [];
  });
  const sortedBookingCandidates = useMemo(
    () =>
      [...bookingCandidates].sort(
        (a, b) =>
          safeTimeMs(getStayStartAt(a)) - safeTimeMs(getStayStartAt(b)),
      ),
    [bookingCandidates],
  );
  const [selectedBookingId, setSelectedBookingId] = useState(
    String(bookingStay?.maPhien || bookingStay?.maLichHen || "").trim(),
  );
  const selectedBooking = useMemo(() => {
    if (!sortedBookingCandidates.length) return bookingStay || null;
    const targetId = String(selectedBookingId || "").trim();
    if (!targetId) return null;
    const found = sortedBookingCandidates.find((item) => {
      const key = String(item.maPhien || item.maLichHen || "").trim();
      return key && key === targetId;
    });
    return found || null;
  }, [sortedBookingCandidates, selectedBookingId, bookingStay]);
  const selectedPackage = useMemo(
    () =>
      packageOptions.find((item) => String(item.maGoi || "") === String(form.maGoi || "")) || null,
    [packageOptions, form.maGoi],
  );
  const selectedRoom = useMemo(() => {
    const roomCode = String(form.maGiuong || "").trim();
    return roomOptions.find((item) => String(item.maGiuong || "").trim() === roomCode) || room || null;
  }, [form.maGiuong, roomOptions, room]);
  const selectedStaff = useMemo(() => {
    const staffCode = String(form.maNhanVien || "").trim();
    return (
      staffOptions.find((item) => String(item.maNhanVien || "").trim() === staffCode) || null
    );
  }, [form.maNhanVien, staffOptions]);
  const selectedRoomBookings = useMemo(() => {
    const roomCode = String(form.maGiuong || "").trim();
    if (!roomCode) return [];
    const selectedBookingKey = getStayIdentityKey(selectedBooking);
    return allStays
      .filter((stay) => {
        if (![SESSION_STATUS.BOOKED, SESSION_STATUS.IN_HOUSE].includes(getStayStatus(stay))) {
          return false;
        }
        if (String(stay.maGiuong || "").trim() !== roomCode) return false;
        if (selectedBookingKey && getStayIdentityKey(stay) === selectedBookingKey) return false;
        return true;
      })
      .sort(
        (a, b) =>
          safeTimeMs(getStayStartAt(a)) - safeTimeMs(getStayStartAt(b)),
      );
  }, [allStays, form.maGiuong, selectedBooking]);
  const selectedStaffSchedules = useMemo(() => {
    const staffCode = String(form.maNhanVien || "").trim();
    if (!staffCode) return [];
    const selectedBookingKey = getStayIdentityKey(selectedBooking);
    return allStays
      .filter((stay) => {
        if (![SESSION_STATUS.BOOKED, SESSION_STATUS.IN_HOUSE].includes(getStayStatus(stay))) {
          return false;
        }
        if (String(stay.maNhanVien || "").trim() !== staffCode) return false;
        if (selectedBookingKey && getStayIdentityKey(stay) === selectedBookingKey) return false;
        return true;
      })
      .sort(
        (a, b) =>
          safeTimeMs(getStayStartAt(a)) - safeTimeMs(getStayStartAt(b)),
      );
  }, [allStays, form.maNhanVien, selectedBooking]);
  const selectedExtraProduct = useMemo(
    () =>
      productOptions.find(
        (item) => String(item.maSanPham || "").trim() === String(extraForm.maSanPham || "").trim(),
      ) || null,
    [productOptions, extraForm.maSanPham],
  );
  const pendingItemsTotal = useMemo(
    () =>
      pendingItems.reduce(
        (sum, item) =>
          sum +
          Math.max(Number(item.soLuong || 0), 0) * Math.max(Number(item.donGia || 0), 0),
        0,
      ),
    [pendingItems],
  );
  const selectedStaffCatalogStatus = getStaffCatalogStatus(selectedStaff);
  const selectedStaffBlocked = isBlockingStaffStatus(selectedStaffCatalogStatus);
  const validationWindow = useMemo(() => {
    const startIso = isInstantMode ? toVnDateTimeString(new Date()) : form.batDauAt;
    const fallbackDuration = getStayDurationMinutes({
      batDauAt: startIso,
      ketThucDuKien: form.ketThucDuKien,
    });
    const durationMinutes = Math.max(
      Number(selectedPackage?.thoiLuongPhut || fallbackDuration || 0),
      15,
    );
    const endIso = isInstantMode
      ? toVnDateTimeString(new Date(new Date(startIso).getTime() + durationMinutes * 60000))
      : form.ketThucDuKien;
    const startMs = new Date(startIso || "").getTime();
    const endMs = new Date(endIso || "").getTime();
    return {
      startIso,
      endIso,
      durationMinutes,
      isValid:
        Number.isFinite(startMs) &&
        Number.isFinite(endMs) &&
        endMs > startMs,
    };
  }, [form.batDauAt, form.ketThucDuKien, isInstantMode, selectedPackage]);
  const staffShiftViolation = useMemo(
    () =>
      selectedBooking
        ? null
        : validationWindow.isValid
        ? getStaffShiftViolation(selectedStaff, validationWindow.startIso, validationWindow.endIso, schedules)
        : null,
    [selectedBooking, selectedStaff, validationWindow, schedules],
  );

  const lastSyncedBookingIdRef = useRef("");

  useEffect(() => {
    if (bookingStay || selectedBooking) return undefined;
    if (bookingDraftTimerRef.current) clearTimeout(bookingDraftTimerRef.current);
    bookingDraftTimerRef.current = setTimeout(() => {
      writeFormDraft(
        bookingDraftKey,
        {
          form,
          extraForm,
          progressMode,
          selectedProgressCode,
          pendingItems,
        },
        { page: "create-order" },
      );
    }, 400);
    return () => {
      if (bookingDraftTimerRef.current) clearTimeout(bookingDraftTimerRef.current);
    };
  }, [
    bookingDraftKey,
    bookingStay,
    selectedBooking,
    form,
    extraForm,
    progressMode,
    selectedProgressCode,
    pendingItems,
  ]);

  useEffect(() => {
    if (!selectedBooking) return;
    const bookingId = String(selectedBooking.maPhien || selectedBooking.maLichHen || "").trim();
    if (bookingId && lastSyncedBookingIdRef.current === bookingId) return;
    if (bookingId) lastSyncedBookingIdRef.current = bookingId;

    setForm((prev) => ({
      ...prev,
      tenKhach: String(selectedBooking.tenKhach || prev.tenKhach || "").trim(),
      soDienThoai: String(selectedBooking.soDienThoai || prev.soDienThoai || "").trim(),
      maNhanVien: String(selectedBooking.maNhanVien || prev.maNhanVien || "").trim(),
      maGiuong: String(selectedBooking.maGiuong || prev.maGiuong || "").trim(),
      maGoi: String(selectedBooking.maGoi || prev.maGoi || "").trim(),
      batDauAt: getStayStartAt(selectedBooking) || prev.batDauAt,
      ketThucDuKien: getStayExpectedEndAt(selectedBooking) || prev.ketThucDuKien,
      ghiChu: String(selectedBooking.ghiChu || prev.ghiChu || "").trim(),
    }));
    setPendingItems(
      Array.isArray(selectedBooking.serviceItems)
        ? selectedBooking.serviceItems.map((item) => mapPendingItem(item))
        : [],
    );
  }, [selectedBooking]);
  useEffect(() => {
    setForm((prev) => {
      // Don't auto-calculate if editing an existing booking without changing its package
      if (selectedBooking && String(selectedBooking.maGoi || "") === String(selectedPackage?.maGoi || "")) {
        // Only skip if the start time is also unchanged
        if (prev.batDauAt === getStayStartAt(selectedBooking)) return prev;
      }
      const startMs = parseVnDateTimeMs(prev.batDauAt);
      if (!Number.isFinite(startMs)) return prev;
      const duration = Math.max(Number(selectedPackage?.thoiLuongPhut || 60), 15);
      const newEnd = toVnDateTimeString(new Date(startMs + duration * 60000));
      if (prev.ketThucDuKien === newEnd) return prev;
      return {
        ...prev,
        ketThucDuKien: newEnd,
      };
    });
  }, [selectedPackage, selectedBooking, form.batDauAt]);

  const durationInfo = useMemo(() => {
    return calculateDuration(form.batDauAt, form.ketThucDuKien, "THEO_GIO");
  }, [form.batDauAt, form.ketThucDuKien]);
  const roomBookingConflict = useMemo(() => {
    if (!validationWindow.isValid) return null;
    return (
      selectedRoomBookings.find((stay) =>
        isScheduleOverlap({
          startA: validationWindow.startIso,
          endA: validationWindow.endIso,
          startB: getStayStartAt(stay),
          endB: getStayExpectedEndAt(stay),
        }),
      ) || null
    );
  }, [
    validationWindow,
    selectedRoomBookings,
  ]);
  const staffScheduleConflict = useMemo(() => {
    if (!validationWindow.isValid || !String(form.maNhanVien || "").trim()) return null;
    return (
      selectedStaffSchedules.find((stay) =>
        isScheduleOverlap({
          startA: validationWindow.startIso,
          endA: validationWindow.endIso,
          startB: getStayStartAt(stay),
          endB: getStayExpectedEndAt(stay),
        }),
      ) || null
    );
  }, [
    validationWindow,
    form.maNhanVien,
    selectedStaffSchedules,
  ]);
  const selectedStaffUiStatus = useMemo(() => {
    if (!selectedStaff) return "";
    if (selectedStaffCatalogStatus && isBlockingStaffStatus(selectedStaffCatalogStatus)) {
      return selectedStaffCatalogStatus;
    }
    const inHouseStay = selectedStaffSchedules.find(
      (stay) => getStayStatus(stay) === SESSION_STATUS.IN_HOUSE,
    );
    if (inHouseStay) {
      return `Đang trị liệu • ${inHouseStay.tenKhach || inHouseStay.maGiuong || "Đang phục vụ"}`;
    }
    const futureStay = selectedStaffSchedules.find(
      (stay) => getStayStatus(stay) === SESSION_STATUS.BOOKED,
    );
    if (futureStay) {
      return `Sắp có lịch • ${formatTimeOnly(getStayStartAt(futureStay))}`;
    }
    return selectedStaffCatalogStatus || "Sẵn sàng";
  }, [selectedStaff, selectedStaffCatalogStatus, selectedStaffSchedules]);

  const estimated = Math.max(
    Number(selectedPackage?.giaBanGoi || selectedPackage?.giaGoi || 0),
    0,
  );
  const normalizedPhone = useMemo(() => normalizePhone(form.soDienThoai), [form.soDienThoai]);
  const normalizedCustomerName = useMemo(
    () => normalizeCustomerName(form.tenKhach),
    [form.tenKhach],
  );
  const treatmentProgressPreview = useMemo(() => {
    if (!selectedPackage) return null;
    const preview = resolveTreatmentProgressPreview({
      stays: allStays,
      maGoi: selectedPackage.maGoi,
      tenKhach: form.tenKhach,
      soDienThoai: form.soDienThoai,
    });
    if (!preview) return null;
    return {
      ...preview,
      tongBuoiCombo: Math.max(
        Number(preview.tongBuoiCombo || selectedPackage.soBuoiQuyDoi || 1),
        1,
      ),
    };
  }, [allStays, form.soDienThoai, form.tenKhach, selectedPackage]);
  const treatmentProgressCandidates = useMemo(
    () => (Array.isArray(treatmentProgressPreview?.candidates) ? treatmentProgressPreview.candidates : []),
    [treatmentProgressPreview],
  );
  useEffect(() => {
    const progressSelectionKey = [
      String(selectedPackage?.maGoi || "").trim(),
      normalizedPhone,
      normalizedCustomerName,
    ].join("||");
    if (!selectedPackage) {
      progressSelectionKeyRef.current = "";
      setProgressMode("NEW");
      setSelectedProgressCode("");
      return;
    }
    const nextCode = String(treatmentProgressCandidates[0]?.maTienTrinh || "").trim();
    if (progressSelectionKeyRef.current !== progressSelectionKey) {
      progressSelectionKeyRef.current = progressSelectionKey;
      setProgressMode(nextCode ? "CONTINUE" : "NEW");
    }
    setSelectedProgressCode((prev) => (prev && treatmentProgressCandidates.some((item) => item.maTienTrinh === prev) ? prev : nextCode));
  }, [normalizedCustomerName, normalizedPhone, selectedPackage, treatmentProgressCandidates]);
  const selectedProgressPreview = useMemo(() => {
    if (progressMode === "CONTINUE") {
      return (
        treatmentProgressCandidates.find(
          (item) => String(item.maTienTrinh || "").trim() === String(selectedProgressCode || "").trim(),
        ) || treatmentProgressCandidates[0] || null
      );
    }
    if (!selectedPackage) return null;
    return {
      maTienTrinh: "",
      tongBuoiCombo: Math.max(Number(selectedPackage.soBuoiQuyDoi || 1), 1),
      buoiDaDung: 0,
      buoiTiepTheo: 1,
      buoiConLai: Math.max(Number(selectedPackage.soBuoiQuyDoi || 1), 0),
      lichGanNhat: null,
      seThuTienGoi: true,
    };
  }, [progressMode, selectedPackage, selectedProgressCode, treatmentProgressCandidates]);
  const recognizedCustomer = useMemo(() => {
    if (!normalizedPhone && !normalizedCustomerName) return null;
    let matches = customerHints;
    if (normalizedPhone) {
      matches = matches.filter(item => {
        const p = normalizePhone(item.soDienThoai);
        return Boolean(p) && p === normalizedPhone;
      });
    }
    if (normalizedCustomerName) {
      matches = matches.filter(item => {
        const n = normalizeCustomerName(item.tenKhach);
        return Boolean(n) && n === normalizedCustomerName;
      });
    }
    return matches.length > 0 ? matches[0] : null;
  }, [customerHints, normalizedPhone, normalizedCustomerName]);

  // Auto-fill tên khách khi nhận diện bằng SĐT đầy đủ
  useEffect(() => {
    if (!recognizedCustomer) return;
    const recognizedName = recognizedCustomer.tenKhach || "";
    const currentName = form.tenKhach || "";
    // Chỉ auto-fill khi tên đang trống HOẶC tên hiện tại khác với tên nhận diện
    if (!currentName || normalizeCustomerName(currentName) !== normalizeCustomerName(recognizedName)) {
      setForm((prev) => ({ ...prev, tenKhach: recognizedName }));
    }
  }, [recognizedCustomer]);
  
  const validationErrors = useMemo(() => {
    const errs = [];
    if (selectedStaffBlocked) {
      errs.push(`Nhân viên đang ở trạng thái ${selectedStaffCatalogStatus}, không thể nhận lịch hoặc mở phiên.`);
    }

    if (roomBookingConflict) {
      errs.push(`Giường trùng lịch với ${roomBookingConflict.tenKhach || roomBookingConflict.maPhien || "lịch đã có"} (${formatTimeOnly(getStayStartAt(roomBookingConflict))} - ${formatTimeOnly(getStayExpectedEndAt(roomBookingConflict))}).`);
    }
    if (staffScheduleConflict) {
      errs.push(`Nhân viên trùng lịch với ${staffScheduleConflict.tenKhach || staffScheduleConflict.maPhien || "lịch đã có"} (${formatTimeOnly(getStayStartAt(staffScheduleConflict))} - ${formatTimeOnly(getStayExpectedEndAt(staffScheduleConflict))}).`);
    }
    if (!isInstantMode && !durationInfo.isValid && durationInfo.error) {
      errs.push(durationInfo.error);
    }
    return errs;
  }, [selectedStaffBlocked, selectedStaffCatalogStatus, staffShiftViolation, roomBookingConflict, staffScheduleConflict, isInstantMode, durationInfo]);

  const todayComboCustomers = useMemo(() => {
    const todayStr = toVnDateTimeString(new Date()).split('T')[0];
    const uniqueProgresses = new Map();
    
    allStays.forEach(stay => {
      if (!stay.lichTrinhChiTiet) return;
      try {
        const schedule = JSON.parse(stay.lichTrinhChiTiet);
        if (!Array.isArray(schedule)) return;
        
        const todaySession = schedule.find(s => s.date === todayStr && s.status === "PENDING");
        if (todaySession) {
          const key = String(stay.maTienTrinh || stay.maPhien || "").trim();
          if (key && !uniqueProgresses.has(key)) {
            uniqueProgresses.set(key, {
              ...stay,
              todaySession
            });
          }
        }
      } catch (e) {
        // ignore JSON parse error
      }
    });
    return Array.from(uniqueProgresses.values());
  }, [allStays]);

  const customerSuggestionActive = normalizedPhone.length >= 2 || normalizedCustomerName.length >= 2;
  const suggestedCustomers = useMemo(() => {
    if (!customerSuggestionActive) return [];
    const matches = customerHints.filter((item) => {
      const phone = normalizePhone(item.soDienThoai);
      const name = normalizeCustomerName(item.tenKhach);
      const matchesPhone = !normalizedPhone || (phone && phone.includes(normalizedPhone));
      const matchesName = !normalizedCustomerName || (name && name.includes(normalizedCustomerName));
      return matchesPhone && matchesName;
    });
    const unique = [];
    const seen = new Set();
    matches.forEach((item) => {
      const key = getCustomerIdentityKey(item);
      if (!key || seen.has(key)) return;
      seen.add(key);
      unique.push(item);
    });
    return unique.slice(0, 6);
  }, [customerHints, customerSuggestionActive, normalizedCustomerName, normalizedPhone]);
  const customerOngoingPackages = useMemo(
    () =>
      resolveOngoingPackages({
        stays: allStays,
        tenKhach: form.tenKhach,
        soDienThoai: form.soDienThoai,
        packageOptions,
      }),
    [allStays, form.soDienThoai, form.tenKhach, packageOptions],
  );

  const applyCustomerSuggestion = (item) => {
    setForm((prev) => ({
      ...prev,
      soDienThoai: item.soDienThoai || prev.soDienThoai,
      tenKhach: item.tenKhach || prev.tenKhach,
      maNhanVien: prev.maNhanVien || item.maNhanVien || "",
    }));
  };



  const handleAddPendingItem = () => {
    if (!selectedExtraProduct) return;
    setPendingItems((prev) => [
      ...prev,
      mapPendingItem({
        maSanPham: extraForm.maSanPham,
        tenSanPham: selectedExtraProduct.tenSanPham,
        soLuong: extraForm.soLuong,
        donGia: extraForm.donGia,
        donVi: selectedExtraProduct.donVi,
        ghiChu: extraForm.ghiChu,
      }),
    ]);
    setExtraForm((prev) => ({
      ...prev,
      maSanPham: "",
      soLuong: 1,
      donGia: 0,
      ghiChu: "",
    }));
  };

  const handleRemovePendingItem = (index) => {
    setPendingItems((prev) => prev.filter((_, idx) => idx !== index));
  };
  const handleSubmit = () => {
    clearFormDraft(bookingDraftKey);
    const now = new Date();
    const startIso = isInstantMode
      ? toVnDateTimeString(now)
      : form.batDauAt;
    const durationMinutes = Math.max(
      Number(
        selectedPackage?.thoiLuongPhut ||
          getStayDurationMinutes({
            batDauAt: startIso,
            ketThucDuKien: form.ketThucDuKien,
          }) ||
          0,
      ),
      15,
    );
    const endIso = isInstantMode
      ? toVnDateTimeString(new Date(now.getTime() + durationMinutes * 60000))
      : form.ketThucDuKien;
    let finalSchedule = form.lichTrinhChiTiet;
    if (progressMode === "CONTINUE") {
      const todayStr = toVnDateTimeString(new Date()).split('T')[0];
      try {
        let schedule = [];
        if (selectedBooking && selectedBooking.lichTrinhChiTiet) {
          schedule = JSON.parse(selectedBooking.lichTrinhChiTiet);
        } else {
          // Find the customer's progress to get their current schedule
          const pkg = todayComboCustomers.find(p => String(p.maTienTrinh || p.maPhien) === String(selectedProgressCode));
          if (pkg && pkg.lichTrinhChiTiet) {
            schedule = JSON.parse(pkg.lichTrinhChiTiet);
          }
        }
        
        if (Array.isArray(schedule)) {
          let updated = false;
          const mapped = schedule.map(s => {
            if (s.date === todayStr && String(s.status).toUpperCase() === "PENDING") {
              updated = true;
              return { ...s, status: "ATTENDED" };
            }
            return s;
          });
          if (updated) finalSchedule = mapped;
        }
      } catch (e) {}
    }

    onSubmit({
      maGiuong: form.maGiuong,
      tenKhach: form.tenKhach,
      soDienThoai: form.soDienThoai,
      maNhanVien: form.maNhanVien,
      maGoi: form.maGoi,
      tenGoi: selectedPackage?.tenGoi || selectedPackage?.tenDichVu || "",
      maDv: selectedPackage?.maDv || "",
      tenDichVu: selectedPackage?.tenDichVu || selectedPackage?.tenGoi || "",
      batDauAt: startIso,
      ketThucDuKien: endIso,
      thoiLuongPhut: durationMinutes,
      giaGoi: estimated,
      tienGoi: estimated,
      ghiChu: form.ghiChu,
      maTienTrinh: progressMode === "CONTINUE" ? String(selectedProgressPreview?.maTienTrinh || "").trim() : "",
      forceNewProgress: progressMode === "NEW",
      maPhien: selectedBooking?.maPhien || "",
      maLichHen: selectedBooking?.maLichHen || "",
      serviceItems: selectedBooking ? [] : pendingItems,
      tienCoc: form.tienCoc,
      lichTrinhChiTiet: finalSchedule,
    });
  };

  return (
    <div
      className="fixed inset-0 z-[9500] bg-slate-900/40 p-4 overflow-y-auto"
      data-testid="checkin-modal"
    >
      <div className="mx-auto mt-[3vh] w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl mb-4">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="text-base font-bold text-slate-800">
            {selectedRoom
              ? `${
                  isInstantMode ? "Mở phiên ngay" : "Đặt lịch hẹn"
                } cho ${selectedRoom.tenGiuong || selectedRoom.maGiuong || "giường"}`
              : isInstantMode
                ? "Mở phiên trị liệu ngay"
                : "Tạo lịch trị liệu"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            Đóng
          </button>
        </div>

        <div className="space-y-3 px-4 py-4">
          {selectedBooking ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Đang mở phiên từ lịch hẹn: <strong>{selectedBooking.maPhien || selectedBooking.maLichHen || "-"}</strong>.
            </div>
          ) : null}
          {sortedBookingCandidates.length > 0 ? (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Lịch hẹn của giường (tùy chọn)</label>
              <CustomDropdown
                value={selectedBookingId}
                onChange={(next) => setSelectedBookingId(String(next || "").trim())}
                options={[
                  { value: "", label: "Không dùng lịch hẹn (mở phiên mới)" },
                  ...sortedBookingCandidates.map((item) => {
                    const key = String(item.maPhien || item.maLichHen || "").trim();
                    return {
                      value: key,
                      label: `${prettyTime(getStayStartAt(item))} • ${item.tenKhach || "-"} • ${key}`,
                    };
                  }),
                ]}
                buttonClassName="py-2"
              />
            </div>
          ) : null}
          {todayComboCustomers.length > 0 && mode !== "BOOKING" && (
            <div className="space-y-1 rounded-xl border border-indigo-200 bg-indigo-50 p-3 shadow-sm">
              <div className="flex items-center gap-1.5 text-indigo-800">
                <Calendar className="h-4 w-4" />
                <span className="text-xs font-semibold">Khách tới lịch Combo hôm nay</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 mt-2">
                {todayComboCustomers.map((pkg) => {
                  let sessionLabel = "Buổi ?";
                  try {
                    const scheduleList = JSON.parse(pkg.lichTrinhChiTiet || "[]");
                    const normalIdx = !pkg.todaySession?.isTrial 
                      ? scheduleList.filter(s => !s.isTrial).findIndex(s => s.id === pkg.todaySession?.id) + 1 
                      : "-";
                    sessionLabel = pkg.todaySession?.isTrial ? "Trải nghiệm" : pkg.todaySession?.isMakeUp ? `Lịch bù (B.${normalIdx})` : `Buổi ${normalIdx}`;
                  } catch (e) {}
                  return (
                    <button
                      key={pkg.maTienTrinh || pkg.maPhien}
                      type="button"
                      onClick={() => {
                        setForm((p) => ({ ...p, tenKhach: pkg.tenKhach, soDienThoai: pkg.soDienThoai, maGoi: pkg.maGoi }));
                        setTimeout(() => {
                          setProgressMode("CONTINUE");
                          setSelectedProgressCode(pkg.maTienTrinh || pkg.maPhien);
                        }, 50);
                      }}
                      className="flex flex-col items-start gap-1 rounded-lg border border-indigo-200 bg-white p-2 text-left transition-colors hover:border-indigo-400 hover:bg-indigo-50"
                    >
                      <span className="text-[11px] font-semibold text-indigo-900">{pkg.tenKhach} • {pkg.soDienThoai}</span>
                      <div className="flex w-full items-center justify-between text-[10px] text-indigo-700 mt-1">
                        <span className="truncate max-w-[120px]">{pkg.tenGoi || pkg.tenDichVu}</span>
                        <span className="font-bold text-pink-600 bg-pink-50 px-1.5 rounded whitespace-nowrap">{sessionLabel}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Tên khách *</label>
              <input
                value={form.tenKhach}
                onChange={(e) => setForm((p) => ({ ...p, tenKhach: e.target.value }))}
                placeholder="Nhập tên khách để gợi ý khách cũ"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Số điện thoại</label>
              <input
                value={form.soDienThoai}
                onChange={(e) => setForm((p) => ({ ...p, soDienThoai: e.target.value }))}
                placeholder="Nhập SĐT để gợi ý khách cũ"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            {recognizedCustomer ? (
              <div className="sm:col-span-2 -mt-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                Đã nhận diện khách: <strong>{recognizedCustomer.tenKhach || "-"}</strong>
              </div>
            ) : customerSuggestionActive && suggestedCustomers.length > 0 ? (
              <div className="sm:col-span-2 -mt-1 rounded-xl border border-slate-200 bg-white shadow-sm">
                <p className="border-b border-slate-100 px-3 py-2 text-[11px] font-semibold text-slate-600">
                  Gợi ý khách cũ
                </p>
                <div className="max-h-52 overflow-auto p-1.5">
                  {suggestedCustomers.map((item, idx) => (
                    <button
                      key={`phone-suggest-${getCustomerIdentityKey(item)}-${idx}`}
                      type="button"
                      onClick={() => applyCustomerSuggestion(item)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-rose-50 hover:text-rose-700"
                    >
                      <span className="truncate font-semibold">
                        {item.tenKhach || "Khách cũ"}
                      </span>
                      <span className="shrink-0 text-xs text-slate-500">
                        {item.soDienThoai || "Chưa có SĐT"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Giường trị liệu *</label>
              <CustomDropdown
                value={form.maGiuong}
                onChange={(next) => setForm((p) => ({ ...p, maGiuong: String(next || "") }))}
                placeholder="Nhấp vào để chọn giường"
                preferPlaceholderWhenEmpty
                options={roomOptions.map((item) => ({
                  value: item.maGiuong,
                  label: getRoomOptionLabel(item),
                }))}
                buttonClassName="py-2"
              />
              {selectedRoom ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                  Trạng thái giường:{" "}
                  <strong className="text-slate-800">
                    {selectedRoom.trangThaiGiuong || ROOM_STATUS.AVAILABLE}
                  </strong>
                </div>
              ) : null}
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Nhân viên phụ trách</label>
              <CustomDropdown
                value={form.maNhanVien}
                onChange={(next) => setForm((p) => ({ ...p, maNhanVien: String(next || "") }))}
                placeholder="Nhấp vào để chọn nhân viên"
                preferPlaceholderWhenEmpty
                options={[
                  { value: "", label: "Chưa gán nhân viên" },
                  ...staffOptions.map((staff) => ({
                    value: staff.maNhanVien,
                    label: `${staff.tenNhanVien} • ${getStaffRoleLabel(staff)} • ${
                      getStaffCatalogStatus(staff) || "Sẵn sàng"
                    } • ${getStaffShiftLabelForDate(staff, schedules, form.batDauAt)}`,
                  })),
                ]}
                buttonClassName="py-2"
              />
              {selectedStaff && mode !== "BOOKING" ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                  Trạng thái nhân viên:{" "}
                  <strong className="text-slate-800">{selectedStaffUiStatus}</strong>
                  <span className="mt-1 block">
                    Ca làm:{" "}
                    <strong className="text-slate-800">
                      {getStaffShiftLabelForDate(selectedStaff, schedules, form.batDauAt)}
                    </strong>
                  </span>
                </div>
              ) : null}
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-semibold text-slate-600">Gói trị liệu *</label>
              <CustomDropdown
                value={form.maGoi}
                onChange={(next) => setForm((p) => ({ ...p, maGoi: String(next || "") }))}
                placeholder="Nhấp vào để chọn gói trị liệu"
                preferPlaceholderWhenEmpty
                options={packageOptions.map((item) => ({
                  value: item.maGoi,
                  label: `${item.tenGoi || item.tenDichVu} • ${fmt(item.giaBanGoi || item.giaGoi || 0)} • ${item.thoiLuongPhut || 0} phút`,
                }))}
                buttonClassName="py-2"
              />
              {customerOngoingPackages.length > 0 && mode !== "BOOKING" && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3 shadow-sm">
                  <div className="mb-2 flex items-center gap-1.5 text-amber-800">
                    <History className="h-4 w-4" />
                    <span className="text-xs font-semibold">Gói combo đang làm dở của khách:</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {customerOngoingPackages.map((pkg) => (
                      <button
                        key={pkg.maTienTrinh}
                        type="button"
                        onClick={() => {
                          setForm((p) => ({ ...p, maGoi: pkg.maGoi }));
                          setTimeout(() => {
                            setProgressMode("CONTINUE");
                            setSelectedProgressCode(pkg.maTienTrinh);
                          }, 50);
                        }}
                        className={`flex flex-col items-start gap-1 rounded-lg border p-2 text-left transition-colors ${
                          form.maGoi === pkg.maGoi && selectedProgressCode === pkg.maTienTrinh
                            ? "border-amber-500 bg-amber-100/50 ring-1 ring-amber-500"
                            : "border-amber-200 bg-white hover:border-amber-400 hover:bg-amber-50"
                        }`}
                      >
                        <span className="text-[11px] font-semibold text-amber-900">{pkg.tenGoi}</span>
                        <div className="flex w-full items-center justify-between text-[10px] text-amber-700">
                          <span>Đã dùng: {pkg.buoiDaDung}/{pkg.tongBuoiCombo}</span>
                          <span className="font-semibold text-amber-600">Còn {pkg.buoiConLai} buổi</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            </div>
            
            {selectedPackage && progressMode === "NEW" && Math.max(Number(selectedPackage.soBuoiQuyDoi || 1), 1) >= 2 && (
              <div className="sm:col-span-2 space-y-4 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 mt-2">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-indigo-900">Thiết lập lộ trình Combo mới</h4>
                  <span className="text-xs text-indigo-700 bg-indigo-100 px-2 py-1 rounded-md">
                    Tổng: {Math.max(Number(selectedPackage.soBuoiQuyDoi || 1), 1)} buổi
                  </span>
                </div>
                
                <div className="flex flex-col gap-4 items-start">
                  <div className="w-full">
                    <div className="rounded-xl bg-white p-3.5 border border-indigo-100 shadow-sm">
                      <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-2">Tóm tắt Gói Combo</p>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500 text-xs">Tên gói:</span>
                          <span className="font-semibold text-slate-800 truncate max-w-[200px] sm:max-w-xs" title={selectedPackage?.tenGoi || selectedPackage?.tenDichVu}>{selectedPackage?.tenGoi || selectedPackage?.tenDichVu}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500 text-xs">Giá trị gói:</span>
                          <span className="font-bold text-slate-800">{fmt(estimated)}</span>
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                          <span className="text-slate-500 text-xs">Đã xếp lịch:</span>
                          <span className={`font-bold ${(form.lichTrinhChiTiet || []).length === Math.max(Number(selectedPackage.soBuoiQuyDoi || 1), 1) ? 'text-emerald-600' : 'text-indigo-600'}`}>
                            {(form.lichTrinhChiTiet || []).length} / {Math.max(Number(selectedPackage.soBuoiQuyDoi || 1), 1)} buổi
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="w-full flex justify-center">
                    <MultiDatePicker
                      selectedDates={form.lichTrinhChiTiet || []}
                      maxSessions={Math.max(Number(selectedPackage.soBuoiQuyDoi || 1), 1)}
                      onChange={(dates) => setForm(p => ({ ...p, lichTrinhChiTiet: dates }))}
                      startDate={parseVnDateTimeMs(form.batDauAt) ? new Date(parseVnDateTimeMs(form.batDauAt)) : new Date()}
                    />
                  </div>
                </div>
              </div>
            )}

          <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-700">Sản phẩm/dịch vụ phát sinh</p>
                <p className="text-xs text-slate-500">
                  {selectedBooking
                    ? "Đơn hẹn đã có sẵn được chỉnh ở popup phiên hiện có."
                    : "Tùy chọn thêm trước khi mở phiên hoặc tạo lịch hẹn."}
                </p>
              </div>
              <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600">
                {fmt(pendingItemsTotal)}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-semibold text-slate-600">Sản phẩm / dịch vụ</label>
                <CustomDropdown
                  value={extraForm.maSanPham}
                  onChange={(next) => {
                    const nextCode = String(next || "").trim();
                    const found = productOptions.find(
                      (item) => String(item.maSanPham || "").trim() === nextCode,
                    );
                    setExtraForm((prev) => ({
                      ...prev,
                      maSanPham: nextCode,
                      donGia: Math.max(Number(found?.donGiaBan || prev.donGia || 0), 0),
                    }));
                  }}
                  placeholder="Nhấp vào để chọn sản phẩm / dịch vụ"
                  preferPlaceholderWhenEmpty
                  options={productOptions.map((item) => ({
                    value: item.maSanPham,
                    label: `${item.tenSanPham || item.maSanPham || "Sản phẩm"} • ${fmt(item.donGiaBan || 0)}`,
                  }))}
                  buttonClassName="py-2"
                  disabled={Boolean(selectedBooking)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Số lượng</label>
                <input
                  type="number"
                  min="1"
                  value={extraForm.soLuong}
                  disabled={Boolean(selectedBooking)}
                  onChange={(e) =>
                    setExtraForm((prev) => ({
                      ...prev,
                      soLuong: Math.max(1, Number(e.target.value || 1)),
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-100"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Đơn giá</label>
                <input
                  value={extraForm.donGia}
                  disabled={Boolean(selectedBooking)}
                  onChange={(e) =>
                    setExtraForm((prev) => ({
                      ...prev,
                      donGia: Number(String(e.target.value).replace(/[^\d]/g, "") || 0),
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-100"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={extraForm.ghiChu}
                disabled={Boolean(selectedBooking)}
                onChange={(e) =>
                  setExtraForm((prev) => ({
                    ...prev,
                    ghiChu: e.target.value,
                  }))
                }
                placeholder="Ghi chú cho dòng phát sinh"
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-100"
              />
              <button
                type="button"
                disabled={Boolean(selectedBooking) || !extraForm.maSanPham}
                onClick={handleAddPendingItem}
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-60"
              >
                Thêm dòng
              </button>
            </div>
            <div className="max-h-40 overflow-auto rounded-xl border border-slate-200 bg-white">
              {pendingItems.length === 0 ? (
                <div className="px-3 py-3 text-sm text-slate-500">Chưa có dòng phát sinh.</div>
              ) : (
                pendingItems.map((item, index) => (
                  <div
                    key={`pending-service-${item.maSanPham || "item"}-${index}`}
                    className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-800">{item.tenSanPham || item.maSanPham}</p>
                      <p className="truncate text-xs text-slate-500">
                        {item.soLuong} {item.donVi || ""} x {fmt(item.donGia)}
                        {item.ghiChu ? ` • ${item.ghiChu}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-800">
                        {fmt(Number(item.soLuong || 0) * Number(item.donGia || 0))}
                      </p>
                      {!selectedBooking ? (
                        <button
                          type="button"
                          onClick={() => handleRemovePendingItem(index)}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700"
                        >
                          Xóa
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {isInstantMode ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-sm text-slate-700">
              <p>
                Bắt đầu: <strong>ngay khi xác nhận</strong>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Giờ kết thúc dự kiến sẽ tự tính theo thời lượng gói trị liệu đã chọn.
              </p>
            </div>
          ) : (
            <>
              <DateTimePicker
                label="Giờ bắt đầu"
                value={form.batDauAt}
                onChange={(iso) => setForm((p) => ({ ...p, batDauAt: iso }))}
                disabled={loading}
                testId="booking-start-picker"
              />

              <DateTimePicker
                label="Giờ kết thúc dự kiến"
                value={form.ketThucDuKien}
                onChange={(iso) => setForm((p) => ({ ...p, ketThucDuKien: iso }))}
                minDate={form.batDauAt ? form.batDauAt.slice(0, 10) : undefined}
                disabled={loading}
                testId="booking-end-picker"
              />
              {String(form.maGiuong || "").trim() && !roomBookingConflict ? (
                <div className="rounded-xl border border-sky-200 bg-sky-50/70 px-3 py-2 text-sm text-slate-700">
                  {selectedRoomBookings.length > 0 ? (
                    <>
                      Lịch đã có của giường này:
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedRoomBookings.map((stay) => (
                          <span
                            key={`room-booking-${getStayIdentityKey(stay)}`}
                            className="rounded-full border border-sky-200 bg-white px-2 py-1 text-[11px] font-semibold text-sky-700"
                          >
                            {formatTimeOnly(getStayStartAt(stay))} -{" "}
                            {formatTimeOnly(getStayExpectedEndAt(stay))} •{" "}
                            {stay.tenKhach || stay.maPhien || "Khách"} • {getStayStatus(stay)}
                          </span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>Chưa có lịch hẹn nào khác trên giường này trong tương lai.</>
                  )}
                </div>
              ) : null}
              {String(form.maNhanVien || "").trim() && !staffScheduleConflict ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-sm text-slate-700">
                  {selectedStaffSchedules.length > 0 ? (
                    <>
                      Lịch đã có của nhân viên này:
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedStaffSchedules.map((stay) => (
                          <span
                            key={`staff-booking-${getStayIdentityKey(stay)}`}
                            className="rounded-full border border-emerald-200 bg-white px-2 py-1 text-[11px] font-semibold text-emerald-700"
                          >
                            {formatTimeOnly(getStayStartAt(stay))} -{" "}
                            {formatTimeOnly(getStayExpectedEndAt(stay))} •{" "}
                            {stay.maGiuong || "Giường"} • {stay.tenKhach || "Khách"} •{" "}
                            {getStayStatus(stay)}
                          </span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>Chưa có lịch nào khác của nhân viên này trong cùng khoảng thời gian tương lai.</>
                  )}
                </div>
              ) : null}
            </>
          )}


          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <p className="font-semibold text-slate-800">
                {selectedPackage?.tenGoi || selectedPackage?.tenDichVu || "Chưa chọn gói"}
              </p>
              <p className="text-xs text-slate-500">
                {selectedPackage?.thoiLuongPhut || 0} phút • {fmt(selectedPackage?.giaBanGoi || selectedPackage?.giaGoi || 0)}
              </p>
              {selectedProgressPreview ? (
                <div className="mt-2 rounded-lg border border-emerald-200 bg-white px-2.5 py-2 text-[11px] text-slate-600">
                  {treatmentProgressCandidates.length > 0 ? (
                    <div className="mb-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setProgressMode("CONTINUE")}
                        className={`rounded-full border px-2.5 py-1 font-semibold ${
                          progressMode === "CONTINUE"
                            ? "border-emerald-400 bg-emerald-100 text-emerald-700"
                            : "border-slate-200 bg-white text-slate-600"
                        }`}
                      >
                        Làm tiếp tiến trình cũ
                      </button>
                      <button
                        type="button"
                        onClick={() => setProgressMode("NEW")}
                        className={`rounded-full border px-2.5 py-1 font-semibold ${
                          progressMode === "NEW"
                            ? "border-rose-300 bg-rose-50 text-rose-700"
                            : "border-slate-200 bg-white text-slate-600"
                        }`}
                      >
                        Mở tiến trình mới
                      </button>
                    </div>
                  ) : null}
                  {progressMode === "CONTINUE" && treatmentProgressCandidates.length > 1 ? (
                    <div className="mb-2">
                      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Chọn tiến trình đang dở
                      </label>
                      <select
                        value={selectedProgressCode}
                        onChange={(e) => setSelectedProgressCode(String(e.target.value || "").trim())}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-medium text-slate-700"
                      >
                        {treatmentProgressCandidates.map((item) => (
                          <option key={item.maTienTrinh} value={item.maTienTrinh}>
                            {item.maTienTrinh} • buổi {item.buoiTiepTheo}/{item.tongBuoiCombo}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  <p className="font-semibold text-emerald-700">
                    {selectedProgressPreview.maTienTrinh
                      ? `Tiến trình hiện tại: ${selectedProgressPreview.maTienTrinh}`
                      : "Sẽ mở tiến trình mới"}
                  </p>
                  <p className="mt-1">
                    Buổi này:{" "}
                    <strong>
                      {selectedProgressPreview.buoiTiepTheo}/{selectedProgressPreview.tongBuoiCombo}
                    </strong>
                    {selectedProgressPreview.maTienTrinh
                      ? ` • Còn lại ${selectedProgressPreview.buoiConLai} buổi sau phiên này`
                      : ` • Combo ${selectedProgressPreview.tongBuoiCombo} buổi`}
                  </p>
                  <p className="mt-1">
                    Thu tiền gói:{" "}
                    <strong>
                      {selectedProgressPreview.seThuTienGoi ? "Có, ở buổi đầu tiên" : "Không, combo đã thu từ buổi trước"}
                    </strong>
                  </p>
                </div>
              ) : null}
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Khách trả trước (Tiền cọc)</label>
              <div className="relative">
                <input
                  type="text"
                  value={form.tienCoc ? fmt(form.tienCoc).replace(/\s?₫/, '') : ""}
                  onChange={(e) => {
                    const val = Number(String(e.target.value).replace(/[^\d]/g, ""));
                    setForm(p => ({ ...p, tienCoc: val }));
                  }}
                  className="w-full rounded-xl border border-slate-200 pl-3 pr-8 py-2 text-sm bg-white focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-colors font-bold text-slate-800 placeholder:font-normal"
                  placeholder="Nhập số tiền cọc (nếu có)..."
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₫</span>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Ghi chú</label>
              <input
                value={form.ghiChu}
                onChange={(e) => setForm((p) => ({ ...p, ghiChu: e.target.value }))}
                placeholder="Ghi chú thêm"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {!isInstantMode ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-sm text-slate-700">
              Thời lượng lịch: <strong>{durationInfo.displayLabel}</strong>
              <span className="mx-2">•</span>
              Giá gói áp dụng: <strong>{fmt(estimated)}</strong>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3">
          {validationErrors.length > 0 ? (
            <div className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              <ul className="list-inside list-disc">
                {validationErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            {!isInstantMode ? (
              <button
                type="button"
                onClick={() =>
                  onCreateBooking({
                    maGiuong: form.maGiuong,
                    tenKhach: form.tenKhach,
                    soDienThoai: form.soDienThoai,
                    maNhanVien: form.maNhanVien,
                    maGoi: form.maGoi,
                    tenGoi: selectedPackage?.tenGoi || selectedPackage?.tenDichVu || "",
                    maDv: selectedPackage?.maDv || "",
                    tenDichVu: selectedPackage?.tenDichVu || selectedPackage?.tenGoi || "",
                    batDauAt: form.batDauAt,
                    ketThucDuKien: form.ketThucDuKien,
                    thoiLuongPhut: Math.max(Number(selectedPackage?.thoiLuongPhut || getStayDurationMinutes(form) || 0), 0),
                    giaGoi: estimated,
                    tienGoi: estimated,
                    ghiChu: form.ghiChu,
                    maTienTrinh: progressMode === "CONTINUE" ? String(selectedProgressPreview?.maTienTrinh || "").trim() : "",
                    forceNewProgress: progressMode === "NEW",
                    serviceItems: pendingItems,
                  })
                }
                disabled={
                  loading ||
                  Boolean(selectedBooking) ||
                  validationErrors.length > 0 ||
                  !String(form.tenKhach || "").trim() ||
                  !String(form.maGiuong || "").trim() ||
                  !String(form.maGoi || "").trim()
                }
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-60"
              >
                Tạo lịch hẹn
              </button>
            ) : null}
            {isInstantMode ? (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={
                  loading ||
                  validationErrors.length > 0 ||
                  !String(form.tenKhach || "").trim() ||
                  !String(form.maGiuong || "").trim() ||
                  !String(form.maGoi || "").trim()
                }
                className="rounded-xl border border-rose-600 bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {loading ? "Đang xử lý..." : "Mở phiên ngay"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}


function StayModal({
  room,
  stay,
  catalog,
  onClose,
  onAddService,
  onUpdateService,
  onDeleteService,
  onCheckout,
  onUpdateTime,
  onUseBooking,
  onNoShow,
  loading,
  staffs,
}) {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [tab, setTab] = useState("service");
  const [satisfactionScore, setSatisfactionScore] = useState(5);
  const [paymentMethod, setPaymentMethod] = useState("TIEN_MAT");
  const [qrCheckout, setQrCheckout] = useState({
    loading: false,
    qrImageUrl: "",
    qrEmvCode: "",
    error: "",
    oxuStatus: "",
    bankSource: "",
    oxuMessage: "",
  });
  const qrRequestKeyRef = useRef("");
  const qrImageCacheRef = useRef({ key: "", url: "", qrEmvCode: "", bankConfig: null });
  const [oxuBusy, setOxuBusy] = useState("");
  const [form, setForm] = useState(() => ({
    maSanPham: "",
    soLuong: 1,
    donGia: 0,
    ghiChu: "",
  }));
  const [editingService, setEditingService] = useState(null);
  const [editForm, setEditForm] = useState({ soLuong: 1, donGia: 0, ghiChu: "" });
  const [editingTime, setEditingTime] = useState(false);
  const [timeForm, setTimeForm] = useState(() => ({
    batDauAt: getStayStartAt(stay) || toVnDateTimeString(new Date()),
    ketThucDuKien:
      getStayExpectedEndAt(stay) ||
      toVnDateTimeString(new Date(Date.now() + Math.max(getStayDurationMinutes(stay) || 60, 15) * 60000)),
    maNhanVien: String(stay?.maNhanVien || "").trim(),
  }));

  const lastSyncedStayIdRef = useRef("");
  useEffect(() => {
    if (!stay) return;
    const stayId = String(stay.maPhien || "").trim();
    if (stayId && lastSyncedStayIdRef.current === stayId) return;
    if (stayId) lastSyncedStayIdRef.current = stayId;

    setTimeForm({
      batDauAt: getStayStartAt(stay) || toVnDateTimeString(new Date()),
      ketThucDuKien:
        getStayExpectedEndAt(stay) ||
        toVnDateTimeString(new Date(Date.now() + Math.max(getStayDurationMinutes(stay) || 60, 15) * 60000)),
      maNhanVien: String(stay?.maNhanVien || "").trim(),
    });
  }, [stay]);

  const selectedProduct = useMemo(
    () => catalog.find((x) => String(x.maSanPham) === String(form.maSanPham)),
    [catalog, form.maSanPham],
  );
  const durationInfo = useMemo(
    () => calculateDuration(timeForm.batDauAt, timeForm.ketThucDuKien, "THEO_GIO"),
    [timeForm.batDauAt, timeForm.ketThucDuKien],
  );
  const stayStatus = getStayStatus(stay);
  const canManageItems = isStayPlannable(stay);
  const canEditTime = isStayPlannable(stay);
  const canCheckout = canStayCheckout(stay);
  const readOnlyStay = isStayReadOnly(stay);

  const applyCheckoutQrResult = useCallback((result, requestKey) => {
    if (!result.ok) {
      setQrCheckout({
        loading: false,
        qrImageUrl: "",
        qrEmvCode: "",
        error: result.message,
        oxuStatus: "",
        bankSource: "",
        oxuMessage: "",
      });
      return;
    }

      const oxuStatus = result.presentation.qrCode
        ? result.oxu?.ok
          ? "sent"
          : result.oxu?.skipped
            ? "pending"
            : "failed"
        : "";
    setQrCheckout({
      loading: false,
      qrImageUrl: result.presentation.qrImageUrl || "",
      qrEmvCode: result.presentation.qrCode || "",
      error: result.presentation.warning || "",
      oxuStatus,
      bankSource: result.bankConfig?.source || "",
      oxuMessage: result.oxu?.message || "",
    });
    qrImageCacheRef.current = {
      key: requestKey,
      url: result.presentation.qrImageUrl || "",
      qrEmvCode: result.presentation.qrCode || "",
      bankConfig: result.bankConfig || null,
    };

    if (result.oxu?.ok) {
      // Lệnh QR đã chuyển sang popup/host OXU — không hiện toast thành công.
    } else if (result.presentation.qrCode && result.oxu?.message) {
      toast.error(result.oxu.message, { id: "checkout-oxu-fail" });
    } else if (result.presentation.warning) {
      toast.error(result.presentation.warning, { id: "checkout-qr-static" });
    }
  }, []);

  const loadCheckoutQrExperience = useCallback(
    async ({ forceRefresh = false, autoPushOxu = true } = {}) => {
      const requestKey = `${stay?.maPhien || ""}:${stay?.tongThanhToan || 0}`;
      if (
        !forceRefresh &&
        qrImageCacheRef.current.key === requestKey &&
        qrImageCacheRef.current.url
      ) {
        setQrCheckout((prev) => ({
          ...prev,
          loading: false,
          qrImageUrl: qrImageCacheRef.current.url,
          qrEmvCode: qrImageCacheRef.current.qrEmvCode || "",
        }));
        return;
      }

      qrRequestKeyRef.current = requestKey;
      setQrCheckout((prev) => ({
        ...prev,
        loading: true,
        error: "",
        oxuStatus: "",
        bankSource: "",
        oxuMessage: "",
      }));

      const result = await prepareCheckoutQrExperience({
        stay,
        getBankConfigFn: getBankConfig,
        autoPushOxu: false,
        forceRefreshBank: forceRefresh,
        forceRefreshQr: forceRefresh,
      });
      applyCheckoutQrResult(result, requestKey);

      if (autoPushOxu && result?.ok && result.presentation?.qrCode && result.bankConfig) {
        void syncCheckoutQrToOxuPopup({
          bankConfig: result.bankConfig,
          stay,
          presentation: result.presentation,
        }).then((oxu) => {
          if (qrRequestKeyRef.current !== requestKey) return;
          setQrCheckout((prev) => ({
            ...prev,
            oxuStatus: oxu.ok ? "popup" : "failed",
            oxuMessage: oxu.ok ? "" : oxu.message || "",
          }));
          if (!oxu.ok && oxu.message) {
            toast(oxu.message, { id: "checkout-oxu-popup", icon: "🔌" });
          }
        });
      }

      return result;
    },
    [applyCheckoutQrResult, stay],
  );

  const handleSelectPaymentMethod = (nextMethod) => {
    if (nextMethod === "CHUYEN_KHOAN") {
      primeOxuBridgePopupSync();
    }
    setPaymentMethod(nextMethod);
  };

  useEffect(() => {
    if (
      tab !== "checkout" ||
      paymentMethod !== "CHUYEN_KHOAN" ||
      stayStatus !== SESSION_STATUS.IN_HOUSE
    ) {
      return undefined;
    }

    let cancelled = false;
    primeOxuBridgePopupSync();
    void loadCheckoutQrExperience({ autoPushOxu: true }).then((result) => {
      if (cancelled && result) {
        // noop — cancelled before resolve
      }
    });

    return () => {
      cancelled = true;
    };
  }, [tab, paymentMethod, stay?.maPhien, stay?.tongThanhToan, stayStatus, loadCheckoutQrExperience]);

  useEffect(() => {
    if (paymentMethod !== "CHUYEN_KHOAN") {
      qrRequestKeyRef.current = "";
      qrImageCacheRef.current = { key: "", url: "", qrEmvCode: "", bankConfig: null };
      setQrCheckout({
        loading: false,
        qrImageUrl: "",
        qrEmvCode: "",
        error: "",
        oxuStatus: "",
        bankSource: "",
        oxuMessage: "",
      });
    }
  }, [paymentMethod]);

  const handleRefreshBankFromSheet = async () => {
    setOxuBusy("refresh");
    try {
      clearReadCacheByKeys([CACHE_KEYS.bankConfig], { source: "checkout_refresh_bank" });
      setBankConfig(null);
      qrRequestKeyRef.current = "";
      qrImageCacheRef.current = { key: "", url: "", qrEmvCode: "", bankConfig: null };
      const result = await loadCheckoutQrExperience({
        forceRefresh: true,
        autoPushOxu: false,
      });
      if (result?.ok) {
        // STK đã cập nhật từ sheet BANK.
      } else if (result?.message) {
        toast.error(result.message);
      }
    } finally {
      setOxuBusy("");
    }
  };

  const handleOpenOxuQrPopup = async () => {
    const qrEmvCode = qrCheckout.qrEmvCode || qrImageCacheRef.current.qrEmvCode;
    const bankConfig = qrImageCacheRef.current.bankConfig;
    if (!qrEmvCode) {
      toast.error("Chưa có mã EMVCo — đợi VietQR tạo xong hoặc bấm cập nhật STK từ sheet.");
      return;
    }
    if (!bankConfig) {
      toast.error("Thiếu thông tin tài khoản ngân hàng.");
      return;
    }
    primeOxuBridgePopupSync();
    setOxuBusy("push");
    try {
      const oxu = await syncCheckoutQrToOxuPopup({
        bankConfig,
        stay,
        presentation: {
          qrImageUrl: qrCheckout.qrImageUrl || qrImageCacheRef.current.url,
          qrCode: qrEmvCode,
        },
      });
      if (oxu.ok) {
        setQrCheckout((prev) => ({
          ...prev,
          oxuStatus: "popup",
          oxuMessage: "",
        }));
      } else {
        setQrCheckout((prev) => ({
          ...prev,
          oxuStatus: "failed",
          oxuMessage: oxu.message || "",
        }));
        toast(oxu.message || "Không mở được popup OXU.", { id: "checkout-oxu-popup" });
      }
    } finally {
      setOxuBusy("");
    }
  };

  const handleStartEditService = (item, index) => {
    if (!canManageItems) return;
    setEditingService({
      ...item,
      index,
      serviceItemId: String(item.serviceItemId || ""),
    });
    setEditForm({
      soLuong: Number(item.soLuong || 1),
      donGia: Number(item.donGia || 0),
      ghiChu: String(item.ghiChu || ""),
    });
  };

  const handleSaveEditService = async () => {
    if (!canManageItems) return;
    if (!editingService) return;
    await onUpdateService({
      maPhien: stay?.maPhien,
      serviceItemId: editingService.serviceItemId,
      soLuong: editForm.soLuong,
      donGia: editForm.donGia,
      ghiChu: editForm.ghiChu,
    });
    setEditingService(null);
  };

  const handleDeleteService = async (serviceItemId) => {
    if (!canManageItems) return;
    const ok = await confirm({ message: "Xóa dịch vụ này?", yesLabel: "Xóa" });
    if (!ok) return;
    await onDeleteService({ maPhien: stay?.maPhien, serviceItemId });
  };

  const handleSaveTime = async () => {
    if (!canEditTime) return;
    if (!durationInfo.isValid) {
      toast.error(durationInfo.error);
      return;
    }
    const nextPayload = {
      maPhien: stay?.maPhien,
      batDauAt: timeForm.batDauAt,
      ketThucDuKien: timeForm.ketThucDuKien,
      maNhanVien: timeForm.maNhanVien,
      thoiLuongPhut: Math.max(
        Math.round(
          (parseVnDateTimeMs(timeForm.ketThucDuKien) - parseVnDateTimeMs(timeForm.batDauAt)) /
            60000,
        ),
        0,
      ),
    };
    setEditingTime(false);
    const ok = await onUpdateTime(nextPayload);
    if (!ok) {
      setEditingTime(true);
    }
  };

  return (
    <div className="fixed inset-0 z-[9500] overflow-y-auto bg-slate-900/40 p-4">
      {confirmDialog}
      <div className="mx-auto mb-4 mt-[3vh] w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h3 className="text-base font-bold text-slate-800">
              Phiên {stay?.maPhien || "-"} • {room?.tenGiuong || room?.maGiuong || "Giường trị liệu"}
            </h3>
            <p className="text-xs text-slate-500">
              Khách: {stay?.tenKhach || "-"} • Bắt đầu: {prettyTime(getStayStartAt(stay))}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            Đóng
          </button>
        </div>

        <div className="overflow-x-auto border-b border-slate-200 px-3 py-2">
          <div className="inline-flex min-w-max rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setTab("service")}
              className={`rounded-lg px-3 py-1.5 whitespace-nowrap ${tab === "service" ? "bg-white text-rose-700" : "text-slate-600"}`}
            >
              {stayStatus === SESSION_STATUS.BOOKED ? "Dự kiến sản phẩm" : "Dịch vụ/sản phẩm"}
            </button>
            <button
              type="button"
              onClick={() => setTab("time")}
              className={`rounded-lg px-3 py-1.5 whitespace-nowrap ${tab === "time" ? "bg-white text-amber-700" : "text-slate-600"}`}
            >
              Sửa thời gian
            </button>
            <button
              type="button"
              onClick={() => setTab("checkout")}
              className={`rounded-lg px-3 py-1.5 whitespace-nowrap ${tab === "checkout" ? "bg-white text-emerald-700" : "text-slate-600"}`}
            >
              {stayStatus === SESSION_STATUS.BOOKED ? "Xử lý lịch hẹn" : "Kết thúc phiên"}
            </button>
          </div>
        </div>

        <div className="space-y-3 px-4 py-4">
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="rounded-lg bg-slate-50 px-2 py-2">
              Gói trị liệu
              <strong className="block">{stay?.tenGoi || stay?.tenDichVu || "-"}</strong>
            </div>
            <div className="rounded-lg bg-slate-50 px-2 py-2">
              Tiền gói
              <strong className="block">{fmt(getStayPackageAmount(stay))}</strong>
            </div>
            <div className="rounded-lg bg-slate-50 px-2 py-2">
              Dịch vụ thêm
              <strong className="block">{fmt(stay?.tienDichVu)}</strong>
            </div>
            <div className="rounded-lg bg-slate-50 px-2 py-2">
              Tổng phiên
              <strong className="block">{fmt(stay?.tongThanhToan)}</strong>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 border border-slate-100 mb-2">
            <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">Nhân viên phụ trách:</span>
            <div className="flex-1 max-w-[300px]">
              <CustomDropdown
                value={timeForm.maNhanVien}
                onChange={async (val) => {
                  setTimeForm((p) => ({ ...p, maNhanVien: val }));
                  await onUpdateTime({
                    maPhien: stay?.maPhien,
                    // Use timeForm state, not stale stay prop - avoids overwriting user-edited time
                    batDauAt: timeForm.batDauAt,
                    ketThucDuKien: timeForm.ketThucDuKien,
                    maNhanVien: val,
                    thoiLuongPhut: stay?.thoiLuongPhut,
                  });
                }}
                options={[
                  { value: "", label: "Chưa gán nhân viên" },
                  ...(Array.isArray(staffs) ? staffs : []).map((s) => ({ value: String(s.maNhanVien || ""), label: `${s.tenNhanVien} (${s.maNhanVien})` }))
                ]}
                placeholder="Chọn nhân viên"
                disabled={loading || !canEditTime}
                buttonClassName="py-1.5 min-h-[32px] text-xs"
              />
            </div>
          </div>

          {tab === "service" ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-600">Dịch vụ/sản phẩm thêm</label>
                  <CustomDropdown
                    value={form.maSanPham}
                    onChange={(next) => {
                      const code = String(next || "");
                      const found = catalog.find((x) => String(x.maSanPham) === String(code));
                      setForm((p) => ({
                        ...p,
                        maSanPham: code,
                        donGia: Number(found?.donGiaBan || p.donGia || 0),
                      }));
                    }}
                    buttonClassName="py-2"
                    placeholder="Nhấp vào để chọn sản phẩm / dịch vụ"
                    preferPlaceholderWhenEmpty
                    options={catalog.map((p) => ({
                      value: p.maSanPham,
                      label: `${p.tenSanPham} (${p.nhomHang || "-"})`,
                    }))}
                    disabled={!canManageItems}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Số lượng</label>
                  <input
                    type="number"
                    min="1"
                    value={form.soLuong}
                    disabled={!canManageItems}
                    onChange={(e) => setForm((p) => ({ ...p, soLuong: Math.max(1, Number(e.target.value || 1)) }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-100"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Đơn giá</label>
                  <input
                    value={form.donGia}
                    disabled={!canManageItems}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        donGia: Number(String(e.target.value).replace(/[^\d]/g, "") || 0),
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-100"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Ghi chú</label>
                <input
                  value={form.ghiChu}
                  disabled={!canManageItems}
                  onChange={(e) => setForm((p) => ({ ...p, ghiChu: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-100"
                  placeholder="Ghi chú cho dòng phát sinh"
                />
              </div>
              <div className="rounded-xl border border-rose-200 bg-rose-50/70 px-3 py-2 text-sm text-slate-700">
                {selectedProduct?.tenSanPham || "Mặt hàng"}: <strong>{fmt(Number(form.soLuong || 0) * Number(form.donGia || 0))}</strong>
              </div>
              <button
                type="button"
                onClick={() =>
                  onAddService({
                    maPhien: stay?.maPhien,
                    maSanPham: form.maSanPham,
                    tenSanPham: selectedProduct?.tenSanPham || "",
                    soLuong: Number(form.soLuong || 1),
                    donGia: Number(form.donGia || 0),
                    ghiChu: form.ghiChu,
                  })
                }
                disabled={loading || !form.maSanPham || !canManageItems}
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-60"
              >
                {loading
                  ? "Đang thêm..."
                  : stayStatus === SESSION_STATUS.BOOKED
                    ? "Thêm dòng dự kiến"
                    : "Thêm dịch vụ/sản phẩm"}
              </button>
              <div className="max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white">
                {(stay?.serviceItems || []).length === 0 ? (
                  <div className="px-3 py-3 text-sm text-slate-500">Chưa có phát sinh.</div>
                ) : (
                  (stay?.serviceItems || []).map((item, idx) => (
                    <div
                      key={item.serviceItemId || `${stay?.maPhien}-svc-${idx}`}
                      className="border-b border-slate-100 px-3 py-2 text-sm last:border-b-0"
                    >
                      {editingService?.serviceItemId === item.serviceItemId ? (
                        <div className="space-y-2">
                          <p className="font-semibold text-slate-800">{item.tenSanPham}</p>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              min="1"
                              value={editForm.soLuong}
                              onChange={(e) => setEditForm((p) => ({ ...p, soLuong: Math.max(1, Number(e.target.value || 1)) }))}
                              className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm"
                            />
                            <input
                              value={editForm.donGia}
                              onChange={(e) => setEditForm((p) => ({ ...p, donGia: Number(String(e.target.value).replace(/[^\d]/g, "") || 0) }))}
                              className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-sm"
                            />
                            <input
                              value={editForm.ghiChu}
                              onChange={(e) => setEditForm((p) => ({ ...p, ghiChu: e.target.value }))}
                              className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-sm"
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={handleSaveEditService}
                              disabled={loading || !canManageItems}
                              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                            >
                              Lưu
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingService(null)}
                              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700"
                            >
                              Hủy
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1">
                            <p className="font-semibold text-slate-800">{item.tenSanPham}</p>
                            <p className="text-xs text-slate-500">
                              {item.soLuong} {item.donVi || ""} x {fmt(item.donGia)}
                              {item.ghiChu ? ` • ${item.ghiChu}` : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-slate-800">{fmt(item.thanhTien)}</p>
                            <button
                              type="button"
                              onClick={() => handleStartEditService(item, idx)}
                              disabled={!canManageItems}
                              className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700"
                            >
                              Sửa
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteService(item.serviceItemId)}
                              disabled={!canManageItems}
                              className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700"
                            >
                              Xóa
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </>
          ) : null}

          {tab === "time" ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-sm text-slate-700">
                <p className="font-semibold">Sửa thời gian / nhân viên</p>
                <p className="mt-1 text-xs text-slate-500">
                  {canEditTime
                    ? "Giá gói không đổi theo giường. Bạn chỉ đang điều chỉnh mốc thời gian của phiên."
                    : "Phiên đã hoàn tất nên phần thời gian chỉ còn để xem lại lịch sử."}
                </p>
              </div>
              <DateTimePicker
                label="Giờ bắt đầu"
                value={timeForm.batDauAt}
                onChange={(iso) => setTimeForm((p) => {
                  const startMs = parseVnDateTimeMs(iso);
                  if (!Number.isFinite(startMs)) return { ...p, batDauAt: iso };
                  const oldStartMs = parseVnDateTimeMs(p.batDauAt);
                  const endMs = parseVnDateTimeMs(p.ketThucDuKien);
                  if (Number.isFinite(oldStartMs) && Number.isFinite(endMs) && endMs >= oldStartMs) {
                    const diff = endMs - oldStartMs;
                    return { ...p, batDauAt: iso, ketThucDuKien: toVnDateTimeString(new Date(startMs + diff)) };
                  }
                  return { ...p, batDauAt: iso };
                })}
                disabled={loading || !editingTime || !canEditTime}
                testId="edit-start-picker"
              />
              <DateTimePicker
                label="Giờ kết thúc dự kiến"
                value={timeForm.ketThucDuKien}
                onChange={(iso) => setTimeForm((p) => ({ ...p, ketThucDuKien: iso }))}
                minDate={timeForm.batDauAt ? getDatePartFromVnDateTime(timeForm.batDauAt) : undefined}
                disabled={loading || !editingTime || !canEditTime}
                testId="edit-end-picker"
              />
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Nhân viên phụ trách</label>
                <CustomDropdown
                  value={timeForm.maNhanVien}
                  onChange={(val) => setTimeForm((p) => ({ ...p, maNhanVien: val }))}
                  options={[
                    { value: "", label: "Chưa gán nhân viên" },
                    ...(Array.isArray(staffs) ? staffs : []).map((s) => ({ value: String(s.maNhanVien || ""), label: `${s.tenNhanVien} (${s.maNhanVien})` }))
                  ]}
                  placeholder="Chọn nhân viên"
                  disabled={loading || !editingTime || !canEditTime}
                />
              </div>
              <div className={`rounded-xl border px-3 py-2 text-sm ${durationInfo.isValid ? "border-amber-200 bg-amber-50/70 text-slate-700" : "border-red-300 bg-red-50 text-red-600"}`}>
                {durationInfo.error ? (
                  <span className="font-semibold">{durationInfo.error}</span>
                ) : (
                  <>
                    <p>Thời lượng mới: <strong>{Math.max(getStayDurationMinutes(timeForm), 0)} phút</strong></p>
                    <p>Giá gói giữ nguyên: <strong>{fmt(getStayPackageAmount(stay))}</strong></p>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                {!editingTime ? (
                  <button
                    type="button"
                    onClick={() => setEditingTime(true)}
                    disabled={!canEditTime}
                    className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 disabled:opacity-60"
                  >
                    Cho phép sửa
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleSaveTime}
                      disabled={loading || !durationInfo.isValid}
                      className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 disabled:opacity-60"
                    >
                      {loading ? "Đang lưu..." : "Lưu thay đổi"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingTime(false)}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700"
                    >
                      Hủy
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : null}

          {tab === "checkout" ? (
            <div className="space-y-3">
              {stayStatus === SESSION_STATUS.BOOKED ? (
                <>
                  <div className="rounded-xl border border-sky-200 bg-sky-50/70 px-3 py-3 text-sm text-slate-700">
                    <p>
                      Lịch hẹn đang ở trạng thái <strong>chờ khách</strong>. Bạn có thể mở phiên ngay,
                      chỉnh lại lịch, hoặc đánh dấu khách không đến.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onUseBooking?.(stay)}
                      disabled={loading}
                      className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 disabled:opacity-60"
                    >
                      Nhận khách hẹn
                    </button>
                    <button
                      type="button"
                      onClick={() => onNoShow?.(stay)}
                      disabled={loading}
                      className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-60"
                    >
                      Khách không đến
                    </button>
                  </div>
                </>
              ) : stayStatus === SESSION_STATUS.IN_HOUSE ? (
                <>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-3 text-sm text-slate-700">
                    <p>Tổng tiền phiên: <strong>{fmt(stay?.tongThanhToan)}</strong></p>
                    <p className="mt-1 text-xs text-slate-500">
                      Kết thúc phiên xong giường sẽ chuyển sang trạng thái <strong>Sẵn sàng</strong>.
                    </p>
                  </div>

                  {/* Chọn phương thức thanh toán */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3 space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Phương thức thanh toán
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { value: "TIEN_MAT", label: "Tiền mặt" },
                        { value: "CHUYEN_KHOAN", label: "Chuyển khoản" },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => handleSelectPaymentMethod(opt.value)}
                          className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
                            paymentMethod === opt.value
                              ? "border-sky-300 bg-sky-100 text-sky-800"
                              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {paymentMethod === "CHUYEN_KHOAN" ? (
                      <div className="pt-2">
                        {qrCheckout.loading ? (
                          <div className="rounded-lg border border-slate-200 bg-white px-3 py-6 text-center text-xs text-slate-500">
                            Đang tạo mã QR chuyển khoản…
                          </div>
                        ) : qrCheckout.qrImageUrl ? (
                          <div className="flex flex-col items-center gap-2">
                            <img
                              src={qrCheckout.qrImageUrl}
                              alt="VietQR thanh toán"
                              className="mx-auto max-h-56 rounded-xl border border-slate-200 shadow-sm"
                            />
                            <p className="text-xs text-slate-500 text-center">
                              Quét mã để chuyển khoản <strong>{fmt(stay?.tongThanhToan)}</strong>
                              {qrCheckout.bankSource === "sheet" ? (
                                <span className="block text-[11px] text-slate-400">
                                  TK lấy từ sheet BANK
                                </span>
                              ) : null}
                              {qrCheckout.oxuStatus === "popup" ? (
                                <span className="block text-[11px] font-semibold text-emerald-600">
                                  QR đã hiển thị trong popup OXU — bấm «Gửi lên màn hình» trên popup.
                                </span>
                              ) : qrCheckout.oxuStatus === "sent" ? (
                                <span className="block text-[11px] font-semibold text-emerald-600">
                                  Đã gửi lệnh QR tới màn hình OXU
                                </span>
                              ) : qrCheckout.qrEmvCode ? (
                                <span className="block text-[11px] font-semibold text-sky-700">
                                  Mã QR sẽ mở trong popup OXU khi chọn Chuyển khoản.
                                </span>
                              ) : null}
                              {qrCheckout.oxuStatus === "failed" && qrCheckout.oxuMessage ? (
                                <span className="block text-[11px] font-semibold text-amber-700">
                                  {qrCheckout.oxuMessage}
                                </span>
                              ) : null}
                            </p>
                            {qrCheckout.error ? (
                              <p className="text-[11px] text-amber-700 text-center">{qrCheckout.error}</p>
                            ) : null}
                            <div className="flex flex-wrap justify-center gap-2 pt-1">
                              <button
                                type="button"
                                disabled={Boolean(oxuBusy) || !qrCheckout.qrEmvCode}
                                onClick={handleOpenOxuQrPopup}
                                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-50"
                              >
                                {oxuBusy === "push" ? "Đang mở…" : "Mở popup QR OXU"}
                              </button>
                              <button
                                type="button"
                                disabled={Boolean(oxuBusy)}
                                onClick={handleRefreshBankFromSheet}
                                className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 disabled:opacity-50"
                              >
                                {oxuBusy === "refresh" ? "Đang cập nhật…" : "Cập nhật STK từ sheet"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                            {qrCheckout.error ||
                              "Chưa cấu hình tài khoản ngân hàng. Điền sheet BANK hoặc lưu ở trang Test QR OXU."}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                      Mức hài lòng khách (1–5)
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {[1, 2, 3, 4, 5].map((score) => (
                        <button
                          key={score}
                          type="button"
                          data-testid={`checkout-satisfaction-${score}`}
                          onClick={() => setSatisfactionScore(score)}
                          className={`rounded-lg border px-3 py-1.5 text-sm font-bold ${
                            satisfactionScore === score
                              ? "border-amber-300 bg-amber-100 text-amber-900"
                              : "border-slate-200 bg-white text-slate-600"
                          }`}
                        >
                          {score} ★
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onCheckout({
                        maPhien: stay?.maPhien,
                        ketThucThucTe: toVnDateTimeString(new Date()),
                        diemHaiLongKhach: satisfactionScore,
                        phuongThucThanhToan: paymentMethod,
                      })
                    }
                    disabled={loading || !canCheckout}
                    className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 disabled:opacity-60"
                  >
                    {loading ? "Đang kết thúc..." : "Xác nhận kết thúc phiên"}
                  </button>
                </>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700 space-y-3">
                  <div>
                    <p>
                      Phiên đã hoàn tất. Tổng thanh toán cuối cùng: <strong>{fmt(stay?.tongThanhToan)}</strong>
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {readOnlyStay ? "Bạn có thể xem lại lịch sử và các dòng phát sinh đã ghi nhận." : "Không còn thao tác vận hành nào ở trạng thái này."}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SelectTimeModal({
  selectedDate,
  intervalMinutes,
  onChangeDate,
  onChangeInterval,
  onClose,
  onConfirm,
}) {
  const dayBase = useMemo(
    () => startOfDay(new Date(selectedDate || toVnDateTimeString(new Date()))),
    [selectedDate],
  );
  const slotRows = useMemo(() => {
    return TIME_SEGMENTS.map((segment) => {
      const slots = [];
      for (let hour = segment.fromHour; hour <= segment.toHour; hour += 1) {
        for (let minute = 0; minute < 60; minute += intervalMinutes) {
          const slot = new Date(
            dayBase.getFullYear(),
            dayBase.getMonth(),
            dayBase.getDate(),
            hour,
            minute,
            0,
            0,
          );
          slots.push(slot);
        }
      }
      return { ...segment, slots };
    });
  }, [dayBase, intervalMinutes]);
  const nowLabel = useMemo(() => {
    const now = new Date();
    return `${toDisplayDate(now)} • ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  }, []);
  const handleOpenNow = () => {
    const now = new Date();
    now.setSeconds(0, 0);
    onChangeDate(toDateKey(now));
    onConfirm(now);
  };

  return (
    <div className="fixed inset-0 z-[9600] bg-slate-900/40 p-4">
      <div className="mx-auto mt-[3vh] w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="text-lg font-black text-slate-800">Chọn thời gian</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            Đóng
          </button>
        </div>
        <div className="space-y-3 px-4 py-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
            <input
              type="date"
              value={toDateKey(selectedDate)}
              onChange={(e) => onChangeDate(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <CustomDropdown
              value={intervalMinutes}
              onChange={(next) => onChangeInterval(Number(next))}
              options={[
                { value: 60, label: "Lưới 60 phút" },
                { value: 30, label: "Lưới 30 phút" },
                { value: 15, label: "Lưới 15 phút" },
              ]}
              buttonClassName="py-2"
            />
          </div>
          <button
            type="button"
            onClick={handleOpenNow}
            className="flex w-full items-center justify-between rounded-2xl border border-rose-200 bg-gradient-to-r from-rose-50 to-white px-4 py-3 text-left shadow-sm transition hover:border-rose-300 hover:from-rose-100"
          >
            <span>
              <span className="block text-sm font-black text-rose-700">Mở ngay bây giờ</span>
              <span className="mt-0.5 block text-xs font-medium text-slate-500">
                Dùng thời điểm hiện tại để mở nhanh form lịch hẹn / phiên trị liệu.
              </span>
            </span>
            <span className="rounded-full bg-rose-600 px-3 py-1 text-xs font-bold text-white">
              {nowLabel}
            </span>
          </button>
          <div className="max-h-[62vh] space-y-3 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
            {slotRows.map((segment) => (
              <section
                key={`segment-${segment.key}`}
                className="rounded-xl border border-slate-200 bg-white p-3"
              >
                <p className="mb-2 text-sm font-bold text-slate-700">
                  {segment.icon} {segment.title}
                </p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {segment.slots.map((slot) => {
                    const label = toHourLabel(slot);
                    return (
                      <button
                        key={`${segment.key}-${toVnDateTimeString(slot)}-${intervalMinutes}`}
                        type="button"
                        onClick={() => onConfirm(slot)}
                        className="rounded-xl border border-slate-300 bg-white px-2 py-2 text-sm font-semibold text-slate-700 hover:border-rose-300 hover:bg-rose-50"
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
            <div className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-xs text-slate-500">
              Mẹo: Chọn đúng mốc giờ trống để thao tác nhanh và tránh trùng lịch.
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Chọn mốc giờ để mở nhanh form lịch hẹn/phiên trị liệu.
          </p>
        </div>
      </div>
    </div>
  );
}

function EntryActionModal({
  room,
  loading = false,
  onClose,
  onOpenNow,
  onCreateBooking,
}) {
  const canOpenNow =
    !room || String(room?.trangThaiGiuong || "").trim() === ROOM_STATUS.AVAILABLE;
  return (
    <div className="fixed inset-0 z-[9580] bg-slate-900/40 p-4 overflow-y-auto">
      <div className="mx-auto mt-[8vh] w-full max-w-lg rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-600">
              Chọn thao tác
            </p>
            <h3 className="mt-2 text-xl font-black text-slate-900">
              {room?.tenGiuong || room?.maGiuong || "Phiên trị liệu"}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {room?.maGiuong
                ? `${room.maGiuong} • ${room.loaiGiuong || "Giường trị liệu"}`
                : "Chọn mở ngay hoặc tạo lịch hẹn trước khi nhập thông tin."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            Đóng
          </button>
        </div>
        <div className="space-y-3 px-5 py-5">
          <button
            type="button"
            onClick={onOpenNow}
            disabled={loading || !canOpenNow}
            className={`w-full rounded-2xl border px-5 py-5 text-left shadow-sm transition disabled:opacity-60 ${
              canOpenNow
                ? "border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
                : "border-slate-200 bg-slate-100"
            }`}
          >
            <span className={`block text-lg font-black ${canOpenNow ? "text-emerald-800" : "text-slate-500"}`}>
              Mở ngay
            </span>
            <span className={`mt-1 block text-sm ${canOpenNow ? "text-emerald-700" : "text-slate-500"}`}>
              {canOpenNow
                ? "Bắt đầu phiên tại thời điểm hiện tại. Không cần nhập giờ bắt đầu và giờ kết thúc dự kiến."
                : "Chỉ mở ngay được khi giường đang ở trạng thái Sẵn sàng."}
            </span>
          </button>
          <button
            type="button"
            onClick={onCreateBooking}
            disabled={loading}
            className="w-full rounded-2xl border border-rose-200 bg-rose-50 px-5 py-5 text-left shadow-sm transition hover:bg-rose-100 disabled:opacity-60"
          >
            <span className="block text-lg font-black text-rose-800">Đặt lịch hẹn</span>
            <span className="mt-1 block text-sm text-rose-700">
              Nhập giờ bắt đầu và giờ kết thúc dự kiến cho khách hẹn trước.
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

function DueBookingDecisionModal({
  room,
  stay,
  loading = false,
  onConfirmCheckIn,
  onDelay,
  onCancelBooking,
}) {
  const overdueMinutes = getStayOverdueMinutes(
    {
      ...stay,
      trangThaiPhien: SESSION_STATUS.IN_HOUSE,
    },
    Date.now(),
  );
  const isOverdue = overdueMinutes > 0;
  return (
    <div className="fixed inset-0 z-[9550] bg-slate-900/45 p-4 overflow-y-auto">
      <div className="mx-auto mt-[8vh] w-full max-w-xl rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-600">
            {isOverdue ? "Lịch hẹn đã quá giờ" : "Đã tới giờ hẹn"}
          </p>
          <h3 className="mt-2 text-2xl font-black text-slate-900">
            {room?.tenGiuong || room?.maGiuong || "Giường trị liệu"}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {room?.maGiuong || "-"} • {room?.loaiGiuong || "Giường trị liệu"}
          </p>
        </div>
        <div className="space-y-4 px-5 py-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-lg font-black text-slate-900">{stay?.tenKhach || "Khách đã hẹn"}</p>
            <p className="mt-1 text-sm text-slate-600">
              {formatTimeOnly(getStayStartAt(stay))} - {formatTimeOnly(getStayExpectedEndAt(stay))} •{" "}
              {stay?.tenGoi || stay?.tenDichVu || "Gói trị liệu"}
            </p>
            {isOverdue ? (
              <p className="mt-2 text-sm font-semibold text-red-600">
                Hiện đã quá giờ hẹn {overdueMinutes} phút.
              </p>
            ) : (
              <p className="mt-2 text-sm font-semibold text-sky-700">
                Khách đã tới chưa? Chọn cách xử lý bên dưới.
              </p>
            )}
          </div>
          <div className="grid gap-3">
            <button
              type="button"
              onClick={onConfirmCheckIn}
              disabled={loading}
              className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-5 text-left shadow-sm transition hover:bg-emerald-100 disabled:opacity-60"
            >
              <span className="block text-lg font-black text-emerald-800">Mở giường</span>
              <span className="mt-1 block text-sm text-emerald-700">
                Xác nhận khách đã tới và chuyển lịch hẹn sang đang hoạt động.
              </span>
            </button>
            <button
              type="button"
              onClick={onDelay}
              disabled={loading}
              className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-5 text-left shadow-sm transition hover:bg-amber-100 disabled:opacity-60"
            >
              <span className="block text-lg font-black text-amber-800">Khách delay, mở sau</span>
              <span className="mt-1 block text-sm text-amber-700">
                Đóng popup, giữ lịch ở trạng thái đang chờ.
              </span>
            </button>
            <button
              type="button"
              onClick={onCancelBooking}
              disabled={loading}
              className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-5 text-left shadow-sm transition hover:bg-rose-100 disabled:opacity-60"
            >
              <span className="block text-lg font-black text-rose-800">Huỷ đặt trước</span>
              <span className="mt-1 block text-sm text-rose-700">
                Đánh dấu khách không đến và giải phóng lịch hẹn này.
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BedManagerModal({
  rooms = [],
  stays = [],
  loading = false,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}) {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [editingCode, setEditingCode] = useState("");
  const [form, setForm] = useState(() =>
    buildBedPayload({
      maGiuong: "",
      tenGiuong: "",
      loaiGiuong: "",
      trangThaiGiuong: ROOM_STATUS.AVAILABLE,
      soKhachToiDa: 1,
      ghiChu: "",
    }),
  );

  const resetForm = () => {
    setEditingCode("");
    setForm(
      buildBedPayload({
        maGiuong: "",
        tenGiuong: "",
        loaiGiuong: "",
        trangThaiGiuong: ROOM_STATUS.AVAILABLE,
        soKhachToiDa: 1,
        ghiChu: "",
      }),
    );
  };

  const linkedStayCountByRoom = useMemo(() => {
    const map = new Map();
    stays.forEach((stay) => {
      const code = String(stay.maGiuong || "").trim();
      if (!code) return;
      if (!["BOOKED", "IN_HOUSE"].includes(String(stay.trangThaiPhien || "").toUpperCase())) return;
      map.set(code, (map.get(code) || 0) + 1);
    });
    return map;
  }, [stays]);

  const sortedRooms = useMemo(
    () => [...rooms].sort((a, b) => String(a.maGiuong || "").localeCompare(String(b.maGiuong || ""), "vi")),
    [rooms],
  );

  const startEdit = (room) => {
    setEditingCode(String(room?.maGiuong || "").trim());
    setForm(buildBedPayload(room));
  };

  const submit = async () => {
    if (!form.maGiuong || !form.tenGiuong) {
      toast.error("Cần nhập mã giường và tên giường.");
      return;
    }
    const bedCode = String(form.maGiuong || "").trim();
    if (!editingCode && rooms.some((item) => String(item.maGiuong || "").trim() === bedCode)) {
      toast.error(`Mã giường ${bedCode} đã tồn tại.`);
      return;
    }
    const ok = editingCode ? await onUpdate(form) : await onCreate(form);
    if (ok !== false) resetForm();
  };

  const remove = async (room) => {
    const code = String(room?.maGiuong || "").trim();
    if (!code) return;
    if ((linkedStayCountByRoom.get(code) || 0) > 0) {
      toast.error("Giường đang có lịch hẹn hoặc phiên mở, không thể xóa.");
      return;
    }
    const confirmed = await confirm({
      message: `Xóa giường ${room?.tenGiuong || code}?`,
      yesLabel: "Xóa",
    });
    if (!confirmed) return;
    await onDelete({ maGiuong: code });
    if (editingCode === code) resetForm();
  };

  return (
    <div
      className="fixed inset-0 z-[9700] overflow-y-auto bg-slate-900/45 p-4"
      data-testid="bed-manager-modal"
    >
      {confirmDialog}
      <div className="mx-auto w-full max-w-5xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h3 className="text-lg font-black text-slate-800">Danh sách giường</h3>
            <p className="text-xs text-slate-500">Chỉ dùng để thêm, sửa, xóa và đổi trạng thái cấu hình giường.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            Đóng
          </button>
        </div>
        <div className="grid grid-cols-1 gap-4 px-4 py-4 xl:grid-cols-[minmax(0,1.2fr)_360px]">
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200">
              <div className="grid grid-cols-[120px_minmax(0,1fr)_140px_120px_100px] gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                <span>Mã</span>
                <span>Giường</span>
                <span>Loại</span>
                <span>Trạng thái</span>
                <span className="text-right">Hành động</span>
              </div>
              <div className="max-h-[68vh] overflow-y-auto">
                {loading ? (
                  <div className="px-3 py-6 text-sm text-slate-500">Đang tải danh sách giường...</div>
                ) : sortedRooms.length === 0 ? (
                  <div className="px-3 py-6 text-sm text-slate-500">Chưa có giường nào.</div>
                ) : (
                  sortedRooms.map((room) => {
                    const code = String(room.maGiuong || "");
                    return (
                      <div
                        key={`bed-row-${code}`}
                        className="grid grid-cols-[120px_minmax(0,1fr)_140px_120px_100px] gap-2 border-b border-slate-100 px-3 py-3 text-sm last:border-b-0"
                      >
                        <div className="font-semibold text-slate-700">{code}</div>
                        <div>
                          <p className="font-semibold text-slate-800">{room.tenGiuong || "-"}</p>
                          <p className="text-xs text-slate-500">
                            {room.ghiChu || "Không có ghi chú"}
                          </p>
                        </div>
                        <div className="text-slate-600">{room.loaiGiuong || "-"}</div>
                        <div className="text-slate-600">{room.trangThaiGiuong || ROOM_STATUS.AVAILABLE}</div>
                        <div className="flex items-start justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => startEdit(room)}
                            className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700"
                          >
                            Sửa
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(room)}
                            className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700"
                          >
                            Xóa
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-black text-slate-800">
                {editingCode ? `Sửa giường ${editingCode}` : "Thêm giường mới"}
              </h4>
              {editingCode ? (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                >
                  Hủy sửa
                </button>
              ) : null}
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Mã giường *</label>
                <input
                  value={form.maGiuong}
                  disabled={Boolean(editingCode)}
                  onChange={(e) => setForm((prev) => ({ ...prev, maGiuong: String(e.target.value || "").trim() }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Tên giường *</label>
                <input
                  value={form.tenGiuong}
                  onChange={(e) => setForm((prev) => ({ ...prev, tenGiuong: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Loại giường</label>
                <input
                  value={form.loaiGiuong}
                  onChange={(e) => setForm((prev) => ({ ...prev, loaiGiuong: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Trạng thái</label>
                <CustomDropdown
                  value={form.trangThaiGiuong}
                  onChange={(next) => setForm((prev) => ({ ...prev, trangThaiGiuong: String(next || ROOM_STATUS.AVAILABLE) }))}
                  options={STATUS_OPTIONS.map((status) => ({ value: status, label: status }))}
                  buttonClassName="py-2"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Số khách tối đa</label>
                <input
                  type="number"
                  min="1"
                  value={form.soKhachToiDa}
                  onChange={(e) => setForm((prev) => ({ ...prev, soKhachToiDa: Math.max(Number(e.target.value || 1), 1) }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Ghi chú</label>
                <textarea
                  value={form.ghiChu}
                  onChange={(e) => setForm((prev) => ({ ...prev, ghiChu: e.target.value }))}
                  rows={4}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={submit}
                className="w-full rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700"
              >
                {editingCode ? "Lưu thay đổi" : "Thêm giường"}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function EmptySchedule({ message }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
      <p className="text-5xl">🗓️</p>
      <p className="mt-3 text-base text-slate-700">{message}</p>
      <p className="mt-1 text-sm text-slate-500">Bạn có thể đổi bộ lọc khác để tìm kiếm.</p>
    </div>
  );
}

export default function CreateOrderPage() {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [rooms, setRooms] = useState(() => readCachedList(CACHE_KEYS.rooms));
  const [stays, setStays] = useState(() => readCachedList(CACHE_KEYS.stayHistory));
  const [staffs, setStaffs] = useState(() => readCachedList(CACHE_KEYS.staffCatalog));
  const [catalog, setCatalog] = useState(() =>
    mapActiveCatalogItems(readCachedList(CACHE_KEYS.productCatalog)),
  );
  const [packages, setPackages] = useState(() => readCachedList(CACHE_KEYS.treatmentPackages));
  const [customerCatalog, setCustomerCatalog] = useState(() =>
    readCachedList(CACHE_KEYS.customerCatalog),
  );
  const [bankConfig, setBankConfig] = useState(() => readCachedList(CACHE_KEYS.bankConfig));
  const [loading, setLoading] = useState(() => !hasCreateOrderBootstrap());
  const [keyword, setKeyword] = useState("");
  const [activeTab, setActiveTab] = useState("TIME_GRID");
  const [dateMode, setDateMode] = useState("DAY");
  const [selectedDate, setSelectedDate] = useState(() => toVnDateTimeString(new Date()));
  const [selectedStaff, setSelectedStaff] = useState("ALL");
  const [gridMinutes, setGridMinutes] = useState(30);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [entryActionModal, setEntryActionModal] = useState(null);
  const [checkinRoom, setCheckinRoom] = useState(null);
  const [checkinPreset, setCheckinPreset] = useState(null);
  const [stayModal, setStayModal] = useState(null);
  const [dueBookingPrompt, setDueBookingPrompt] = useState(null);
  const [showSelectTimeModal, setShowSelectTimeModal] = useState(false);
  const [showBedManager, setShowBedManager] = useState(false);
  const [bedEditor, setBedEditor] = useState(null);
  const [timelineNow, setTimelineNow] = useState(() => Date.now());
  const hydrationBlockedRef = useRef(false);
  const pendingHydrationRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [roomTimelinePage, setRoomTimelinePage] = useState(0);
  const timeGridScrollRef = useRef(null);
  const staffGridScrollRef = useRef(null);
  const autoScrollStateRef = useRef("");
  const timelineUserScrolledRef = useRef(false);
  const delayedDuePromptKeysRef = useRef(readDelayedDuePromptKeys());
  const recentSessionOverridesRef = useRef(new Map());
  const { data: scheduleData } = useCachedQuery(getSpaStaffSchedules, CACHE_KEYS.staffSchedules);
  const staffSchedules = scheduleData?.data || [];

  const rememberRecentSessionOverride = (stay, ttlMs = 120000) => {
    const key = String(stay?.maPhien || stay?.maLichHen || "").trim();
    if (!key) return;
    const previous = recentSessionOverridesRef.current.get(key)?.stay;
    recentSessionOverridesRef.current.set(key, {
      stay: normalizeSessionState(mergeTreatmentSessionPatch(previous || {}, stay)),
      expiresAt: Date.now() + Math.max(Number(ttlMs || 0), 5000),
    });
  };

  const mergeRecentSessionOverrides = (rows = []) => {
    const now = Date.now();
    for (const [key, value] of recentSessionOverridesRef.current.entries()) {
      if (!value || Number(value.expiresAt || 0) <= now) {
        recentSessionOverridesRef.current.delete(key);
      }
    }
    if (!recentSessionOverridesRef.current.size) return rows;
    const safeMerge = (base, overrideStay) =>
      normalizeSessionState(mergeTreatmentSessionPatch(base, overrideStay));
    const seen = new Set();
    const merged = rows.map((row) => {
      const key = String(row?.maPhien || row?.maLichHen || "").trim();
      if (!key) return row;
      seen.add(key);
      const override = recentSessionOverridesRef.current.get(key);
      if (!override?.stay) return row;
      return safeMerge(row, override.stay);
    });
    recentSessionOverridesRef.current.forEach((value, key) => {
      if (!seen.has(key) && value?.stay) merged.unshift(value.stay);
    });
    return merged;
  };

  const suppressDuePrompt = (stay) => {
    const promptKey = getStayPromptKey(stay);
    if (promptKey) {
      delayedDuePromptKeysRef.current.add(promptKey);
      persistDelayedDuePromptKeys(delayedDuePromptKeysRef.current);
    }
    return promptKey;
  };

  const releaseDuePrompt = (stay) => {
    const promptKey = getStayPromptKey(stay);
    if (promptKey) {
      delayedDuePromptKeysRef.current.delete(promptKey);
      persistDelayedDuePromptKeys(delayedDuePromptKeysRef.current);
    }
    return promptKey;
  };

  const mergeHydratedStays = (serverRows = [], localRows = []) => {
    const localByKey = new Map(
      (Array.isArray(localRows) ? localRows : [])
        .map((stay) => [getStayIdentityKey(stay), stay])
        .filter(([key]) => Boolean(key)),
    );
    const preferCheckedOutOverStale = (serverRow) => {
      const key = getStayIdentityKey(serverRow);
      const localRow = key ? localByKey.get(key) : null;
      const override = key ? recentSessionOverridesRef.current.get(key) : null;
      const effectiveLocal =
        override?.stay && Number(override.expiresAt || 0) > Date.now()
          ? mergeTreatmentSessionPatch(localRow || {}, override.stay)
          : localRow;
      if (!effectiveLocal) return serverRow;
      const serverStatus = getStayStatus(serverRow);
      const localStatus = getStayStatus(effectiveLocal);
      if (
        localStatus === SESSION_STATUS.CHECKED_OUT &&
        serverStatus === SESSION_STATUS.IN_HOUSE
      ) {
        return normalizeSessionState(
          mergeTreatmentSessionPatch(serverRow, {
            ...effectiveLocal,
            trangThaiPhien: SESSION_STATUS.CHECKED_OUT,
          }),
        );
      }
      return serverRow;
    };
    const hydrated = mergeRecentSessionOverrides(
      (Array.isArray(serverRows) ? serverRows : []).map(preferCheckedOutOverStale),
    );
    const serverByKey = new Map(
      hydrated
        .map((stay) => [getStayIdentityKey(stay), stay])
        .filter(([key]) => Boolean(key)),
    );
    const serverByLichHen = new Map(
      hydrated
        .filter((stay) => String(stay.maLichHen || "").trim())
        .map((stay) => [String(stay.maLichHen || "").trim(), stay]),
    );
    const now = Date.now();
    const carryLocal = localRows.filter((stay) => {
      const key = getStayIdentityKey(stay);
      const lichHen = String(stay.maLichHen || "").trim();
      const maPhien = String(stay.maPhien || "").trim();
      const isTemp = maPhien.startsWith("TEMP-");
      const status = getStayStatus(stay);
      const override = recentSessionOverridesRef.current.get(key);
      if (override && Number(override.expiresAt || 0) > now) {
        const serverMatch = key ? serverByKey.get(key) : null;
        if (serverMatch) return false;
        return true;
      }

      const serverMatch = key ? serverByKey.get(key) : null;
      if (serverMatch) return false;

      if (lichHen) {
        const serverBooking = serverByLichHen.get(lichHen);
        if (serverBooking) {
          const serverPhien = String(serverBooking.maPhien || "").trim();
          // Chỉ thay local bằng server khi server đã có mã phiên thật (không TEMP).
          if (serverPhien && !serverPhien.startsWith("TEMP-")) {
            return isTemp;
          }
          return false;
        }
      }

      return (
        isTemp &&
        (status === SESSION_STATUS.IN_HOUSE || status === SESSION_STATUS.BOOKED)
      );
    });
    return [...carryLocal, ...hydrated];
  };

  const loadData = async ({ silent = false, force = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [roomRes, stayRes, productRes, staffRes, customerRes, packageRes, bankRes] = await Promise.all([
        getTreatmentBeds({ force }),
        getTreatmentHistory({ force }),
        getProductCatalog({ force }),
        getSpaStaff({ force }),
        getCustomerCatalog({ force }),
        getTreatmentPackages({ force }),
        getBankConfig({ force }),
      ]);
      setRooms(Array.isArray(roomRes?.data) ? roomRes.data : []);
      setStays((prev) => mergeHydratedStays(stayRes?.data, prev));
      setStaffs(Array.isArray(staffRes?.data) ? staffRes.data : []);
      setCatalog(mapActiveCatalogItems(productRes?.data));
      setPackages(Array.isArray(packageRes?.data) ? packageRes.data : []);
      setCustomerCatalog(Array.isArray(customerRes?.data) ? customerRes.data : []);
      setBankConfig(bankRes?.data || null);
    } catch (e) {
      toast.error("Không tải được dữ liệu spa.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void loadData({ silent: hasCreateOrderBootstrap() });
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadData({ silent: true, force: true });
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    hydrationBlockedRef.current = Boolean(
      checkinRoom ||
        stayModal ||
        dueBookingPrompt ||
        entryActionModal ||
        showSelectTimeModal ||
        showBedManager ||
        bedEditor,
    );
  }, [
    bedEditor,
    checkinRoom,
    dueBookingPrompt,
    entryActionModal,
    showBedManager,
    showSelectTimeModal,
    stayModal,
  ]);

  useEffect(() => {
    if (hydrationBlockedRef.current || !pendingHydrationRef.current) return;
    pendingHydrationRef.current = false;
    void loadData({ silent: true });
  }, [
    bedEditor,
    checkinRoom,
    dueBookingPrompt,
    entryActionModal,
    showBedManager,
    showSelectTimeModal,
    stayModal,
  ]);

  useCacheSync({
    cacheKeys: [
      CACHE_KEYS.rooms,
      CACHE_KEYS.stayHistory,
      CACHE_KEYS.productCatalog,
      CACHE_KEYS.staffCatalog,
      CACHE_KEYS.customerCatalog,
      CACHE_KEYS.treatmentPackages,
      CACHE_KEYS.bankConfig,
    ],
    onCacheUpdated: (detail, cacheKey) => {
      const response = detail?.response;
      if (!response) return;
      if (cacheKey === CACHE_KEYS.staffCatalog) {
        setStaffs(Array.isArray(response.data) ? response.data : []);
        return;
      }
      if (cacheKey === CACHE_KEYS.rooms) {
        setRooms(Array.isArray(response.data) ? response.data : []);
        return;
      }
      if (cacheKey === CACHE_KEYS.productCatalog) {
        setCatalog(mapActiveCatalogItems(response.data));
        return;
      }
      if (cacheKey === CACHE_KEYS.treatmentPackages) {
        setPackages(Array.isArray(response.data) ? response.data : []);
        return;
      }
      if (cacheKey === CACHE_KEYS.customerCatalog) {
        setCustomerCatalog(Array.isArray(response.data) ? response.data : []);
        return;
      }
      if (cacheKey === CACHE_KEYS.bankConfig) {
        setBankConfig(response.data || null);
        return;
      }
      if (cacheKey === CACHE_KEYS.stayHistory && !hydrationBlockedRef.current) {
        setStays((prev) => mergeHydratedStays(response.data, prev));
      }
    },
    /**
     * ⚠️ FIXED: Xóa void loadData() trong onCacheInvalidated
     * Lý do: Gây stack overflow khi event được dispatch liên tục
     * 
     * Pattern đúng: Chỉ đọc từ cache và update state
     * Cache sẽ được update khi mutation hoàn thành (afterSuccess writeCache)
     */
    onCacheInvalidated: (keys) => {
      if (
        keys.includes(CACHE_KEYS.rooms) ||
        keys.includes(CACHE_KEYS.stayHistory) ||
        keys.includes(CACHE_KEYS.productCatalog) ||
        keys.includes(CACHE_KEYS.staffCatalog) ||
        keys.includes(CACHE_KEYS.customerCatalog) ||
        keys.includes(CACHE_KEYS.treatmentPackages) ||
        keys.includes(CACHE_KEYS.bankConfig)
      ) {
        if (hydrationBlockedRef.current) {
          pendingHydrationRef.current = true;
          return;
        }
        keys.forEach((key) => {
          const cached = readCache(key)?.response;
          if (!cached) return;
          if (key === CACHE_KEYS.staffCatalog) {
            setStaffs(Array.isArray(cached.data) ? cached.data : []);
          } else if (key === CACHE_KEYS.rooms) {
            setRooms(Array.isArray(cached.data) ? cached.data : []);
          } else if (key === CACHE_KEYS.productCatalog) {
            setCatalog(mapActiveCatalogItems(cached.data));
          } else if (key === CACHE_KEYS.treatmentPackages) {
            setPackages(Array.isArray(cached.data) ? cached.data : []);
          } else if (key === CACHE_KEYS.customerCatalog) {
            setCustomerCatalog(Array.isArray(cached.data) ? cached.data : []);
          } else if (key === CACHE_KEYS.bankConfig) {
            setBankConfig(cached.data || null);
          } else if (key === CACHE_KEYS.stayHistory && !hydrationBlockedRef.current) {
            setStays((prev) => mergeHydratedStays(cached.data, prev));
          }
        });
        // ⚠️ KHÔNG gọi loadData() ở đây - chỉ đọc từ cache
      }
    }
  });

  useEffect(() => {
    const timer = window.setInterval(() => {
      // Skip timeline clock refresh while a mutation is in-flight to prevent
      // unnecessary re-renders that cause the timeline grid to flicker/jump.
      if (hydrationBlockedRef.current) return;
      setTimelineNow(Date.now());
    }, 15 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const syncTimelineNow = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      setTimelineNow(Date.now());
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncTimelineNow();
      }
    };
    window.addEventListener("focus", syncTimelineNow);
    window.addEventListener("pageshow", syncTimelineNow);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", syncTimelineNow);
      window.removeEventListener("pageshow", syncTimelineNow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const timelinePreparedStays = useMemo(
    () => prepareTimelineStays(stays, timelineNow),
    [stays, timelineNow],
  );

  const activeStayByRoom = useMemo(() => {
    const map = new Map();
    timelinePreparedStays.forEach((stay) => {
      if (getStayStatus(stay) !== SESSION_STATUS.IN_HOUSE) return;
      if (stay._timelineLive === false) return;
      map.set(String(stay.maGiuong || ""), stay);
    });
    return map;
  }, [timelinePreparedStays]);

  const bookedStaysByRoom = useMemo(() => {
    const map = new Map();
    timelinePreparedStays
      .filter((stay) => String(stay.trangThaiPhien || "").toUpperCase() === "BOOKED")
      .sort(
        (a, b) =>
          safeTimeMs(getStayStartAt(a)) - safeTimeMs(getStayStartAt(b)),
      )
      .forEach((stay) => {
        const roomCode = String(stay.maGiuong || "");
        if (!roomCode) return;
        const current = map.get(roomCode) || [];
        current.push(stay);
        map.set(roomCode, current);
      });
    return map;
  }, [timelinePreparedStays]);

  const roomBookingAlertByRoom = useMemo(() => {
    const map = new Map();
    bookedStaysByRoom.forEach((bookedList, maGiuong) => {
      map.set(String(maGiuong || ""), getRoomBookingAlert(bookedList || [], timelineNow));
    });
    return map;
  }, [bookedStaysByRoom, timelineNow]);

  const roomsWithUiState = useMemo(() => {
    return rooms.map((room) => {
      const roomCode = String(room?.maGiuong || "");
      const inHouse = activeStayByRoom.get(roomCode);
      const baseStatus = String(room?.trangThaiGiuong || "");
      let displayStatus = baseStatus;
      if (baseStatus === ROOM_STATUS.IN_HOUSE && !inHouse) {
        displayStatus = ROOM_STATUS.AVAILABLE;
      }
      if (inHouse) {
        displayStatus = ROOM_STATUS.IN_HOUSE;
      }
      return {
        ...room,
        _rawtrangThaiGiuong: baseStatus,
        trangThaiGiuong: displayStatus,
      };
    });
  }, [rooms, activeStayByRoom]);

  const filteredRooms = useMemo(() => {
    const q = String(keyword || "").trim().toLowerCase();
    return roomsWithUiState
      .filter((room) => {
        if (statusFilter !== "ALL" && room.trangThaiGiuong !== statusFilter) return false;
        if (!q) return true;
        const source = [room.maGiuong, room.tenGiuong, room.loaiGiuong]
          .join(" ")
          .toLowerCase();
        return source.includes(q);
      })
      .sort((a, b) => String(a.maGiuong || "").localeCompare(String(b.maGiuong || ""), "vi"));
  }, [roomsWithUiState, keyword, statusFilter]);

  const grouped = useMemo(() => {
    const out = {
      [ROOM_STATUS.AVAILABLE]: [],
      [ROOM_STATUS.IN_HOUSE]: [],
      [ROOM_STATUS.CLEANING]: [],
      [ROOM_STATUS.MAINTENANCE]: [],
    };
    filteredRooms.forEach((room) => {
      const key = out[room.trangThaiGiuong] ? room.trangThaiGiuong : ROOM_STATUS.AVAILABLE;
      out[key].push(room);
    });
    return out;
  }, [filteredRooms]);

  const selectedDateObj = useMemo(() => {
    const d = new Date(selectedDate || toVnDateTimeString(new Date()));
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }, [selectedDate]);

  const scheduleRange = useMemo(() => {
    if (dateMode === "WEEK") return weekRange(selectedDateObj);
    return {
      from: startOfDay(selectedDateObj),
      to: endOfDay(selectedDateObj),
    };
  }, [dateMode, selectedDateObj]);

  const filteredStays = useMemo(() => {
    const key = String(keyword || "").trim().toLowerCase();
    const rangeStartMs = scheduleRange.from.getTime();
    const rangeEndMs = scheduleRange.to.getTime() + 1;
    return timelinePreparedStays
      .filter((stay) => {
        const status = String(stay.trangThaiPhien || "").toUpperCase();
        if (!["BOOKED", "IN_HOUSE", "CHECKED_OUT"].includes(status)) return false;
        if (
          !doesStayOverlapWindow({
            stay,
            rangeStartMs,
            rangeEndMs,
            fallbackMinutes: gridMinutes,
            nowMs: timelineNow,
          })
        ) {
          return false;
        }
        if (
          selectedStaff !== "ALL" &&
          String(stay.maNhanVien || "") !== String(selectedStaff)
        ) {
          return false;
        }
        if (!key) return true;
        const source = [
          stay.maPhien,
          stay.tenKhach,
          stay.maGiuong,
          stay.tenNhanVien,
          stay.soDienThoai,
        ]
          .join(" ")
          .toLowerCase();
        return source.includes(key);
      })
      .sort(
        (a, b) =>
          safeTimeMs(getStayStartAt(a)) - safeTimeMs(getStayStartAt(b)),
      );
  }, [timelinePreparedStays, scheduleRange.from, scheduleRange.to, selectedStaff, keyword, gridMinutes, timelineNow]);

  const timelineRooms = useMemo(() => {
    const lowerKeyword = String(keyword || "").trim().toLowerCase();
    const roomsByStatus = roomsWithUiState
      .filter((room) => (statusFilter === "ALL" ? true : room.trangThaiGiuong === statusFilter))
      .sort((a, b) => String(a.maGiuong || "").localeCompare(String(b.maGiuong || ""), "vi"));
    if (!lowerKeyword) return roomsByStatus;

    const matchedRoomCodes = new Set(
      filteredStays.map((stay) => String(stay.maGiuong || "")).filter(Boolean),
    );
    return roomsByStatus.filter((room) => {
      const roomSource = [room.maGiuong, room.tenGiuong, room.loaiGiuong].join(" ").toLowerCase();
      return roomSource.includes(lowerKeyword) || matchedRoomCodes.has(String(room.maGiuong || ""));
    });
  }, [filteredStays, keyword, roomsWithUiState, statusFilter]);

  const assignableStaffOptions = useMemo(() => {
    const assignedCodes = new Set(
      stays.map((stay) => String(stay.maNhanVien || "").trim()).filter(Boolean),
    );
    return staffs.filter((staff) => {
      const code = String(staff.maNhanVien || "").trim();
      const alreadyAssigned = assignedCodes.has(code);
      if (!canAssignStaffToSession(staff) && !alreadyAssigned) return false;
      if (!alreadyAssigned && isBlockingStaffStatus(getStaffCatalogStatus(staff))) return false;
      return true;
    });
  }, [staffs, stays]);

  const staffRows = useMemo(() => {
    const base = [{ maNhanVien: "", tenNhanVien: "Chưa xác định" }];
    return [...base, ...staffs];
  }, [staffs]);
  const visibleStaffRows = useMemo(
    () =>
      selectedStaff === "ALL"
        ? staffRows
        : staffRows.filter(
            (staff) => String(staff.maNhanVien || "") === String(selectedStaff || ""),
          ),
    [selectedStaff, staffRows],
  );

  const scheduleHours = useMemo(() => {
    const rows = [];
    for (let hour = 0; hour <= 23; hour += 1) {
      for (let minute = 0; minute < 60; minute += gridMinutes) {
        rows.push(`${pad2(hour)}:${pad2(minute)}`);
      }
    }
    return rows;
  }, [gridMinutes]);

  const runOptimisticAction = async ({
    actionName,
    applyOptimistic,
    apiCall,
    rollback,
  }) => {
    try {
      applyOptimistic?.();
      const res = await apiCall();
      if (!res?.success) throw new Error(res?.message || `${actionName} thất bại`);
      console.log(`[UI_OPTIMIZE_OK] ${actionName}`, res);
      return res;
    } catch (error) {
      console.error(`[UI_OPTIMIZE_FAIL] ${actionName}`, error);
      if (typeof rollback === "function") {
        await rollback(error);
      } else {
        setStays(readCachedList(CACHE_KEYS.stayHistory));
        setRooms(readCachedList(CACHE_KEYS.rooms));
      }
      void logAction({
        userName: "spa-ui",
        changeDescription: `UI mutation failed: ${actionName}`,
        status: "ERROR",
        errorMessage: error?.message || `${actionName} failed`,
      });
      toast.error(error?.message || `${actionName} thất bại.`);
      return null;
    }
  };

  const handleQuickCheckIn = async (room, bookedStays = [], bookingStay = null) => {
    if (room && String(room?.trangThaiGiuong || "") !== ROOM_STATUS.AVAILABLE) {
      toast.error("Chỉ có thể mở phiên ngay trên giường đang Sẵn sàng.");
      return;
    }
    const candidates = Array.isArray(bookedStays) ? bookedStays : [];
    if (bookingStay) {
      setDueBookingPrompt({
        room,
        bookingStay,
        bookingCandidates: candidates,
      });
      return;
    }
    const alert = getRoomBookingAlert(candidates, Date.now());
    if (alert && alert.type === "UPCOMING_SOON") {
      const ok = await confirm({
        message: `Giường này có lịch hẹn lúc ${prettyTime(getStayStartAt(alert.stay))} (${alert.stay?.tenKhach || "khách đã hẹn"}).`,
        subMessage: "Bạn vẫn muốn mở phiên mới ngay bây giờ?",
        yesLabel: "Mở phiên mới",
        yesStyle: "warning",
      });
      if (!ok) return;
    }
    if (alert && alert.type === "DUE_NOW") {
      const ok = await confirm({
        message: `Đã đến giờ khách hẹn (${alert.stay?.tenKhach || "khách đã hẹn"} - ${prettyTime(getStayStartAt(alert.stay))}).`,
        subMessage: "Bạn chắc chắn muốn mở phiên khác thay vì nhận khách hẹn?",
        yesLabel: "Mở phiên khác",
        yesStyle: "warning",
      });
      if (!ok) return;
    }
    const now = new Date();
    const defaultEnd = new Date(now.getTime() + 60 * 60000);
    setCheckinPreset({
      batDauAt: toVnDateTimeString(now),
      ketThucDuKien: toVnDateTimeString(defaultEnd),
    });
    setCheckinRoom({
      room,
      bookingStay: null,
      bookingCandidates: candidates,
      mode: "INSTANT",
    });
  };

  const handleOpenBookingForm = (room, bookedStays = []) => {
    setCheckinPreset(null);
    setCheckinRoom({
      room,
      bookingStay: null,
      bookingCandidates: Array.isArray(bookedStays) ? bookedStays : [],
      mode: "BOOKING",
    });
  };

  const openEntryActionChooser = (room = null, bookedStays = []) => {
    setEntryActionModal({
      room: room || null,
      bookingCandidates: Array.isArray(bookedStays) ? bookedStays : [],
    });
  };

  const closeCheckinModal = () => {
    setCheckinRoom(null);
    setCheckinPreset(null);
  };

  const handleTimelineRoomHeaderSelect = (room) => {
    const roomCode = String(room?.maGiuong || "").trim();
    const activeStay = activeStayByRoom.get(roomCode);
    if (activeStay) {
      openStay(room, activeStay);
      return;
    }
    const roomAlert = roomBookingAlertByRoom.get(roomCode);
    if (roomAlert?.type === "DUE_NOW" && roomAlert?.stay) {
      setDueBookingPrompt({
        room,
        bookingStay: roomAlert.stay,
        bookingCandidates: bookedStaysByRoom.get(roomCode) || [],
      });
      return;
    }
    openEntryActionChooser(room, bookedStaysByRoom.get(roomCode) || []);
  };

  const handleDueBookingDelay = () => {
    suppressDuePrompt(dueBookingPrompt?.bookingStay);
    setDueBookingPrompt(null);
  };

  const handleDueBookingConfirmCheckIn = async () => {
    if (!dueBookingPrompt?.bookingStay) return;
    const prompt = dueBookingPrompt;
    const stay = prompt.bookingStay;
    const payload = buildBookingCheckInPayload(stay);
    suppressDuePrompt(stay);
    setDueBookingPrompt(null);
    const ok = await handleCheckIn(payload, { silentRefresh: true });
    if (!ok) {
      releaseDuePrompt(stay);
      setDueBookingPrompt(prompt);
      return;
    }
  };

  const syncStayState = (rawStay) => {
    if (!rawStay || !rawStay.maPhien) return;
    const nextStay = normalizeSessionState(rawStay);
    // Safe-merge: preserve identity fields (maGiuong, tenKhach, maNhanVien...)
    // from the existing stay when the API response is missing them.
    // This prevents sessions from "jumping" to a wrong bed on the timeline.
    const safeReplace = (existing) =>
      normalizeSessionState(mergeTreatmentSessionPatch(existing, nextStay));
    setStays((prev) => {
      const existed = prev.some(
        (stay) => String(stay.maPhien || "") === String(nextStay.maPhien || ""),
      );
      if (!existed) return [nextStay, ...prev];
      return prev.map((stay) =>
        String(stay.maPhien || "") === String(nextStay.maPhien || "")
          ? safeReplace(stay)
          : stay,
      );
    });
    setStayModal((prev) => {
      if (!prev || String(prev?.stay?.maPhien || "") !== String(nextStay.maPhien || "")) return prev;
      return { ...prev, stay: safeReplace(prev.stay) };
    });
  };

  const upsertStayInState = (rawStay) => {
    if (!rawStay?.maPhien) return;
    const nextStay = normalizeSessionState(rawStay);
    setStays((prev) => {
      const existed = prev.some(
        (stay) => String(stay.maPhien || "") === String(nextStay.maPhien || ""),
      );
      if (!existed) return [nextStay, ...prev];
      return prev.map((stay) =>
        String(stay.maPhien || "") === String(nextStay.maPhien || "")
          ? normalizeSessionState(mergeTreatmentSessionPatch(stay, nextStay))
          : stay,
      );
    });
    setStayModal((prev) => {
      if (!prev || String(prev?.stay?.maPhien || "") !== String(nextStay.maPhien || "")) return prev;
      return {
        ...prev,
        stay: normalizeSessionState(mergeTreatmentSessionPatch(prev.stay, nextStay)),
      };
    });
  };

  const patchRoomStatusInState = (roomCode, nextStatus) => {
    const normalizedCode = String(roomCode || "").trim();
    if (!normalizedCode) return;
    setRooms((prev) =>
      prev.map((room) =>
        String(room.maGiuong || "").trim() === normalizedCode
          ? { ...room, trangThaiGiuong: nextStatus }
          : room,
      ),
    );
  };

  const buildOptimisticInHouseStay = (payload, previousStay = null) =>
    normalizeSessionState({
      ...(previousStay || {}),
      ...(payload || {}),
      maPhien: String(
        payload?.maPhien || previousStay?.maPhien || `TEMP-${Date.now()}`,
      ).trim(),
      trangThaiPhien: SESSION_STATUS.IN_HOUSE,
      batDauAt: payload?.batDauAt || previousStay?.batDauAt || toVnDateTimeString(new Date()),
    });

  const buildOptimisticBookingStay = (payload) =>
    normalizeSessionState({
      ...(payload || {}),
      maPhien: String(payload?.maPhien || `TEMP-${Date.now()}`).trim(),
      trangThaiPhien: SESSION_STATUS.BOOKED,
      batDauAt: payload?.batDauAt || toVnDateTimeString(new Date()),
    });

  const resolveSelectedStaff = (payload = {}) => {
    const requestedCode = String(payload?.maNhanVien || "").trim();
    const requestedName = normalizeCustomerName(payload?.tenNhanVien || "");
    return (
      staffs.find((item) => String(item.maNhanVien || "").trim() === requestedCode) ||
      staffs.find((item) => normalizeCustomerName(item.tenNhanVien || "") === requestedName) ||
      null
    );
  };

  const handleCheckIn = async (payload, options = {}) => {
    const roomCode = String(payload?.maGiuong || "").trim();
    const currentRoom = roomsWithUiState.find(
      (room) => String(room.maGiuong || "").trim() === roomCode,
    );
    const stayIdentityKey = String(payload?.maPhien || payload?.maLichHen || "").trim();
    const previousStay = stays.find((stay) => getStayIdentityKey(stay) === stayIdentityKey);
    const activeStay = activeStayByRoom.get(roomCode) || null;
    const roomIsAvailable =
      currentRoom && String(currentRoom.trangThaiGiuong || "").trim() === ROOM_STATUS.AVAILABLE;
    const isBookingCheckIn = getStayStatus(previousStay) === SESSION_STATUS.BOOKED;
    const roomBlockedByAnotherActiveStay =
      activeStay && getStayIdentityKey(activeStay) !== stayIdentityKey;
    const canOpenDueBooking = isBookingCheckIn && !roomBlockedByAnotherActiveStay;
    const selectedStaff = resolveSelectedStaff(payload);
    const selectedStaffStatus = getStaffCatalogStatus(selectedStaff);
    if (!currentRoom || (!roomIsAvailable && !canOpenDueBooking)) {
      toast.error(
        roomBlockedByAnotherActiveStay
          ? "Giường đang có một phiên hoạt động khác."
          : "Chỉ có thể mở phiên ngay trên giường đang Sẵn sàng.",
      );
      return false;
    }
    if (isBlockingStaffStatus(selectedStaffStatus)) {
      toast.error(`Nhân viên đang ở trạng thái ${selectedStaffStatus}, không thể mở phiên.`);
      return false;
    }

    if (String(currentRoom.trangThaiGiuong || "").trim() === ROOM_STATUS.MAINTENANCE) {
      toast.error("Giường đang ngưng sử dụng, không thể mở phiên.");
      return false;
    }
    const scheduleValidation = validateSessionScheduleConflicts(stays, {
      maGiuong: roomCode,
      maNhanVien: payload?.maNhanVien,
      batDauAt: payload?.batDauAt,
      ketThucDuKien: payload?.ketThucDuKien,
      excludeStayKey: stayIdentityKey,
    });
    if (!scheduleValidation.ok) {
      toast.error(scheduleValidation.message);
      return false;
    }
    const result = await runOptimisticAction({
      actionName: "start_treatment_session",
      applyOptimistic: () => {
        const nextStay = buildOptimisticInHouseStay(payload, previousStay);
        upsertStayInState(nextStay);
        patchRoomStatusInState(roomCode, ROOM_STATUS.IN_HOUSE);
      },
      apiCall: () => startTreatmentSessionWithItems(payload || {}),
    });
    if (result?.success) {
      rememberRecentSessionOverride(result.data);
      syncStayState(result.data);
      closeCheckinModal();
      return true;
    }
    return false;
  };

  const handleCreateBooking = async (payload) => {
    if (!String(payload?.tenKhach || "").trim()) {
      toast.error("Cần nhập tên khách.");
      return false;
    }
    if (!String(payload?.maGiuong || "").trim()) {
      toast.error("Cần chọn giường.");
      return false;
    }
    if (!String(payload?.maGoi || "").trim()) {
      toast.error("Cần chọn gói trị liệu.");
      return false;
    }
    const selectedStaff = resolveSelectedStaff(payload);
    const selectedStaffStatus = getStaffCatalogStatus(selectedStaff);
    if (isBlockingStaffStatus(selectedStaffStatus)) {
      toast.error(`Nhân viên đang ở trạng thái ${selectedStaffStatus}, không thể tạo lịch.`);
      return false;
    }

    const scheduleValidation = validateSessionScheduleConflicts(stays, {
      maGiuong: payload?.maGiuong,
      maNhanVien: payload?.maNhanVien,
      batDauAt: payload?.batDauAt,
      ketThucDuKien: payload?.ketThucDuKien,
      excludeStayKey: String(payload?.maPhien || payload?.maLichHen || "").trim(),
    });
    if (!scheduleValidation.ok) {
      toast.error(scheduleValidation.message);
      return false;
    }
    const result = await runOptimisticAction({
      actionName: "create_spa_booking",
      applyOptimistic: () => {
        upsertStayInState(buildOptimisticBookingStay(payload));
      },
      apiCall: () => createSpaBookingWithItems(payload || {}),
    });
    if (result?.success) {
      rememberRecentSessionOverride(result.data);
      syncStayState(result.data);
      closeCheckinModal();
      return true;
    }
    return false;
  };

  const handleAddService = async (payload) => {
    const selectedProduct = catalog.find(
      (item) => String(item.maSanPham || "") === String(payload.maSanPham || ""),
    );
    const result = await runOptimisticAction({
      actionName: "add_service_item",
      applyOptimistic: () => {
        const patchStay = (stay) => {
          const serviceItems = Array.isArray(stay?.serviceItems) ? [...stay.serviceItems] : [];
          serviceItems.push({
            serviceItemId: `tmp-${Date.now()}-${serviceItems.length}`,
            maSanPham: payload.maSanPham,
            tenSanPham: payload.tenSanPham || selectedProduct?.tenSanPham || "Dịch vụ",
            soLuong: Number(payload.soLuong || 1),
            donGia: Number(payload.donGia || 0),
            donVi: selectedProduct?.donViTinh || "",
            ghiChu: payload.ghiChu || "",
            thanhTien: Number(payload.soLuong || 1) * Number(payload.donGia || 0),
          });
          const tienDichVu = serviceItems.reduce(
            (sum, item) => sum + Number(item.thanhTien || Number(item.soLuong || 0) * Number(item.donGia || 0)),
            0,
          );
          const tienGoi = getStayPackageAmount(stay);
          const tongThanhToan = tienGoi + tienDichVu;
          return normalizeSessionState({
            ...stay,
            serviceItems,
            tienDichVu,
            tongThanhToan,
          });
        };
        setStays((prev) =>
          prev.map((stay) =>
            String(stay.maPhien || "") === String(payload.maPhien || "")
              ? patchStay(stay)
              : stay,
          ),
        );
        setStayModal((prev) =>
          prev && String(prev?.stay?.maPhien || "") === String(payload.maPhien || "")
            ? { ...prev, stay: patchStay(prev.stay) }
            : prev,
        );
      },
      apiCall: () => addTreatmentServiceItem(payload),
    });
    if (result?.success && result?.data) {
      rememberRecentSessionOverride(result.data);
      syncStayState(result.data);
    }
  };

  const handleUpdateService = async (payload) => {
    const result = await runOptimisticAction({
      actionName: "update_service_item",
      applyOptimistic: () => {
        const patchStay = (stay) => {
          const serviceItems = Array.isArray(stay?.serviceItems) ? [...stay.serviceItems] : [];
          const idx = serviceItems.findIndex(
            (item) => String(item.serviceItemId || "") === String(payload.serviceItemId || ""),
          );
          if (idx < 0) return stay;
          const current = serviceItems[idx] || {};
          const next = {
            ...current,
            soLuong: Number(payload.soLuong || current.soLuong || 1),
            donGia: Number(payload.donGia || current.donGia || 0),
            ghiChu: String(payload.ghiChu || ""),
          };
          next.thanhTien = Number(next.soLuong || 0) * Number(next.donGia || 0);
          serviceItems[idx] = next;
          const tienDichVu = serviceItems.reduce(
            (sum, item) => sum + Number(item.thanhTien || Number(item.soLuong || 0) * Number(item.donGia || 0)),
            0,
          );
          const tienGoi = getStayPackageAmount(stay);
          const tongThanhToan = tienGoi + tienDichVu;
          return normalizeSessionState({
            ...stay,
            serviceItems,
            tienDichVu,
            tongThanhToan,
          });
        };
        setStays((prev) =>
          prev.map((stay) =>
            String(stay.maPhien || "") === String(payload.maPhien || "")
              ? patchStay(stay)
              : stay,
          ),
        );
        setStayModal((prev) =>
          prev && String(prev?.stay?.maPhien || "") === String(payload.maPhien || "")
            ? { ...prev, stay: patchStay(prev.stay) }
            : prev,
        );
      },
      apiCall: () => updateTreatmentServiceItem(payload),
    });
    if (result?.success && result?.data) {
      rememberRecentSessionOverride(result.data);
      syncStayState(result.data);
    }
  };

  const handleDeleteService = async (payload) => {
    const result = await runOptimisticAction({
      actionName: "delete_service_item",
      applyOptimistic: () => {
        const patchStay = (stay) => {
          const serviceItems = Array.isArray(stay?.serviceItems) ? [...stay.serviceItems] : [];
          const nextItems = serviceItems.filter(
            (item) => String(item.serviceItemId || "") !== String(payload.serviceItemId || ""),
          );
          if (nextItems.length === serviceItems.length) return stay;
          const tienDichVu = nextItems.reduce(
            (sum, item) => sum + Number(item.thanhTien || Number(item.soLuong || 0) * Number(item.donGia || 0)),
            0,
          );
          const tienGoi = getStayPackageAmount(stay);
          const tongThanhToan = tienGoi + tienDichVu;
          return normalizeSessionState({
            ...stay,
            serviceItems: nextItems,
            tienDichVu,
            tongThanhToan,
          });
        };
        setStays((prev) =>
          prev.map((stay) =>
            String(stay.maPhien || "") === String(payload.maPhien || "")
              ? patchStay(stay)
              : stay,
          ),
        );
        setStayModal((prev) =>
          prev && String(prev?.stay?.maPhien || "") === String(payload.maPhien || "")
            ? { ...prev, stay: patchStay(prev.stay) }
            : prev,
        );
      },
      apiCall: () => deleteTreatmentServiceItem(payload),
    });
    if (result?.success && result?.data) {
      rememberRecentSessionOverride(result.data);
      syncStayState(result.data);
    }
  };

  const handleUpdateTime = async (payload) => {
    const targetStay = stays.find((s) => String(s.maPhien) === String(payload.maPhien));
    if (targetStay) {
      const scheduleValidation = validateSessionScheduleConflicts(stays, {
        maGiuong: targetStay.maGiuong,
        maNhanVien: targetStay.maNhanVien,
        batDauAt: payload.batDauAt || targetStay.batDauAt,
        ketThucDuKien: payload.ketThucDuKien || targetStay.ketThucDuKien,
        excludeStayKey: String(payload.maPhien),
      });
      if (!scheduleValidation.ok) {
        toast.error(scheduleValidation.message);
        return false;
      }
    }

    const result = await runOptimisticAction({
      actionName: "update_stay_time",
      applyOptimistic: () => {
        const patchStay = (stay) => normalizeSessionState({
          ...stay,
          batDauAt: payload.batDauAt || stay.batDauAt,
          ketThucDuKien:
            payload.ketThucDuKien || stay.ketThucDuKien,
          maNhanVien: payload.maNhanVien !== undefined ? payload.maNhanVien : stay.maNhanVien,
          tenNhanVien: payload.maNhanVien !== undefined 
            ? (staffs.find((s) => String(s.maNhanVien) === String(payload.maNhanVien))?.tenNhanVien || "")
            : stay.tenNhanVien,
          thoiLuongPhut:
            Math.max(Number(payload.thoiLuongPhut || 0), 0) ||
            getStayDurationMinutes({
              batDauAt: payload.batDauAt || stay.batDauAt,
              ketThucDuKien: payload.ketThucDuKien || stay.ketThucDuKien,
            }),
        });
        setStays((prev) =>
          prev.map((stay) =>
            String(stay.maPhien || "") === String(payload.maPhien || "")
              ? patchStay(stay)
              : stay,
          ),
        );
        setStayModal((prev) =>
          prev && String(prev?.stay?.maPhien || "") === String(payload.maPhien || "")
            ? { ...prev, stay: patchStay(prev.stay) }
            : prev,
        );
      },
      apiCall: () => updateTreatmentSessionTime(payload),
    });
    if (result?.success && result?.data) {
      rememberRecentSessionOverride(result.data);
      syncStayState(result.data);
    }
    return Boolean(result?.success);
  };

  const handleCheckout = async (payload) => {
    console.log("[Checkout] Bắt đầu checkout với payload:", JSON.stringify(payload));
    const existingStay = stays.find(
      (stay) => String(stay.maPhien || "") === String(payload?.maPhien || ""),
    );
    console.log("[Checkout] Tìm thấy existingStay:", existingStay?.maPhien, existingStay?.trangThaiPhien);

    const dichVuDaDung = existingStay?.dichVuDaDung || payload?.dichVuDaDung || [];
    const productQtyMap = {};
    for (const item of dichVuDaDung) {
      if (item.loaiDichVu === "PRODUCT") {
        const key = String(item.maSanPham || "");
        productQtyMap[key] = (productQtyMap[key] || 0) + (Number(item.soLuong) || 0);
      }
    }
    for (const [key, qty] of Object.entries(productQtyMap)) {
      const productInfo = catalog.find((p) => p.key === key);
      if (productInfo && productInfo.tonKho !== undefined) {
        const currentStock = Number(productInfo.tonKho) || 0;
        if (currentStock < qty) {
          toast.error(
            `Sản phẩm "${productInfo.tenSanPham}" không đủ tồn kho (Còn ${currentStock}, Cần ${qty}).`,
          );
          console.log("[Checkout] Lỗi tồn kho:", productInfo.tenSanPham, currentStock, qty);
          return false;
        }
      }
    }

    const roomCode = String(existingStay?.maGiuong || payload?.maGiuong || "").trim();
    console.log("[Checkout] Room code:", roomCode);
    setCheckoutLoading(true);
    try {
      const result = await completeTreatmentSession(payload);
      console.log("[Checkout] Kết quả từ completeTreatmentSession:", JSON.stringify(result));

      // Xử lý trường hợp operation được đưa vào queue
      if (result?.queued) {
        console.log("[Checkout] Operation đang được queue, jobId:", result.jobId);
        toast.info("Hệ thống đang bận, yêu cầu đang được xử lý...");
        setCheckoutLoading(false);
        return true; // Không đóng popup, chờ queue xử lý
      }

      if (!result?.success) {
        console.log("[Checkout] Lỗi từ BE:", result?.message);
        toast.error(result?.message || "Không thể kết thúc phiên.");
        return false;
      }
      console.log("[Checkout] Thành công, cập nhật UI");
      const nextStay = result?.data
        ? normalizeSessionState(mergeTreatmentSessionPatch(existingStay || {}, result.data))
        : null;
      if (nextStay) {
        rememberRecentSessionOverride(nextStay);
        syncStayState(nextStay);
      }
      setStayModal(null);
      setCheckinRoom(null);
      setCheckinPreset(null);
      console.log("[Checkout] Hoàn tất");
      return true;
    } catch (error) {
      console.error("[Checkout] Catch error:", error);
      toast.error(error?.message || "Đã xảy ra lỗi khi kết thúc phiên.");
      return false;
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleStatusChange = async (room, nextStatus) => {
    const currentStatus = String(room._rawtrangThaiGiuong || room.trangThaiGiuong || "");
    if (currentStatus === nextStatus) return;
    await runOptimisticAction({
      actionName: "update_room_status",
      applyOptimistic: () => {
        setRooms((prev) =>
          prev.map((item) =>
            String(item.maGiuong || "") === String(room.maGiuong || "")
              ? { ...item, trangThaiGiuong: nextStatus }
              : item,
          ),
        );
      },
      apiCall: () =>
        updateRoomStatus({
          maGiuong: room.maGiuong,
          trangThaiGiuong: nextStatus,
        }),
      rollback: async () => {
        await loadData({ silent: true });
      },
    });
  };

  const handleCreateBed = async (payload) => {
    const normalized = buildBedPayload(payload);
    const bedCode = String(normalized.maGiuong || "").trim();
    if (rooms.some((item) => String(item.maGiuong || "").trim() === bedCode)) {
      toast.error(`Mã giường ${bedCode} đã tồn tại.`);
      return false;
    }
    const result = await runOptimisticAction({
      actionName: "create_treatment_bed",
      applyOptimistic: () => {
        setRooms((prev) => [...prev, normalized]);
      },
      apiCall: () => createTreatmentBed(normalized),
      rollback: async () => {
        await loadData({ silent: true });
      },
    });
    return Boolean(result?.success);
  };

  const handleUpdateBed = async (payload) => {
    const normalized = buildBedPayload(payload);
    const result = await runOptimisticAction({
      actionName: "update_treatment_bed",
      applyOptimistic: () => {
        setRooms((prev) =>
          prev.map((room) =>
            String(room.maGiuong || "") === String(normalized.maGiuong || "") ? { ...room, ...normalized } : room,
          ),
        );
      },
      apiCall: () => updateTreatmentBed(normalized),
      rollback: async () => {
        await loadData({ silent: true });
      },
    });
    return Boolean(result?.success);
  };

  const handleDeleteBed = async (payload) => {
    await runOptimisticAction({
      actionName: "delete_treatment_bed",
      applyOptimistic: () => {
        setRooms((prev) => prev.filter((room) => String(room.maGiuong || "") !== String(payload.maGiuong || "")));
      },
      apiCall: () => deleteTreatmentBed({ maGiuong: payload.maGiuong }),
      rollback: async () => {
        await loadData({ silent: true });
      },
    });
  };

  const openStay = (room, stay) => {
    if (!stay) return;
    if (stay?._pendingSync) {
      toast("Lịch hẹn đang đồng bộ, chờ vài giây rồi thao tác lại.");
      return;
    }
    if (isDueOrOverdueBooking(stay, timelineNow)) {
      setDueBookingPrompt({
        room:
          room ||
          roomMap.get(String(stay.maGiuong || "")) || {
            maGiuong: String(stay.maGiuong || "").trim(),
            tenGiuong: String(stay.maGiuong || "").trim(),
            loaiGiuong: "",
            trangThaiGiuong: ROOM_STATUS.AVAILABLE,
          },
        bookingStay: stay,
        bookingCandidates: bookedStaysByRoom.get(String(stay.maGiuong || "")) || [],
      });
      return;
    }
    setStayModal({ room, stay });
  };

  const handleUseBookingFromModal = (stay) => {
    if (!stay) return;
    const room =
      roomMap.get(String(stay.maGiuong || "")) || {
        maGiuong: String(stay.maGiuong || "").trim(),
        tenGiuong: String(stay.maGiuong || "").trim(),
        loaiGiuong: "",
        trangThaiGiuong: ROOM_STATUS.AVAILABLE,
      };
    if (isDueOrOverdueBooking(stay, timelineNow)) {
      setStayModal(null);
      setDueBookingPrompt({
        room,
        bookingStay: stay,
        bookingCandidates: bookedStaysByRoom.get(String(stay.maGiuong || "")) || [],
      });
      return;
    }
    setStayModal(null);
    const now = new Date();
    setCheckinRoom({
      room,
      bookingStay: stay,
      bookingCandidates: bookedStaysByRoom.get(String(stay.maGiuong || "")) || [],
      mode: "INSTANT",
    });
    setCheckinPreset({
      batDauAt: toVnDateTimeString(now),
      ketThucDuKien: toVnDateTimeString(new Date(now.getTime() + 60 * 60000)),
    });
  };

  const handleNoShow = async (stay, options = {}) => {
    if (!stay?.maPhien && !stay?.maLichHen) return;
    if (getStayStatus(stay) !== SESSION_STATUS.BOOKED) {
      toast.error("Chỉ có thể đánh dấu không đến cho lịch hẹn chưa nhận khách.");
      return false;
    }
    if (!options?.skipConfirm) {
      const ok = await confirm({
        message: `Đánh dấu khách "${stay.tenKhach || "khách đã hẹn"}" là không đến?`,
        subMessage: "Slot này sẽ được giải phóng để đặt/mở phiên khác.",
        yesLabel: "Không đến",
        yesStyle: "warning",
      });
      if (!ok) return false;
    }
    const result = await runOptimisticAction({
      actionName: "booking_no_show",
      applyOptimistic: () => {
        setStays((prev) =>
          prev.map((item) =>
            String(item.maPhien || item.maLichHen || "") ===
            String(stay.maPhien || stay.maLichHen || "")
              ? { ...item, trangThaiPhien: "NO_SHOW" }
              : item,
          ),
        );
        setStayModal((prev) =>
          String(prev?.stay?.maPhien || prev?.stay?.maLichHen || "") ===
          String(stay.maPhien || stay.maLichHen || "")
            ? null
            : prev,
        );
      },
      apiCall: () =>
        markTreatmentNoShow({
          maPhien: stay.maPhien,
          maLichHen: stay.maLichHen,
        }),
      rollback: async () => {
        await loadData({ silent: true });
      },
    });
    return Boolean(result?.success);
  };

  const handlePickTimeSlot = (slotDate) => {
    const start = slotDate instanceof Date ? slotDate : new Date(slotDate);
    const safeStart = Number.isNaN(start.getTime()) ? new Date() : start;
    const end = new Date(safeStart.getTime() + Math.max(15, gridMinutes) * 60 * 1000);
    setCheckinPreset({
      batDauAt: toVnDateTimeString(safeStart),
      ketThucDuKien: toVnDateTimeString(end),
    });
    setCheckinRoom({
      room: null,
      bookingStay: null,
      bookingCandidates: [],
      mode: "BOOKING",
    });
    setShowSelectTimeModal(false);
  };

  const displayDateRange = useMemo(() => {
    const from = scheduleRange.from;
    const to = scheduleRange.to;
    const sameDay = toDateKey(from) === toDateKey(to);
    if (sameDay) return toDisplayDate(from);
    return `${toDisplayDate(from)} - ${toDisplayDate(to)}`;
  }, [scheduleRange.from, scheduleRange.to]);

  const customerHints = useMemo(() => {
    const map = new Map();
    const pushCustomer = (raw = {}) => {
      const phone = normalizePhone(raw.soDienThoai);
      const name = String(raw.tenKhach || "").trim();
      if (!name) return;
      const nameKey = normalizeCustomerName(name);
      const phoneMapKey = phone ? `phone:${phone}` : "";
      const nameMapKey = nameKey ? `name:${nameKey}` : "";
      const current =
        (phoneMapKey && map.get(phoneMapKey)) ||
        (nameMapKey && map.get(nameMapKey)) ||
        {};
      const merged = {
        soDienThoai: raw.soDienThoai || current.soDienThoai || "",
        tenKhach: name || current.tenKhach || "",
        maNhanVien: String(raw.maNhanVien || current.maNhanVien || "").trim(),
      };
      if (phoneMapKey) map.set(phoneMapKey, merged);
      if (nameMapKey) map.set(nameMapKey, merged);
    };
    customerCatalog.forEach(pushCustomer);
    stays
      .slice()
      .sort(
        (a, b) =>
          new Date(getStayStartAt(b) || 0).getTime() - new Date(getStayStartAt(a) || 0).getTime(),
      )
      .forEach(pushCustomer);
    const uniqueMap = new Map();
    Array.from(map.values()).forEach((item) => {
      const identityKey = getCustomerIdentityKey(item);
      if (!identityKey || uniqueMap.has(identityKey)) return;
      uniqueMap.set(identityKey, item);
    });
    return Array.from(uniqueMap.values());
  }, [customerCatalog, stays]);

  const roomMap = useMemo(() => {
    const map = new Map();
    rooms.forEach((room) => map.set(String(room.maGiuong || ""), room));
    return map;
  }, [rooms]);

  const gridStays = filteredStays;

  const timelineDays = useMemo(
    () => buildTimelineDays(scheduleRange.from, scheduleRange.to),
    [scheduleRange.from, scheduleRange.to],
  );

  const timelineRows = useMemo(
    () =>
      buildTimelineRows({
        days: timelineDays,
        labels: scheduleHours,
        stays: gridStays,
        gridMinutes,
        nowMs: timelineNow,
      }),
    [gridStays, gridMinutes, scheduleHours, timelineDays, timelineNow],
  );

  const dayTimelineEntries = useMemo(() => {
    if (dateMode !== "DAY") return [];
    const rangeStartMs = scheduleRange.from.getTime();
    const rangeEndMs = scheduleRange.to.getTime() + 1;
    return timelineRooms
      .map((room) => {
        const entries = gridStays
          .filter((stay) => String(stay.maGiuong || "") === String(room.maGiuong || ""))
          .map((stay) => {
            const metrics = getTimelineBlockMetrics({
              stay,
              rangeStartMs,
              rangeEndMs,
              fallbackMinutes: gridMinutes,
              nowMs: timelineNow,
            });
            if (!metrics) return null;
            return {
              stay,
              room,
              ...metrics,
            };
          })
          .filter(Boolean)
          .sort((a, b) => a.visibleStartMs - b.visibleStartMs);
        return { room, entries };
      })
      .filter((column) => column.room && column.room.maGiuong);
  }, [dateMode, gridMinutes, gridStays, scheduleRange.from, scheduleRange.to, timelineNow, timelineRooms]);

  const dayTimelinePageCount = useMemo(
    () => Math.max(1, Math.ceil(dayTimelineEntries.length / ROOM_TIMELINE_PAGE_SIZE)),
    [dayTimelineEntries.length],
  );

  const safeRoomTimelinePage = useMemo(
    () => clamp(roomTimelinePage, 0, Math.max(dayTimelinePageCount - 1, 0)),
    [roomTimelinePage, dayTimelinePageCount],
  );

  const pagedDayTimelineEntries = useMemo(() => {
    const startIndex = safeRoomTimelinePage * ROOM_TIMELINE_PAGE_SIZE;
    return dayTimelineEntries.slice(startIndex, startIndex + ROOM_TIMELINE_PAGE_SIZE);
  }, [dayTimelineEntries, safeRoomTimelinePage]);

  useEffect(() => {
    if (roomTimelinePage !== safeRoomTimelinePage) {
      setRoomTimelinePage(safeRoomTimelinePage);
    }
  }, [roomTimelinePage, safeRoomTimelinePage]);

  const dayTimelineNowMarker = useMemo(() => {
    if (dateMode !== "DAY") return null;
    return getTimelineNowMarker({
      nowMs: timelineNow,
      rangeStartMs: scheduleRange.from.getTime(),
      rangeEndMs: scheduleRange.to.getTime() + 1,
    });
  }, [dateMode, scheduleRange.from, scheduleRange.to, timelineNow]);

  const dayStaffTimelineEntries = useMemo(() => {
    if (dateMode !== "DAY") return [];
    const rangeStartMs = scheduleRange.from.getTime();
    const rangeEndMs = scheduleRange.to.getTime() + 1;
    return visibleStaffRows
      .map((staff) => {
        const entries = gridStays
          .filter(
            (stay) => String(stay.maNhanVien || "") === String(staff.maNhanVien || ""),
          )
          .map((stay) => {
            const metrics = getTimelineBlockMetrics({
              stay,
              rangeStartMs,
              rangeEndMs,
              fallbackMinutes: gridMinutes,
              nowMs: timelineNow,
            });
            if (!metrics) return null;
            return {
              stay,
              staff,
              ...metrics,
            };
          })
          .filter(Boolean)
          .sort((a, b) => a.visibleStartMs - b.visibleStartMs);
        return { staff, entries };
      })
      .filter(({ staff, entries }) =>
        selectedStaff === "ALL"
          ? entries.length > 0 || String(staff.maNhanVien || "").trim() !== ""
          : true,
      );
  }, [
    dateMode,
    gridMinutes,
    gridStays,
    scheduleRange.from,
    scheduleRange.to,
    selectedStaff,
    timelineNow,
    visibleStaffRows,
  ]);

  useEffect(() => {
    if (
      entryActionModal ||
      dueBookingPrompt ||
      checkinRoom ||
      stayModal ||
      showBedManager ||
      showSelectTimeModal
    ) {
      return;
    }
    const rangeStartMs = scheduleRange.from.getTime();
    const rangeEndMs = scheduleRange.to.getTime() + 1;
    if (timelineNow < rangeStartMs || timelineNow >= rangeEndMs) return;
    const dueBooking = filteredStays
      .filter((stay) => {
        const promptKey = getStayPromptKey(stay);
        if (!promptKey) return false;
        if (stay?._pendingSync) return false;
        if (delayedDuePromptKeysRef.current.has(promptKey)) return false;
        return isDueOrOverdueBooking(stay, timelineNow);
      })
      .sort(
        (a, b) =>
          new Date(getStayStartAt(b) || 0).getTime() -
          new Date(getStayStartAt(a) || 0).getTime(),
      )[0];
    if (!dueBooking) return;
    const room =
      roomMap.get(String(dueBooking.maGiuong || "")) || {
        maGiuong: String(dueBooking.maGiuong || "").trim(),
        tenGiuong: String(dueBooking.maGiuong || "").trim(),
        loaiGiuong: "",
        trangThaiGiuong: ROOM_STATUS.AVAILABLE,
      };
    setDueBookingPrompt({
      room,
      bookingStay: dueBooking,
      bookingCandidates: bookedStaysByRoom.get(String(dueBooking.maGiuong || "")) || [],
    });
  }, [
    bookedStaysByRoom,
    checkinRoom,
    entryActionModal,
    dueBookingPrompt,
    filteredStays,
    roomMap,
    scheduleRange.from,
    scheduleRange.to,
    showBedManager,
    showSelectTimeModal,
    stayModal,
    timelineNow,
  ]);

  const staffWeekGridMap = useMemo(() => {
    const map = new Map();
    timelineRows.forEach((row) => {
      row.dayBuckets.forEach((bucket) => {
        bucket.items.forEach((item) => {
          const staffKey = String(item.stay?.maNhanVien || "");
          const key = `${staffKey}|${bucket.dayKey}|${row.label}`;
          const current = map.get(key) || [];
          current.push(item.stay);
          map.set(key, current);
        });
      });
    });
    map.forEach((value) => {
      value.sort(
        (a, b) =>
          new Date(getStayStartAt(a) || 0).getTime() - new Date(getStayStartAt(b) || 0).getTime(),
      );
    });
    return map;
  }, [timelineRows]);

  const todaySlotLabel = useMemo(() => {
    const current = new Date(timelineNow);
    if (Number.isNaN(current.getTime())) return "";
    const minutes = Math.floor(current.getMinutes() / gridMinutes) * gridMinutes;
    return `${pad2(current.getHours())}:${pad2(minutes)}`;
  }, [timelineNow, gridMinutes]);

  const currentTimelineRowIndex = useMemo(
    () => scheduleHours.findIndex((label) => label === todaySlotLabel),
    [scheduleHours, todaySlotLabel],
  );
  const timelineHeightPx = scheduleHours.length * TIMELINE_SLOT_HEIGHT;

  useEffect(() => {
    timelineUserScrolledRef.current = false;
    autoScrollStateRef.current = "";
  }, [activeTab, dateMode, selectedDateObj]);

  const blockTimeline = useMemo(
    () => shouldBlockPanelUI(loading, stays.length > 0 || rooms.length > 0),
    [loading, rooms.length, stays.length],
  );

  useEffect(() => {
    const nodes = [timeGridScrollRef.current, staffGridScrollRef.current].filter(Boolean);
    if (!nodes.length) return undefined;
    const onScroll = () => {
      timelineUserScrolledRef.current = true;
    };
    nodes.forEach((node) => node.addEventListener("scroll", onScroll, { passive: true }));
    return () => {
      nodes.forEach((node) => node.removeEventListener("scroll", onScroll));
    };
  }, [activeTab, dateMode, blockTimeline]);

  useEffect(() => {
    if (blockTimeline) return;
    if (dateMode !== "DAY") return;
    const targetRef =
      activeTab === "TIME_GRID" ? timeGridScrollRef.current : staffGridScrollRef.current;
    if (!targetRef) return;
    const viewKey = `${activeTab}|${dateMode}|${toDateKey(selectedDateObj)}|${gridMinutes}`;
    if (autoScrollStateRef.current === viewKey) return;
    if (timelineUserScrolledRef.current) return;
    autoScrollStateRef.current = viewKey;
    const isToday = toDateKey(selectedDateObj) === toDateKey(new Date());
    const scrollToTarget = () => {
      const markerTopPx =
        isToday && dayTimelineNowMarker
          ? (timelineHeightPx * Number(dayTimelineNowMarker.topPct || 0)) / 100
          : Math.max(currentTimelineRowIndex, 0) * TIMELINE_SLOT_HEIGHT;
      const targetTop = Math.max(
        0,
        markerTopPx - targetRef.clientHeight * 0.22,
      );
      targetRef.scrollTop = targetTop;
    };
    window.requestAnimationFrame(() => {
      scrollToTarget();
      window.setTimeout(scrollToTarget, 80);
    });
  }, [
    activeTab,
    currentTimelineRowIndex,
    dateMode,
    dayTimelineNowMarker,
    gridMinutes,
    blockTimeline,
    selectedDateObj,
    timelineHeightPx,
  ]);

  return (
    <main className="app-page bg-slate-100 pb-24">
      {confirmDialog}
      <div className="app-shell space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-3xl font-black text-slate-800">Điều phối trị liệu</h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {refreshing ? (
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-700/80 border-r-transparent" />
                ) : null}
                {refreshing ? "Đang tải..." : "Tải lại"}
              </button>
              <button
                type="button"
                onClick={() => setShowBedManager(true)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
              >
                Xem danh sách giường
              </button>
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                Đang trị liệu: {grouped[ROOM_STATUS.IN_HOUSE]?.length || 0}
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 xl:grid-cols-[minmax(180px,1fr)_minmax(150px,1fr)_minmax(180px,1fr)_minmax(180px,1fr)_minmax(280px,2fr)]">
            <CustomDropdown
              value={statusFilter}
              onChange={(next) => setStatusFilter(String(next))}
              options={[
                { value: "ALL", label: "Tất cả trạng thái" },
                ...STATUS_OPTIONS.map((status) => ({ value: status, label: status })),
              ]}
            />
            <CustomDropdown
              value={dateMode}
              onChange={(next) => setDateMode(String(next))}
              options={[
                { value: "DAY", label: "Theo ngày" },
                { value: "WEEK", label: "Theo tuần" },
              ]}
            />
            <DateFilterPopover
              selectedDate={selectedDate}
              dateMode={dateMode}
              onChangeDate={setSelectedDate}
              onChangeDateMode={setDateMode}
            />
            <CustomDropdown
              value={selectedStaff}
              onChange={(next) => setSelectedStaff(String(next))}
              options={[
                { value: "ALL", label: "Tất cả nhân viên" },
                ...staffs.map((staff) => ({
                  value: staff.maNhanVien,
                  label: staff.tenNhanVien,
                })),
              ]}
            />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Tìm theo khách/mã phiên/nhân viên..."
              className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm xl:col-span-1"
            />
          </div>

          <div className="mt-3 border-b border-slate-200">
            <div className="flex gap-6 text-lg font-semibold">
              <button
                type="button"
                onClick={() => setActiveTab("TIME_GRID")}
                className={`pb-2 ${
                  activeTab === "TIME_GRID"
                    ? "border-b-4 border-rose-500 text-rose-700"
                    : "text-slate-500"
                }`}
              >
                Lưới thời gian
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("STAFF_GRID")}
                className={`pb-2 ${
                  activeTab === "STAFF_GRID"
                    ? "border-b-4 border-rose-500 text-rose-700"
                    : "text-slate-500"
                }`}
              >
                Lưới nhân viên
              </button>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4">
          <div>
            {blockTimeline ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
                Đang tải lịch trị liệu...
              </section>
            ) : activeTab === "LIST" ? (
              <section className="space-y-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-600 shadow-sm">
                  Bộ lọc hiện tại: <strong>{displayDateRange}</strong> •{" "}
                  <strong>{selectedStaff === "ALL" ? "Tất cả nhân viên" : staffs.find((x) => x.maNhanVien === selectedStaff)?.tenNhanVien || "Tất cả nhân viên"}</strong> •{" "}
                  <strong>{filteredStays.length}</strong> lịch
                </div>
                {filteredStays.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                    <EmptySchedule message="Chưa có lịch trị liệu nào phù hợp." />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {filteredStays.map((stay) => {
                      const room = roomMap.get(String(stay.maGiuong || ""));
                      return (
                        <button
                          key={`stay-card-${stay.maPhien}`}
                          type="button"
                          onClick={() => openStay(room, stay)}
                          className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-rose-300 hover:bg-rose-50/40"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-base font-black text-slate-800">{stay.tenKhach || "-"}</p>
                              <p className="text-xs text-slate-500">
                                {prettyTime(getStayStartAt(stay))} • {stay.maPhien}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {room?.tenGiuong || stay.maGiuong} • {stay.tenNhanVien || "Chưa gán nhân viên"}
                              </p>
                            </div>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600">
                              {getSessionStatusLabel(stay.trangThaiPhien)}
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                            <span className="rounded-lg bg-slate-100 px-2 py-1">
                              Gói: {fmt(getStayPackageAmount(stay))}
                            </span>
                            <span className="rounded-lg bg-emerald-50 px-2 py-1 text-emerald-700">
                              Tổng: {fmt(stay.tongThanhToan)}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            ) : (
              <TimelineWorkspace
                activeTab={activeTab}
                dateMode={dateMode}
                displayDateRange={displayDateRange}
                selectedDateObj={selectedDateObj}
                toDateKey={toDateKey}
                toWeekdayDateLabel={toWeekdayDateLabel}
                gridMinutes={gridMinutes}
                onGridMinutesChange={(next) => setGridMinutes(Number(next))}
                DropdownComponent={CustomDropdown}
                onOpenEntryAction={() => openEntryActionChooser()}
                roomTimelinePage={roomTimelinePage}
                roomTimelinePageSize={ROOM_TIMELINE_PAGE_SIZE}
                dayTimelinePageCount={dayTimelinePageCount}
                dayTimelineEntries={dayTimelineEntries}
                onPrevRoomPage={() => setRoomTimelinePage((prev) => Math.max(prev - 1, 0))}
                onNextRoomPage={() => setRoomTimelinePage((prev) => Math.min(prev + 1, dayTimelinePageCount - 1))}
                timeGridScrollRef={timeGridScrollRef}
                staffGridScrollRef={staffGridScrollRef}
                timelineDays={timelineDays}
                timelineRows={timelineRows}
                roomMap={roomMap}
                openStay={openStay}
                timelineNow={timelineNow}
                getStayStartAt={getStayStartAt}
                getStayEndAt={getStayEndAt}
                getStayStatus={getStayStatus}
                scheduleHours={scheduleHours}
                timelineHeightPx={timelineHeightPx}
                timelineSlotHeight={TIMELINE_SLOT_HEIGHT}
                dayTimelineNowMarker={dayTimelineNowMarker}
                pagedDayTimelineEntries={pagedDayTimelineEntries}
                activeStayByRoom={activeStayByRoom}
                roomBookingAlertByRoom={roomBookingAlertByRoom}
                getRoomTimelineHeaderState={getRoomTimelineHeaderState}
                handleTimelineRoomHeaderSelect={handleTimelineRoomHeaderSelect}
                getStayTimelineMetaLabel={getStayTimelineMetaLabel}
                dayStaffTimelineEntries={dayStaffTimelineEntries}
                visibleStaffRows={visibleStaffRows}
                staffWeekGridMap={staffWeekGridMap}
              />
            )}
          </div>

        </div>
      </div>

      {entryActionModal ? (
        <EntryActionModal
          room={entryActionModal.room}
          loading={false}
          onClose={() => setEntryActionModal(null)}
          onOpenNow={() => {
            const context = entryActionModal;
            setEntryActionModal(null);
            handleQuickCheckIn(context.room, context.bookingCandidates || []);
          }}
          onCreateBooking={() => {
            const context = entryActionModal;
            setEntryActionModal(null);
            handleOpenBookingForm(context.room, context.bookingCandidates || []);
          }}
        />
      ) : null}

      {checkinRoom && (
        <CheckinModal
          mode={checkinRoom?.mode || "BOOKING"}
          room={checkinRoom?.room || checkinRoom}
          bookingStay={checkinRoom?.bookingStay || null}
          bookingCandidates={checkinRoom?.bookingCandidates || []}
          allStays={stays}
          onClose={closeCheckinModal}
          onSubmit={handleCheckIn}
          onCreateBooking={handleCreateBooking}
          loading={false}
          initialValues={checkinPreset}
          staffOptions={assignableStaffOptions}
          customerHints={customerHints}
          packageOptions={packages}
          roomOptions={roomsWithUiState}
          productOptions={catalog}
        />
      )}

      {stayModal?.stay && (
        <StayModal
          room={
            stayModal.room ||
            roomMap.get(String(stayModal?.stay?.maGiuong || "")) || {
              maGiuong: String(stayModal?.stay?.maGiuong || ""),
              tenGiuong: String(stayModal?.stay?.maGiuong || "Giường"),
              loaiGiuong: "",
              trangThaiGiuong: ROOM_STATUS.AVAILABLE,
              soKhachToiDa: 0,
              ghiChu: "",
            }
          }
          stay={stayModal.stay}
          catalog={catalog}
          onClose={() => setStayModal(null)}
          onAddService={handleAddService}
          onUpdateService={handleUpdateService}
          onDeleteService={handleDeleteService}
          onCheckout={handleCheckout}
          onUpdateTime={handleUpdateTime}
          onUseBooking={handleUseBookingFromModal}
          onNoShow={handleNoShow}
          loading={checkoutLoading}
        />
      )}

      {dueBookingPrompt?.bookingStay && (
        <DueBookingDecisionModal
          room={dueBookingPrompt.room}
          stay={dueBookingPrompt.bookingStay}
          loading={false}
          onConfirmCheckIn={handleDueBookingConfirmCheckIn}
          onDelay={handleDueBookingDelay}
          onCancelBooking={async () => {
            const prompt = dueBookingPrompt;
            const stay = prompt.bookingStay;
            suppressDuePrompt(stay);
            setDueBookingPrompt(null);
            const ok = await handleNoShow(stay, { skipConfirm: true });
            if (!ok) {
              releaseDuePrompt(stay);
              setDueBookingPrompt(prompt);
              return;
            }
          }}
        />
      )}

      {showSelectTimeModal && (
        <SelectTimeModal
          selectedDate={selectedDate}
          intervalMinutes={gridMinutes}
          onChangeDate={(next) =>
            setSelectedDate(next ? toVnDateTimeString(new Date(`${next}T00:00:00`)) : toVnDateTimeString(new Date()))
          }
          onChangeInterval={(next) => setGridMinutes(clamp(Number(next || 30), 15, 60))}
          onClose={() => setShowSelectTimeModal(false)}
          onConfirm={handlePickTimeSlot}
        />
      )}

      {showBedManager ? (
        <BedManagerModal
          rooms={roomsWithUiState}
          stays={stays}
          loading={false}
          onClose={() => setShowBedManager(false)}
          onCreate={handleCreateBed}
          onUpdate={handleUpdateBed}
          onDelete={handleDeleteBed}
        />
      ) : null}

    </main>
  );
}
