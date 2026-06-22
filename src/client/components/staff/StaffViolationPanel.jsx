import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { CustomDropdown } from "../CustomDropdown";
import { useConfirm } from "../ConfirmDialog";
import {
  CACHE_KEYS,
  buildStaffViolationsCacheKey,
  getSpaStaffViolations,
} from "../../api";
import { CACHE_KEY_IDS } from "../../api/cacheRegistry.js";
import { readCache } from "../../api/localCache.js";
import { useCacheSync } from "../../hooks/useCacheSync.js";
import { hasCachedResponse, shouldBlockPanelUI } from "../../utils/cacheBootstrap.js";
import {
  getStaffCatalogStatus,
  getStaffRoleLabel,
  inferStaffRole,
  isRetiredStaffStatus,
  matchesStaffStatusFilter,
  normalizeAttendanceDateKey,
} from "./staffConstants";
import {
  VIOLATION_LEVEL_OPTIONS,
  VIOLATION_STATUS,
  getViolationLevelLabel,
  isActiveViolation,
  validateViolationSave,
} from "./staffViolationHelpers";

const pad2 = (n) => String(n).padStart(2, "0");

const todayDateKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
};

const fmtMoney = (value) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(
    Math.max(Number(value || 0), 0),
  );

const emptyForm = (staffCode = "") => ({
  maViPham: "",
  maNhanVien: staffCode,
  ngay: todayDateKey(),
  capDo: "TRU_THUONG",
  noiDung: "",
  mucTru: "",
  ghiChu: "",
});

const readCachedViolationRows = (tuNgay, denNgay) => {
  const cached = readCache(buildStaffViolationsCacheKey({ tuNgay, denNgay }))?.response;
  return Array.isArray(cached?.data) ? cached.data : [];
};

const hasCachedViolationRows = (tuNgay, denNgay) =>
  hasCachedResponse(buildStaffViolationsCacheKey({ tuNgay, denNgay }));

