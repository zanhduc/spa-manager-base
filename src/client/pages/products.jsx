import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  CACHE_INVALIDATED_EVENT,
  CACHE_KEYS,
  createProductCatalogItem,
  deleteProductCatalogItem,
  getProductCatalog,
  updateProductCatalogItem,
  formatAllSheets,
} from "../api";
import { runInBackground } from "../api/backgroundApi";
import { useUser } from "../context";
import ImageUploader from "../components/ImageUploader";

const toNum = (v) => Number(String(v ?? "").replace(/[^\d.-]/g, "")) || 0;
const fmt = (n) => Number(n || 0).toLocaleString("vi-VN");

const foldText = (v) =>
  String(v || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim();

/* ── Sub-components ── */

function MoneyInput({
  value,
  onChange,
  placeholder,
  className = "",
  maxLength,
}) {
  const [display, setDisplay] = useState(value ? fmt(value) : "");

  useEffect(() => {
    setDisplay(value ? fmt(value) : "");
  }, [value]);

  return (
    <input
      value={display}
      onChange={(e) => {
        const digits = String(e.target.value || "").replace(/[^\d]/g, "");
        const n = digits ? Number(digits) : 0;
        setDisplay(digits ? fmt(n) : "");
        onChange(n);
      }}
      inputMode="numeric"
      placeholder={placeholder}
      maxLength={maxLength}
      className={`w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 pt-2 pb-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-rose-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-700/20 transition-all ${className}`}
    />
  );
}

function LabeledMoneyInput({
  label,
  tone = "rose",
  value,
  onChange,
  placeholder,
  className = "",
  error = "",
  required = false,
  maxLength,
}) {
  const toneCls =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50/60 text-emerald-800"
      : "border-rose-200 bg-rose-50/60 text-rose-800";

  const errCls = error ? "border-rose-500 ring-1 ring-rose-500/20" : toneCls;

  return (
    <div className="space-y-1">
      <div
        className={`min-h-[52px] rounded-xl border px-2.5 py-1.5 ${errCls} grid grid-cols-[auto,1fr] items-center gap-2 ${className}`}
      >
        <span className="inline-flex self-center pt-0.5 min-w-[84px] items-center justify-start text-[11px] font-bold uppercase tracking-wide leading-none whitespace-nowrap">
          {label} {required && <span className="text-rose-500 ml-0.5">*</span>}
        </span>
        <MoneyInput
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          maxLength={maxLength}
          className="h-full py-0.5 leading-none bg-white"
        />
      </div>
      {error && (
        <p className="px-1 text-[10px] font-semibold text-rose-600">{error}</p>
      )}
    </div>
  );
}

function LabeledTextInput({
  label,
  value,
  onChange,
  placeholder,
  className = "",
  error = "",
  required = false,
  maxLength,
}) {
  const normalCls = "border-slate-200 bg-slate-50/60";
  const errCls = error ? "border-rose-500 ring-1 ring-rose-500/20" : normalCls;

  return (
    <div className="space-y-1">
      <div
        className={`min-h-[52px] rounded-xl border px-2.5 py-1.5 grid grid-cols-[auto,1fr] items-center gap-2 text-slate-700 ${errCls} ${className}`}
      >
        <span className="inline-flex self-center pt-0.5 min-w-[84px] items-center justify-start text-[11px] font-bold uppercase tracking-wide leading-none whitespace-nowrap text-slate-500">
          {label} {required && <span className="text-rose-500 ml-0.5">*</span>}
        </span>
        <input
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          maxLength={maxLength}
          className="h-full py-0.5 leading-none bg-white outline-none w-full border-0 focus:ring-0 px-2 rounded-lg"
        />
      </div>
      {error && (
        <p className="px-1 text-[10px] font-semibold text-rose-600">{error}</p>
      )}
    </div>
  );
}

/* ── Data helpers ── */

const toViewRow = (p, idx) => ({
  id: `sp-${idx}-${Date.now()}`,
  isNew: false,
  originalTenSanPham: String(p.tenSanPham || ""),
  originalNhomHang: String(p.nhomHang || ""),
  originalDonVi: String(p.donVi || ""),
  tenSanPham: String(p.tenSanPham || ""),
  anhSanPham: String(p.anhSanPham || ""),
  nhomHang: String(p.nhomHang || ""),
  donVi: String(p.donVi || ""),
  donGiaBan: toNum(p.donGiaBan),
  giaVon: toNum(p.giaVon),
});

/* ── Main Page ── */

export default function ProductsPage() {
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState("");
  const [deletingKey, setDeletingKey] = useState("");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState("");
  const [rows, setRows] = useState([]);
  const [errorsMap, setErrorsMap] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Toggle hiện/ẩn ảnh
  const [showImages, setShowImages] = useState(
    () => localStorage.getItem("show_product_images") !== "false",
  );
  const toggleImages = () => {
    setShowImages((prev) => {
      const next = !prev;
      localStorage.setItem("show_product_images", String(next));
      return next;
    });
  };

  const loadProducts = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const res = await getProductCatalog();
      if (res?.success && Array.isArray(res.data)) {
        setRows(res.data.map((p, idx) => toViewRow(p, idx)));
      } else {
        setRows([]);
        if (res?.message) toast.error(res.message);
      }
    } catch (e) {
      setRows([]);
      toast.error("Không tải được danh sách sản phẩm");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    const onInvalidated = (event) => {
      const keys = event?.detail?.keys;
      if (!Array.isArray(keys)) return;
      if (!keys.includes(CACHE_KEYS.productCatalog)) return;
      loadProducts({ silent: true });
    };
    window.addEventListener(CACHE_INVALIDATED_EVENT, onInvalidated);
    return () =>
      window.removeEventListener(CACHE_INVALIDATED_EVENT, onInvalidated);
  }, []);

  const filteredRows = useMemo(() => {
    const q = foldText(query);
    if (!q) return rows;
    return rows.filter((r) =>
      foldText(`${r.tenSanPham} ${r.nhomHang} ${r.donVi}`).includes(q),
    );
  }, [rows, query]);

  const patchRow = (id, patch) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setErrorsMap((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      const rowErr = { ...next[id] };
      Object.keys(patch).forEach((key) => delete rowErr[key]);
      next[id] = rowErr;
      return next;
    });
  };

  const addProductDraft = () => {
    if (rows.some((r) => r.isNew)) {
      return toast.error("Vui lòng lưu hoặc xóa sản phẩm mới hiện tại trước");
    }
    const id = `new-${Date.now()}`;
    setRows((prev) => [
      {
        id,
        isNew: true,
        originalTenSanPham: "",
        originalNhomHang: "",
        originalDonVi: "",
        tenSanPham: "",
        anhSanPham: "",
        nhomHang: "",
        donVi: "",
        donGiaBan: 0,
        giaVon: 0,
      },
      ...prev,
    ]);
    setOpenId(id);
  };

  const removeDraft = (id) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    if (openId === id) setOpenId("");
  };

  const [showInventory, setShowInventory] = useState(
    () => localStorage.getItem("enable_inventory") === "true",
  );

  useEffect(() => {
    const handleSettingChange = (e) => setShowInventory(e.detail);
    window.addEventListener("inventory_setting_changed", handleSettingChange);
    return () =>
      window.removeEventListener(
        "inventory_setting_changed",
        handleSettingChange,
      );
  }, []);

  const validateRow = (row) => {
    const tenSanPham = String(row.tenSanPham || "").trim();
    const nhomHang = String(row.nhomHang || "").trim();
    const donVi = String(row.donVi || "").trim();
    const donGiaBan = toNum(row.donGiaBan);
    const giaVon = toNum(row.giaVon);

    const err = {};
    if (!tenSanPham) err.tenSanPham = "Chưa có tên";
    if (!donVi) err.donVi = "Cần đơn vị";
    if (donGiaBan <= 0) err.donGiaBan = "Sai giá";
    if (giaVon <= 0) err.giaVon = "Sai giá";

    if (Object.keys(err).length > 0) return { ok: false, errors: err };

    return {
      ok: true,
      data: {
        tenSanPham,
        anhSanPham: String(row.anhSanPham || "").trim(),
        nhomHang,
        donVi,
        donGiaBan,
        giaVon,
      },
    };
  };

  const handleSaveRow = (row) => {
    const validated = validateRow(row);
    if (!validated.ok) {
      setErrorsMap((prev) => ({ ...prev, [row.id]: validated.errors }));
      return toast.error("Vui lòng kiểm tra lại thông tin");
    }
    const data = validated.data;
    const isNew = row.isNew;
    const actionLabel = isNew ? "Tạo" : "Cập nhật";

    // Optimistic UI: update row in list + close editor
    if (isNew) {
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? {
                ...r,
                ...data,
                isNew: false,
                originalTenSanPham: data.tenSanPham,
                originalNhomHang: data.nhomHang,
                originalDonVi: data.donVi,
              }
            : r,
        ),
      );
    } else {
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? {
                ...r,
                ...data,
                originalTenSanPham: data.tenSanPham,
                originalNhomHang: data.nhomHang,
                originalDonVi: data.donVi,
              }
            : r,
        ),
      );
    }
    setOpenId("");
    setErrorsMap((prev) => {
      const next = { ...prev };
      delete next[row.id];
      return next;
    });
    setSavingKey("");

    const apiCall = isNew
      ? () => createProductCatalogItem(data)
      : () => updateProductCatalogItem({
          originalTenSanPham: row.originalTenSanPham,
          originalDonVi: row.originalDonVi,
          ...data,
        });

    runInBackground({
      apiCall,
      successMessage: `${actionLabel} sản phẩm "${data.tenSanPham}" thành công`,
      changeDescription: `${actionLabel} sản phẩm "${data.tenSanPham}"`,
      userName: user?.name || user?.email || "unknown",
      onComplete: (result) => {
        if (result?.success) {
          formatAllSheets().catch(() => {});
        }
        loadProducts().catch(() => {});
      },
    });
  };

  const handleDeleteRow = (row) => {
    if (row.isNew) {
      removeDraft(row.id);
      return;
    }
    setDeleteTarget(row);
  };

  const confirmDeleteRow = () => {
    const row = deleteTarget;
    if (!row) return;

    const tenSanPham = row.originalTenSanPham || row.tenSanPham;
    const donVi = row.originalDonVi || row.donVi;

    // Optimistic UI: remove from list immediately
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    setOpenId("");
    setDeleteTarget(null);
    setDeletingKey("");

    runInBackground({
      apiCall: () => deleteProductCatalogItem({ tenSanPham, donVi }),
      successMessage: `Đã xóa sản phẩm "${tenSanPham}"`,
      changeDescription: `Xóa sản phẩm "${tenSanPham}"`,
      userName: user?.name || user?.email || "unknown",
      onComplete: (result) => {
        if (result?.success) {
          formatAllSheets().catch(() => {});
        }
        loadProducts().catch(() => {});
      },
    });
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-50 to-rose-50/30">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6 md:py-8 pb-24">
        <div className="mb-6 md:mb-8">
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 leading-tight">
            Danh sách sản phẩm
          </h1>
          <p className="mt-2 text-sm md:text-base text-slate-500">
            Bấm vào sản phẩm để mở chi tiết, lưu hoặc xóa.
          </p>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-sm mb-4">
          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm theo tên sản phẩm hoặc đơn vị..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-rose-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-700/20 transition-all"
            />
            <div className="flex gap-2">
              {/* Toggle ảnh */}
              <button
                type="button"
                onClick={toggleImages}
                className={`rounded-xl border px-3 py-2.5 text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  showImages
                    ? "border-blue-300 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-slate-50 text-slate-400"
                }`}
              >
                <span
                  className={`inline-block w-7 h-4 rounded-full relative transition-colors ${showImages ? "bg-blue-500" : "bg-slate-300"}`}
                >
                  <span
                    className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-all ${showImages ? "left-3.5" : "left-0.5"}`}
                  />
                </span>
                Ảnh
              </button>
              <button
                type="button"
                onClick={addProductDraft}
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-100 whitespace-nowrap"
              >
                + Thêm SP
              </button>
              <button
                type="button"
                onClick={loadProducts}
                className="rounded-xl bg-gradient-to-r from-rose-700 to-rose-500 px-4 py-2.5 text-sm font-semibold text-white hover:shadow-lg hover:shadow-rose-700/25 whitespace-nowrap"
              >
                Tải lại
              </button>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
            Đang tải danh sách sản phẩm...
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
            Không có sản phẩm phù hợp.
          </div>
        ) : (
          <div className="space-y-2">
            {filteredRows.map((row) => {
              const open = openId === row.id;
              return (
                <article
                  key={row.id}
                  className={`rounded-2xl border bg-white shadow-sm overflow-hidden transition-colors ${
                    open ? "border-rose-200" : "border-slate-200"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? "" : row.id)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors ${
                      open
                        ? "bg-rose-50/60 hover:bg-rose-50"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    {/* Thumbnail ảnh */}
                    {showImages && (
                      <div className="flex-shrink-0">
                        {row.anhSanPham ? (
                          <img
                            src={row.anhSanPham}
                            alt=""
                            className="w-11 h-11 rounded-lg object-cover border border-slate-200"
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.src = "";
                              e.target.style.display = "none";
                              e.target.nextElementSibling &&
                                (e.target.nextElementSibling.style.display =
                                  "flex");
                            }}
                          />
                        ) : null}
                        {!row.anhSanPham && (
                          <div className="w-11 h-11 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 text-lg">
                            📦
                          </div>
                        )}
                      </div>
                    )}

                    <span
                      className={`h-6 w-1.5 rounded-full flex-shrink-0 ${open ? "bg-rose-300" : "bg-rose-100"}`}
                    />
                    <div className="min-w-0 flex-1 text-left">
                      <p className="text-sm md:text-base font-bold text-slate-900 truncate">
                        {row.tenSanPham || "Sản phẩm mới"}
                      </p>
                      <p className="text-xs text-slate-500 truncate leading-tight">
                        {row.nhomHang ? `${row.nhomHang} • ` : ""}
                        {row.donVi || "-"}
                        {showInventory && row.tonKho !== undefined && (
                          <span
                            className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold ${toNum(row.tonKho) <= 0 ? "bg-rose-100 text-rose-600" : "bg-emerald-100 text-emerald-600"}`}
                          >
                            Tồn: {row.tonKho}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-semibold text-emerald-700">
                        {fmt(row.donGiaBan)}đ
                      </p>
                    </div>
                    <span
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full border transition-all duration-300 ease-out flex-shrink-0 ${
                        open
                          ? "border-rose-300 bg-rose-100 text-rose-700 -rotate-180"
                          : "border-slate-200 bg-white text-slate-500 rotate-0"
                      }`}
                      aria-hidden="true"
                    >
                      <svg
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="h-4 w-4"
                      >
                        <path
                          fillRule="evenodd"
                          d="M5.23 7.21a.75.75 0 011.06.02L10 11.18l3.71-3.95a.75.75 0 111.1 1.02l-4.25 4.52a.75.75 0 01-1.1 0L5.21 8.25a.75.75 0 01.02-1.04z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </span>
                  </button>

                  {open && (
                    <div className="border-t border-rose-100 bg-rose-50/30 p-4 space-y-3">
                      {/* Image Upload Section */}
                      <div className="pb-2 border-b border-rose-100/60">
                        <ImageUploader
                          currentUrl={row.anhSanPham}
                          onUploaded={(url) =>
                            patchRow(row.id, { anhSanPham: url })
                          }
                          uploading={uploadingImage}
                          setUploading={setUploadingImage}
                        />
                      </div>

                      <div className="grid gap-2 md:gap-3 md:grid-cols-2 lg:grid-cols-3">
                        <LabeledTextInput
                          className="lg:col-span-2"
                          label="Tên sp"
                          value={row.tenSanPham}
                          required
                          maxLength={200}
                          onChange={(e) =>
                            patchRow(row.id, { tenSanPham: e.target.value })
                          }
                          placeholder="Tên sản phẩm"
                          error={errorsMap[row.id]?.tenSanPham}
                        />
                        <LabeledTextInput
                          label="Nhóm hàng"
                          value={row.nhomHang}
                          maxLength={50}
                          onChange={(e) =>
                            patchRow(row.id, { nhomHang: e.target.value })
                          }
                          placeholder="Nhóm hàng"
                        />
                        <LabeledTextInput
                          className="lg:col-span-2"
                          label="Đơn vị"
                          value={row.donVi}
                          onChange={(e) =>
                            patchRow(row.id, { donVi: e.target.value })
                          }
                          placeholder="Đơn vị"
                          error={errorsMap[row.id]?.donVi}
                        />
                        <LabeledMoneyInput
                          className="lg:col-span-2"
                          label="Giá bán"
                          tone="emerald"
                          value={row.donGiaBan}
                          onChange={(v) => patchRow(row.id, { donGiaBan: v })}
                          placeholder="Đơn giá bán"
                          error={errorsMap[row.id]?.donGiaBan}
                        />
                        <LabeledMoneyInput
                          className="lg:col-span-2"
                          label="Giá vốn"
                          tone="rose"
                          value={row.giaVon}
                          onChange={(v) => patchRow(row.id, { giaVon: v })}
                          placeholder="Giá vốn"
                        />
                      </div>

                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleDeleteRow(row)}
                          disabled={
                            deletingKey === row.id ||
                            savingKey === row.id ||
                            uploadingImage
                          }
                          className="rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                        >
                          {deletingKey === row.id ? "Đang xóa..." : "Xóa"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveRow(row)}
                          disabled={
                            savingKey === row.id ||
                            deletingKey === row.id ||
                            uploadingImage
                          }
                          className={`rounded-xl px-4 py-2 text-sm font-semibold text-white ${
                            savingKey === row.id
                              ? "bg-slate-400"
                              : "bg-gradient-to-r from-rose-700 to-rose-500 hover:shadow-lg hover:shadow-rose-700/25"
                          }`}
                        >
                          {savingKey === row.id
                            ? "Đang lưu..."
                            : "Lưu sản phẩm"}
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      {deleteTarget && (
        <div
          className="fixed inset-0 z-[9900] bg-slate-900/45 p-4"
          onClick={() => (deletingKey ? null : setDeleteTarget(null))}
        >
          <div
            className="mx-auto mt-[18vh] w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-1.5 h-5 rounded-full bg-rose-600 shadow-sm mt-0.5"></div>
              <h3 className="text-base font-black text-slate-900 tracking-tight">
                Xác nhận xóa sản phẩm
              </h3>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Bạn sắp xóa sản phẩm{" "}
              <span className="font-semibold text-slate-900">
                {deleteTarget.tenSanPham} ({deleteTarget.donVi || "-"})
              </span>
              .
            </p>
            <p className="mt-1 text-xs text-rose-600">
              Hành động này không thể hoàn tác.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={Boolean(deletingKey)}
                onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-60"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={Boolean(deletingKey)}
                onClick={confirmDeleteRow}
                className="flex-1 rounded-xl bg-gradient-to-r from-rose-700 to-rose-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {deletingKey ? "Đang xóa..." : "Xóa sản phẩm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
