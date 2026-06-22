import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  CACHE_INVALIDATED_EVENT,
  CACHE_KEYS,
  CACHE_UPDATED_EVENT,
  getSpaStaffSchedules,
} from "../../api";
import { useCachedQuery } from "../../hooks/useCachedQuery.js";
import { hasCachedResponse, shouldBlockPanelUI } from "../../utils/cacheBootstrap.js";
import { CustomDropdown } from "../CustomDropdown";
import { readCache } from "../../api/localCache.js";
import {
  clearFormDraft,
  FORM_DRAFT_KEYS,
  readFormDraft,
  writeFormDraft,
} from "../../utils/formDraftCache.js";
import { STAFF_SHIFT_DEFINITIONS } from "./staffConstants";

const pad2 = (n) => String(n).padStart(2, "0");

const toDateKey = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
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

const buildStaffScheduleDraft = (rows = []) => {
  const nextDraft = {};
  rows.forEach((row) => {
    const dateKey = normalizeScheduleDateKey(row?.ngay);
    if (!dateKey) return;
    nextDraft[dateKey] = {
      caSang: row.caSang ? String(row.caSang).split(",").map((s) => s.trim()).filter(Boolean) : [],
      caChieu: row.caChieu ? String(row.caChieu).split(",").map((s) => s.trim()).filter(Boolean) : [],
      caToi: row.caToi ? String(row.caToi).split(",").map((s) => s.trim()).filter(Boolean) : [],
    };
  });
  return nextDraft;
};

const buildDateRange = (weekOffset = 0) => {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() + weekOffset * 7);
  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    days.push({
      date: d,
      key: toDateKey(d),
      label: d.toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit" }),
    });
  }
  return days;
};

