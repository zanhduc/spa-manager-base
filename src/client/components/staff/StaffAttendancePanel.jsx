import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  CACHE_INVALIDATED_EVENT,
  CACHE_KEYS,
  CACHE_UPDATED_EVENT,
  buildStaffAttendanceCacheKey,
  getSpaAttendance,
  getSpaStaffSchedules,
} from "../../api";
import { readCache } from "../../api/localCache.js";
import { shouldBlockPanelUI } from "../../utils/cacheBootstrap.js";
import {
  ATTENDANCE_STATUS,
  buildAttendanceShiftSlots,
  buildOptimisticAttendanceRecord,
  getAttendanceButtonState,
  upsertAttendanceRows,
  getStaffCatalogStatus,
  getStaffRoleLabel,
  inferStaffRole,
  isBlockingStaffStatus,
  isRetiredStaffStatus,
  matchesStaffStatusFilter,
  normalizeAttendanceDateKey,
  normalizeAttendanceShiftCode,
  validateAttendanceAction,
} from "./staffConstants";

const readCachedScheduleRows = () => {
  const cached = readCache(CACHE_KEYS.staffSchedules)?.response;
  return Array.isArray(cached?.data) ? cached.data : [];
};

const readCachedAttendanceRows = (dateKey) => {
  const cached = readCache(buildStaffAttendanceCacheKey({ ngay: dateKey }))?.response;
  return Array.isArray(cached?.data) ? cached.data : [];
};

const pad2 = (n) => String(n).padStart(2, "0");

const toDateInputValue = (value) => normalizeAttendanceDateKey(value) || "";

const todayDateKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
};

