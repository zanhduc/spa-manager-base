import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  CACHE_INVALIDATED_EVENT,
  CACHE_KEYS,
  createInventoryReceipt,
  getNextInventoryReceiptDefaults,
  getProductCatalog,
  getInventorySuggestions,
  getSupplierCatalog,
  formatAllSheets,
} from "../api";
import { runInBackground } from "../api/backgroundApi";
import { normalizeText as foldText } from "../../core/core";

const fmt = (n) => Number(n || 0).toLocaleString("vi-VN");

const toTitleCase = (str) => {
  return String(str || "")
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
    .trim();
};

const RECEIPT_STATUS = {
  PAID: "\u0110\u00e3 thanh to\u00e1n",
  PARTIAL: "Tr\u1ea3 m\u1ed9t ph\u1ea7n",
  DEBT: "N\u1ee3",
};

const RECEIPT_STATUS_OPTIONS = [
  RECEIPT_STATUS.PAID,
  RECEIPT_STATUS.PARTIAL,
  RECEIPT_STATUS.DEBT,
];

const getTodayInputDate = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().split("T")[0];
};

const getReceiptStatusCode = (status) => {
  if (status === RECEIPT_STATUS.PARTIAL) return "PARTIAL";
  if (status === RECEIPT_STATUS.DEBT) return "DEBT";
  return "PAID";
};

const createInitialReceiptInfo = () => ({
  maPhieu: "",
  ngayNhap: getTodayInputDate(),
  ghiChu: "",
  nhaCungCap: "",
  soDienThoai: "",
  trangThai: RECEIPT_STATUS.PAID,
  soTienDaTra: 0,
});

function CurrencyInput({ value, onChange, className }) {
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
      placeholder="0"
      className={className}
    />
  );
}

function ReceiptStatusSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const current = RECEIPT_STATUS_OPTIONS.includes(value)
    ? value
    : RECEIPT_STATUS.PAID;

  useEffect(() => {
    const onDocClick = (e) => {
      if (!e.target.closest("#inventory-status-select")) setOpen(false);
    };
    const onEsc = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("touchstart", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("touchstart", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  return (
    <div id="inventory-status-select" className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-left text-sm text-slate-800 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
      >
        {current}
        <span
          className={`absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <i className="ri-arrow-down-s-line text-lg"></i>
        </span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
          {RECEIPT_STATUS_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${
                option === current
                  ? "bg-emerald-50 font-semibold text-emerald-700"
                  : "text-slate-700 hover:bg-emerald-50"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ProductListItem({ product, onUpdate, onRemove }) {
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState(product);

  if (isEditing) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4 space-y-3 shadow-sm animate-[fadeUp_0.2s_ease]">
        <div className="flex items-center justify-between">
          <p className="font-bold text-slate-800">Sửa hàng hóa</p>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-lg p-1 text-slate-400 hover:bg-rose-100 hover:text-rose-600 transition-colors"
          >
            ❌
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs font-semibold text-slate-500 mb-1 block">
              Tên hàng hóa <span className="text-rose-500">*</span>
            </label>
            <input
              value={form.tenSanPham}
              maxLength={200}
              onChange={(e) => setForm({ ...form, tenSanPham: e.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-rose-500 focus:ring-1 focus:ring-rose-500 outline-none transition-all"
            />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-semibold text-slate-500 mb-1 block">
              Nhóm hàng
            </label>
            <input
              value={form.nhomHang || ""}
              maxLength={50}
              onChange={(e) => setForm({ ...form, nhomHang: e.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-rose-500 focus:ring-1 focus:ring-rose-500 outline-none transition-all"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">
              Đơn vị chẵn <span className="text-rose-500">*</span>
            </label>
            <input
              value={form.donViChan || ""}
              maxLength={20}
              onChange={(e) => setForm({ ...form, donViChan: e.target.value })}
              placeholder="Thùng, Hộp..."
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-rose-500 focus:ring-1 focus:ring-rose-500 outline-none transition-all"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">
              Đơn vị lẻ
            </label>
            <input
              value={form.donViLe || ""}
              maxLength={20}
              onChange={(e) => setForm({ ...form, donViLe: e.target.value })}
              placeholder="Chai, Gói..."
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-rose-500 focus:ring-1 focus:ring-rose-500 outline-none transition-all"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">
              Quy đổi <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              min="1"
              value={form.quyDoi}
              onChange={(e) =>
                setForm({ ...form, quyDoi: parseInt(e.target.value) || 1 })
              }
              placeholder="Ví dụ: 24"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-rose-500 focus:ring-1 focus:ring-rose-500 outline-none transition-all"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">
              Số lượng (chẵn) <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              min="1"
              value={form.soLuong}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 0;
                setForm({ ...form, soLuong: Math.min(val, 100000) });
              }}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-rose-500 focus:ring-1 focus:ring-rose-500 outline-none transition-all"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">
              Giá nhập <span className="text-rose-500">*</span>
            </label>
            <CurrencyInput
              value={form.giaNhapChan}
              onChange={(v) => setForm({ ...form, giaNhapChan: v })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-rose-500 focus:ring-1 focus:ring-rose-500 outline-none transition-all"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              setForm(product);
              setIsEditing(false);
            }}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-white transition-colors"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={() => {
              if (Number(form.giaNhapChan || 0) <= 0) {
                return toast.error("Giá nhập phải lớn hơn 0");
              }
              onUpdate(form);
              setIsEditing(false);
            }}
            className="rounded-xl px-4 py-2 text-sm font-semibold bg-rose-600 text-white hover:bg-rose-700 transition-colors"
          >
            Lưu
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => setIsEditing(true)}
      className="group flex flex-col sm:flex-row sm:items-center justify-between rounded-xl border border-slate-100 bg-white px-4 py-3 hover:border-rose-200 hover:shadow-sm transition-all cursor-pointer gap-2"
    >
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-800 leading-tight group-hover:text-rose-700 transition-colors">
          {product.tenSanPham}{" "}
          <span className="text-slate-400 font-normal">
            ({product.donViChan})
          </span>
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Nhóm: {product.nhomHang || "-"} • Quy đổi: {product.quyDoi}{" "}
          {product.donViLe}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Mã SP: {product.maSanPham || "-"}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
          <span>
            SL:{" "}
            <strong className="text-slate-700">{fmt(product.soLuong)}</strong>{" "}
            {product.donViChan}
            {product.donViLe && product.quyDoi > 1 && (
              <span className="text-xs ml-1 text-slate-400">
                (= {fmt(product.soLuong * product.quyDoi)} {product.donViLe})
              </span>
            )}
          </span>
          <span className="opacity-40">•</span>
          <span>
            Giá:{" "}
            <strong className="text-slate-700">
              {fmt(product.giaNhapChan)}
            </strong>
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between sm:flex-col sm:items-end sm:justify-center shrink-0 border-t border-slate-50 sm:border-0 pt-2 sm:pt-0 mt-1 sm:mt-0">
        <span className="text-xs text-slate-400 sm:hidden">Thành tiền</span>
        <span className="font-bold text-rose-600 tabular-nums">
          {fmt(product.soLuong * product.giaNhapChan)}
        </span>
      </div>
    </div>
  );
}

function SupplierInfoSection({
  receiptInfo,
  onUpdate,
  showSupplierSuggestions,
  onShowSuggestions,
  onHideSuggestions,
  supplierSuggestions,
  onSelectSupplierSuggestion,
  errors = {},
}) {
  const inputCls = (hasError) =>
    `w-full rounded-xl border ${
      hasError ? "border-rose-500 ring-1 ring-rose-500/20" : "border-slate-200"
    } bg-slate-50/50 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 transition-all`;

  return (
    <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-500">
          Tên nhà cung cấp <span className="text-rose-500">*</span>
        </label>
        <div className="relative">
          <input
            type="text"
            placeholder="Nhập tên nhà cung cấp"
            value={receiptInfo.nhaCungCap || ""}
            maxLength={120}
            onFocus={onShowSuggestions}
            onBlur={() => setTimeout(onHideSuggestions, 120)}
            onChange={(e) => {
              onUpdate({ ...receiptInfo, nhaCungCap: e.target.value });
              if (errors.nhaCungCap)
                onUpdate({ ...receiptInfo, nhaCungCap: e.target.value }); // Trigger re-render if needed, but mostly clear error locally if we had local state
            }}
            className={inputCls(!!errors.nhaCungCap)}
          />
          {errors.nhaCungCap && (
            <p className="mt-1 text-[10px] font-semibold text-rose-600 ml-1">
              {errors.nhaCungCap}
            </p>
          )}
          {showSupplierSuggestions && supplierSuggestions.length > 0 && (
            <div className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
              {supplierSuggestions.map((s) => (
                <button
                  key={`${s.tenNCC}-${s.soDienThoai || ""}`}
                  type="button"
                  className="block w-full border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-emerald-50"
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => onSelectSupplierSuggestion(s)}
                >
                  <p className="text-sm font-semibold text-slate-800">
                    {s.tenNCC}
                  </p>
                  <p className="text-xs text-slate-500">
                    {s.soDienThoai || "-"}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-500">
          Số điện thoại NCC
        </label>
        <input
          type="tel"
          placeholder="Nhập số điện thoại"
          value={receiptInfo.soDienThoai || ""}
          maxLength={15}
          onChange={(e) =>
            onUpdate({
              ...receiptInfo,
              soDienThoai: e.target.value.replace(/\D/g, ""),
            })
          }
          className={inputCls(!!errors.soDienThoai)}
        />
      </div>
    </div>
  );
}

export default function InventoryPage({ user }) {
  const [productSuggestions, setProductSuggestions] = useState([]);
  const [supplierCatalog, setSupplierCatalog] = useState([]);
  const [showSupplierSuggestions, setShowSupplierSuggestions] = useState(false);
  const [products, setProducts] = useState([]);
  const [productCatalog, setProductCatalog] = useState([]);
  const [showImages, setShowImages] = useState(
    () => localStorage.getItem("show_product_images") !== "false"
  );

  useEffect(() => {
    const handleImageChange = () => setShowImages(localStorage.getItem("show_product_images") !== "false");
    window.addEventListener("storage", handleImageChange);
    return () => window.removeEventListener("storage", handleImageChange);
  }, []);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showProductSuggestions, setShowProductSuggestions] = useState(false);
  const [isLoadingReceiptDefaults, setIsLoadingReceiptDefaults] =
    useState(true);
  const [errors, setErrors] = useState({});

  const [receiptInfo, setReceiptInfo] = useState(createInitialReceiptInfo);

  const [newProduct, setNewProduct] = useState({
    tenSanPham: "",
    nhomHang: "",
    donViChan: "",
    donViLe: "",
    quyDoi: 1,
    soLuong: 1,
    giaNhapChan: 0,
  });

  const loadReceiptDefaults = async ({ silent = false } = {}) => {
    if (!silent) setIsLoadingReceiptDefaults(true);
    const today = getTodayInputDate();

    try {
      const res = await getNextInventoryReceiptDefaults();
      const maPhieu = String(res?.data?.maPhieu || "").trim() || "NK01";
      const ngayNhap = String(res?.data?.ngayNhap || "").trim() || today;

      setReceiptInfo((prev) => ({
        ...prev,
        maPhieu,
        ngayNhap,
      }));
    } catch (err) {
      setReceiptInfo((prev) => ({
        ...prev,
        maPhieu: prev.maPhieu || "NK01",
        ngayNhap: prev.ngayNhap || today,
      }));
    } finally {
      if (!silent) setIsLoadingReceiptDefaults(false);
    }
  };

  const loadCatalogAndSuggestions = async () => {
    const [catRes, sugRes] = await Promise.all([
      getProductCatalog(),
      getInventorySuggestions(),
    ]);
    let catalog = [];
    if (catRes?.success && Array.isArray(catRes.data)) {
      catalog = catRes.data;
      setProductCatalog(catalog);
    }
    if (sugRes?.success && Array.isArray(sugRes.data)) {
      const suggestionsWithImages = sugRes.data.map((s) => {
        const match = catalog.find(
          (c) => foldText(c.tenSanPham) === foldText(s.tenSanPham),
        );
        return { ...s, anhSanPham: match ? match.anhSanPham : "" };
      });
      setProductSuggestions(suggestionsWithImages);
    }
  };

  const loadSuppliers = async () => {
    const res = await getSupplierCatalog();
    if (res?.success && Array.isArray(res.data)) {
      setSupplierCatalog(res.data);
    }
  };

  useEffect(() => {
    loadReceiptDefaults();

    loadCatalogAndSuggestions().catch(() => {});
    loadSuppliers().catch(() => {});
  }, []);

  useEffect(() => {
    const onInvalidated = (event) => {
      const keys = event?.detail?.keys;
      if (!Array.isArray(keys)) return;
      if (
        keys.includes(CACHE_KEYS.productCatalog) ||
        keys.includes(CACHE_KEYS.inventorySuggestions)
      ) {
        loadCatalogAndSuggestions().catch(() => {});
      }
      if (keys.includes(CACHE_KEYS.supplierCatalog)) {
        loadSuppliers().catch(() => {});
      }
    };
    window.addEventListener(CACHE_INVALIDATED_EVENT, onInvalidated);
    return () =>
      window.removeEventListener(CACHE_INVALIDATED_EVENT, onInvalidated);
  }, []);

  const supplierSuggestions = supplierCatalog
    .filter((s) =>
      foldText(s.tenNCC).includes(foldText(receiptInfo.nhaCungCap)),
    )
    .slice(0, 5);

  const applyMatchedProduct = (current, tenSanPham, matched) => {
    if (!matched) return { ...current, tenSanPham };
    return {
      ...current,
      tenSanPham: tenSanPham || matched.tenSanPham || "",
      nhomHang: matched.nhomHang || "",
      donViChan: matched.donViChan || "",
      quyDoi: matched.quyDoi || 1,
      donViLe: matched.donViLe || matched.donViChan || "",
      giaNhapChan: Number(matched.giaNhapChan || 0),
      soLuong: matched.soLuong ? Number(matched.soLuong) : current.soLuong,
    };
  };

  const handleAddProduct = () => {
    const name = newProduct.tenSanPham.trim();
    const group = String(newProduct.nhomHang || "").trim();

    const donViChan = (newProduct.donViChan || "").trim();
    const donViLe = (newProduct.donViLe || "").trim();
    const qtyChan = Number(newProduct.soLuong) || 0;
    const priceChan = Number(newProduct.giaNhapChan) || 0;

    const newErr = {};
    if (!name) newErr.new_tenSanPham = "Chưa có tên hàng";
    if (!donViChan) newErr.new_donViChan = "Cần đơn vị";
    if (qtyChan <= 0) newErr.new_soLuong = "Sai SL";
    if (qtyChan > 100000) newErr.new_soLuong = "Tối đa 100k";
    if (priceChan <= 0) newErr.new_giaNhapChan = "Sai giá";

    const isDuplicate = products.some(
      (p) =>
        p.tenSanPham.trim().toLowerCase() === name.toLowerCase() &&
        p.donViChan.trim().toLowerCase() === donViChan.toLowerCase(),
    );
    if (isDuplicate) {
      newErr.new_tenSanPham = "Hàng này đã có trong phiếu nhập";
    }

    if (Object.keys(newErr).length > 0) {
      setErrors((p) => ({ ...p, ...newErr }));
      return;
    }

    setProducts((prev) => [
      {
        id: Date.now().toString(),
        tenSanPham: name,
        nhomHang: group,
        donViChan,
        donViLe,
        quyDoi: Number(newProduct.quyDoi) || 1,
        soLuong: qtyChan,
        giaNhapChan: priceChan,
      },
      ...prev,
    ]);

    setErrors((p) => {
      const {
        new_tenSanPham,
        new_donViChan,
        new_soLuong,
        new_giaNhapChan,
        ...rest
      } = p;
      return rest;
    });
    setNewProduct({
      tenSanPham: "",
      nhomHang: "",
      donViChan: "",
      donViLe: "",
      quyDoi: 1,
      soLuong: 1,
      giaNhapChan: 0,
    });
    toast.success("Đã thêm vào phiếu");
  };

  const handleUpdateProduct = (id, updated) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updated } : p)),
    );
  };

  const handleRemoveProduct = (id) => {
    setProducts((prev) => prev.filter((p) => p.id !== id));
  };
  const totalAmount = products.reduce(
    (sum, p) => sum + p.soLuong * (p.giaNhapChan || 0),
    0,
  );
  const totalItems = products.length; // Thay vì sum quantity, đếm số loại mặt hàng

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isLoadingReceiptDefaults)
      return toast.error("Đang tải mã phiếu nhập mới, vui lòng chờ...");

    const newErr = {};
    if (!receiptInfo.nhaCungCap?.trim()) {
      newErr.nhaCungCap = "Vui lòng nhập tên nhà cung cấp";
    }
    if (products.length === 0) {
      toast.error("Vui lòng thêm sản phẩm vào phiếu nhập");
      return;
    }

    if (Object.keys(newErr).length > 0) {
      setErrors(newErr);
      toast.error("Vui lòng kiểm tra lại thông tin");
      return;
    }

    setErrors({});
    if (receiptInfo.trangThai === RECEIPT_STATUS.PARTIAL) {
      const paid = Number(receiptInfo.soTienDaTra || 0);
      if (paid <= 0) return toast.error("Vui lòng nhập số tiền đã trả trước");
      if (paid > totalAmount)
        return toast.error("Số tiền đã trả không được lớn hơn tổng phiếu nhập");
    }

    const payload = {
      receiptInfo: {
        ...receiptInfo,
        trangThaiCode: getReceiptStatusCode(receiptInfo.trangThai),
        soTienDaTra:
          receiptInfo.trangThai === RECEIPT_STATUS.PARTIAL
            ? Number(receiptInfo.soTienDaTra || 0)
            : 0,
      },
      products: products.map((p) => ({
        ...p,
        donVi: p.donViChan,
        soLuong: p.soLuong,
        giaNhap: p.giaNhapChan,
      })),
      user: user?.email || "Unknown",
    };

    const maPhieu = receiptInfo.maPhieu || "";

    // Optimistic UI: clear form immediately
    setProducts([]);
    setReceiptInfo(createInitialReceiptInfo());
    setIsSubmitting(false);

    runInBackground({
      apiCall: () => createInventoryReceipt(payload),
      successMessage: "Tạo phiếu nhập kho thành công!",
      changeDescription: `Tạo phiếu nhập kho "${maPhieu}"`,
      userName: user?.name || user?.email || "unknown",
      onComplete: (result) => {
        if (result?.success && !result?.queued) {
          formatAllSheets().catch(() => {});
        }
        // Reload data in background
        Promise.all([
          loadReceiptDefaults(),
          loadCatalogAndSuggestions(),
          loadSuppliers(),
        ]).catch(() => {});
      },
    });
  };

  const inputCls = (hasError) =>
    `w-full rounded-xl border ${
      hasError ? "border-rose-500 ring-1 ring-rose-500/20" : "border-slate-200"
    } bg-white px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all`;

  return (
    <main className="min-h-screen pb-24 bg-gradient-to-br from-slate-50 via-slate-50 to-emerald-50/30">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6 md:py-8 pb-24">
        {/* Header */}
        <div className="mb-8 md:mb-10 animate-[fadeUp_0.4s_ease] max-w-3xl">
          <div className="inline-flex items-center gap-2 mb-4 md:mb-6">
            <div className="w-3 h-3 rounded-full bg-emerald-600" />
            <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest"></span>
          </div>
          <div className="mb-4 md:mb-6">
            <h1 className="text-4xl md:text-5xl font-black text-slate-900 leading-[1.15] md:leading-[1.2] pb-1 md:pb-2">
              Nhập Hàng
            </h1>
            <h2 className="text-4xl md:text-5xl font-black bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent leading-[1.15] md:leading-[1.2] pb-1">
              Chi Tiêu Gia Đình
            </h2>
          </div>
          <p className="text-sm md:text-base text-slate-500 max-w-md leading-relaxed font-medium">
            Ghi nhận nhập hàng và chi tiêu gia đình theo cùng một luồng vận hành.
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="space-y-5 md:space-y-6 lg:grid lg:grid-cols-12 lg:gap-6 lg:space-y-0"
        >
          <div className="lg:col-span-8 space-y-5 md:space-y-6">
            {/* Receipt Info */}
            <div className="rounded-2xl border border-slate-200/50 bg-gradient-to-br from-white to-white/80 shadow-sm hover:shadow-md transition-all duration-300 hover:border-slate-200 overflow-hidden">
              <div className="bg-emerald-50/80 border-b border-emerald-100/50 px-5 py-4 flex items-center gap-2.5">
                <div className="w-1.5 h-4 rounded-full bg-emerald-600 shadow-sm"></div>
                <h3 className="font-bold text-sm md:text-base text-emerald-800 uppercase tracking-widest mt-0.5">
                  Thông tin phiếu nhập
                </h3>
              </div>
              <div className="p-5 md:p-6 pt-5">
                <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                    Mã phiếu <span className="text-rose-500">*</span>
                  </label>
                  <input
                    value={receiptInfo.maPhieu}
                    maxLength={50}
                    onChange={(e) =>
                      setReceiptInfo((prev) => ({
                        ...prev,
                        maPhieu: e.target.value,
                      }))
                    }
                    placeholder={
                      isLoadingReceiptDefaults
                        ? "Đang tải mã phiếu..."
                        : "Mã phiếu tự động"
                    }
                    className={inputCls(false)}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                    Ngày nhập <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={receiptInfo.ngayNhap}
                    onChange={(e) =>
                      setReceiptInfo((prev) => ({
                        ...prev,
                        ngayNhap: e.target.value,
                      }))
                    }
                    className={inputCls(false)}
                  />
                </div>
                <SupplierInfoSection
                  receiptInfo={receiptInfo}
                  onUpdate={setReceiptInfo}
                  showSupplierSuggestions={showSupplierSuggestions}
                  onShowSuggestions={() => setShowSupplierSuggestions(true)}
                  onHideSuggestions={() => setShowSupplierSuggestions(false)}
                  supplierSuggestions={supplierSuggestions}
                  onSelectSupplierSuggestion={(s) => {
                    setReceiptInfo((prev) => ({
                      ...prev,
                      nhaCungCap: s.tenNCC,
                      soDienThoai: s.soDienThoai,
                    }));
                    if (errors.nhaCungCap)
                      setErrors((p) => {
                        const { nhaCungCap, ...rest } = p;
                        return rest;
                      });
                  }}
                  errors={errors}
                />
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                    Trạng thái <span className="text-rose-500">*</span>
                  </label>
                  <ReceiptStatusSelect
                    value={receiptInfo.trangThai}
                    onChange={(nextStatus) =>
                      setReceiptInfo((prev) => ({
                        ...prev,
                        trangThai: nextStatus,
                        soTienDaTra:
                          nextStatus === RECEIPT_STATUS.PARTIAL
                            ? prev.soTienDaTra
                            : 0,
                      }))
                    }
                  />
                </div>
                {receiptInfo.trangThai === RECEIPT_STATUS.PARTIAL && (
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                      Đã trả trước
                    </label>
                    <CurrencyInput
                      value={Number(receiptInfo.soTienDaTra || 0)}
                      onChange={(v) =>
                        setReceiptInfo((prev) => ({ ...prev, soTienDaTra: v }))
                      }
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                )}
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                    Ghi chú
                  </label>
                  <input
                    value={receiptInfo.ghiChu}
                    maxLength={200}
                    onChange={(e) =>
                      setReceiptInfo((prev) => ({
                        ...prev,
                        ghiChu: e.target.value,
                      }))
                    }
                    placeholder="Ghi chú thêm về lô hàng nhập..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>
              </div>
            </div>

            {/* Add Product Form */}
            <div className="rounded-2xl border border-slate-200/50 bg-gradient-to-br from-white to-white/80 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden">
              <div className="bg-emerald-50/80 border-b border-emerald-100/50 px-5 py-4 flex items-center gap-2.5">
                <div className="w-1.5 h-4 rounded-full bg-emerald-600 shadow-sm"></div>
                <h3 className="font-bold text-sm md:text-base text-emerald-800 uppercase tracking-widest mt-0.5">
                  Thêm mặt hàng nhập
                </h3>
              </div>
              <div className="p-5 md:p-6 pt-5 space-y-4 md:space-y-5">
                <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-2">
                    Tên hàng <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Ví dụ: áo phông trắng, Quần jean..."
                      value={newProduct.tenSanPham}
                      maxLength={200}
                      onFocus={() => setShowProductSuggestions(true)}
                      onBlur={() => {
                        const titleName = toTitleCase(newProduct.tenSanPham);
                        if (titleName !== newProduct.tenSanPham) {
                          setNewProduct((prev) => ({
                            ...prev,
                            tenSanPham: titleName,
                          }));
                        }
                        setTimeout(() => setShowProductSuggestions(false), 120);

                        // Need a custom logic for local filtered logic here similar to getCatalogMatch
                        const q = titleName
                          .toLowerCase()
                          .replace(/[\u0300-\u036f]/g, "")
                          .trim();
                        const matched = productCatalog.find(
                          (p) =>
                            p.tenSanPham
                              ?.toLowerCase()
                              .replace(/[\u0300-\u036f]/g, "")
                              .trim() === q,
                        );

                        if (!matched) return;
                        setNewProduct((prev) =>
                          applyMatchedProduct(prev, titleName, matched),
                        );
                      }}
                      onChange={(e) => {
                        const tenSanPham = e.target.value;
                        setNewProduct((prev) => ({ ...prev, tenSanPham }));
                        if (errors.new_tenSanPham)
                          setErrors((p) => {
                            const { new_tenSanPham, ...rest } = p;
                            return rest;
                          });
                      }}
                      className={inputCls(!!errors.new_tenSanPham)}
                    />
                    {errors.new_tenSanPham && (
                      <p className="mt-1 text-[10px] font-semibold text-rose-600 ml-1">
                        {errors.new_tenSanPham}
                      </p>
                    )}
                    {showProductSuggestions &&
                      productSuggestions.filter((p) =>
                        p.tenSanPham
                          .toLowerCase()
                          .includes(newProduct.tenSanPham.toLowerCase()),
                      ).length > 0 && (
                        <div className="absolute top-full left-0 right-0 z-[60] mt-2 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
                          <div className="max-h-[300px] overflow-y-auto scrollbar-thin overflow-x-hidden p-2 space-y-1">
                            {productSuggestions
                              .filter((p) =>
                                p.tenSanPham
                                  .toLowerCase()
                                  .includes(
                                    newProduct.tenSanPham.toLowerCase(),
                                  ),
                              )
                              .slice(0, 8)
                              .map((p, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  className="w-full text-left p-3 rounded-xl hover:bg-slate-50 transition-colors duration-200 group"
                                  onClick={() => {
                                    setNewProduct((prev) =>
                                      applyMatchedProduct(
                                        prev,
                                        prev.tenSanPham,
                                        p,
                                      ),
                                    );
                                    setShowProductSuggestions(false);
                                  }}
                                >
                                  <div className="flex justify-between items-start gap-3">
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      {showImages && p.anhSanPham ? (
                                        <img
                                          src={p.anhSanPham}
                                          alt=""
                                          className="w-8 h-8 rounded-md object-cover border border-slate-200 flex-shrink-0"
                                          onError={(e) => { e.target.style.display = "none"; }}
                                        />
                                      ) : showImages ? (
                                        <div className="w-8 h-8 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 text-xs flex-shrink-0">
                                          📦
                                        </div>
                                      ) : null}
                                      <div className="flex-1 min-w-0">
                                        <h4 className="font-bold text-slate-800 text-sm group-hover:text-blue-600 transition-colors truncate">
                                          {p.tenSanPham}
                                        </h4>
                                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                                        {p.nhomHang && (
                                          <span className="text-[10px] font-medium text-slate-500 flex items-center gap-1 uppercase tracking-wider">
                                            <i className="ri-folder-line opacity-70" />
                                            {p.nhomHang}
                                          </span>
                                        )}
                                        <span className="text-[10px] font-medium text-blue-600 flex items-center gap-1 uppercase tracking-wider">
                                          <i className="ri-scales-line opacity-70" />
                                          {p.donViChan}
                                        </span>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                      <div className="text-[11px] font-bold text-slate-700">
                                        {fmt(p.giaNhapChan)}
                                      </div>
                                      <div className="text-[9px] text-slate-400 font-medium">
                                        Vốn ({p.donViChan})
                                      </div>
                                    </div>
                                  </div>
                                </button>
                              ))}
                          </div>
                        </div>
                      )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 md:gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-800 mb-2">
                      Nhóm hàng
                    </label>
                    <input
                      type="text"
                      placeholder="Nước, Bánh kẹo..."
                      value={newProduct.nhomHang}
                      maxLength={50}
                      onChange={(e) =>
                        setNewProduct({
                          ...newProduct,
                          nhomHang: e.target.value,
                        })
                      }
                      className={inputCls(false)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-800 mb-2">
                      Đơn vị chẵn <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Thùng, Hộp..."
                      value={newProduct.donViChan}
                      maxLength={20}
                      onChange={(e) => {
                        setNewProduct({
                          ...newProduct,
                          donViChan: e.target.value,
                        });
                        if (errors.new_donViChan)
                          setErrors((p) => {
                            const { new_donViChan, ...rest } = p;
                            return rest;
                          });
                      }}
                      className={inputCls(!!errors.new_donViChan)}
                    />
                    {errors.new_donViChan && (
                      <p className="mt-1 text-[10px] font-semibold text-rose-600 ml-1">
                        {errors.new_donViChan}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-800 mb-2">
                      Đơn vị lẻ
                    </label>
                    <input
                      type="text"
                      placeholder="Chai, Gói..."
                      value={newProduct.donViLe}
                      maxLength={20}
                      onChange={(e) =>
                        setNewProduct({
                          ...newProduct,
                          donViLe: e.target.value,
                        })
                      }
                      className={inputCls(false)}
                    />
                  </div>
                  <div className="col-span-2 lg:col-span-1">
                    <label className="block text-sm font-semibold text-slate-800 mb-2">
                      Quy đổi <span className="text-rose-500">*</span> (
                      {newProduct.donViChan || "Chẵn"} →{" "}
                      {newProduct.donViLe || "Lẻ"})
                    </label>
                    <input
                      type="number"
                      min="1"
                      placeholder="24"
                      value={newProduct.quyDoi}
                      onChange={(e) =>
                        setNewProduct({
                          ...newProduct,
                          quyDoi:
                            e.target.value === ""
                              ? ""
                              : parseInt(e.target.value, 10) || 0,
                        })
                      }
                      onBlur={() => {
                        if (newProduct.quyDoi === "" || newProduct.quyDoi < 1)
                          setNewProduct((prev) => ({ ...prev, quyDoi: 1 }));
                      }}
                      className={inputCls(false)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 md:gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-800 mb-2">
                      Số lượng ({newProduct.donViChan || "chẵn"}){" "}
                      <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      placeholder="1"
                      min="1"
                      value={newProduct.soLuong}
                      onChange={(e) => {
                        const val =
                          e.target.value === ""
                            ? ""
                            : parseInt(e.target.value, 10) || 0;
                        setNewProduct({
                          ...newProduct,
                          soLuong: val === "" ? "" : Math.min(val, 100000),
                        });
                        if (errors.new_soLuong)
                          setErrors((p) => {
                            const { new_soLuong, ...rest } = p;
                            return rest;
                          });
                      }}
                      onBlur={() => {
                        if (newProduct.soLuong === "" || newProduct.soLuong < 1)
                          setNewProduct((prev) => ({ ...prev, soLuong: 1 }));
                      }}
                      className={inputCls(!!errors.new_soLuong)}
                    />
                    {errors.new_soLuong && (
                      <p className="mt-1 text-[10px] font-semibold text-rose-600 ml-1">
                        {errors.new_soLuong}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-800 mb-2">
                      Giá nhập ({newProduct.donViChan || "chẵn"}){" "}
                      <span className="text-rose-500">*</span>
                    </label>
                    <CurrencyInput
                      value={newProduct.giaNhapChan}
                      maxLength={20}
                      onChange={(v) => {
                        setNewProduct({ ...newProduct, giaNhapChan: v });
                        if (errors.new_giaNhapChan)
                          setErrors((p) => {
                            const { new_giaNhapChan, ...rest } = p;
                            return rest;
                          });
                      }}
                      className={inputCls(!!errors.new_giaNhapChan)}
                    />
                    {errors.new_giaNhapChan && (
                      <p className="mt-1 text-[10px] font-semibold text-rose-600 ml-1">
                        {errors.new_giaNhapChan}
                      </p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddProduct}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-4 py-3 font-semibold text-white hover:shadow-lg hover:shadow-emerald-600/25 transition-all duration-300 active:scale-95"
                >
                  Thêm vào phiếu
                </button>
              </div>
              </div>
            </div>

            {/* Mobile Products List */}
            {products.length > 0 && (
              <>
                <div className="flex items-center justify-between lg:hidden">
                  <div>
                    <h2 className="text-xl md:text-2xl font-bold text-slate-800">
                      Thông tin phiếu
                    </h2>
                    <p className="text-xs md:text-sm text-slate-500 mt-1">
                      Mặt hàng đang chờ nhập
                    </p>
                  </div>
                  <div className="flex items-center justify-center min-w-[40px] px-2 h-10 md:h-12 rounded-xl bg-emerald-100 text-emerald-700 font-bold shadow-sm">
                    {totalItems}
                  </div>
                </div>
                <div className="space-y-3 lg:hidden">
                  {products.map((product) => (
                    <ProductListItem
                      key={product.id}
                      product={product}
                      onUpdate={(updated) =>
                        handleUpdateProduct(product.id, updated)
                      }
                      onRemove={() => handleRemoveProduct(product.id)}
                    />
                  ))}
                </div>
              </>
            )}

            {products.length === 0 && (
              <div className="rounded-2xl border border-slate-200/50 bg-gradient-to-br from-slate-50/50 to-slate-100/30 p-8 md:p-12 text-center lg:hidden">
                <div className="flex justify-center mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-600/10 flex items-center justify-center text-2xl">
                    📦
                  </div>
                </div>
                <p className="text-base font-semibold text-slate-800 mb-1">
                  Phiếu trống
                </p>
                <p className="text-sm text-slate-500">
                  Thêm mặt hàng để bắt đầu
                </p>
              </div>
            )}
          </div>

          <aside className="lg:col-span-4 lg:sticky lg:top-6 self-start space-y-4">
            {products.length > 0 && (
              <div className="hidden lg:flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white p-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">
                    Hàng nhập
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Tổng cộng {totalItems} sản phẩm
                  </p>
                </div>
              </div>
            )}
            {products.length > 0 && (
              <div className="hidden lg:block space-y-3 max-h-[48vh] overflow-y-auto pr-1">
                {products.map((product) => (
                  <ProductListItem
                    key={`desktop-${product.id}`}
                    product={product}
                    onUpdate={(updated) =>
                      handleUpdateProduct(product.id, updated)
                    }
                    onRemove={() => handleRemoveProduct(product.id)}
                  />
                ))}
              </div>
            )}

            <div className="rounded-2xl border border-slate-200/70 bg-white overflow-hidden shadow-sm">
              <div className="bg-emerald-50/50 px-5 py-4 border-b border-emerald-100">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-emerald-800 uppercase tracking-wide">
                    Tổng tiền hàng
                  </span>
                  <span className="text-2xl font-black text-emerald-600 tabular-nums tracking-tight">
                    {fmt(totalAmount)}
                  </span>
                </div>
              </div>
            </div>

            {products.length > 0 ? (
              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full rounded-xl px-6 py-4 font-bold text-white text-base md:text-lg transition-all duration-300 active:scale-95 ${
                  isSubmitting
                    ? "bg-slate-400 cursor-not-allowed"
                    : "bg-gradient-to-r from-emerald-600 to-teal-500 hover:shadow-lg hover:shadow-emerald-600/25"
                }`}
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Đang lưu...
                  </span>
                ) : (
                  "Lưu Phiếu Nhập"
                )}
              </button>
            ) : (
              <div className="hidden lg:block rounded-2xl border border-slate-200/70 bg-slate-50/50 p-8 text-center text-sm text-slate-500">
                <div className="flex justify-center mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-600/10 flex items-center justify-center text-2xl">
                    📦
                  </div>
                </div>
                Thêm mặt hàng để lưu phiếu
              </div>
            )}
          </aside>
        </form>
      </div>
    </main>
  );
}
