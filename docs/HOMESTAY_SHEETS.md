# Homestay Sheet Structure

## Core sheets

### `PHONG`
`STT, maPhong, tenPhong, loaiPhong, trangThaiPhong, giaTheoDem, giaTheoGio, soKhachToiDa, ghiChu, updatedAt`

### `LUU_TRU`
`STT, maLuuTru, maDatPhong, maPhong, tenKhach, soDienThoai, giayTo, hinhThucTinhGia, checkinAt, checkoutAtDuKien, checkoutAtThucTe, soDem, soGio, donGiaPhongApDung, tienPhong, tienDichVu, tongThanhToan, daThuCheckin, canThuCheckout, trangThaiLuuTru, ghiChu`

### `LUU_TRU_DICH_VU`
`STT, maLuuTru, thoiGian, maSanPham, tenSanPham, nhomHang, donVi, soLuong, donGia, thanhTien, ghiChu`

## Existing sheets kept

- `SAN_PHAM`: dùng chung cho menu ăn uống, dịch vụ, vật tư.
- `NHAP_HANG`: giữ luồng nhập hàng, dùng luôn cho chi tiêu gia đình.
- `BANK`, `account`, `Log`, `QUEUE`: giữ nguyên theo base.

## Business rules

- Checkin thu 100% tiền phòng ngay.
- Checkout chỉ thu tiền dịch vụ phát sinh.
- Checkout xong phòng chuyển `Đang dọn`.
- Tính giờ: làm tròn lên từng giờ.
- Tính đêm: làm tròn lên từng đêm.
