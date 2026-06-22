import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { toLocalDateTimeString } from "../../utils/dateFormatter";
import { CustomDropdown } from "../CustomDropdown";
import {
  CACHE_INVALIDATED_EVENT,
  CACHE_KEYS,
  CACHE_UPDATED_EVENT,
  buildStaffChecklistsCacheKey,
  getSpaShiftChecklists,
} from "../../api";
import { readCache } from "../../api/localCache.js";
import { hasCachedResponse, shouldBlockPanelUI } from "../../utils/cacheBootstrap.js";
import {
  CHECKLIST_TYPE_OPTIONS,
  buildChecklistRecordKey,
  buildDailyChecklistSummary,
  calculateChecklistProgress,
  getChecklistTemplate,
  mergeChecklistItems,
  parseChecklistItemsJson,
  resolveChecklistCompletionStatus,
  resolveChecklistItemsForRecord,
  supportsShiftChecklist,
  validateChecklistSave,
} from "./staffChecklistHelpers";
import {
  STAFF_SHIFT_DEFINITIONS,
  getStaffCatalogStatus,
  getStaffRoleLabel,
  inferStaffRole,
  isRetiredStaffStatus,
  matchesStaffStatusFilter,
  normalizeAttendanceDateKey,
} from "./staffConstants";

const pad2 = (n) => String(n).padStart(2, "0");

const todayDateKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
};

const statusTone = (status) => {
  if (status === "Hoàn thành") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "Đang làm") return "border-sky-200 bg-sky-50 text-sky-800";
  return "border-slate-200 bg-slate-50 text-slate-600";
};

const readCachedChecklistRows = (dateKey) => {
  const cached = readCache(buildStaffChecklistsCacheKey({ ngay: dateKey }))?.response;
  return Array.isArray(cached?.data) ? cached.data : [];
};

const hasCachedChecklistRows = (dateKey) =>
  hasCachedResponse(buildStaffChecklistsCacheKey({ ngay: dateKey }));

