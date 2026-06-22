import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { CACHE_KEYS, buildStaffTrainingsCacheKey, getSpaStaffTrainings } from "../../api";
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
  TRAINING_STATUS,
  TRAINING_STATUS_OPTIONS,
  TRAINING_TYPE_OPTIONS,
  getTrainingStatusLabel,
  getTrainingTypeLabel,
  normalizeTrainingStatus,
  validateTrainingSave,
} from "./staffTrainingHelpers";

const pad2 = (n) => String(n).padStart(2, "0");
const todayDateKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
};

const emptyForm = (staffCode = "") => ({
  maDaoTao: "",
  maNhanVien: staffCode,
  loaiDaoTao: "HOI_NHAP",
  tuNgay: todayDateKey(),
  denNgay: todayDateKey(),
  noiDung: "",
  trangThai: TRAINING_STATUS.SCHEDULED,
  ghiChu: "",
});

const readCachedTrainingRows = (tuNgay, denNgay) => {
  const cached = readCache(buildStaffTrainingsCacheKey({ tuNgay, denNgay }))?.response;
  return Array.isArray(cached?.data) ? cached.data : [];
};

const hasCachedTrainingRows = (tuNgay, denNgay) =>
  hasCachedResponse(buildStaffTrainingsCacheKey({ tuNgay, denNgay }));

