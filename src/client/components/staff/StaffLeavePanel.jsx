import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { CACHE_KEYS, buildStaffLeavesCacheKey, getSpaStaffLeaveRequests } from "../../api";
import { CACHE_KEY_IDS } from "../../api/cacheRegistry.js";
import { LOCAL_MUTATION_CACHE_META } from "../../utils/cacheToastPolicy.js";
import { readCache } from "../../api/localCache.js";
import { useCacheSync } from "../../hooks/useCacheSync.js";
import { upsertCachedListItem } from "../../api/cacheListHelpers.js";
import { hasCachedResponse, shouldBlockPanelUI } from "../../utils/cacheBootstrap.js";
import { CustomDropdown } from "../CustomDropdown";
import {
  getStaffCatalogStatus,
  getStaffRoleLabel,
  inferStaffRole,
  isRetiredStaffStatus,
  matchesStaffStatusFilter,
  normalizeAttendanceDateKey,
} from "./staffConstants";
import {
  LEAVE_REVIEW_ACTION,
  LEAVE_STATUS,
  buildLeaveReviewPayload,
  getLeaveStatusLabel,
  normalizeLeaveStatus,
  validateLeaveSave,
} from "./staffLeaveHelpers";

const pad2 = (n) => String(n).padStart(2, "0");
const todayDateKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
};

const emptyForm = (staffCode = "") => ({
  maDon: "",
  maNhanVien: staffCode,
  tuNgay: todayDateKey(),
  denNgay: todayDateKey(),
  lyDo: "",
  ghiChu: "",
});

const readCachedLeaveRows = (tuNgay, denNgay) => {
  const cached = readCache(buildStaffLeavesCacheKey({ tuNgay, denNgay }))?.response;
  return Array.isArray(cached?.data) ? cached.data : [];
};

const hasCachedLeaveRows = (tuNgay, denNgay) =>
  hasCachedResponse(buildStaffLeavesCacheKey({ tuNgay, denNgay }));