export function StaffChecklistPanel({
  staffs = [],
  onSave,
  roleFilter = "ALL",
  statusFilter = "ALL",
  keyword = "",
}) {
  const initialDate = todayDateKey();
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [selectedShift, setSelectedShift] = useState("SANG");
  const [selectedType, setSelectedType] = useState("DAU_CA");
  const [selectedStaffCode, setSelectedStaffCode] = useState("");
  const [checklistRows, setChecklistRows] = useState(() => readCachedChecklistRows(initialDate));
  const [itemDrafts, setItemDrafts] = useState([]);
  const [ghiChu, setGhiChu] = useState("");
  const [loading, setLoading] = useState(() => !hasCachedChecklistRows(initialDate));

  const loadChecklistData = useCallback(async ({ silent = false } = {}) => {
    if (!silent && !hasCachedChecklistRows(selectedDate)) setLoading(true);
    try {
      const checklistRes = await getSpaShiftChecklists({ ngay: selectedDate });
      setChecklistRows(Array.isArray(checklistRes?.data) ? checklistRes.data : []);
    } catch (_) {
      toast.error("Không tải được checklist ca.");
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    setChecklistRows(readCachedChecklistRows(selectedDate));
    void loadChecklistData({ silent: hasCachedChecklistRows(selectedDate) });
  }, [loadChecklistData, selectedDate]);

  /**
   * ⚠️ REMOVED: Event listeners trùng lặp với useCachedQuery pattern
   * Lý do: Component đã dùng loadChecklistData() trong useEffect mount
   * Việc lắng nghe CACHE_INVALIDATED_EVENT và gọi API sẽ gây stack overflow
   */

  const eligibleStaffs = useMemo(() => {
    const lowerKeyword = String(keyword || "").trim().toLowerCase();
    return staffs
      .filter((staff) => !isRetiredStaffStatus(getStaffCatalogStatus(staff)))
      .filter((staff) => supportsShiftChecklist(staff))
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

  const selectedStaff = useMemo(
    () => eligibleStaffs.find((staff) => String(staff.maNhanVien || "").trim() === selectedStaffCode) || null,
    [eligibleStaffs, selectedStaffCode],
  );

  const activeRecord = useMemo(() => {
    if (!selectedStaffCode) return null;
    const key = buildChecklistRecordKey(selectedStaffCode, selectedDate, selectedShift, selectedType);
    return (
      checklistRows.find(
        (row) =>
          buildChecklistRecordKey(row.maNhanVien, row.ngay, row.caDuKien, row.loaiChecklist) === key,
      ) || null
    );
  }, [checklistRows, selectedDate, selectedShift, selectedStaffCode, selectedType]);

  useEffect(() => {
    if (!selectedStaff) {
      setItemDrafts([]);
      setGhiChu("");
      return;
    }
    const template = getChecklistTemplate(inferStaffRole(selectedStaff), selectedType);
    const saved = parseChecklistItemsJson(activeRecord?.itemsJson);
    setItemDrafts(mergeChecklistItems(template, saved));
    setGhiChu(String(activeRecord?.ghiChu || ""));
  }, [activeRecord, selectedStaff, selectedType]);

  useEffect(() => {
    if (!selectedStaffCode && eligibleStaffs.length > 0) {
      setSelectedStaffCode(String(eligibleStaffs[0].maNhanVien || "").trim());
    }
  }, [eligibleStaffs, selectedStaffCode]);

  const formProgress = useMemo(() => calculateChecklistProgress(itemDrafts), [itemDrafts]);
  const dailySummary = useMemo(
    () => buildDailyChecklistSummary(checklistRows, selectedDate, staffs),
    [checklistRows, selectedDate, staffs],
  );

  const overviewRows = useMemo(() => {
    return checklistRows
      .filter((row) => normalizeAttendanceDateKey(row?.ngay) === selectedDate)
      .map((row) => {
        const staff = staffs.find(
          (item) => String(item.maNhanVien || "").trim() === String(row.maNhanVien || "").trim(),
        );
        const items = resolveChecklistItemsForRecord(row, staff);
        const progress = calculateChecklistProgress(items);
        return {
          key: buildChecklistRecordKey(row.maNhanVien, row.ngay, row.caDuKien, row.loaiChecklist),
          row,
          staff,
          progress,
          status: resolveChecklistCompletionStatus(items),
        };
      })
      .sort((a, b) => String(a.staff?.tenNhanVien || a.row.maNhanVien).localeCompare(
        String(b.staff?.tenNhanVien || b.row.maNhanVien),
        "vi",
      ));
  }, [checklistRows, selectedDate, staffs]);

  const saveChecklist = async () => {
    if (!selectedStaff) {
      toast.error("Chọn nhân viên thực hiện checklist.");
      return;
    }
    const validation = validateChecklistSave(
      {
        maNhanVien: selectedStaffCode,
        ngay: selectedDate,
        caDuKien: selectedShift,
        loaiChecklist: selectedType,
        items: itemDrafts,
        ghiChu,
      },
      selectedStaff,
    );
    if (!validation.ok) {
      toast.error(validation.message);
      return;
    }
    const snapshot = checklistRows;
    const optimisticRecord = {
      ...validation.data,
      updatedAt: toLocalDateTimeString(new Date()),
    };
    const recordKey = buildChecklistRecordKey(
      optimisticRecord.maNhanVien,
      optimisticRecord.ngay,
      optimisticRecord.caDuKien,
      optimisticRecord.loaiChecklist,
    );
    setChecklistRows((prev) => {
      const list = [...prev];
      const index = list.findIndex(
        (row) =>
          buildChecklistRecordKey(row.maNhanVien, row.ngay, row.caDuKien, row.loaiChecklist) ===
          recordKey,
      );
      if (index >= 0) list[index] = { ...list[index], ...optimisticRecord };
      else list.push(optimisticRecord);
      return list;
    });
    const ok = await onSave?.(validation.data);
    if (ok === false) setChecklistRows(snapshot);
  };

  const openOverviewRow = (row) => {
    setSelectedStaffCode(String(row.maNhanVien || "").trim());
    setSelectedShift(String(row.caDuKien || "SANG").trim().toUpperCase());
    setSelectedType(String(row.loaiChecklist || "DAU_CA").trim().toUpperCase());
  };

  const blockPanel = shouldBlockPanelUI(
    loading,
    checklistRows.length > 0 || hasCachedChecklistRows(selectedDate),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <div>
          <div className="text-sm font-semibold text-slate-700">Checklist đầu / cuối ca</div>
          <div className="text-xs text-slate-500">
            Theo vai trò Lễ tân, KTV, Quản lý — mục VIII.6–7 quy trình TLC Spa.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(normalizeAttendanceDateKey(e.target.value))}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={() => setSelectedDate(todayDateKey())}
            className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm font-semibold text-sky-700"
          >
            Hôm nay
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          { label: "Checklist trong ngày", value: dailySummary.total },
          { label: "Hoàn thành", value: dailySummary.completed },
          { label: "Đang làm", value: dailySummary.partial },
          { label: "Chưa làm", value: dailySummary.pending },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center"
          >
            <div className="text-lg font-black text-slate-800">{item.value}</div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {item.label}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Nhân viên</label>
              <CustomDropdown
                value={selectedStaffCode}
                onChange={setSelectedStaffCode}
                disabled={eligibleStaffs.length === 0}
                placeholder="Không có nhân viên phù hợp"
                options={
                  eligibleStaffs.length === 0
                    ? []
                    : eligibleStaffs.map((staff) => ({
                        value: staff.maNhanVien,
                        label: `${staff.tenNhanVien} • ${getStaffRoleLabel(staff)}`,
                      }))
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Ca</label>
              <CustomDropdown
                value={selectedShift}
                onChange={setSelectedShift}
                options={STAFF_SHIFT_DEFINITIONS.map((shift) => ({
                  value: shift.code,
                  label: shift.label,
                }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Loại checklist</label>
              <CustomDropdown
                value={selectedType}
                onChange={setSelectedType}
                options={CHECKLIST_TYPE_OPTIONS}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Tiến độ</label>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                {formProgress.requiredChecked}/{formProgress.required || formProgress.total} mục bắt buộc
              </div>
            </div>
          </div>

          {blockPanel ? (
            <div className="py-8 text-center text-sm text-slate-500">Đang tải checklist...</div>
          ) : !selectedStaff ? (
            <div className="py-8 text-center text-sm text-slate-500">
              Chọn nhân viên có vai trò Lễ tân / KTV / Quản lý để làm checklist.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {selectedStaff.tenNhanVien} • {getStaffRoleLabel(selectedStaff)} •{" "}
                {CHECKLIST_TYPE_OPTIONS.find((item) => item.value === selectedType)?.label}
              </div>
              <div className="space-y-2">
                {itemDrafts.map((item) => (
                  <label
                    key={item.code}
                    className="flex items-start gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(item.checked)}
                      onChange={(e) =>
                        setItemDrafts((prev) =>
                          prev.map((entry) =>
                            entry.code === item.code
                              ? { ...entry, checked: e.target.checked }
                              : entry,
                          ),
                        )
                      }
                      className="mt-0.5 rounded border-slate-300"
                    />
                    <span className="text-slate-700">
                      {item.label}
                      {item.required === false ? (
                        <span className="ml-1 text-xs text-slate-400">(tùy chọn)</span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Ghi chú / giao KPI</label>
                <textarea
                  value={ghiChu}
                  onChange={(e) => setGhiChu(e.target.value)}
                  rows={3}
                  placeholder="Ghi chú họp đầu ca, giao KPI, bàn giao ca..."
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                disabled={eligibleStaffs.length === 0}
                onClick={saveChecklist}
                className="w-full rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-60"
              >
                Lưu checklist
              </button>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            Checklist đã lưu trong ngày
          </div>
          <div className="max-h-[68vh] overflow-y-auto">
            {overviewRows.length === 0 ? (
              <div className="px-3 py-8 text-sm text-slate-500">Chưa có checklist nào trong ngày.</div>
            ) : (
              overviewRows.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => openOverviewRow(entry.row)}
                  className="flex w-full items-center justify-between gap-2 border-b border-slate-100 px-3 py-3 text-left text-sm hover:bg-slate-50"
                >
                  <div>
                    <div className="font-semibold text-slate-800">
                      {entry.staff?.tenNhanVien || entry.row.maNhanVien}
                    </div>
                    <div className="text-xs text-slate-500">
                      {entry.row.caDuKien} •{" "}
                      {CHECKLIST_TYPE_OPTIONS.find((item) => item.value === entry.row.loaiChecklist)?.label ||
                        entry.row.loaiChecklist}
                    </div>
                  </div>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${statusTone(entry.status)}`}
                  >
                    {entry.status}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
