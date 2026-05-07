import { formatMoney as fmt } from "../../../core/core";

export default function PosCreateOrderLayout({
  newProduct,
  setNewProduct,
  showProductSuggestions,
  setShowProductSuggestions,
  getCatalogMatch,
  applyMatchedProduct,
  orderInfo,
  startNewPosOrder,
  posProductSuggestions,
  handleAddProductFromSuggestion,
  totalItems,
  products,
  selectedProductId,
  setSelectedProductId,
  handleUpdateProduct,
  handleRemoveProduct,
  customerInfo,
  setCustomerInfo,
  showCustomerSuggestions,
  setShowCustomerSuggestions,
  customerSuggestions,
  setOrderInfo,
  handleAddProduct,
  posKeyBuffer,
  posKeypadKeys,
  handlePosKeypadPress,
  selectedProduct,
  totalAmount,
  hasDraft,
  formattedDraftTime,
  saveDraftNow,
  dismissKeyboard,
  handleSubmit,
  isSubmitting,
  paymentModal,
}) {
  return (
    <main className="min-h-screen bg-slate-100 pb-24">
      <div className="sticky top-0 z-20 border-b border-sky-700 bg-gradient-to-r from-sky-700 to-sky-600 px-4 py-3 text-white shadow-md">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-3">
          <div className="rounded-lg bg-white/15 px-3 py-2 text-sm font-bold tracking-wide">
            POS
          </div>
          <div className="flex-1">
            <input
              type="text"
              value={newProduct.tenSanPham}
              onFocus={() => setShowProductSuggestions(true)}
              onBlur={() => setTimeout(() => setShowProductSuggestions(false), 160)}
              onChange={(e) => {
                const tenSanPham = e.target.value;
                const matched = getCatalogMatch(tenSanPham);
                setNewProduct((prev) =>
                  applyMatchedProduct(prev, tenSanPham, matched),
                );
              }}
              placeholder="Tìm hàng hóa (chạm để tìm nhanh)..."
              className="w-full rounded-xl border border-white/25 bg-white/95 px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-white"
            />
          </div>
          <div className="rounded-lg bg-white/15 px-3 py-2 text-xs font-semibold">
            Mã: {orderInfo.maPhieu || "--"}
          </div>
          <button
            type="button"
            onClick={startNewPosOrder}
            className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-sky-700"
          >
            Đơn mới
          </button>
        </div>
        {showProductSuggestions && posProductSuggestions.length > 0 && (
          <div className="mx-auto mt-2 w-full max-w-7xl rounded-2xl border border-sky-300 bg-white p-2 shadow-2xl">
            <div className="grid max-h-56 grid-cols-1 gap-1 overflow-y-auto md:grid-cols-2">
              {posProductSuggestions.map((p) => (
                <button
                  key={p.variantKey || `${p.tenSanPham}-${p.donVi}`}
                  type="button"
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => handleAddProductFromSuggestion(p)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-left hover:bg-sky-50"
                >
                  <p className="text-sm font-semibold text-slate-800">{p.tenSanPham}</p>
                  <p className="text-xs text-slate-500">
                    {p.displayUnit || "-"} • {fmt(p.displayPrice || 0)}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-12">
        <section className="lg:col-span-8">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                Đơn hàng đang soạn
              </h3>
              <span className="rounded-lg bg-sky-100 px-2 py-1 text-xs font-bold text-sky-700">
                {totalItems} mặt hàng
              </span>
            </div>
            <div className="max-h-[62vh] overflow-y-auto">
              {products.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-slate-500">
                  Chưa có hàng trong đơn. Tìm sản phẩm ở thanh trên để thêm nhanh.
                </div>
              ) : (
                products.map((product) => {
                  const isSelected = product.id === selectedProductId;
                  return (
                    <div
                      key={`pos-row-${product.id}`}
                      className={`grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-slate-100 px-4 py-3 ${
                        isSelected ? "bg-sky-50" : "bg-white"
                      }`}
                      onClick={() => setSelectedProductId(product.id)}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">
                          {product.tenSanPham}
                        </p>
                        <p className="text-xs text-slate-500">
                          {product.donVi || "-"} • {fmt(product.donGiaBan || 0)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const next = Math.max(1, Number(product.soLuong || 1) - 1);
                            handleUpdateProduct(product.id, { soLuong: next });
                          }}
                          className="h-8 w-8 rounded-lg border border-slate-300 bg-white text-sm font-bold text-slate-700"
                        >
                          -
                        </button>
                        <span className="min-w-[34px] text-center text-sm font-bold text-slate-800">
                          {product.soLuong}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const next = Math.min(100000, Number(product.soLuong || 1) + 1);
                            handleUpdateProduct(product.id, { soLuong: next });
                          }}
                          className="h-8 w-8 rounded-lg border border-slate-300 bg-white text-sm font-bold text-slate-700"
                        >
                          +
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="min-w-[96px] text-right text-sm font-bold text-slate-800">
                          {fmt((product.soLuong || 0) * (product.donGiaBan || 0))}
                        </p>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveProduct(product.id);
                          }}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-600"
                        >
                          Xóa
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>

        <aside className="lg:col-span-4 space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-700">
              Khách hàng
            </h3>
            <input
              type="text"
              placeholder="Tên khách hàng (tùy chọn)"
              value={customerInfo.tenKhach}
              onFocus={() => setShowCustomerSuggestions(true)}
              onBlur={() => setTimeout(() => setShowCustomerSuggestions(false), 120)}
              onChange={(e) =>
                setCustomerInfo((prev) => ({ ...prev, tenKhach: e.target.value }))
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500"
            />
            {showCustomerSuggestions && customerSuggestions.length > 0 && (
              <div className="mt-2 max-h-32 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                {customerSuggestions.map((c) => (
                  <button
                    key={`pos-cus-${c.tenKhach}-${c.soDienThoai || ""}`}
                    type="button"
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={() => {
                      setCustomerInfo({
                        tenKhach: c.tenKhach || "",
                        soDienThoai: c.soDienThoai || "",
                      });
                      setShowCustomerSuggestions(false);
                    }}
                    className="block w-full border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-sky-50"
                  >
                    <p className="text-sm font-semibold text-slate-800">{c.tenKhach}</p>
                    <p className="text-xs text-slate-500">{c.soDienThoai || "-"}</p>
                  </button>
                ))}
              </div>
            )}
            <textarea
              value={orderInfo.ghiChu}
              onChange={(e) =>
                setOrderInfo((prev) => ({ ...prev, ghiChu: e.target.value }))
              }
              rows={2}
              placeholder="Ghi chú đơn..."
              className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500"
            />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-700">
              Thêm nhanh mặt hàng
            </h3>
            <div className="space-y-2">
              <input
                type="text"
                value={newProduct.tenSanPham}
                onChange={(e) => {
                  const tenSanPham = e.target.value;
                  const matched = getCatalogMatch(tenSanPham);
                  setNewProduct((prev) =>
                    applyMatchedProduct(prev, tenSanPham, matched),
                  );
                }}
                placeholder="Tên hàng"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500"
              />
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  value={newProduct.donVi}
                  onChange={(e) =>
                    setNewProduct((prev) => ({ ...prev, donVi: e.target.value }))
                  }
                  placeholder="Đơn vị"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500"
                />
                <input
                  type="number"
                  min="1"
                  value={newProduct.soLuong}
                  onChange={(e) =>
                    setNewProduct((prev) => ({
                      ...prev,
                      soLuong: Math.max(1, Number(e.target.value || 1)),
                    }))
                  }
                  placeholder="SL"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500"
                />
                <input
                  type="text"
                  value={newProduct.donGiaBan ? fmt(newProduct.donGiaBan) : ""}
                  onChange={(e) => {
                    const digits = String(e.target.value || "").replace(/[^\d]/g, "");
                    setNewProduct((prev) => ({
                      ...prev,
                      donGiaBan: Number(digits || 0),
                    }));
                  }}
                  placeholder="Đơn giá"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500"
                />
              </div>
              <button
                type="button"
                onClick={handleAddProduct}
                className="w-full rounded-xl bg-sky-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-sky-700"
              >
                Thêm vào đơn
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-700">
              Bàn phím số lượng
            </h3>
            <div className="mb-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-right text-lg font-black text-slate-800">
              {posKeyBuffer || "0"}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {posKeypadKeys.map((key) => (
                <button
                  key={`pos-key-${key}`}
                  type="button"
                  onClick={() => handlePosKeypadPress(key)}
                  className={`rounded-xl px-2 py-2.5 text-sm font-bold ${
                    key === "AC"
                      ? "bg-rose-50 text-rose-700 border border-rose-200"
                      : key === "⌫"
                        ? "bg-amber-50 text-amber-700 border border-amber-200"
                        : "bg-slate-100 text-slate-700 border border-slate-200"
                  }`}
                >
                  {key}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => handlePosKeypadPress("OK")}
              className="mt-2 w-full rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
            >
              Áp dụng cho {selectedProduct ? "dòng đang chọn" : "số lượng thêm mới"}
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-500">Tạm tính</p>
              <p className="text-2xl font-black text-slate-900">{fmt(totalAmount)}</p>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {hasDraft && formattedDraftTime
                ? `Nháp gần nhất: ${formattedDraftTime}`
                : "Chưa có nháp."}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => saveDraftNow({ silent: false })}
                className="rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700"
              >
                Lưu nháp
              </button>
              <button
                type="button"
                onClick={dismissKeyboard}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
              >
                Ẩn phím
              </button>
            </div>
            <button
              type="button"
              onClick={() => handleSubmit({ preventDefault: () => {} })}
              disabled={!products.length || isSubmitting}
              className={`mt-3 w-full rounded-xl px-4 py-3 text-sm font-bold text-white ${
                !products.length || isSubmitting
                  ? "bg-slate-400"
                  : "bg-gradient-to-r from-emerald-600 to-emerald-500"
              }`}
            >
              {isSubmitting ? "Đang xử lý..." : "Thanh toán"}
            </button>
          </div>
        </aside>
      </div>
      {paymentModal}
    </main>
  );
}

