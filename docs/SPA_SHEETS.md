# SPA Sheets

Tài liệu này bám theo schema canonical hiện tại trong [gasAdapter.js](C:\Users\anhdu\OneDrive\Desktop\code\appscript\spa-manager-base\src\client\api\adapters\gasAdapter.js).

## Danh mục TLC

Các sheet danh mục được nạp từ poster TLC:

- `DM_PHAC_DO`
- `DM_DICH_VU`
- `DM_GOI_DIEU_TRI`
- `GIUONG_TRI_LIEU`

`DM_PHAC_DO`:

- `STT`
- `maPhacDo`
- `tenPhacDo`
- `nhomBenh`
- `capDoBenh`
- `moTa`
- `active`
- `updatedAt`

`DM_DICH_VU`:

- `STT`
- `maDv`
- `maPhacDo`
- `lop1NhomDv`
- `lop2DichVu`
- `vungTriLieu`
- `thoiLuongPhut`
- `active`
- `updatedAt`

`DM_GOI_DIEU_TRI`:

- `STT`
- `maGoi`
- `maDv`
- `tenGoi`
- `loaiGoi`
- `soBuoiMua`
- `soBuoiTang`
- `soBuoiQuyDoi`
- `giaBanGoi`
- `giaVonChuanGoi`
- `active`
- `updatedAt`

Ghi chú: poster không có giá vốn, nên preset TLC đang để `giaVonChuanGoi = 0` cho các gói lấy từ ảnh.

## Sheet Vận Hành Chính

- `GIUONG_TRI_LIEU`
- `PHIEN_DICH_VU`
- `CHI_TIET_DICH_VU`
- `NHAN_VIEN`

## `GIUONG_TRI_LIEU`

Cột chuẩn:

- `STT`
- `maGiuong`
- `tenGiuong`
- `loaiGiuong`
- `trangThaiGiuong`
- `soKhachToiDa`
- `ghiChu`
- `updatedAt`

Preset TLC hiện có 11 giường:

- 9 giường trị liệu: `P101` đến `P109`
- 2 giường gội: `G201`, `G202`

Rule:

- Không còn `giaTheoDem`, `giaTheoGio`.
- Giá trị giường không quyết định doanh thu phiên.
- Trạng thái hợp lệ: `Sẵn sàng | Đang trị liệu | Đang tạm dừng | Ngưng sử dụng`.

## `PHIEN_DICH_VU`

Cột chuẩn:

- `STT`
- `maPhien`
- `maLichHen`
- `maTienTrinh`
- `maGiuong`
- `tenKhach`
- `soDienThoai`
- `maNhanVien`
- `tenNhanVien`
- `maDv`
- `tenDichVu`
- `maGoi`
- `tenGoi`
- `tongBuoiCombo`
- `buoiThu`
- `batDauAt`
- `ketThucDuKien`
- `ketThucThucTe`
- `thoiLuongPhut`
- `giaGoi`
- `tienGoi`
- `tienDichVu`
- `tongThanhToan`
- `trangThaiPhien`
- `ghiChu`

Rule:

- Không còn nhóm cột định giá/lưu trú cũ của mô hình homestay.
- `batDauAt < ketThucDuKien`.
- `BOOKED` giữ slot theo `batDauAt -> ketThucDuKien`.
- `IN_HOUSE` là phiên đang vận hành thật.
- `CHECKED_OUT` phải có `ketThucThucTe`.
- Giá phiên lấy từ `gói trị liệu`, không lấy từ giường.
- Gói/combo nhiều buổi phải ghi `maTienTrinh`, `tongBuoiCombo`, `buoiThu` để trang Tiến trình khách tính đúng số buổi.

## `CHI_TIET_DICH_VU`

Cột chuẩn:

- `STT`
- `maPhien`
- `thoiGian`
- `maSanPham`
- `tenSanPham`
- `nhomHang`
- `donVi`
- `soLuong`
- `donGia`
- `thanhTien`
- `ghiChu`
- `daTruTonKho`

Rule:

- Chỉ được thêm/sửa/xóa khi phiên còn `IN_HOUSE`.
- `daTruTonKho` dùng để chống trừ kho lặp khi checkout retry.

## `NHAN_VIEN`

Cột chuẩn:

- `STT`
- `maNhanVien`
- `tenNhanVien`
- `trangThai`
- `caLamViec`
- `ghiChu`
- `updatedAt`

## Chuẩn Hóa Sheet Cũ

- Hệ thống vẫn đọc alias cũ kiểu homestay để tương thích dữ liệu cũ.
- Khi chạy `initSpaSheets()` hoặc `simplifySpaSheets()`, sheet vận hành sẽ được rebuild lại theo header canonical.
- Các alias cũ chỉ còn để đọc tương thích, không còn là schema nghiệp vụ chính.
