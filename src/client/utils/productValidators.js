const toNum = (v) => Number(String(v ?? "").replace(/[^\d.-]/g, "")) || 0;

/** Validate một dòng danh mục sản phẩm trước khi gửi adapter. */
export function validateProductRow(row = {}) {
  const tenSanPham = String(row.tenSanPham || "").trim();
  const nhomHang = String(row.nhomHang || "").trim();
  const donVi = String(row.donVi || "").trim();
  const donGiaBan = toNum(row.donGiaBan);
  const giaVon = toNum(row.giaVon);

  const errors = {};
  if (!tenSanPham) errors.tenSanPham = "Chưa có tên";
  if (!donVi) errors.donVi = "Cần đơn vị";
  if (donGiaBan <= 0) errors.donGiaBan = "Sai giá";
  if (giaVon <= 0) errors.giaVon = "Sai giá";

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

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
}