export function StaffViolationPanel({
  staffs = [],
  onSave,
  onCancel,
  roleFilter = "ALL",
  statusFilter = "ALL",
  keyword = "",
}) {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const initialTuNgay = todayDateKey().slice(0, 8) + "01";
  const initialDenNgay = todayDateKey();
  const [tuNgay, setTuNgay] = useState(initialTuNgay);
  const [denNgay, setDenNgay] = useState(initialDenNgay);
  const [rows, setRows] = useState(() => readCachedViolationRows(initialTuNgay, initialDenNgay));
  const [form, setForm] = useState(() => emptyForm());
  const [loading, setLoading] = useState(
    () => !hasCachedViolationRows(initialTuNgay, initialDenNgay),
  );

  const eligibleStaffs = useMemo(() => {
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

  const loadViolations = useCallback(async ({ silent = false } = {}) => {
    if (!silent && !hasCachedViolationRows(tuNgay, denNgay)) setLoading(true);
    try {
      const res = await getSpaStaffViolations({ tuNgay, denNgay });
      setRows(Array.isArray(res?.data) ? res.data : []);
    } catch (_) {
      toast.error("Không tải được biên bản vi phạm.");
    } finally {
      setLoading(false);
    }
  }, [denNgay, tuNgay]);

  useEffect(() => {
    setRows(readCachedViolationRows(tuNgay, denNgay));
    void loadViolations({ silent: hasCachedViolationRows(tuNgay, denNgay) });
  }, [loadViolations, tuNgay, denNgay]);

  /**
   * ⚠️ REMOVED: useCacheSync với onCacheInvalidated gọi API
   * Lý do: Gây stack overflow khi event được dispatch liên tục
   * 
   * Data sẽ được sync khi:
   * - Component re-mount (khi date range thay đổi → useEffect chạy)
   * - useEffect mount đã gọi loadViolations() rồi
   */
  useCacheSync({
    cacheKeys: [buildStaffViolationsCacheKey({ tuNgay, denNgay })],
    cacheKeyPrefixes: [CACHE_KEY_IDS.staffViolations],
    onCacheUpdated: (_detail, cacheKey) => {
      if (cacheKey !== buildStaffViolationsCacheKey({ tuNgay, denNgay })) return;
      setRows(readCachedViolationRows(tuNgay, denNgay));
    },
    // ⚠️ KHÔNG có onCacheInvalidated gọi API
  });

  useEffect(() => {
    if (!form.maNhanVien && eligibleStaffs.length > 0) {
      setForm((prev) => ({
        ...prev,
        maNhanVien: String(eligibleStaffs[0].maNhanVien || "").trim(),
      }));
    }
  }, [eligibleStaffs, form.maNhanVien]);

  const visibleRows = useMemo(() => {
    const codes = new Set(eligibleStaffs.map((staff) => String(staff.maNhanVien || "").trim()));
    return rows
      .filter((row) => codes.has(String(row.maNhanVien || "").trim()))
      .map((row) => {
        const staff = staffs.find(
          (item) => String(item.maNhanVien || "").trim() === String(row.maNhanVien || "").trim(),
        );
        return { row, staff };
      });
  }, [eligibleStaffs, rows, staffs]);

  const summary = useMemo(() => {
    let active = 0;
    let cancelled = 0;
    let totalTru = 0;
    visibleRows.forEach(({ row }) => {
      if (isActiveViolation(row)) {
        active += 1;
        totalTru += Math.max(Number(row.mucTru || 0), 0);
      } else cancelled += 1;
    });
    return { active, cancelled, totalTru };
  }, [visibleRows]);

  const selectedStaff = useMemo(
    () =>
      eligibleStaffs.find(
        (staff) => String(staff.maNhanVien || "").trim() === String(form.maNhanVien || "").trim(),
      ) || null,
    [eligibleStaffs, form.maNhanVien],
  );

  const submit = async () => {
    const validation = validateViolationSave(form, selectedStaff, rows);
    if (!validation.ok) {
      toast.error(validation.message);
      return;
    }
    const snapshot = rows;
    setRows((prev) => {
      const index = prev.findIndex((row) => row.maViPham === validation.data.maViPham);
      if (index >= 0) {
        const next = [...prev];
        next[index] = { ...next[index], ...validation.data };
        return next;
      }
      return [...prev, validation.data];
    });
    const ok = await onSave?.(validation.data);
    if (ok === false) {
      setRows(snapshot);
      return;
    }
    setForm(emptyForm(String(form.maNhanVien || "").trim()));
  };

  const startEdit = (row) => {
    setForm({
      maViPham: String(row.maViPham || "").trim(),
      maNhanVien: String(row.maNhanVien || "").trim(),
      ngay: normalizeAttendanceDateKey(row.ngay),
      capDo: String(row.capDo || "TRU_THUONG").trim(),
      noiDung: String(row.noiDung || "").trim(),
      mucTru: String(row.mucTru ?? ""),
      ghiChu: String(row.ghiChu || "").trim(),
    });
  };

  const cancelRecord = async (row) => {
    if (!isActiveViolation(row)) return;
    const ok = await confirm({
      message: `Hủy biên bản vi phạm ${row.maViPham}?`,
      yesLabel: "Hủy biên bản",
      yesStyle: "warning",
    });
    if (!ok) return;
    const snapshot = rows;
    setRows((prev) =>
      prev.map((entry) =>
        entry.maViPham === row.maViPham
          ? { ...entry, trangThai: VIOLATION_STATUS.CANCELLED }
          : entry,
      ),
    );
    const cancelled = await onCancel?.({ maViPham: row.maViPham });
    if (cancelled === false) {
      setRows(snapshot);
    }
  };

  const blockPanel = shouldBlockPanelUI(
    loading,
    rows.length > 0 || hasCachedViolationRows(tuNgay, denNgay),
  );

  return (
    <div className="space-y-4">
      {confirmDialog}
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <div>
          <div className="text-sm font-semibold text-slate-700">Biên bản vi phạm</div>
          <div className="text-xs text-slate-500">
            Nhắc nhở → Khiển trách → Trừ thưởng → Đình chỉ. Số tiền trừ sẽ khấu trừ vào bảng lương kỳ.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={tuNgay}
            onChange={(e) => setTuNgay(normalizeAttendanceDateKey(e.target.value))}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          />
          <span className="text-sm text-slate-400">→</span>
          <input
            type="date"
            value={denNgay}
            onChange={(e) => setDenNgay(normalizeAttendanceDateKey(e.target.value))}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {[
          { label: "Đang áp dụng", value: summary.active },
          { label: "Đã hủy", value: summary.cancelled },
          { label: "Tổng trừ kỳ", value: fmtMoney(summary.totalTru) },
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
        <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white md:block">
          <div className="grid grid-cols-[100px_minmax(0,1fr)_120px_100px_90px] gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            <span>Ngày</span>
            <span>Nhân viên / nội dung</span>
            <span>Mức xử lý</span>
            <span className="text-right">Trừ</span>
            <span className="text-right">Hành động</span>
          </div>
          <div className="max-h-[68vh] overflow-y-auto">
            {blockPanel ? (
              <div className="px-3 py-8 text-sm text-slate-500">Đang tải biên bản...</div>
            ) : visibleRows.length === 0 ? (
              <div className="px-3 py-8 text-sm text-slate-500">Chưa có biên bản trong kỳ.</div>
            ) : (
              visibleRows.map(({ row, staff }) => (
                <div
                  key={row.maViPham}
                  className="grid grid-cols-[100px_minmax(0,1fr)_120px_100px_90px] items-start gap-2 border-b border-slate-100 px-3 py-3 text-sm"
                >
                  <div className="text-xs text-slate-600">{row.ngay}</div>
                  <div>
                    <div className="font-semibold text-slate-800">
                      {staff?.tenNhanVien || row.maNhanVien}
                    </div>
                    <div className="text-xs text-slate-500">
                      {row.maViPham} • {getStaffRoleLabel(staff || row)}
                    </div>
                    <div className="mt-1 text-slate-700">{row.noiDung}</div>
                    {row.ghiChu ? (
                      <div className="mt-1 text-xs text-slate-400">{row.ghiChu}</div>
                    ) : null}
                    {!isActiveViolation(row) ? (
                      <div className="mt-1 text-xs font-semibold text-slate-400">Đã hủy</div>
                    ) : null}
                  </div>
                  <div className="text-xs font-semibold text-slate-700">
                    {getViolationLevelLabel(row.capDo)}
                  </div>
                  <div className="text-right font-semibold text-rose-700">
                    {fmtMoney(row.mucTru)}
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(row)}
                      className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700"
                    >
                      Sửa
                    </button>
                    {isActiveViolation(row) ? (
                      <button
                        type="button"
                        onClick={() => cancelRecord(row)}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600"
                      >
                        Hủy
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-2 md:hidden">
          {blockPanel ? (
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-8 text-sm text-slate-500">
              Đang tải biên bản...
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-8 text-sm text-slate-500">
              Chưa có biên bản trong kỳ.
            </div>
          ) : (
            visibleRows.map(({ row, staff }) => (
              <div
                key={`violation-card-${row.maViPham}`}
                className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-800">
                      {staff?.tenNhanVien || row.maNhanVien}
                    </div>
                    <div className="text-xs text-slate-500">
                      {row.ngay} • {row.maViPham}
                    </div>
                  </div>
                  <span className="font-semibold text-rose-700">{fmtMoney(row.mucTru)}</span>
                </div>
                <div className="mt-2 text-xs text-slate-600">
                  {getViolationLevelLabel(row.capDo)}
                </div>
                <div className="mt-1 text-slate-700">{row.noiDung}</div>
                {!isActiveViolation(row) ? (
                  <div className="mt-1 text-xs font-semibold text-slate-400">Đã hủy</div>
                ) : null}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(row)}
                    className="flex-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-xs font-semibold text-amber-700"
                  >
                    Sửa
                  </button>
                  {isActiveViolation(row) ? (
                    <button
                      type="button"
                      onClick={() => cancelRecord(row)}
                      className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-600"
                    >
                      Hủy
                    </button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>

        <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <h4 className="mb-3 text-sm font-black text-slate-800">
            {form.maViPham ? `Sửa ${form.maViPham}` : "Ghi nhận vi phạm"}
          </h4>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Nhân viên</label>
              <CustomDropdown
                value={form.maNhanVien}
                onChange={(next) => setForm((prev) => ({ ...prev, maNhanVien: String(next || "") }))}
                options={eligibleStaffs.map((staff) => ({
                  value: staff.maNhanVien,
                  label: `${staff.tenNhanVien} • ${getStaffRoleLabel(staff)}`,
                }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Ngày vi phạm</label>
              <input
                type="date"
                value={form.ngay}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    ngay: normalizeAttendanceDateKey(e.target.value),
                  }))
                }
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Mức xử lý</label>
              <CustomDropdown
                value={form.capDo}
                onChange={(next) => setForm((prev) => ({ ...prev, capDo: String(next || "") }))}
                options={VIOLATION_LEVEL_OPTIONS}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Nội dung vi phạm *</label>
              <textarea
                value={form.noiDung}
                onChange={(e) => setForm((prev) => ({ ...prev, noiDung: e.target.value }))}
                rows={3}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Số tiền trừ (VND)</label>
              <input
                type="number"
                min={0}
                value={form.mucTru}
                onChange={(e) => setForm((prev) => ({ ...prev, mucTru: e.target.value }))}
                placeholder="Bắt buộc nếu chọn Trừ thưởng"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Ghi chú</label>
              <textarea
                value={form.ghiChu}
                onChange={(e) => setForm((prev) => ({ ...prev, ghiChu: e.target.value }))}
                rows={2}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-2">
              {form.maViPham ? (
                <button
                  type="button"
                  onClick={() => setForm(emptyForm(String(form.maNhanVien || "").trim()))}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                >
                  Hủy sửa
                </button>
              ) : null}
              <button
                type="button"
                onClick={submit}
                className="flex-1 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700"
              >
                {form.maViPham ? "Lưu thay đổi" : "Lưu vi phạm"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