export function StaffLeavePanel({
  staffs = [],
  onSave,
  onReview,
  roleFilter = "ALL",
  statusFilter = "ALL",
  keyword = "",
}) {
  const initialTuNgay = todayDateKey().slice(0, 8) + "01";
  const initialDenNgay = todayDateKey();
  const [tuNgay, setTuNgay] = useState(initialTuNgay);
  const [denNgay, setDenNgay] = useState(initialDenNgay);
  const [rows, setRows] = useState(() => readCachedLeaveRows(initialTuNgay, initialDenNgay));
  const [form, setForm] = useState(() => emptyForm());
  const [loading, setLoading] = useState(
    () => !hasCachedLeaveRows(initialTuNgay, initialDenNgay),
  );

  const eligibleStaffs = useMemo(() => {
    const lowerKeyword = String(keyword || "").trim().toLowerCase();
    return staffs
      .filter((staff) => !isRetiredStaffStatus(getStaffCatalogStatus(staff)))
      .filter((staff) => {
        if (roleFilter !== "ALL" && inferStaffRole(staff) !== roleFilter) return false;
        if (!matchesStaffStatusFilter(staff, statusFilter)) return false;
        if (!lowerKeyword) return true;
        const haystack = [staff.maNhanVien, staff.tenNhanVien, staff.soDienThoai, getStaffRoleLabel(staff)]
          .join(" ")
          .toLowerCase();
        return haystack.includes(lowerKeyword);
      })
      .sort((a, b) => String(a.tenNhanVien || "").localeCompare(String(b.tenNhanVien || ""), "vi"));
  }, [keyword, roleFilter, staffs, statusFilter]);

  const loadLeaves = useCallback(async ({ silent = false } = {}) => {
    if (!silent && !hasCachedLeaveRows(tuNgay, denNgay)) setLoading(true);
    try {
      const res = await getSpaStaffLeaveRequests({ tuNgay, denNgay });
      setRows(Array.isArray(res?.data) ? res.data : []);
    } catch (_) {
      toast.error("Không tải được đơn nghỉ phép.");
    } finally {
      setLoading(false);
    }
  }, [denNgay, tuNgay]);

  useEffect(() => {
    setRows(readCachedLeaveRows(tuNgay, denNgay));
    void loadLeaves({ silent: hasCachedLeaveRows(tuNgay, denNgay) });
  }, [loadLeaves, tuNgay, denNgay]);

  /**
   * ⚠️ REMOVED: onCacheInvalidated gọi API
   * Lý do: Gây stack overflow khi event được dispatch liên tục
   */
  useCacheSync({
    cacheKeys: [buildStaffLeavesCacheKey({ tuNgay, denNgay })],
    cacheKeyPrefixes: [CACHE_KEY_IDS.staffLeaves],
    onCacheUpdated: (detail, cacheKey) => {
      const expected = buildStaffLeavesCacheKey({ tuNgay, denNgay });
      if (cacheKey !== expected) return;
      const data = detail?.response?.data;
      if (Array.isArray(data)) setRows(data);
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
    let pending = 0;
    let approved = 0;
    visibleRows.forEach(({ row }) => {
      const status = normalizeLeaveStatus(row.trangThai);
      if (status === LEAVE_STATUS.PENDING) pending += 1;
      if (status === LEAVE_STATUS.APPROVED) approved += 1;
    });
    return { pending, approved, total: visibleRows.length };
  }, [visibleRows]);

  const submit = async () => {
    const validation = validateLeaveSave(form);
    if (!validation.ok) {
      toast.error(validation.message);
      return;
    }
    const payload = {
      maDon: String(form.maDon || "").trim(),
      maNhanVien: validation.maNhanVien,
      tuNgay: validation.tuNgay,
      denNgay: validation.denNgay,
      lyDo: String(form.lyDo || "").trim(),
      ghiChu: String(form.ghiChu || "").trim(),
      trangThai: LEAVE_STATUS.PENDING,
    };
    const snapshot = rows;
    const cacheKey = buildStaffLeavesCacheKey({ tuNgay, denNgay });
    const optimisticRow = {
      ...payload,
      maDon: payload.maDon || `TEMP-${Date.now()}`,
    };
    setRows((prev) => {
      const existingId = String(payload.maDon || "").trim();
      if (existingId) {
        return prev.map((row) =>
          String(row.maDon || "").trim() === existingId ? { ...row, ...optimisticRow } : row,
        );
      }
      return [optimisticRow, ...prev];
    });
    upsertCachedListItem(cacheKey, optimisticRow, "maDon", {
      LOCAL_MUTATION_CACHE_META,
    });
    const ok = await onSave?.(payload);
    if (ok === false) {
      setRows(snapshot);
      return;
    }
    setForm(emptyForm(String(form.maNhanVien || "").trim()));
  };

  const review = async (row, action) => {
    const built = buildLeaveReviewPayload(row, action);
    if (!built.ok) {
      toast.error(built.message);
      return;
    }
    const snapshot = rows;
    const nextRow = { ...row, trangThai: built.trangThai };
    setRows((prev) =>
      prev.map((item) =>
        String(item.maDon || "").trim() === String(row.maDon || "").trim() ? nextRow : item,
      ),
    );
    upsertCachedListItem(
      buildStaffLeavesCacheKey({ tuNgay, denNgay }),
      nextRow,
      "maDon",
      LOCAL_MUTATION_CACHE_META,
    );
    const ok = await onReview?.({ ...built, record: row, action });
    if (ok === false) setRows(snapshot);
  };

  const startEdit = (row) => {
    if (normalizeLeaveStatus(row.trangThai) !== LEAVE_STATUS.PENDING) {
      toast.error("Chỉ sửa đơn đang chờ duyệt.");
      return;
    }
    setForm({
      maDon: String(row.maDon || "").trim(),
      maNhanVien: String(row.maNhanVien || "").trim(),
      tuNgay: normalizeAttendanceDateKey(row.tuNgay),
      denNgay: normalizeAttendanceDateKey(row.denNgay),
      lyDo: String(row.lyDo || "").trim(),
      ghiChu: String(row.ghiChu || "").trim(),
    });
  };

  const blockPanel = shouldBlockPanelUI(
    loading,
    rows.length > 0 || hasCachedLeaveRows(tuNgay, denNgay),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <div>
          <div className="text-sm font-semibold text-slate-700">Đơn nghỉ phép</div>
          <div className="text-xs text-slate-500">
            Tạo đơn → duyệt/từ chối. Khi duyệt trong ngày hiện tại, trạng thái NV chuyển sang Nghỉ phép.
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

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Chờ duyệt", value: summary.pending },
          { label: "Đã duyệt", value: summary.approved },
          { label: "Tổng đơn", value: summary.total },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center">
            <div className="text-lg font-black text-slate-800">{item.value}</div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white md:block">
          <div className="grid grid-cols-[minmax(0,1fr)_120px_100px] gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            <span>Nhân viên / lý do</span>
            <span>Kỳ nghỉ</span>
            <span className="text-right">Hành động</span>
          </div>
          <div className="max-h-[68vh] overflow-y-auto">
            {blockPanel ? (
              <div className="px-3 py-8 text-sm text-slate-500">Đang tải đơn nghỉ phép...</div>
            ) : visibleRows.length === 0 ? (
              <div className="px-3 py-8 text-sm text-slate-500">Chưa có đơn trong kỳ.</div>
            ) : (
              visibleRows.map(({ row, staff }) => {
                const status = normalizeLeaveStatus(row.trangThai);
                return (
                  <div
                    key={row.maDon}
                    className="grid grid-cols-[minmax(0,1fr)_120px_100px] items-start gap-2 border-b border-slate-100 px-3 py-3 text-sm"
                  >
                    <div>
                      <div className="font-semibold text-slate-800">{staff?.tenNhanVien || row.maNhanVien}</div>
                      <div className="text-xs text-slate-500">
                        {row.maDon} • {getLeaveStatusLabel(status)}
                      </div>
                      <div className="mt-1 text-slate-700">{row.lyDo}</div>
                    </div>
                    <div className="text-xs text-slate-600">
                      {row.tuNgay}
                      <br />→ {row.denNgay}
                    </div>
                    <div className="flex flex-col gap-1">
                      {status === LEAVE_STATUS.PENDING ? (
                        <>
                          <button
                            type="button"
                            onClick={() => review(row, LEAVE_REVIEW_ACTION.APPROVE)}
                            className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 disabled:opacity-50"
                          >
                            Duyệt
                          </button>
                          <button
                            type="button"
                            onClick={() => review(row, LEAVE_REVIEW_ACTION.REJECT)}
                            className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 disabled:opacity-50"
                          >
                            Từ chối
                          </button>
                          <button
                            type="button"
                            onClick={() => startEdit(row)}
                            className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700"
                          >
                            Sửa
                          </button>
                        </>
                      ) : null}
                      {status === LEAVE_STATUS.APPROVED ? (
                        <button
                          type="button"
                          onClick={() => review(row, LEAVE_REVIEW_ACTION.CANCEL)}
                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 disabled:opacity-50"
                        >
                          Hủy đơn
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="space-y-2 md:hidden">
          {blockPanel ? (
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-8 text-sm text-slate-500">
              Đang tải đơn nghỉ phép...
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-8 text-sm text-slate-500">
              Chưa có đơn trong kỳ.
            </div>
          ) : (
            visibleRows.map(({ row, staff }) => {
              const status = normalizeLeaveStatus(row.trangThai);
              return (
                <div
                  key={`leave-card-${row.maDon}`}
                  className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-800">{staff?.tenNhanVien || row.maNhanVien}</div>
                      <div className="text-xs text-slate-500">
                        {row.maDon} • {getLeaveStatusLabel(status)}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-slate-600">
                      {row.tuNgay} → {row.denNgay}
                    </span>
                  </div>
                  <div className="mt-2 text-slate-700">{row.lyDo}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {status === LEAVE_STATUS.PENDING ? (
                      <>
                        <button
                          type="button"
                          onClick={() => review(row, LEAVE_REVIEW_ACTION.APPROVE)}
                          className="flex-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-2 text-xs font-semibold text-emerald-700 disabled:opacity-50"
                        >
                          Duyệt
                        </button>
                        <button
                          type="button"
                          onClick={() => review(row, LEAVE_REVIEW_ACTION.REJECT)}
                          className="flex-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50"
                        >
                          Từ chối
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(row)}
                          className="flex-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-xs font-semibold text-amber-700"
                        >
                          Sửa
                        </button>
                      </>
                    ) : null}
                    {status === LEAVE_STATUS.APPROVED ? (
                      <button
                        type="button"
                        onClick={() => review(row, LEAVE_REVIEW_ACTION.CANCEL)}
                        className="w-full rounded-md border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-600 disabled:opacity-50"
                      >
                        Hủy đơn
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <h4 className="mb-3 text-sm font-black text-slate-800">
            {form.maDon ? `Sửa ${form.maDon}` : "Tạo đơn nghỉ phép"}
          </h4>
          <div className="space-y-3">
            <CustomDropdown
              value={form.maNhanVien}
              onChange={(next) => setForm((prev) => ({ ...prev, maNhanVien: String(next || "") }))}
              options={eligibleStaffs.map((staff) => ({
                value: staff.maNhanVien,
                label: `${staff.tenNhanVien} • ${getStaffRoleLabel(staff)}`,
              }))}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={form.tuNgay}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, tuNgay: normalizeAttendanceDateKey(e.target.value) }))
                }
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              <input
                type="date"
                value={form.denNgay}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, denNgay: normalizeAttendanceDateKey(e.target.value) }))
                }
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </div>
            <textarea
              value={form.lyDo}
              onChange={(e) => setForm((prev) => ({ ...prev, lyDo: e.target.value }))}
              rows={3}
              placeholder="Lý do nghỉ phép *"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            />
            <textarea
              value={form.ghiChu}
              onChange={(e) => setForm((prev) => ({ ...prev, ghiChu: e.target.value }))}
              rows={2}
              placeholder="Ghi chú"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={submit}
              className="w-full rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700"
            >
              {form.maDon ? "Lưu thay đổi" : "Gửi đơn"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