export function StaffTrainingPanel({
  staffs = [],
  onSave,
  roleFilter = "ALL",
  statusFilter = "ALL",
  keyword = "",
}) {
  const initialTuNgay = todayDateKey().slice(0, 8) + "01";
  const initialDenNgay = todayDateKey();
  const [tuNgay, setTuNgay] = useState(initialTuNgay);
  const [denNgay, setDenNgay] = useState(initialDenNgay);
  const [rows, setRows] = useState(() => readCachedTrainingRows(initialTuNgay, initialDenNgay));
  const [form, setForm] = useState(() => emptyForm());
  const [loading, setLoading] = useState(
    () => !hasCachedTrainingRows(initialTuNgay, initialDenNgay),
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

  const loadTrainings = useCallback(async ({ silent = false } = {}) => {
    if (!silent && !hasCachedTrainingRows(tuNgay, denNgay)) setLoading(true);
    try {
      const res = await getSpaStaffTrainings({ tuNgay, denNgay });
      setRows(Array.isArray(res?.data) ? res.data : []);
    } catch (_) {
      toast.error("Không tải được lịch đào tạo.");
    } finally {
      setLoading(false);
    }
  }, [denNgay, tuNgay]);

  useEffect(() => {
    setRows(readCachedTrainingRows(tuNgay, denNgay));
    void loadTrainings({ silent: hasCachedTrainingRows(tuNgay, denNgay) });
  }, [loadTrainings, tuNgay, denNgay]);

  /**
   * ⚠️ REMOVED: onCacheInvalidated gọi API
   * Lý do: Gây stack overflow khi event được dispatch liên tục
   */
  useCacheSync({
    cacheKeys: [buildStaffTrainingsCacheKey({ tuNgay, denNgay })],
    cacheKeyPrefixes: [CACHE_KEY_IDS.staffTrainings],
    onCacheUpdated: (detail, cacheKey) => {
      const expected = buildStaffTrainingsCacheKey({ tuNgay, denNgay });
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

  const submit = async () => {
    const validation = validateTrainingSave(form);
    if (!validation.ok) {
      toast.error(validation.message);
      return;
    }
    const payload = {
      maDaoTao: String(form.maDaoTao || "").trim(),
      maNhanVien: validation.maNhanVien,
      loaiDaoTao: validation.loaiDaoTao,
      tuNgay: validation.tuNgay,
      denNgay: validation.denNgay,
      noiDung: String(form.noiDung || "").trim(),
      trangThai: String(form.trangThai || TRAINING_STATUS.SCHEDULED).trim(),
      ghiChu: String(form.ghiChu || "").trim(),
    };
    const snapshot = rows;
    const cacheKey = buildStaffTrainingsCacheKey({ tuNgay, denNgay });
    const optimisticRow = {
      ...payload,
      maDaoTao: payload.maDaoTao || `TEMP-${Date.now()}`,
    };
    setRows((prev) => {
      const existingId = String(payload.maDaoTao || "").trim();
      if (existingId) {
        return prev.map((row) =>
          String(row.maDaoTao || "").trim() === existingId ? { ...row, ...optimisticRow } : row,
        );
      }
      return [optimisticRow, ...prev];
    });
    upsertCachedListItem(cacheKey, optimisticRow, "maDaoTao", {
      LOCAL_MUTATION_CACHE_META,
    });
    const ok = await onSave?.(payload);
    if (ok === false) {
      setRows(snapshot);
      return;
    }
    setForm(emptyForm(String(form.maNhanVien || "").trim()));
  };

  const startEdit = (row) => {
    setForm({
      maDaoTao: String(row.maDaoTao || "").trim(),
      maNhanVien: String(row.maNhanVien || "").trim(),
      loaiDaoTao: String(row.loaiDaoTao || "HOI_NHAP").trim(),
      tuNgay: normalizeAttendanceDateKey(row.tuNgay),
      denNgay: normalizeAttendanceDateKey(row.denNgay),
      noiDung: String(row.noiDung || "").trim(),
      trangThai: normalizeTrainingStatus(row.trangThai),
      ghiChu: String(row.ghiChu || "").trim(),
    });
  };

  const markStatus = async (row, trangThai) => {
    const snapshot = rows;
    const nextRow = { ...row, trangThai };
    setRows((prev) =>
      prev.map((item) =>
        String(item.maDaoTao || "").trim() === String(row.maDaoTao || "").trim() ? nextRow : item,
      ),
    );
    upsertCachedListItem(
      buildStaffTrainingsCacheKey({ tuNgay, denNgay }),
      nextRow,
      "maDaoTao",
      LOCAL_MUTATION_CACHE_META,
    );
    const ok = await onSave?.({ ...row, trangThai });
    if (ok === false) setRows(snapshot);
  };

  const blockPanel = shouldBlockPanelUI(
    loading,
    rows.length > 0 || hasCachedTrainingRows(tuNgay, denNgay),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <div>
          <div className="text-sm font-semibold text-slate-700">Đào tạo nhân viên</div>
          <div className="text-xs text-slate-500">Hội nhập 1 ngày và chuyên môn 3–7 ngày theo quy trình HCNS.</div>
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

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="max-h-[68vh] overflow-y-auto">
            {blockPanel ? (
              <div className="px-3 py-8 text-sm text-slate-500">Đang tải lịch đào tạo...</div>
            ) : visibleRows.length === 0 ? (
              <div className="px-3 py-8 text-sm text-slate-500">Chưa có lịch đào tạo trong kỳ.</div>
            ) : (
              visibleRows.map(({ row, staff }) => {
                const status = normalizeTrainingStatus(row.trangThai);
                return (
                  <div key={row.maDaoTao} className="border-b border-slate-100 px-3 py-3 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-slate-800">{staff?.tenNhanVien || row.maNhanVien}</div>
                        <div className="text-xs text-slate-500">
                          {row.maDaoTao} • {getTrainingTypeLabel(row.loaiDaoTao)} •{" "}
                          {getTrainingStatusLabel(status)}
                        </div>
                        <div className="mt-1 text-xs text-slate-600">
                          {row.tuNgay} → {row.denNgay}
                        </div>
                        <div className="mt-1 text-slate-700">{row.noiDung}</div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(row)}
                          className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700"
                        >
                          Sửa
                        </button>
                        {status === TRAINING_STATUS.SCHEDULED ? (
                          <button
                            type="button"
                            onClick={() => markStatus(row, TRAINING_STATUS.COMPLETED)}
                            className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700"
                          >
                            Hoàn thành
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <h4 className="mb-3 text-sm font-black text-slate-800">
            {form.maDaoTao ? `Sửa ${form.maDaoTao}` : "Lên lịch đào tạo"}
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
            <CustomDropdown
              value={form.loaiDaoTao}
              onChange={(next) => setForm((prev) => ({ ...prev, loaiDaoTao: String(next || "") }))}
              options={TRAINING_TYPE_OPTIONS}
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
              value={form.noiDung}
              onChange={(e) => setForm((prev) => ({ ...prev, noiDung: e.target.value }))}
              rows={3}
              placeholder="Nội dung đào tạo *"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            />
            <CustomDropdown
              value={form.trangThai}
              onChange={(next) => setForm((prev) => ({ ...prev, trangThai: String(next || "") }))}
              options={TRAINING_STATUS_OPTIONS}
            />
            <button
              type="button"
              onClick={submit}
              className="w-full rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700"
            >
              {form.maDaoTao ? "Lưu thay đổi" : "Lưu lịch đào tạo"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
