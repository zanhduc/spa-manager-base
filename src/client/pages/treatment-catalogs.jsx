import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { CACHE_KEYS } from "../api";
import { useCacheSync } from "../hooks/useCacheSync.js";
import {
  clearReadCacheByKeys,
  getTreatmentCatalogs,
  saveTreatmentCatalogs,
} from "../api";
import { readCache } from "../api/localCache.js";
import {
  bootstrapSilentAny,
  hasCachedResponse,
  readCachedObject,
  shouldBlockPanelUI,
} from "../utils/cacheBootstrap.js";
import {
  clearFormDraft,
  FORM_DRAFT_KEYS,
  readFormDraft,
  writeFormDraft,
} from "../utils/formDraftCache.js";
import { validateTreatmentCatalogPayload as validateCatalogPayload } from "../utils/treatmentCatalogValidators.js";
import { toUsDateTime } from "../../core/dateUtils.js";

const emptyTreatmentCatalogData = () => ({ phacDo: [], dichVu: [], goiDieuTri: [] });

const readCachedTreatmentData = () => {
  const cached = readCachedObject(CACHE_KEYS.treatmentCatalogs);
  if (!cached || typeof cached !== "object") return emptyTreatmentCatalogData();
  return {
    phacDo: Array.isArray(cached.phacDo) ? cached.phacDo : [],
    dichVu: Array.isArray(cached.dichVu) ? cached.dichVu : [],
    goiDieuTri: Array.isArray(cached.goiDieuTri) ? cached.goiDieuTri : [],
  };
};

const normalizeCatalogData = (cached) => {
  if (!cached || typeof cached !== "object") return emptyTreatmentCatalogData();
  return {
    phacDo: Array.isArray(cached.phacDo) ? cached.phacDo : [],
    dichVu: Array.isArray(cached.dichVu) ? cached.dichVu : [],
    goiDieuTri: Array.isArray(cached.goiDieuTri) ? cached.goiDieuTri : [],
  };
};

const TABS = [
  { id: "phacDo", label: "Phác đồ" },
  { id: "dichVu", label: "Dịch vụ" },
  { id: "goiDieuTri", label: "Combo / Gói" },
];

const createEmptyProtocol = () => ({
  maPhacDo: "",
  tenPhacDo: "",
  nhomBenh: "",
  capDoBenh: "",
  moTa: "",
  active: true,
});

const createEmptyService = () => ({
  maDv: "",
  maPhacDo: "",
  lop1NhomDv: "",
  lop2DichVu: "",
  vungTriLieu: "",
  thoiLuongPhut: 60,
  active: true,
});

const createEmptyPackage = () => ({
  maGoi: "",
  maDv: "",
  tenGoi: "",
  loaiGoi: "LE",
  soBuoiMua: 1,
  soBuoiTang: 0,
  soBuoiQuyDoi: 1,
  giaBanGoi: 0,
  giaVonChuanGoi: 0,
  active: true,
});

const parseNumber = (value) => {
  const num = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(num) ? num : 0;
};

const normalizeCode = (value) => String(value || "").trim().toUpperCase();

const buildCatalogStats = (rows = [], tab) => {
  if (tab === "phacDo") {
    return {
      total: rows.length,
      active: rows.filter((item) => item.active !== false).length,
      inactive: rows.filter((item) => item.active === false).length,
      duplicates: new Set(
        rows
          .map((item) => normalizeCode(item.maPhacDo))
          .filter(Boolean)
          .filter((code, index, list) => list.indexOf(code) !== index),
      ).size,
    };
  }
  if (tab === "dichVu") {
    return {
      total: rows.length,
      active: rows.filter((item) => item.active !== false).length,
      inactive: rows.filter((item) => item.active === false).length,
      duplicates: new Set(
        rows
          .map((item) => normalizeCode(item.maDv))
          .filter(Boolean)
          .filter((code, index, list) => list.indexOf(code) !== index),
      ).size,
    };
  }
  return {
    total: rows.length,
    active: rows.filter((item) => item.active !== false).length,
    inactive: rows.filter((item) => item.active === false).length,
    duplicates: new Set(
      rows
        .map((item) => normalizeCode(item.maGoi))
        .filter(Boolean)
        .filter((code, index, list) => list.indexOf(code) !== index),
    ).size,
  };
};