export function StaffSchedulePanel({
  staffs = [],
  onSave,
  showWeekNav = true,
  compact = false,
}) {
  const { data: scheduleData, refresh: refreshSchedules, isLoading } = useCachedQuery(
    getSpaStaffSchedules,
    CACHE_KEYS.staffSchedules,
  );
  const rawSchedules = scheduleData?.data || [];
  const savedScheduleDraft = readFormDraft(FORM_DRAFT_KEYS.staffSchedule);
  const [weekOffset, setWeekOffset] = useState(() =>
    Number(savedScheduleDraft?.weekOffset || 0),
  );
  const dateRange = useMemo(() => buildDateRange(weekOffset), [weekOffset]);

  const [draft, setDraft] = useState(() => {
    if (savedScheduleDraft?.draft && typeof savedScheduleDraft.draft === "object") {
      return savedScheduleDraft.draft;
    }
    return buildStaffScheduleDraft(
      readCache(CACHE_KEYS.staffSchedules)?.response?.data || [],
    );
  });
  const draftDirtyRef = useRef(Boolean(savedScheduleDraft?.draft));

  const hasScheduleData = useMemo(
    () =>
      Object.keys(draft || {}).length > 0 ||
      rawSchedules.length > 0 ||
      hasCachedResponse(CACHE_KEYS.staffSchedules),
    [draft, rawSchedules],
  );
  const blockPanel = shouldBlockPanelUI(isLoading, hasScheduleData);

  /**
   * ⚠️ REMOVED: useEffect mount gọi refreshSchedules()
   * Lý do: useCachedQuery đã tự động gọi API khi mount
   * Việc gọi lại sẽ gây duplicate request
   */

  /**
   * ⚠️ REMOVED: Event listeners trùng lặp với useCachedQuery
   * Lý do: useCachedQuery đã tự động lắng nghe CACHE_UPDATED_EVENT và CACHE_INVALIDATED_EVENT
   * Việc lắng nghe lại trong component sẽ gây stack overflow
   * 
   * Để bảo vệ draft khi có cache update:
   * - Khi draftDirty = true: useCachedQuery vẫn update state nhưng draft được giữ nguyên
   * - Khi draftDirty = false: useCachedQuery update state bình thường
   */

  useEffect(() => {
    if (draftDirtyRef.current) return;
    setDraft(buildStaffScheduleDraft(rawSchedules));
  }, [rawSchedules]);

  useEffect(() => {
    if (!draftDirtyRef.current) return;
    writeFormDraft(FORM_DRAFT_KEYS.staffSchedule, { draft, weekOffset });
  }, [draft, weekOffset]);

  const [quickAssignStaff, setQuickAssignStaff] = useState(null);
  const [selectedCell, setSelectedCell] = useState(null);

  const getCellStaffs = (dateKey, shiftCode) => {
    const dayData = draft[dateKey] || {};
    const shiftKey = shiftCode === "SANG" ? "caSang" : shiftCode === "CHIEU" ? "caChieu" : "caToi";
    return dayData[shiftKey] || [];
  };

  const toggleStaffInCell = (dateKey, shiftCode, staffCode) => {
    const leaves = readCache(CACHE_KEYS.staffLeaves)?.response?.data || [];
    const isLeave = leaves.some((l) => 
      String(l.maNhanVien) === String(staffCode) && 
      String(l.trangThai) === "Duyệt" && 
      toDateKey(l.ngayNghi) === dateKey
    );

    setDraft((prev) => {
      const shiftKey = shiftCode === "SANG" ? "caSang" : shiftCode === "CHIEU" ? "caChieu" : "caToi";
      const dayData = prev[dateKey] || { caSang: [], caChieu: [], caToi: [] };
      const currentList = new Set(dayData[shiftKey] || []);
      if (currentList.has(staffCode)) {
        currentList.delete(staffCode);
        draftDirtyRef.current = true;
      } else {
        if (isLeave) {
          setTimeout(() => toast.error(`Nhân viên đang nghỉ phép vào ngày ${dateKey}`), 0);
          return prev;
        }
        currentList.add(staffCode);
        draftDirtyRef.current = true;
      }
      return {
        ...prev,
        [dateKey]: {
          ...dayData,
          [shiftKey]: Array.from(currentList),
        },
      };
    });
  };

  const handleQuickAssign = (shiftCode) => {
    if (!quickAssignStaff) return;
    
    const leaves = readCache(CACHE_KEYS.staffLeaves)?.response?.data || [];
    
    setDraft((prev) => {
      const next = { ...prev };
      const shiftKey = shiftCode === "SANG" ? "caSang" : shiftCode === "CHIEU" ? "caChieu" : "caToi";
      let leaveBlocked = false;

      dateRange.forEach((day) => {
        const isLeave = leaves.some((l) => 
          String(l.maNhanVien) === String(quickAssignStaff) && 
          String(l.trangThai) === "Duyệt" && 
          toDateKey(l.ngayNghi) === day.key
        );

        const dayData = next[day.key] || { caSang: [], caChieu: [], caToi: [] };
        const currentList = new Set(dayData[shiftKey] || []);
        
        if (!isLeave) {
          currentList.add(quickAssignStaff);
          draftDirtyRef.current = true;
        } else {
          leaveBlocked = true;
        }

        next[day.key] = {
          ...dayData,
          [shiftKey]: Array.from(currentList),
        };
      });

      if (leaveBlocked) {
        setTimeout(() => toast.error("Một số ngày bị bỏ qua do nhân viên đang nghỉ phép."), 0);
      }
      return next;
    });
    setQuickAssignStaff(null);
  };

  const save = async () => {
    const updates = Object.keys(draft).map((dateKey) => ({
      ngay: dateKey,
      caSang: (draft[dateKey].caSang || []).join(","),
      caChieu: (draft[dateKey].caChieu || []).join(","),
      caToi: (draft[dateKey].caToi || []).join(","),
    }));
    const ok = await onSave?.({ updates });
    if (ok === false) return;
    draftDirtyRef.current = false;
    clearFormDraft(FORM_DRAFT_KEYS.staffSchedule);
    /**
     * ⚠️ REMOVED: await refreshSchedules() sau save
     * Lý do: Mutation đã invalidate cache → useCachedQuery tự động update state
     * Việc gọi refreshSchedules() là redundant và có thể gây race condition
     */
  };

  const staffMap = useMemo(() => {
    const map = new Map();
    staffs.forEach((staff) => map.set(staff.maNhanVien, staff));
    return map;
  }, [staffs]);

  const weekLabel = dateRange.length
    ? `${dateRange[0].label} – ${dateRange[dateRange.length - 1].label}`
    : "";

  return (
    <div className="space-y-4">
      {showWeekNav ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setWeekOffset((prev) => prev - 1)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              ← Tuần trước
            </button>
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm font-semibold text-sky-700"
            >
              Tuần này
            </button>
            <button
              type="button"
              onClick={() => setWeekOffset((prev) => prev + 1)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Tuần sau →
            </button>
          </div>
          <div className="text-sm font-semibold text-slate-600">{weekLabel}</div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <span className="text-sm font-semibold text-slate-700">Set nhanh:</span>
        <CustomDropdown
          value={quickAssignStaff || ""}
          onChange={(next) => setQuickAssignStaff(String(next || "") || null)}
          placeholder="-- Chọn nhân viên --"
          preferPlaceholderWhenEmpty
          className="min-w-[200px]"
          buttonClassName="py-1"
          options={staffs.map((staff) => ({
            value: staff.maNhanVien,
            label: staff.tenNhanVien,
          }))}
        />
        {quickAssignStaff ? (
          <div className="flex gap-2">
            {STAFF_SHIFT_DEFINITIONS.map((shift) => (
              <button
                key={shift.code}
                type="button"
                onClick={() => handleQuickAssign(shift.code)}
                className="rounded bg-sky-100 px-3 py-1 text-xs font-bold text-sky-700 transition-colors hover:bg-sky-200"
              >
                Gán full {shift.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {blockPanel ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
          Đang tải lịch làm việc...
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[800px] border-collapse text-left">
            <thead>
              <tr>
                <th className="w-[100px] border-b border-r border-slate-200 bg-slate-100 p-3">Ngày</th>
                {dateRange.map((day) => (
                  <th
                    key={day.key}
                    className="min-w-[150px] border-b border-r border-slate-200 bg-slate-100 p-3 text-center"
                  >
                    <div className="text-sm font-bold text-slate-800">{day.label}</div>
                    <div className="text-xs text-slate-500">{day.key}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {STAFF_SHIFT_DEFINITIONS.map((shift) => (
                <tr key={shift.code}>
                  <td className="border-b border-r border-slate-200 bg-slate-50 p-3 text-center font-bold text-slate-700">
                    {shift.label}
                  </td>
                  {dateRange.map((day) => {
                    const cellStaffs = getCellStaffs(day.key, shift.code);
                    return (
                      <td
                        key={`cell-${day.key}-${shift.code}`}
                        className="cursor-pointer border-b border-r border-slate-200 p-2 align-top transition-colors hover:bg-slate-50"
                        onClick={() => setSelectedCell({ date: day, shift })}
                      >
                        <div className="flex flex-wrap gap-1">
                          {cellStaffs.length > 0 ? (
                            cellStaffs.map((code) => {
                              const staff = staffMap.get(code);
                              return (
                                <div
                                  key={code}
                                  className="rounded border border-sky-200 bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800"
                                >
                                  {staff ? staff.tenNhanVien : code}
                                </div>
                              );
                            })
                          ) : (
                            <div className="text-[11px] italic text-slate-400">Trống</div>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={`flex justify-end gap-2 ${compact ? "" : "pt-2"}`}>
        <button
          type="button"
          onClick={save}
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"
        >
          Lưu lịch làm việc
        </button>
      </div>

      {selectedCell ? (
        <div
          className="fixed inset-0 z-[9800] flex items-center justify-center bg-slate-900/60 p-4"
          onClick={() => setSelectedCell(null)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h4 className="font-bold text-slate-800">
                  {selectedCell.shift.label} - {selectedCell.date.label}
                </h4>
                <p className="text-xs text-slate-500">Chạm để chọn/bỏ chọn nhân viên</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCell(null)}
                className="p-2 text-lg text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto p-4">
              <div className="mb-4">
                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-sky-600">
                  Đã chọn ({getCellStaffs(selectedCell.date.key, selectedCell.shift.code).length})
                </div>
                <div className="flex flex-wrap gap-2">
                  {staffs
                    .filter((staff) =>
                      getCellStaffs(selectedCell.date.key, selectedCell.shift.code).includes(staff.maNhanVien),
                    )
                    .map((staff) => (
                      <button
                        key={`sel-${staff.maNhanVien}`}
                        type="button"
                        onClick={() =>
                          toggleStaffInCell(selectedCell.date.key, selectedCell.shift.code, staff.maNhanVien)
                        }
                        className="rounded-lg border border-sky-600 bg-sky-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-sky-600"
                      >
                        {staff.tenNhanVien} ✕
                      </button>
                    ))}
                  {getCellStaffs(selectedCell.date.key, selectedCell.shift.code).length === 0 ? (
                    <div className="text-sm italic text-slate-400">Chưa có ai</div>
                  ) : null}
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4">
                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                  Danh sách nhân viên
                </div>
                <div className="flex flex-wrap gap-2">
                  {staffs
                    .filter(
                      (staff) =>
                        !getCellStaffs(selectedCell.date.key, selectedCell.shift.code).includes(staff.maNhanVien),
                    )
                    .map((staff) => (
                      <button
                        key={`unsel-${staff.maNhanVien}`}
                        type="button"
                        onClick={() =>
                          toggleStaffInCell(selectedCell.date.key, selectedCell.shift.code, staff.maNhanVien)
                        }
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                      >
                        {staff.tenNhanVien} +
                      </button>
                    ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end rounded-b-2xl border-t border-slate-200 bg-slate-50 px-4 py-3">
              <button
                type="button"
                onClick={() => setSelectedCell(null)}
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700"
              >
                Xong
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
