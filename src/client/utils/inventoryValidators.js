/** Validate dòng hàng mới trên phiếu nhập kho. */
export function validateInventoryLineItem(product = {}, existingProducts = []) {
  const name = String(product.tenSanPham || "").trim();
  const donViChan = String(product.donViChan || "").trim();
  const qtyChan = Number(product.soLuong) || 0;
  const priceChan = Number(product.giaNhapChan) || 0;

  const errors = {};
  if (!name) errors.new_tenSanPham = "Chưa có tên hàng";
  if (!donViChan) errors.new_donViChan = "Cần đơn vị";
  if (qtyChan <= 0) errors.new_soLuong = "Sai SL";
  if (qtyChan > 100000) errors.new_soLuong = "Tối đa 100k";
  if (priceChan <= 0) errors.new_giaNhapChan = "Sai giá";

  const isDuplicate = (Array.isArray(existingProducts) ? existingProducts : []).some(
    (row) =>
      String(row.tenSanPham || "").trim().toLowerCase() === name.toLowerCase() &&
      String(row.donViChan || "").trim().toLowerCase() === donViChan.toLowerCase(),
  );
  if (isDuplicate) {
    errors.new_tenSanPham = "Hàng này đã có trong phiếu nhập";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return { ok: true };
}

/** Validate thông tin header phiếu nhập trước submit. */
export function validateInventoryReceipt(receiptInfo = {}, products = []) {
  const errors = {};
  if (!String(receiptInfo.nhaCungCap || "").trim()) {
    errors.nhaCungCap = "Vui lòng nhập tên nhà cung cấp";
  }
  if (!Array.isArray(products) || products.length === 0) {
    errors.products = "Phiếu nhập cần ít nhất một mặt hàng";
  }
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return { ok: true };
}