function TabButton({ active, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
        active ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
      }`}
    >
      {label}
    </button>
  );
}

function CellInput({ value, onChange, type = "text", placeholder = "" }) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
    />
  );
}

function ActiveSwitch({ checked, onChange }) {
  const active = checked !== false;
  return (
    <button
      type="button"
      onClick={() => onChange(!active)}
      className={`group inline-flex min-w-[92px] items-center justify-between gap-2 rounded-full border px-2 py-1.5 text-xs font-bold transition ${
        active
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-100"
          : "border-slate-200 bg-slate-100 text-slate-500"
      }`}
      aria-pressed={active}
    >
      <span>{active ? "Bật" : "Tắt"}</span>
      <span
        className={`relative h-5 w-9 rounded-full transition ${
          active ? "bg-emerald-500" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${
            active ? "left-4" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

export default function TreatmentCatalogsPage() {
  const savedCatalogDraft = readFormDraft(FORM_DRAFT_KEYS.treatmentCatalog);
  const [tab, setTab] = useState(() => String(savedCatalogDraft?.tab || "phacDo"));
  const [loading, setLoading] = useState(() => !hasCachedResponse(CACHE_KEYS.treatmentCatalogs));
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState(() => {
    if (savedCatalogDraft?.data && typeof savedCatalogDraft.data === "object") {
      return normalizeCatalogData(savedCatalogDraft.data);
    }
    return readCachedTreatmentData();
  });
  const [error, setError] = useState(null);
  const catalogDirtyRef = useRef(Boolean(savedCatalogDraft?.data));
  const catalogDraftTimerRef = useRef(null);
  const [newRowIndices, setNewRowIndices] = useState(() => new Set());
  const [savingRowIndex, setSavingRowIndex] = useState(null);

  const loadData = async ({ silent = false, force = false } = {}) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await getTreatmentCatalogs({ force });
      if (res && res.success === false) {
        setError(res.message || "Không thể tải danh mục điều trị.");
        if (!catalogDirtyRef.current) {
          setData({ phacDo: [], dichVu: [], goiDieuTri: [] });
        }
        return;
      }
      if (!catalogDirtyRef.current) {
        setData({
          phacDo: Array.isArray(res?.data?.phacDo) ? res.data.phacDo : [],
          dichVu: Array.isArray(res?.data?.dichVu) ? res.data.dichVu : [],
          goiDieuTri: Array.isArray(res?.data?.goiDieuTri) ? res.data.goiDieuTri : [],
        });
      }
    } catch (err) {
      setError(err?.message || "Lỗi không xác định khi tải dữ liệu.");
      if (!catalogDirtyRef.current) {
        setData({ phacDo: [], dichVu: [], goiDieuTri: [] });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void loadData({ silent: bootstrapSilentAny(CACHE_KEYS.treatmentCatalogs) });
  }, []);

  useCacheSync({
    cacheKeys: [CACHE_KEYS.treatmentCatalogs, CACHE_KEYS.treatmentPackages],
    onCacheUpdated: (detail, cacheKey) => {
      if (cacheKey !== CACHE_KEYS.treatmentCatalogs) return;
      if (catalogDirtyRef.current) return;
      const cachedData = detail?.response?.data;
      if (cachedData && typeof cachedData === "object") {
        setData(normalizeCatalogData(cachedData));
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
      if (!keys.includes(CACHE_KEYS.treatmentCatalogs) && !keys.includes(CACHE_KEYS.treatmentPackages)) {
        return;
      }
      if (catalogDirtyRef.current) return;
      const cached = readCache(CACHE_KEYS.treatmentCatalogs)?.response?.data;
      if (cached && typeof cached === "object") {
        setData(normalizeCatalogData(cached));
      }
      // ⚠️ KHÔNG gọi loadData() ở đây - chỉ đọc từ cache
    }
  });

  useEffect(() => {
    if (!catalogDirtyRef.current) return undefined;
    if (catalogDraftTimerRef.current) clearTimeout(catalogDraftTimerRef.current);
    catalogDraftTimerRef.current = setTimeout(() => {
      writeFormDraft(FORM_DRAFT_KEYS.treatmentCatalog, { data, tab }, { page: "treatment-catalogs" });
    }, 400);
    return () => {
      if (catalogDraftTimerRef.current) clearTimeout(catalogDraftTimerRef.current);
    };
  }, [data, tab]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      catalogDirtyRef.current = false;
      clearFormDraft(FORM_DRAFT_KEYS.treatmentCatalog);
      await loadData({ silent: true, force: true });
    } finally {
      setRefreshing(false);
    }
  };

  const activeRows = data[tab] || [];
  const stats = useMemo(() => buildCatalogStats(activeRows, tab), [activeRows, tab]);
  const blockPanel = shouldBlockPanelUI(
    loading,
    ((data.phacDo?.length || 0) +
      (data.dichVu?.length || 0) +
      (data.goiDieuTri?.length || 0)) >
      0,
  );

  const protocolOptions = useMemo(
    () => (data.phacDo || []).map((item) => ({ value: item.maPhacDo, label: item.tenPhacDo || item.maPhacDo })),
    [data.phacDo],
  );
  const serviceOptions = useMemo(
    () => (data.dichVu || []).map((item) => ({ value: item.maDv, label: item.lop2DichVu || item.maDv })),
    [data.dichVu],
  );

  const updateRow = (section, index, field, value) => {
    catalogDirtyRef.current = true;
    setData((prev) => ({
      ...prev,
      [section]: prev[section].map((item, idx) =>
        idx === index
          ? {
              ...item,
              [field]:
                field === "active"
                  ? Boolean(value)
                  : [
                        "thoiLuongPhut",
                        "soBuoiMua",
                        "soBuoiTang",
                        "soBuoiQuyDoi",
                        "giaBanGoi",
                        "giaVonChuanGoi",
                      ].includes(field)
                    ? parseNumber(value)
                    : value,
            }
          : item,
      ),
    }));
  };

  const addRow = () => {
    catalogDirtyRef.current = true;
    setData((prev) => ({
      ...prev,
      [tab]: [
        ...prev[tab],
        tab === "phacDo" ? createEmptyProtocol() : tab === "dichVu" ? createEmptyService() : createEmptyPackage(),
      ],
    }));
    setNewRowIndices((prev) => new Set([...prev, prev.size]));
  };

  const deleteRow = (index) => {
    catalogDirtyRef.current = true;
    setData((prev) => ({
      ...prev,
      [tab]: prev[tab].filter((_, idx) => idx !== index),
    }));
    setNewRowIndices((prev) => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  };

  const saveRow = async (index) => {
    const row = data[tab][index];
    if (!row) return;
    setSavingRowIndex(index);
    try {
      const currentTab = tab;
      const allRows = [...data[currentTab]];
      const updatedRows = allRows.map((r, i) => i === index ? { ...r, updatedAt: new Date().toISOString() } : r);
      const payload = {
        phacDo: currentTab === "phacDo" ? updatedRows.filter((item) => item.maPhacDo || item.tenPhacDo) : data.phacDo,
        dichVu: currentTab === "dichVu" ? updatedRows.filter((item) => item.maDv || item.lop2DichVu) : data.dichVu,
        goiDieuTri: currentTab === "goiDieuTri" ? updatedRows.filter((item) => item.maGoi || item.tenGoi) : data.goiDieuTri,
      };
      const validationMessage = validateCatalogPayload(payload);
      if (validationMessage) throw new Error(validationMessage);
      const result = await saveTreatmentCatalogs(payload);
      if (!result?.success && !result?.isOptimistic) {
        throw new Error(result?.message || "Lưu dòng thất bại.");
      }
      setData((prev) => ({
        ...prev,
        [currentTab]: prev[currentTab].map((r, i) => i === index ? { ...r, updatedAt: new Date().toISOString() } : r),
      }));
      setNewRowIndices((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
      toast.success("Đã lưu dòng!");
    } catch (error) {
      toast.error(error?.message || "Không thể lưu dòng.");
    } finally {
      setSavingRowIndex(null);
    }
  };

  const handleSave = async () => {
    try {
      const payload = {
        phacDo: (data.phacDo || []).filter((item) => item.maPhacDo || item.tenPhacDo),
        dichVu: (data.dichVu || []).filter((item) => item.maDv || item.lop2DichVu),
        goiDieuTri: (data.goiDieuTri || []).filter((item) => item.maGoi || item.tenGoi),
      };
      const validationMessage = validateCatalogPayload(payload);
      if (validationMessage) throw new Error(validationMessage);
      catalogDirtyRef.current = false;
      clearFormDraft(FORM_DRAFT_KEYS.treatmentCatalog);
      setData(normalizeCatalogData(payload));
      const result = await saveTreatmentCatalogs(payload);
      if (!result?.success && !result?.isOptimistic) {
        throw new Error(result?.message || "Lưu danh mục thất bại.");
      }
    } catch (error) {
      catalogDirtyRef.current = true;
      toast.error(error?.message || "Không thể lưu danh mục điều trị.");
    }
  };

  return (
    <main className="app-page bg-slate-100 pb-24">
      <div className="app-shell space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-xl font-black text-slate-800">Quản lý liệu trình, dịch vụ, combo</h1>
              <p className="text-sm text-slate-500">
                Chỉnh trực tiếp ba danh mục spa: phác đồ điều trị, dịch vụ trị liệu và combo/gói bán cho khách.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
              >
                {refreshing ? (
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-700/80 border-r-transparent" />
                ) : null}
                {refreshing ? "Đang tải..." : "Tải lại"}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Lưu danh mục
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {TABS.map((item) => (
              <TabButton
                key={item.id}
                active={tab === item.id}
                label={item.label}
                onClick={() => {
                  catalogDirtyRef.current = true;
                  setTab(item.id);
                }}
              />
            ))}
          </div>
        </section>

        {blockPanel ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
            Đang tải danh mục điều trị...
          </section>
        ) : error ? (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-10 text-center text-red-600 shadow-sm">
            <p className="font-semibold">Lỗi tải dữ liệu</p>
            <p className="mt-1 text-sm">{error}</p>
          </section>
        ) : (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-800">
                  {tab === "phacDo" ? "Phác đồ" : tab === "dichVu" ? "Dịch vụ trị liệu" : "Combo / Gói trị liệu"}
                </h2>
                <p className="text-sm text-slate-500">Số dòng hiện có: {activeRows.length}</p>
              </div>
              <button
                type="button"
                onClick={addRow}
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
              >
                Thêm dòng
              </button>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tổng dòng</p>
                <p className="mt-1 text-lg font-black text-slate-900">{stats.total}</p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Đang bật</p>
                <p className="mt-1 text-lg font-black text-emerald-900">{stats.active}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Đang tắt</p>
                <p className="mt-1 text-lg font-black text-slate-900">{stats.inactive}</p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Mã trùng</p>
                <p className="mt-1 text-lg font-black text-amber-900">{stats.duplicates}</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="max-h-[65vh] overflow-auto">
                <table className="min-w-full border-separate border-spacing-0">
                  <thead className="sticky top-0 z-10 bg-white shadow-sm">
                    {tab === "phacDo" ? (
                      <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <th className="border-b border-slate-200 px-3 py-2.5">Mã</th>
                        <th className="border-b border-slate-200 px-3 py-2.5">Tên phác đồ</th>
                        <th className="border-b border-slate-200 px-3 py-2.5">Nhóm bệnh</th>
                        <th className="border-b border-slate-200 px-3 py-2.5">Cấp độ</th>
                        <th className="border-b border-slate-200 px-3 py-2.5">Mô tả</th>
                        <th className="border-b border-slate-200 px-3 py-2.5">Active</th>
                        <th className="border-b border-slate-200 px-3 py-2.5">Cập nhật</th>
                        <th className="border-b border-slate-200 px-3 py-2.5"></th>
                      </tr>
                    ) : null}
                    {tab === "dichVu" ? (
                      <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <th className="border-b border-slate-200 px-3 py-2.5">Mã DV</th>
                        <th className="border-b border-slate-200 px-3 py-2.5">Phác đồ</th>
                        <th className="border-b border-slate-200 px-3 py-2.5">Nhóm DV</th>
                        <th className="border-b border-slate-200 px-3 py-2.5">Tên dịch vụ</th>
                        <th className="border-b border-slate-200 px-3 py-2.5">Vùng</th>
                        <th className="border-b border-slate-200 px-3 py-2.5">Phút</th>
                        <th className="border-b border-slate-200 px-3 py-2.5">Active</th>
                        <th className="border-b border-slate-200 px-3 py-2.5">Cập nhật</th>
                        <th className="border-b border-slate-200 px-3 py-2.5"></th>
                      </tr>
                    ) : null}
                    {tab === "goiDieuTri" ? (
                      <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <th className="border-b border-slate-200 px-3 py-2.5">Mã gói</th>
                        <th className="border-b border-slate-200 px-3 py-2.5">DV gốc</th>
                        <th className="border-b border-slate-200 px-3 py-2.5">Tên gói</th>
                        <th className="border-b border-slate-200 px-3 py-2.5">Loại</th>
                        <th className="border-b border-slate-200 px-3 py-2.5">Mua</th>
                        <th className="border-b border-slate-200 px-3 py-2.5">Tặng</th>
                        <th className="border-b border-slate-200 px-3 py-2.5">Quy đổi</th>
                        <th className="border-b border-slate-200 px-3 py-2.5">Giá bán</th>
                        <th className="border-b border-slate-200 px-3 py-2.5">Giá vốn</th>
                        <th className="border-b border-slate-200 px-3 py-2.5">Active</th>
                        <th className="border-b border-slate-200 px-3 py-2.5">Cập nhật</th>
                        <th className="border-b border-slate-200 px-3 py-2.5"></th>
                      </tr>
                    ) : null}
                  </thead>
                  <tbody>
                    {activeRows.map((row, index) => (
                      <tr key={`${tab}-${index}`} className="align-top hover:bg-slate-50/50">
                        {tab === "phacDo" ? (
                          <>
                            <td className="border-b border-slate-100 px-3 py-2"><CellInput value={row.maPhacDo || ""} onChange={(e) => updateRow("phacDo", index, "maPhacDo", e.target.value)} /></td>
                            <td className="border-b border-slate-100 px-3 py-2"><CellInput value={row.tenPhacDo || ""} onChange={(e) => updateRow("phacDo", index, "tenPhacDo", e.target.value)} /></td>
                            <td className="border-b border-slate-100 px-3 py-2"><CellInput value={row.nhomBenh || ""} onChange={(e) => updateRow("phacDo", index, "nhomBenh", e.target.value)} /></td>
                            <td className="border-b border-slate-100 px-3 py-2"><CellInput value={row.capDoBenh || ""} onChange={(e) => updateRow("phacDo", index, "capDoBenh", e.target.value)} /></td>
                            <td className="border-b border-slate-100 px-3 py-2"><CellInput value={row.moTa || ""} onChange={(e) => updateRow("phacDo", index, "moTa", e.target.value)} /></td>
                            <td className="border-b border-slate-100 px-3 py-2">
                              <ActiveSwitch checked={row.active !== false} onChange={(next) => updateRow("phacDo", index, "active", next)} />
                            </td>
                            <td className="border-b border-slate-100 px-3 py-2 whitespace-nowrap">
                              {newRowIndices.has(index) ? (
                                <button
                                  type="button"
                                  onClick={() => saveRow(index)}
                                  disabled={savingRowIndex === index}
                                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                                >
                                  {savingRowIndex === index ? "Đang lưu..." : "Lưu"}
                                </button>
                              ) : (
                                <span className="text-xs text-slate-500">{toUsDateTime(row.updatedAt) || "-"}</span>
                              )}
                            </td>
                          </>
                        ) : null}
                        {tab === "dichVu" ? (
                          <>
                            <td className="border-b border-slate-100 px-3 py-2"><CellInput value={row.maDv || ""} onChange={(e) => updateRow("dichVu", index, "maDv", e.target.value)} /></td>
                            <td className="border-b border-slate-100 px-3 py-2">
                              <select
                                value={row.maPhacDo || ""}
                                onChange={(e) => updateRow("dichVu", index, "maPhacDo", e.target.value)}
                                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
                              >
                                <option value="">Chọn phác đồ</option>
                                {protocolOptions.map((item) => (
                                  <option key={item.value} value={item.value}>{item.label}</option>
                                ))}
                              </select>
                            </td>
                            <td className="border-b border-slate-100 px-3 py-2"><CellInput value={row.lop1NhomDv || ""} onChange={(e) => updateRow("dichVu", index, "lop1NhomDv", e.target.value)} /></td>
                            <td className="border-b border-slate-100 px-3 py-2"><CellInput value={row.lop2DichVu || ""} onChange={(e) => updateRow("dichVu", index, "lop2DichVu", e.target.value)} /></td>
                            <td className="border-b border-slate-100 px-3 py-2"><CellInput value={row.vungTriLieu || ""} onChange={(e) => updateRow("dichVu", index, "vungTriLieu", e.target.value)} /></td>
                            <td className="border-b border-slate-100 px-3 py-2"><CellInput type="number" value={row.thoiLuongPhut ?? 0} onChange={(e) => updateRow("dichVu", index, "thoiLuongPhut", e.target.value)} /></td>
                            <td className="border-b border-slate-100 px-3 py-2">
                              <ActiveSwitch checked={row.active !== false} onChange={(next) => updateRow("dichVu", index, "active", next)} />
                            </td>
                            <td className="border-b border-slate-100 px-3 py-2 whitespace-nowrap">
                              {newRowIndices.has(index) ? (
                                <button
                                  type="button"
                                  onClick={() => saveRow(index)}
                                  disabled={savingRowIndex === index}
                                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                                >
                                  {savingRowIndex === index ? "Đang lưu..." : "Lưu"}
                                </button>
                              ) : (
                                <span className="text-xs text-slate-500">{toUsDateTime(row.updatedAt) || "-"}</span>
                              )}
                            </td>
                          </>
                        ) : null}
                        {tab === "goiDieuTri" ? (
                          <>
                            <td className="border-b border-slate-100 px-3 py-2"><CellInput value={row.maGoi || ""} onChange={(e) => updateRow("goiDieuTri", index, "maGoi", e.target.value)} /></td>
                            <td className="border-b border-slate-100 px-3 py-2">
                              <select
                                value={row.maDv || ""}
                                onChange={(e) => updateRow("goiDieuTri", index, "maDv", e.target.value)}
                                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
                              >
                                <option value="">Chọn dịch vụ</option>
                                {serviceOptions.map((item) => (
                                  <option key={item.value} value={item.value}>{item.label}</option>
                                ))}
                              </select>
                            </td>
                            <td className="border-b border-slate-100 px-3 py-2"><CellInput value={row.tenGoi || ""} onChange={(e) => updateRow("goiDieuTri", index, "tenGoi", e.target.value)} /></td>
                            <td className="border-b border-slate-100 px-3 py-2">
                              <select
                                value={row.loaiGoi || "LE"}
                                onChange={(e) => updateRow("goiDieuTri", index, "loaiGoi", e.target.value)}
                                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
                              >
                                <option value="LE">Lẻ</option>
                                <option value="COMBO">Combo</option>
                              </select>
                            </td>
                            <td className="border-b border-slate-100 px-3 py-2"><CellInput type="number" value={row.soBuoiMua ?? 0} onChange={(e) => updateRow("goiDieuTri", index, "soBuoiMua", e.target.value)} /></td>
                            <td className="border-b border-slate-100 px-3 py-2"><CellInput type="number" value={row.soBuoiTang ?? 0} onChange={(e) => updateRow("goiDieuTri", index, "soBuoiTang", e.target.value)} /></td>
                            <td className="border-b border-slate-100 px-3 py-2"><CellInput type="number" value={row.soBuoiQuyDoi ?? 0} onChange={(e) => updateRow("goiDieuTri", index, "soBuoiQuyDoi", e.target.value)} /></td>
                            <td className="border-b border-slate-100 px-3 py-2"><CellInput type="number" value={row.giaBanGoi ?? 0} onChange={(e) => updateRow("goiDieuTri", index, "giaBanGoi", e.target.value)} /></td>
                            <td className="border-b border-slate-100 px-3 py-2"><CellInput type="number" value={row.giaVonChuanGoi ?? 0} onChange={(e) => updateRow("goiDieuTri", index, "giaVonChuanGoi", e.target.value)} /></td>
                            <td className="border-b border-slate-100 px-3 py-2">
                              <ActiveSwitch checked={row.active !== false} onChange={(next) => updateRow("goiDieuTri", index, "active", next)} />
                            </td>
                            <td className="border-b border-slate-100 px-3 py-2 whitespace-nowrap">
                              {newRowIndices.has(index) ? (
                                <button
                                  type="button"
                                  onClick={() => saveRow(index)}
                                  disabled={savingRowIndex === index}
                                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                                >
                                  {savingRowIndex === index ? "Đang lưu..." : "Lưu"}
                                </button>
                              ) : (
                                <span className="text-xs text-slate-500">{toUsDateTime(row.updatedAt) || "-"}</span>
                              )}
                            </td>
                          </>
                        ) : null}
                        <td className="border-b border-slate-100 px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => deleteRow(index)}
                            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                          >
                            Xóa
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