const formatTimeOnly = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "--:--";

  // Match "HH:mm" format (new format)
  const m2 = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (m2) {
    return `${m2[1].padStart(2, "0")}:${m2[2]}`;
  }

  // Parse VN datetime "HH:mm DD/MM/YYYY" (legacy format)
  const m = raw.match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    return `${m[1].padStart(2, "0")}:${m[2]}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
};

// Parse time string "HH:mm" to Date object for input value
const parseTimeInput = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  // Match "HH:mm" format - return as-is
  const m = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
      return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    }
  }

  // Match "HH:mm DD/MM/YYYY" format - extract time only
  const m2 = raw.match(/^(\d{1,2}):(\d{2})\s+\d+/);
  if (m2) {
    const h = parseInt(m2[1], 10);
    const min = parseInt(m2[2], 10);
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
      return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    }
  }

  // Fallback: return original
  return raw;
};

// Format time for display/input
const toVnDateTimeForInput = (timeStr, dateStr) => {
  if (!timeStr || !dateStr) return "";
  const time = parseTimeInput(timeStr);
  if (!time) return "";
  // dateStr is YYYY-MM-DD
  return `${time} ${dateStr.slice(8, 10)}/${dateStr.slice(5, 7)}/${dateStr.slice(0, 4)}`;
};

const statusTone = (status) => {
  if (status === ATTENDANCE_STATUS.IN_PROGRESS) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (status === ATTENDANCE_STATUS.COMPLETED) {
    return "border-sky-200 bg-sky-50 text-sky-800";
  }
  if (status === ATTENDANCE_STATUS.ABSENT) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  return "border-slate-200 bg-slate-50 text-slate-600";
};

const actionButtonClass = (enabled, tone) => {
  const base = "rounded-md border px-2 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-45";
  if (!enabled) return `${base} border-slate-200 bg-slate-50 text-slate-400`;
  if (tone === "emerald") return `${base} border-emerald-200 bg-emerald-50 text-emerald-700`;
  if (tone === "sky") return `${base} border-sky-200 bg-sky-50 text-sky-700`;
  if (tone === "amber") return `${base} border-amber-200 bg-amber-50 text-amber-700`;
  return `${base} border-slate-200 bg-white text-slate-700`;
};

export function StaffAttendancePanel({
  staffs = [],
  onRecord,
  roleFilter = "ALL",
  statusFilter = "ALL",
  keyword = "",
}) {
  const initialDate = todayDateKey();
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [scheduleRows, setScheduleRows] = useState(readCachedScheduleRows);
  const [attendanceRows, setAttendanceRows] = useState(() =>
    readCachedAttendanceRows(initialDate),
  );
  const [noteDrafts, setNoteDrafts] = useState({});
  const [loading, setLoading] = useState(
    () =>
      readCachedAttendanceRows(initialDate).length === 0 &&
      readCachedScheduleRows().length === 0,
  );
  const [initialLoadDone, setInitialLoadDone] = useState(
    () =>
      readCachedAttendanceRows(initialDate).length > 0 ||
      readCachedScheduleRows().length > 0,
  );
  const [editingTimes, setEditingTimes] = useState({});

  const loadAttendanceData = useCallback(async ({ silent = false } = {}) => {
    const hasCachedData =
      readCachedAttendanceRows(selectedDate).length > 0 ||
      readCachedScheduleRows().length > 0;
    if (!silent && !hasCachedData) setLoading(true);
    try {
      const [attendanceRes, scheduleRes] = await Promise.all([
        getSpaAttendance({ ngay: selectedDate }),
        getSpaStaffSchedules(),
      ]);
      const rows = Array.isArray(attendanceRes?.data) ? attendanceRes.data : [];
      setAttendanceRows(rows);
      setScheduleRows(Array.isArray(scheduleRes?.data) ? scheduleRes.data : []);
      const nextNotes = {};
      rows.forEach((row) => {
        const key = `${row.maNhanVien}|${row.ngay}|${row.caDuKien || ""}`;
        nextNotes[key] = String(row.ghiChu || "");
      });
      setNoteDrafts(nextNotes);
    } catch (_) {
      toast.error("Không tải được dữ liệu chấm công.");
    } finally {
      setInitialLoadDone(true);
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    setAttendanceRows(readCachedAttendanceRows(selectedDate));
    void loadAttendanceData({ silent: readCachedAttendanceRows(selectedDate).length > 0 });
  }, [loadAttendanceData, selectedDate]);

  /**
   * ⚠️ REMOVED: Event listeners trùng lặp với useCachedQuery pattern
   * Lý do: Component đã dùng loadAttendanceData() trong useEffect mount
   * Việc lắng nghe CACHE_INVALIDATED_EVENT và gọi API sẽ gây stack overflow
   * 
   * Để sync data khi có mutation:
   * - Mutation sẽ invalidate cache
   * - useEffect mount sẽ chạy lại khi selectedDate thay đổi
   * - Hoặc component cha sẽ refresh khi cần
   */

  const visibleStaffs = useMemo(() => {
    const lowerKeyword = String(keyword || "").trim().toLowerCase();
    return staffs
      .filter((staff) => !isRetiredStaffStatus(getStaffCatalogStatus(staff)))
      .filter((staff) => {
        if (roleFilter !== "ALL" && inferStaffRole(staff) !== roleFilter) return false;
        if (!matchesStaffStatusFilter(staff, statusFilter)) return false;
        if (!lowerKeyword) return true;
        const haystack = [
          staff.maNhanVien,
          staff.tenNhanVien,
          staff.soDienThoai,
          getStaffRoleLabel(staff),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(lowerKeyword);
      })
      .sort((a, b) => String(a.tenNhanVien || "").localeCompare(String(b.tenNhanVien || ""), "vi"));
  }, [keyword, roleFilter, staffs, statusFilter]);

  const rows = useMemo(() => {
    if (!initialLoadDone) return [];
    const output = [];
    visibleStaffs.forEach((staff) => {
      const code = String(staff.maNhanVien || "").trim();
      const defaultShifts = String(staff.caLamViec || "")
        .split(/[,;|]+/)
        .map((item) => normalizeAttendanceShiftCode(item))
        .filter(Boolean);
      const slots = buildAttendanceShiftSlots(
        code,
        selectedDate,
        scheduleRows,
        attendanceRows,
        defaultShifts,
      );
      const staffBlocked = isBlockingStaffStatus(getStaffCatalogStatus(staff));
      slots.forEach((slot, slotIndex) => {
        output.push({
          rowKey: slot.recordKey,
          staff,
          code,
          showStaffName: slotIndex === 0,
          shiftSlotsCount: slots.length,
          staffBlocked,
          ...slot,
          buttons: getAttendanceButtonState(slot.record),
        });
      });
    });
    return output;
  }, [attendanceRows, initialLoadDone, scheduleRows, selectedDate, visibleStaffs]);

  const summary = useMemo(() => {
    if (!initialLoadDone) {
      return {
        checkedIn: 0,
        completed: 0,
        absent: 0,
        notRecorded: 0,
        total: visibleStaffs.length,
        shiftRows: 0,
        pending: true,
      };
    }
    let checkedIn = 0;
    let completed = 0;
    let absent = 0;
    let notRecorded = 0;
    rows.forEach((row) => {
      if (row.status === ATTENDANCE_STATUS.IN_PROGRESS) checkedIn += 1;
      else if (row.status === ATTENDANCE_STATUS.COMPLETED) completed += 1;
      else if (row.status === ATTENDANCE_STATUS.ABSENT) absent += 1;
      else if (row.status === ATTENDANCE_STATUS.NOT_RECORDED) notRecorded += 1;
    });
    return {
      checkedIn,
      completed,
      absent,
      notRecorded,
      total: visibleStaffs.length,
      shiftRows: rows.length,
      pending: false,
    };
  }, [initialLoadDone, rows, visibleStaffs.length]);

  const blockPanel = shouldBlockPanelUI(loading, initialLoadDone);

  const runAction = async (row, action, extra = {}) => {
    const blockingActions = ["CHECK_IN", "CHECK_OUT", "MARK_ABSENT"];
    if (
      blockingActions.includes(String(action || "").trim().toUpperCase()) &&
      isBlockingStaffStatus(getStaffCatalogStatus(row.staff))
    ) {
      toast.error("Nhân viên đang nghỉ phép/tạm ngưng, không thể chấm công.");
      return;
    }
    const validation = validateAttendanceAction(action, row.record);
    if (!validation.ok) {
      toast.error(validation.message);
      return;
    }
    const noteKey = row.rowKey;
    const payload = {
      action,
      maNhanVien: row.code,
      ngay: selectedDate,
      caDuKien: row.shiftCode,
      ghiChu: String(noteDrafts[noteKey] ?? row.record?.ghiChu ?? "").trim(),
      ...extra,
    };
    if (action === "CHECK_IN") payload.trangThai = ATTENDANCE_STATUS.IN_PROGRESS;
    if (action === "CHECK_OUT") payload.trangThai = ATTENDANCE_STATUS.COMPLETED;
    if (action === "MARK_ABSENT") payload.trangThai = ATTENDANCE_STATUS.ABSENT;

    const snapshot = attendanceRows;
    const optimistic = buildOptimisticAttendanceRecord(action, payload, row.record);
    setAttendanceRows((prev) => upsertAttendanceRows(prev, optimistic));
    const ok = await onRecord(payload);
    if (ok === false) setAttendanceRows(snapshot);
  };

  const saveNote = async (row) => {
    const noteKey = row.rowKey;
    const ghiChu = String(noteDrafts[noteKey] ?? "").trim();
    const payload = {
      action: "UPDATE_NOTE",
      maNhanVien: row.code,
      ngay: selectedDate,
      caDuKien: row.shiftCode,
      ghiChu,
    };
    const snapshot = attendanceRows;
    const optimistic = buildOptimisticAttendanceRecord("UPDATE_NOTE", payload, row.record);
    setAttendanceRows((prev) => upsertAttendanceRows(prev, optimistic));
    const ok = await onRecord(payload);
    if (ok === false) setAttendanceRows(snapshot);
  };

  const saveTimes = async (row) => {
    const key = row.rowKey;
    const edits = editingTimes[key];
    if (!edits) return;
    const checkInAt = edits.checkInAt !== undefined ? edits.checkInAt : row.record?.checkInAt || "";
    const checkOutAt = edits.checkOutAt !== undefined ? edits.checkOutAt : row.record?.checkOutAt || "";
    const payload = {
      action: "UPDATE_TIMES",
      maNhanVien: row.code,
      ngay: selectedDate,
      caDuKien: row.shiftCode,
      checkInAt,
      checkOutAt,
    };
    const snapshot = attendanceRows;
    const optimistic = buildOptimisticAttendanceRecord("UPDATE_TIMES", payload, row.record);
    setAttendanceRows((prev) => upsertAttendanceRows(prev, optimistic));
    setEditingTimes((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    const ok = await onRecord(payload);
    if (ok === false) {
      setAttendanceRows(snapshot);
      setEditingTimes((prev) => ({ ...prev, [key]: edits }));
    }
  };

  const displayDateLabel = useMemo(() => {
    const parsed = new Date(`${selectedDate}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return selectedDate;
    return parsed.toLocaleDateString("vi-VN", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }, [selectedDate]);

  const emptyMessage = blockPanel
    ? "Đang tải chấm công..."
    : rows.length === 0
      ? "Không có ca được gán cho ngày này."
      : "Không có nhân viên phù hợp bộ lọc.";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <div>
          <div className="text-sm font-semibold text-slate-700">Ngày chấm công</div>
          <div className="text-xs text-slate-500">{displayDateLabel}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const base = new Date(`${selectedDate}T12:00:00`);
              base.setDate(base.getDate() - 1);
              setSelectedDate(toDateInputValue(base));
            }}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            ← Hôm qua
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(toDateInputValue(e.target.value))}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={() => setSelectedDate(todayDateKey())}
            className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm font-semibold text-sky-700"
          >
            Hôm nay
          </button>
          <button
            type="button"
            onClick={() => {
              const base = new Date(`${selectedDate}T12:00:00`);
              base.setDate(base.getDate() + 1);
              setSelectedDate(toDateInputValue(base));
            }}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Ngày mai →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        {[
          { label: "Nhân viên", value: summary.total },
          { label: "Dòng ca", value: summary.shiftRows },
          { label: "Chưa chấm", value: summary.notRecorded },
          { label: "Đang làm", value: summary.checkedIn },
          { label: "Đã ra ca", value: summary.completed },
          { label: "Vắng", value: summary.absent },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center"
          >
            <div className="text-lg font-black text-slate-800">
              {summary.pending ? "—" : item.value}
            </div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {item.label}
            </div>
          </div>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white md:block">
        <div className="grid grid-cols-[minmax(0,1fr)_100px_80px_80px_100px_minmax(140px,1fr)_minmax(150px,1fr)] gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-500">
          <span>Nhân viên</span>
          <span>Ca</span>
          <span>Vào</span>
          <span>Ra</span>
          <span>Trạng thái</span>
          <span>Ghi chú</span>
          <span className="text-right">Hành động</span>
        </div>
        <div className="max-h-[68vh] overflow-y-auto">
          {!blockPanel && rows.length === 0 ? (
            <div className="px-3 py-8 text-sm text-slate-500">{emptyMessage}</div>
          ) : blockPanel ? (
            <div className="px-3 py-8 text-sm text-slate-500">{emptyMessage}</div>
          ) : (
            rows.map((row) => (
              <div
                key={row.rowKey}
                className="grid grid-cols-[minmax(0,1fr)_100px_80px_80px_100px_minmax(140px,1fr)_minmax(150px,1fr)] items-center gap-2 border-b border-slate-100 px-3 py-3 text-sm"
              >
                <div>
                  {row.showStaffName ? (
                    <>
                      <div className="font-semibold text-slate-800">{row.staff.tenNhanVien}</div>
                      <div className="text-xs text-slate-500">
                        {row.code} • {getStaffRoleLabel(row.staff)}
                        {row.shiftSlotsCount > 1 ? ` • ${row.shiftSlotsCount} ca` : ""}
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-slate-400">↳ cùng nhân viên</div>
                  )}
                </div>
                <div className="text-xs font-semibold text-slate-700">{row.shiftLabel}</div>
                {/* Vào - editable */}
                <div>
                  {editingTimes[row.rowKey]?.checkInAt !== undefined ? (
                    <input
                      type="time"
                      value={parseTimeInput(editingTimes[row.rowKey].checkInAt || "")}
                      onChange={(e) => {
                        const time = e.target.value;
                        const existing = editingTimes[row.rowKey] || {};
                        setEditingTimes((prev) => ({
                          ...prev,
                          [row.rowKey]: { ...existing, checkInAt: time },
                        }));
                      }}
                      className="w-full rounded border border-sky-300 bg-white px-1 py-0.5 text-xs font-mono focus:border-sky-500 focus:outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        const currentVal = row.record?.checkInAt || "";
                        setEditingTimes((prev) => ({
                          ...prev,
                          [row.rowKey]: { checkInAt: currentVal },
                        }));
                      }}
                      className="w-full rounded px-1 py-0.5 text-left font-mono text-xs text-slate-700 hover:bg-sky-50"
                      title="Click để sửa giờ vào"
                    >
                      {formatTimeOnly(row.record?.checkInAt)}
                    </button>
                  )}
                </div>
                {/* Ra - editable */}
                <div>
                  {editingTimes[row.rowKey]?.checkOutAt !== undefined ? (
                    <input
                      type="time"
                      value={parseTimeInput(editingTimes[row.rowKey].checkOutAt || "")}
                      onChange={(e) => {
                        const time = e.target.value;
                        const existing = editingTimes[row.rowKey] || {};
                        setEditingTimes((prev) => ({
                          ...prev,
                          [row.rowKey]: { ...existing, checkOutAt: time },
                        }));
                      }}
                      className="w-full rounded border border-sky-300 bg-white px-1 py-0.5 text-xs font-mono focus:border-sky-500 focus:outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        const currentVal = row.record?.checkOutAt || "";
                        setEditingTimes((prev) => ({
                          ...prev,
                          [row.rowKey]: { checkOutAt: currentVal },
                        }));
                      }}
                      className="w-full rounded px-1 py-0.5 text-left font-mono text-xs text-slate-700 hover:bg-sky-50"
                      title="Click để sửa giờ ra"
                    >
                      {formatTimeOnly(row.record?.checkOutAt)}
                    </button>
                  )}
                </div>
                <span
                  className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-[11px] font-bold ${statusTone(row.status)}`}
                >
                  {row.status}
                </span>
                <div className="flex items-center gap-1">
                  <input
                    value={noteDrafts[row.rowKey] ?? row.record?.ghiChu ?? ""}
                    onChange={(e) =>
                      setNoteDrafts((prev) => ({
                        ...prev,
                        [row.rowKey]: e.target.value,
                      }))
                    }
                    placeholder="Ghi chú ca..."
                    className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => saveNote(row)}
                    className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700"
                  >
                    Lưu
                  </button>
                </div>
                <div className="flex flex-wrap justify-end gap-1">
                  <button
                    type="button"
                    disabled={row.staffBlocked || !row.buttons.checkIn.ok}
                    title={
                      row.staffBlocked
                        ? "Nhân viên đang nghỉ phép/tạm ngưng"
                        : row.buttons.checkIn.message || "Vào ca"
                    }
                    onClick={() => runAction(row, "CHECK_IN")}
                    className={actionButtonClass(!row.staffBlocked && row.buttons.checkIn.ok, "emerald")}
                  >
                    Vào ca
                  </button>
                  <button
                    type="button"
                    disabled={row.staffBlocked || !row.buttons.checkOut.ok}
                    title={
                      row.staffBlocked
                        ? "Nhân viên đang nghỉ phép/tạm ngưng"
                        : row.buttons.checkOut.message || "Ra ca"
                    }
                    onClick={() => runAction(row, "CHECK_OUT")}
                    className={actionButtonClass(!row.staffBlocked && row.buttons.checkOut.ok, "sky")}
                  >
                    Ra ca
                  </button>
                  <button
                    type="button"
                    disabled={row.staffBlocked || !row.buttons.markAbsent.ok}
                    title={
                      row.staffBlocked
                        ? "Nhân viên đang nghỉ phép/tạm ngưng"
                        : row.buttons.markAbsent.message || "Vắng"
                    }
                    onClick={() => runAction(row, "MARK_ABSENT")}
                    className={actionButtonClass(!row.staffBlocked && row.buttons.markAbsent.ok, "amber")}
                  >
                    Vắng
                  </button>
                  <button
                    type="button"
                    disabled={!row.buttons.clearAbsent.ok}
                    title={row.buttons.clearAbsent.message || "Hủy vắng"}
                    onClick={() => runAction(row, "CLEAR_ABSENT")}
                    className={actionButtonClass(row.buttons.clearAbsent.ok, "slate")}
                  >
                    Hủy vắng
                  </button>
                  {editingTimes[row.rowKey] && (
                    <button
                      type="button"
                      onClick={() => saveTimes(row)}
                      className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-bold text-sky-700"
                    >
                      Lưu giờ
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="space-y-2 md:hidden">
        {blockPanel || rows.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-8 text-sm text-slate-500">
            {emptyMessage}
          </div>
        ) : (
          rows.map((row) => (
            <div
              key={`attendance-card-${row.rowKey}`}
              className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm"
            >
              {row.showStaffName ? (
                <div className="mb-2">
                  <div className="font-semibold text-slate-800">{row.staff.tenNhanVien}</div>
                  <div className="text-xs text-slate-500">
                    {row.code} • {getStaffRoleLabel(row.staff)}
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700">{row.shiftLabel}</span>
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold ${statusTone(row.status)}`}
                >
                  {row.status}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                <div>Vào: {formatTimeOnly(row.record?.checkInAt)}</div>
                <div>Ra: {formatTimeOnly(row.record?.checkOutAt)}</div>
              </div>
              <div className="mt-2 flex items-center gap-1">
                <input
                  value={noteDrafts[row.rowKey] ?? row.record?.ghiChu ?? ""}
                  onChange={(e) =>
                    setNoteDrafts((prev) => ({
                      ...prev,
                      [row.rowKey]: e.target.value,
                    }))
                  }
                  placeholder="Ghi chú ca..."
                  className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs"
                />
                <button
                  type="button"
                  onClick={() => saveNote(row)}
                  className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700"
                >
                  Lưu
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                <button
                  type="button"
                  disabled={row.staffBlocked || !row.buttons.checkIn.ok}
                  onClick={() => runAction(row, "CHECK_IN")}
                  className={actionButtonClass(!row.staffBlocked && row.buttons.checkIn.ok, "emerald")}
                >
                  Vào ca
                </button>
                <button
                  type="button"
                  disabled={row.staffBlocked || !row.buttons.checkOut.ok}
                  onClick={() => runAction(row, "CHECK_OUT")}
                  className={actionButtonClass(!row.staffBlocked && row.buttons.checkOut.ok, "sky")}
                >
                  Ra ca
                </button>
                <button
                  type="button"
                  disabled={row.staffBlocked || !row.buttons.markAbsent.ok}
                  onClick={() => runAction(row, "MARK_ABSENT")}
                  className={actionButtonClass(!row.staffBlocked && row.buttons.markAbsent.ok, "amber")}
                >
                  Vắng
                </button>
                <button
                  type="button"
                  disabled={!row.buttons.clearAbsent.ok}
                  onClick={() => runAction(row, "CLEAR_ABSENT")}
                  className={actionButtonClass(row.buttons.clearAbsent.ok, "slate")}
                >
                  Hủy vắng
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
