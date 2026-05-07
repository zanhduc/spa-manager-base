import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  CACHE_INVALIDATED_EVENT,
  CACHE_KEYS,
  deleteOrder,
  getCustomerCatalog,
  getSupplierCatalog,
  getDebtCustomers,
  updateDebtCustomer,
  updateSupplierDebt,
  getSupplierDebts,
  getAppSetting,
  formatAllSheets,
} from "../api";
import { runInBackground } from "../api/backgroundApi";
import { useUser } from "../context";
import {
  formatMoney as fmt,
  parseNumber as toNum,
  normalizeText as foldText,
  isGuestCustomer,
  toIsoDate,
} from "../../core/core";

function MoneyInput({ value, onChange }) {
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
      className="w-full h-11 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-1.5 text-sm text-slate-800 focus:border-rose-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-700/20 transition-all"
    />
  );
}

function StatusBadge({ status }) {
  const s = foldText(status);
  if (s.includes("da thanh toan")) {
    return (
      <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
        Đã thanh toán
      </span>
    );
  }
  if (s.includes("tra mot phan") || s.includes("tra 1 phan")) {
    return (
      <span className="inline-flex rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-700">
        Trả một phần
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
      Nợ
    </span>
  );
}

function StatusSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const options = ["Đã thanh toán", "Trả một phần", "Nợ"];
  const current =
    options.find((x) => foldText(x) === foldText(value)) || options[0];

  useEffect(() => {
    const onDocClick = (e) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("touchstart", onDocClick);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("touchstart", onDocClick);
    };
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full h-11 rounded-xl border border-slate-200 bg-slate-50/60 px-3 pr-10 text-left text-sm text-slate-800 focus:border-rose-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-700/20 transition-all"
      >
        {current}
        <span
          className={`absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${
                foldText(opt) === foldText(current)
                  ? "bg-rose-50 text-rose-700 font-semibold"
                  : "text-slate-700 hover:bg-rose-50"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterStatusSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const options = ["ALL", "Đã thanh toán", "Trả một phần", "Nợ"];
  const current =
    options.find((x) => foldText(x) === foldText(value)) || options[0];

  useEffect(() => {
    const onDocClick = (e) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("touchstart", onDocClick);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("touchstart", onDocClick);
    };
  }, []);

  const renderLabel = (opt) => (opt === "ALL" ? "Tất cả trạng thái" : opt);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full h-11 rounded-xl border border-slate-200 bg-slate-50/60 px-3 pr-10 text-left text-sm text-slate-800 focus:border-rose-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-700/20 transition-all"
      >
        {renderLabel(current)}
        <span
          className={`absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${
                foldText(opt) === foldText(current)
                  ? "bg-rose-50 text-rose-700 font-semibold"
                  : "text-slate-700 hover:bg-rose-50"
              }`}
            >
              {renderLabel(opt)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EditDebtModal({
  row,
  saving,
  deleting,
  settling,
  onClose,
  onSave,
  onDelete,
  onSettle,
  catalog = [],
  isSupplier = false,
}) {
  const [form, setForm] = useState(() => ({
    maPhieuOriginal: row.maPhieu,
    name: isSupplier ? row.nhaCungCap || "" : row.tenKhach || "",
    soDienThoai: String(row.soDienThoai || ""),
    maPhieu: row.maPhieu || "",
    date: toIsoDate(isSupplier ? row.ngayNhap : row.ngayBan),
    tienNo: toNum(row.tienNo),
    trangThai: String(row.trangThai || "Nợ"),
    ghiChu: String(row.ghiChu || "-"),
  }));
  const [errors, setErrors] = useState({});
  const [showSuggest, setShowSuggest] = useState(false);

  const validate = () => {
    const newErrors = {};
    if (!form.name?.trim()) {
      newErrors.name = isSupplier
        ? "Tên nhà cung cấp không được để trống"
        : "Tên khách hàng không được để trống";
    }
    if (!form.maPhieu?.trim()) {
      newErrors.maPhieu = "Mã phiếu không được để trống";
    }
    if (!form.date) {
      newErrors.date = "Ngày không được để trống";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSaveClick = () => {
    if (validate()) {
      onSave(form);
    } else {
      toast.error("Vui lòng kiểm tra lại thông tin");
    }
  };

  const getSuggestions = (query) => {
    const q = foldText(query);
    if (!q) return (catalog || []).slice(0, 8);
    return (catalog || [])
      .filter(
        (c) =>
          foldText(isSupplier ? c.tenNCC : c.tenKhach).includes(q) ||
          foldText(c.soDienThoai).includes(q),
      )
      .slice(0, 8);
  };

  return (
    <div
      className="fixed inset-0 z-[9800] bg-slate-900/45 p-3 md:p-6"
      onClick={onClose}
    >
      <div
        className="mx-auto max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-slate-200 px-4 py-3 md:px-5 text-left">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-1.5 h-5 rounded-full bg-rose-600 shadow-sm mt-0.5"></div>
              <h3 className="text-base md:text-lg font-black text-slate-900 tracking-tight">
                {isSupplier
                  ? "Sửa công nợ nhà cung cấp"
                  : "Sửa công nợ khách hàng"}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100"
            >
              Đóng
            </button>
          </div>
        </div>

        <div className="p-4 md:p-5 space-y-3 text-left">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="relative">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                {isSupplier ? "Tên nhà cung cấp" : "Tên khách hàng"}
              </label>
              <input
                value={form.name}
                onChange={(e) => {
                  setForm((p) => ({ ...p, name: e.target.value }));
                  if (errors.name) setErrors((p) => ({ ...p, name: "" }));
                  setShowSuggest(true);
                }}
                onFocus={() => setShowSuggest(true)}
                onBlur={() => setTimeout(() => setShowSuggest(false), 120)}
                placeholder={isSupplier ? "Tên nhà cung cấp" : "Tên khách hàng"}
                className={`w-full h-11 rounded-xl border bg-slate-50/60 px-3 py-1.5 text-sm text-slate-800 focus:bg-white focus:outline-none focus:ring-2 transition-all ${
                  errors.name
                    ? "border-rose-500 focus:ring-rose-500/20"
                    : "border-slate-200 focus:border-rose-700 focus:ring-rose-700/20"
                }`}
              />
              {errors.name && (
                <p className="mt-1 text-[10px] font-semibold text-rose-600 ml-1">
                  {errors.name}
                </p>
              )}
              {showSuggest && getSuggestions(form.name).length > 0 && (
                <div className="absolute z-30 mt-1 w-full rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                  {getSuggestions(form.name).map((c) => (
                    <button
                      key={`${isSupplier ? c.tenNCC : c.tenKhach}-${c.soDienThoai}`}
                      type="button"
                      onMouseDown={(ev) => ev.preventDefault()}
                      onClick={() => {
                        setForm((p) => ({
                          ...p,
                          name: (isSupplier ? c.tenNCC : c.tenKhach) || "",
                          soDienThoai: String(c.soDienThoai || ""),
                        }));
                        setShowSuggest(false);
                      }}
                      className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-rose-50"
                    >
                      <p className="text-sm font-semibold text-slate-800">
                        {isSupplier ? c.tenNCC : c.tenKhach}
                      </p>
                      <p className="text-xs text-slate-500">
                        {c.soDienThoai || "-"}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Số điện thoại
              </label>
              <input
                value={form.soDienThoai}
                onChange={(e) =>
                  setForm((p) => ({ ...p, soDienThoai: e.target.value }))
                }
                placeholder="Số điện thoại"
                className="w-full h-11 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-1.5 text-sm text-slate-800 focus:border-rose-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-700/20 transition-all"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Mã phiếu
              </label>
              <input
                value={form.maPhieu}
                onChange={(e) => {
                  setForm((p) => ({ ...p, maPhieu: e.target.value }));
                  if (errors.maPhieu) setErrors((p) => ({ ...p, maPhieu: "" }));
                }}
                placeholder="Mã phiếu"
                className={`w-full h-11 rounded-xl border bg-slate-50/60 px-3 py-1.5 text-sm text-slate-800 focus:bg-white focus:outline-none focus:ring-2 transition-all ${
                  errors.maPhieu
                    ? "border-rose-500 focus:ring-rose-500/20"
                    : "border-slate-200 focus:border-rose-700 focus:ring-rose-700/20"
                }`}
                readOnly
              />
              {errors.maPhieu && (
                <p className="mt-1 text-[10px] font-semibold text-rose-600 ml-1">
                  {errors.maPhieu}
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                {isSupplier ? "Ngày nhập" : "Ngày bán"}
              </label>
              <input
                type="date"
                lang="en-GB"
                value={form.date}
                onChange={(e) => {
                  setForm((p) => ({ ...p, date: e.target.value }));
                  if (errors.date) setErrors((p) => ({ ...p, date: "" }));
                }}
                className={`w-full h-11 rounded-xl border bg-slate-50/60 px-3 pr-10 py-1.5 text-sm text-slate-800 focus:bg-white focus:outline-none focus:ring-2 transition-all ${
                  errors.date
                    ? "border-rose-500 focus:ring-rose-500/20"
                    : "border-slate-200 focus:border-rose-700 focus:ring-rose-700/20"
                }`}
              />
              {errors.date && (
                <p className="mt-1 text-[10px] font-semibold text-rose-600 ml-1">
                  {errors.date}
                </p>
              )}
            </div>
            {!foldText(form.trangThai).includes("da thanh toan") && (
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Tiền nợ
                </label>
                <MoneyInput
                  value={form.tienNo}
                  onChange={(v) => setForm((p) => ({ ...p, tienNo: v }))}
                />
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Trạng thái
              </label>
              <StatusSelect
                value={form.trangThai}
                onChange={(next) =>
                  setForm((p) => ({
                    ...p,
                    trangThai: next,
                    tienNo: foldText(next).includes("da thanh toan")
                      ? 0
                      : p.tienNo,
                  }))
                }
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Ghi chú
            </label>
            <textarea
              rows={3}
              value={form.ghiChu}
              onChange={(e) =>
                setForm((p) => ({ ...p, ghiChu: e.target.value }))
              }
              placeholder="Ghi chú"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-slate-800 resize-none focus:border-rose-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-700/20 transition-all"
            />
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-200 p-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={saving || deleting || settling}
            onClick={onDelete}
            className="rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
          >
            {deleting ? "Đang xóa..." : "Xóa"}
          </button>

          {/* <button
            type="button"
            disabled={
              saving ||
              deleting ||
              settling ||
              foldText(form.trangThai).includes("da thanh toan")
            }
            onClick={() => onSettle(form)}
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 disabled:opacity-60"
          >
            {settling
              ? isSupplier
                ? "Đang trả..."
                : "Đang thu..."
              : isSupplier
                ? "Trả công nợ"
                : "Thu công nợ"}
          </button> */}

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-6 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Hủy
          </button>

          <button
            type="button"
            disabled={saving || deleting || settling}
            onClick={handleSaveClick}
            className={`min-w-[120px] rounded-xl px-6 py-2.5 text-sm font-semibold text-white ${
              saving
                ? "bg-slate-400"
                : "bg-gradient-to-r from-rose-700 to-rose-500"
            }`}
          >
            {saving ? "Đang lưu..." : "Lưu thay đổi"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DebtPage() {
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [settlingKey, setSettlingKey] = useState("");
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [customerCatalog, setCustomerCatalog] = useState([]);
  const [supplierCatalog, setSupplierCatalog] = useState([]);
  const [activeTab, setActiveTab] = useState("customers");
  const [showSupplierTab, setShowSupplierTab] = useState(false);
  const [settleConfirmTarget, setSettleConfirmTarget] = useState(null);
  const shouldShowGuestDebtRow = (row) => {
    if (!isGuestCustomer(row?.tenKhach)) return true;
    const statusKey = foldText(row?.trangThai || "");
    const isDebtStatus =
      statusKey.includes("no") ||
      statusKey.includes("tra mot phan") ||
      statusKey.includes("tra 1 phan");
    return isDebtStatus || toNum(row?.tienNo) > 0;
  };

  const loadDebts = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      if (activeTab === "customers") {
        const res = await getDebtCustomers();
        if (res?.success && Array.isArray(res.data)) {
          setRows(res.data.filter(shouldShowGuestDebtRow));
        } else {
          setRows([]);
          if (res?.message) toast.error(res.message);
        }
      } else {
        const res = await getSupplierDebts();
        if (res?.success && Array.isArray(res.data)) {
          setRows(res.data);
        } else {
          setRows([]);
          if (res?.message) toast.error(res.message);
        }
      }
    } catch (e) {
      setRows([]);
      toast.error("Không tải được dữ liệu công nợ");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadCatalogs = async () => {
    try {
      const [cusRes, supRes] = await Promise.all([
        getCustomerCatalog(),
        getSupplierCatalog(),
      ]);
      if (cusRes?.success && Array.isArray(cusRes.data))
        setCustomerCatalog(cusRes.data);
      if (supRes?.success && Array.isArray(supRes.data))
        setSupplierCatalog(supRes.data);
    } catch (e) {
      console.warn("Không tải được catalog khách/NCC:", e);
    }
  };

  const checkInventorySetting = async () => {
    try {
      const res = await getAppSetting("enable_inventory");
      if (res?.success) {
        setShowSupplierTab(res.data === "true");
      }
    } catch (e) {
      console.warn("Không đọc được setting enable_inventory:", e);
    }
  };

  useEffect(() => {
    loadDebts();
  }, [activeTab]);

  useEffect(() => {
    loadCatalogs();
    checkInventorySetting();

    const handler = (e) => setShowSupplierTab(Boolean(e.detail));
    window.addEventListener("inventory_setting_changed", handler);
    return () =>
      window.removeEventListener("inventory_setting_changed", handler);
  }, []);

  useEffect(() => {
    const onInvalidated = (event) => {
      const keys = event?.detail?.keys;
      if (!Array.isArray(keys)) return;

      if (
        keys.includes(CACHE_KEYS.customerCatalog) ||
        keys.includes(CACHE_KEYS.supplierCatalog)
      ) {
        loadCatalogs();
      }

      const shouldReloadDebts =
        (activeTab === "customers" &&
          (keys.includes(CACHE_KEYS.debtCustomers) ||
            keys.includes(CACHE_KEYS.orderHistory))) ||
        (activeTab === "suppliers" &&
          (keys.includes(CACHE_KEYS.supplierDebts) ||
            keys.includes(CACHE_KEYS.receiptHistory)));

      if (shouldReloadDebts) {
        loadDebts({ silent: true });
      }
    };
    window.addEventListener(CACHE_INVALIDATED_EVENT, onInvalidated);
    return () =>
      window.removeEventListener(CACHE_INVALIDATED_EVENT, onInvalidated);
  }, [activeTab]);

  const filteredRows = useMemo(() => {
    const q = foldText(query);
    const isSup = activeTab === "suppliers";
    return rows.filter((r) => {
      if (!isSup && !shouldShowGuestDebtRow(r)) return false;
      if (
        statusFilter !== "ALL" &&
        foldText(r.trangThai) !== foldText(statusFilter)
      )
        return false;
      if (!q) return true;
      const name = isSup ? r.nhaCungCap : r.tenKhach;
      const date = isSup ? r.ngayNhap : r.ngayBan;
      const text = `${name} ${r.soDienThoai} ${r.maPhieu} ${date} ${r.ghiChu}`;
      return foldText(text).includes(q);
    });
  }, [rows, query, statusFilter, activeTab]);

  const totalDebt = useMemo(
    () =>
      filteredRows.reduce((sum, r) => sum + Math.max(toNum(r.tienNo), 0), 0),
    [filteredRows],
  );

  const debtCustomerCount = useMemo(() => {
    const seen = new Set();
    for (let i = 0; i < filteredRows.length; i++) {
      const r = filteredRows[i];
      if (toNum(r.tienNo) <= 0) continue;
      const key = `${foldText(r.tenKhach)}||${String(r.soDienThoai || "").replace(/[^\d]/g, "")}`;
      seen.add(key);
    }
    return seen.size;
  }, [filteredRows]);

  const canSettleRow = (r) => {
    const key = foldText(r.trangThai);
    return (
      key.includes("no") || key.includes("tra mot phan") || toNum(r.tienNo) > 0
    );
  };

  const handleSave = (form) => {
    const maPhieu = String(form.maPhieu || "").trim();
    if (!maPhieu) return toast.error("Mã phiếu không được để trống");
    const name = String(form.name || "").trim();
    if (!name)
      return toast.error(
        activeTab === "suppliers"
          ? "Tên nhà cung cấp không được để trống"
          : "Tên khách không được để trống",
      );

    const isSup = activeTab === "suppliers";

    // Optimistic UI: update row + close modal
    setRows((prev) =>
      prev.map((r) =>
        String(r.maPhieu || "").trim() === String(form.maPhieuOriginal || "").trim()
          ? {
              ...r,
              ...(isSup ? { nhaCungCap: name, ngayNhap: form.date } : { tenKhach: name, ngayBan: form.date }),
              soDienThoai: String(form.soDienThoai || "").trim(),
              tienNo: foldText(form.trangThai).includes("da thanh toan") ? 0 : Math.max(toNum(form.tienNo), 0),
              trangThai: form.trangThai,
              ghiChu: String(form.ghiChu || "-").trim() || "-",
            }
          : r,
      ),
    );
    setEditing(null);
    setSaving(false);

    const payload = {
      maPhieuOriginal: form.maPhieuOriginal,
      soDienThoai: String(form.soDienThoai || "").trim(),
      maPhieu,
      tienNo: Math.max(toNum(form.tienNo), 0),
      trangThai: form.trangThai,
      ghiChu: String(form.ghiChu || "-").trim() || "-",
    };

    const apiCall = isSup
      ? () => updateSupplierDebt({ ...payload, nhaCungCap: name, ngayNhap: form.date || "" })
      : () => updateDebtCustomer({ ...payload, tenKhach: name, ngayBan: form.date || "" });

    const label = isSup ? "nhà cung cấp" : "khách hàng";

    runInBackground({
      apiCall,
      successMessage: `Cập nhật công nợ ${label} "${name}" thành công`,
      changeDescription: `Cập nhật công nợ ${label} "${name}" (${maPhieu})`,
      userName: user?.name || user?.email || "unknown",
      onComplete: (result) => {
        if (result?.success) {
          formatAllSheets().catch(() => {});
        }
        loadDebts().catch(() => {});
      },
    });
  };

  const handleDeleteRequest = () => {
    if (!editing?.maPhieu) return;
    setDeleteTarget(editing);
  };

  const confirmDeleteOrder = () => {
    const key = String(deleteTarget?.maPhieu || "").trim();
    if (!key) return;

    // Optimistic UI: remove from list immediately
    setRows((prev) => prev.filter((r) => String(r.maPhieu || "").trim() !== key));
    setDeleteTarget(null);
    setEditing(null);
    setDeleting(false);

    runInBackground({
      apiCall: () => deleteOrder(key),
      successMessage: `Đã xóa hóa đơn ${key}`,
      changeDescription: `Xóa hóa đơn công nợ "${key}"`,
      userName: user?.name || user?.email || "unknown",
      onComplete: (result) => {
        if (result?.success) {
          formatAllSheets().catch(() => {});
        }
        loadDebts().catch(() => {});
      },
    });
  };

  const handleQuickSettle = (target) => {
    const maPhieuKey = String(
      target?.maPhieuOriginal || target?.maPhieu || "",
    ).trim();
    if (!maPhieuKey) return toast.error("Thiếu mã phiếu");

    const isSup = activeTab === "suppliers";
    const name = isSup
      ? String(target.nhaCungCap || "").trim()
      : String(target.tenKhach || "").trim();

    // Optimistic UI: mark as paid immediately
    setRows((prev) =>
      prev.map((r) =>
        String(r.maPhieu || "").trim() === maPhieuKey
          ? { ...r, tienNo: 0, trangThai: "Đã thanh toán" }
          : r,
      ),
    );
    if (editing && String(editing.maPhieu || "").trim() === maPhieuKey)
      setEditing(null);
    setSettlingKey("");

    const payload = {
      maPhieuOriginal: maPhieuKey,
      soDienThoai: String(target.soDienThoai || "").trim(),
      maPhieu: String(target.maPhieu || maPhieuKey).trim() || maPhieuKey,
      tienNo: 0,
      trangThai: "Đã thanh toán",
      ghiChu: String(target.ghiChu || "-").trim() || "-",
    };

    const apiCall = isSup
      ? () => updateSupplierDebt({
          ...payload,
          nhaCungCap: String(target.nhaCungCap || "").trim(),
          ngayNhap: target.ngayNhap || "",
        })
      : () => updateDebtCustomer({
          ...payload,
          tenKhach: String(target.tenKhach || "").trim(),
          ngayBan: target.ngayBan || "",
        });

    const label = isSup ? "Trả nợ" : "Thu công nợ";

    runInBackground({
      apiCall,
      successMessage: `${label} "${name}" thành công`,
      changeDescription: `${label} "${name}" (${maPhieuKey})`,
      userName: user?.name || user?.email || "unknown",
      onComplete: (result) => {
        if (result?.success) {
          formatAllSheets().catch(() => {});
        }
        loadDebts().catch(() => {});
      },
    });
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-50 to-rose-50/30">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6 md:py-8 pb-24">
        <div className="mb-6 md:mb-8">
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 leading-tight">
            Quản lý công nợ
          </h1>
          <p className="mt-2 text-sm md:text-base text-slate-500">
            Theo dõi tiền nợ và chỉnh sửa thông tin khách hàng trực tiếp.
          </p>
        </div>

        {showSupplierTab && (
          <div className="flex p-1 bg-slate-200/50 rounded-2xl mb-6 max-w-sm">
            <button
              onClick={() => setActiveTab("customers")}
              className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all ${
                activeTab === "customers"
                  ? "bg-white text-rose-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Khách hàng Nợ
            </button>
            <button
              onClick={() => setActiveTab("suppliers")}
              className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all ${
                activeTab === "suppliers"
                  ? "bg-white text-rose-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Nợ Nhà cung cấp
            </button>
          </div>
        )}

        <section className="grid gap-3 md:grid-cols-2 mb-4">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {activeTab === "suppliers"
                ? "Tổng nhà cung cấp/đơn"
                : "Tổng khách/đơn"}
            </p>
            <p className="mt-1 text-2xl font-black text-slate-900">
              {filteredRows.length}
            </p>
            <p className="mt-1 text-xs font-semibold text-rose-700">
              {activeTab === "suppliers" ? "Số NCC nợ: " : "Số khách nợ: "}
              {debtCustomerCount}
            </p>
          </div>
          <div className="rounded-2xl border border-rose-200 bg-rose-50/50 px-4 py-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
              Tổng tiền nợ
            </p>
            <p className="mt-1 text-2xl font-black text-rose-700">
              {fmt(totalDebt)}
            </p>
            {statusFilter !== "ALL" && (
              <p className="mt-1 text-xs font-semibold text-rose-700">
                Trạng thái: {statusFilter}
              </p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-sm mb-4">
          <div className="grid gap-2 md:grid-cols-[1fr,220px,120px]">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm theo khách, số điện thoại, mã phiếu, ngày..."
              className="w-full h-11 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-rose-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-700/20 transition-all"
            />
            <FilterStatusSelect
              value={statusFilter}
              onChange={(next) => setStatusFilter(next)}
            />
            <button
              type="button"
              onClick={loadDebts}
              className="h-11 rounded-xl bg-gradient-to-r from-rose-700 to-rose-500 px-3 text-sm font-semibold text-white hover:shadow-lg hover:shadow-rose-700/25"
            >
              Làm mới
            </button>
          </div>
        </section>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
            Đang tải dữ liệu công nợ...
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
            Không có dữ liệu phù hợp.
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wide">
                      {activeTab === "suppliers"
                        ? "Nhà cung cấp"
                        : "Khách hàng"}
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wide">
                      SĐT
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wide">
                      {activeTab === "suppliers" ? "Ngày nhập" : "Ngày bán"}
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wide">
                      Mã phiếu
                    </th>
                    <th className="px-3 py-2.5 text-right text-xs font-bold uppercase tracking-wide">
                      Tiền nợ
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wide">
                      Trạng thái
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wide">
                      Ghi chú
                    </th>
                    <th className="px-3 py-2.5 text-right text-xs font-bold uppercase tracking-wide">
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((r, idx) => (
                    <tr
                      key={`${r.maPhieu}-${idx}`}
                      className="border-t border-slate-100"
                    >
                      <td className="px-3 py-2 text-slate-800 font-semibold">
                        {(activeTab === "suppliers"
                          ? r.nhaCungCap
                          : r.tenKhach) || "-"}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {r.soDienThoai || "-"}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {(activeTab === "suppliers" ? r.ngayNhap : r.ngayBan) ||
                          "-"}
                      </td>
                      <td className="px-3 py-2 text-slate-800 font-semibold">
                        {r.maPhieu || "-"}
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-rose-700">
                        {fmt(r.tienNo || 0)}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={r.trangThai} />
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {r.ghiChu || "-"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSettleConfirmTarget(r)}
                            disabled={
                              !canSettleRow(r) ||
                              settlingKey === String(r.maPhieu || "").trim()
                            }
                            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 disabled:opacity-50"
                          >
                            {settlingKey === String(r.maPhieu || "").trim()
                              ? activeTab === "suppliers"
                                ? "Đang trả..."
                                : "Đang thu..."
                              : activeTab === "suppliers"
                                ? "Trả nợ"
                                : "Thu nợ"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditing(r)}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Sửa
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y divide-slate-100">
              {filteredRows.map((r, idx) => (
                <article key={`${r.maPhieu}-m-${idx}`} className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-900">
                        {(activeTab === "suppliers"
                          ? r.nhaCungCap
                          : r.tenKhach) || "-"}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {r.maPhieu || "-"} |{" "}
                        {(activeTab === "suppliers" ? r.ngayNhap : r.ngayBan) ||
                          "-"}
                      </p>
                    </div>
                    <StatusBadge status={r.trangThai} />
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    SĐT: {r.soDienThoai || "-"}
                  </p>
                  <p className="text-sm font-bold text-rose-700 mt-1">
                    Nợ: {fmt(r.tienNo || 0)}
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    Ghi chú: {r.ghiChu || "-"}
                  </p>
                  <div className="mt-2 flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSettleConfirmTarget(r)}
                      disabled={
                        !canSettleRow(r) ||
                        settlingKey === String(r.maPhieu || "").trim()
                      }
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 disabled:opacity-50"
                    >
                      {settlingKey === String(r.maPhieu || "").trim()
                        ? activeTab === "suppliers"
                          ? "Đang trả..."
                          : "Đang thu..."
                        : activeTab === "suppliers"
                          ? "Trả nợ"
                          : "Thu nợ"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(r)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Sửa
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>

      {editing && (
        <EditDebtModal
          row={editing}
          saving={saving}
          deleting={deleting}
          settling={settlingKey === String(editing?.maPhieu || "").trim()}
          onClose={() => (saving || deleting ? null : setEditing(null))}
          onSave={handleSave}
          onDelete={handleDeleteRequest}
          onSettle={handleQuickSettle}
          catalog={
            activeTab === "suppliers" ? supplierCatalog : customerCatalog
          }
          isSupplier={activeTab === "suppliers"}
        />
      )}

      {settleConfirmTarget && (
        <div
          className="fixed inset-0 z-[9900] bg-slate-900/45 p-4"
          onClick={() => (settlingKey ? null : setSettleConfirmTarget(null))}
        >
          <div
            className="mx-auto mt-[18vh] w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-1.5 h-5 rounded-full bg-rose-600 shadow-sm mt-0.5"></div>
                <h3 className="text-base font-black text-slate-900 tracking-tight">
                  {activeTab === "suppliers"
                    ? "Xác nhận đã trả nợ"
                    : "Xác nhận thu nợ"}
                </h3>
              </div>
            <p className="mt-2 text-sm text-slate-600">
              {activeTab === "suppliers" ? "Trả toàn bộ" : "Thu toàn bộ"} công
              nợ của{" "}
              <span className="font-semibold text-slate-900">
                {activeTab === "suppliers"
                  ? settleConfirmTarget.nhaCungCap
                  : settleConfirmTarget.tenKhach}
              </span>{" "}
              — phiếu{" "}
              <span className="font-semibold">
                {settleConfirmTarget.maPhieu}
              </span>
              ?
            </p>
            <p className="mt-1 text-xs text-rose-600">
              Trạng thái sẽ chuyển thành &quot;Đã thanh toán&quot; và tiền nợ về
              0.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={Boolean(settlingKey)}
                onClick={() => setSettleConfirmTarget(null)}
                className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-60"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={Boolean(settlingKey)}
                onClick={async () => {
                  const target = settleConfirmTarget;
                  setSettleConfirmTarget(null);
                  await handleQuickSettle(target);
                }}
                className="flex-1 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {settlingKey
                  ? "Đang xử lý..."
                  : activeTab === "suppliers"
                    ? "Xác nhận trả"
                    : "Xác nhận thu"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-[9900] bg-slate-900/45 p-4"
          onClick={() => (deleting ? null : setDeleteTarget(null))}
        >
          <div
            className="mx-auto mt-[18vh] w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-1.5 h-5 rounded-full bg-rose-600 shadow-sm mt-0.5"></div>
                <h3 className="text-base font-black text-slate-900 tracking-tight">
                  Xác nhận xóa biên lai
                </h3>
              </div>
            <p className="mt-2 text-sm text-slate-600">
              Bạn sắp xóa hóa đơn{" "}
              <span className="font-semibold text-slate-900">
                {deleteTarget.maPhieu}
              </span>
              . Thao tác này sẽ cập nhật cả `DON_HANG` và `KHACH`.
            </p>
            <p className="mt-1 text-xs text-rose-600">
              Hành động này không thể hoàn tác.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={Boolean(deleting)}
                onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-60"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={Boolean(deleting)}
                onClick={confirmDeleteOrder}
                className="flex-1 rounded-xl bg-gradient-to-r from-rose-700 to-rose-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {deleting ? "Đang xóa..." : "Xóa hóa đơn"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
