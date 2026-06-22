# SPA Business Rules

Tai lieu nay chot rule nghiep vu dang ap dung cho du an quan ly spa.

## 1) Pham vi uu tien
- Uu tien luong cot loi: tong quan, dieu phoi tri lieu, danh sach lich, tien trinh khach, hang hoa, nhap/tra/kiem kho.
- Cac module phu nhu cham cong nang cao, tinh luong nang cao, vay von, thue co the de sau neu khong anh huong flow ban hang/dieu phoi.

## 2) Rule giuong/phong tri lieu
- Giuong/phong chi la resource van hanh, khong phai lich hen.
- Trang thai giuong/phong hop le:
  - `San sang`
  - `Dang tri lieu`
  - `Dang tam dung`
  - `Ngung su dung`
- Khong dung `Da hen truoc` lam trang thai giuong.
- Giuong dang co phien `IN_HOUSE` thi khong duoc mo them phien moi.
- Giuong co lich hen tuong lai van co the `San sang` neu chua co khach dang tri lieu.
- Giuong `Dang tam dung` can co hanh dong mo lai `San sang` truoc khi mo phien moi.
- Giuong `Ngung su dung` khong duoc mo phien/tao lich cho den khi mo lai su dung.

## 3) Rule lich hen va phien tri lieu
- Lich hen nam trong `PHIEN_DICH_VU` voi `trangThaiPhien = BOOKED`.
- Lich hen chi giu slot trong khoang `batDauAt -> ketThucDuKien`, khong khoa giuong ca ngay.
- Trang thai phien/lich hop le:
  - `BOOKED`: da hen
  - `IN_HOUSE`: dang tri lieu
  - `CHECKED_OUT`: da ket thuc
  - `CANCELLED`: da huy
  - `NO_SHOW`: khach khong den
- Tao lich tuong lai tren giuong dang tri lieu duoc phep neu khong trung khung gio voi phien hien tai.
- Trung gio cung giuong hoac cung nhan vien phai bi chan.
- Mo walk-in trong vong 4 gio truoc lich hen ke tiep phai hien canh bao de nguoi dung xac nhan.
- Den gio hen, card giuong phai uu tien hanh dong `Nhan khach hen` de chuyen lich `BOOKED` sang `IN_HOUSE`, khong tao duplicate.
- Khach khong den duoc danh dau `NO_SHOW` va slot khong con blocking.
- Gia cua phien duoc lay tu `goi tri lieu`, khong lay tu giuong.
- Timeline la man van hanh chinh; danh sach giuong chi dung cho CRUD cau hinh giuong.

## 4) Rule dich vu/san pham trong phien
- Mot phien tri lieu co the them dich vu va san pham ban kem.
- Doi tuong them nam trong `CHI_TIET_DICH_VU` va cong vao tong thanh toan cua phien.
- Dich vu khong lam thay doi ton kho.
- San pham co theo doi ton kho chi bi tru khi checkout/chot phien.
- Moi dong san pham can co co che danh dau da tru ton de tranh tru lap khi retry/chot lai.

## 5) Rule doanh thu, von, lai
- `Doanh thu thuan`: tong hoa don/phien da chot trong ky.
- `Von`: tong gia von/chi phi hang hoa va phieu nhap lien quan trong ky.
- `Lai`: `Doanh thu thuan - Von` va hien mau xanh neu duong.
- Khach moi/cu quay lai tinh theo lan phat sinh dau tien va lan quay lai trong ky.

## 6) API alias nghiep vu spa
- `getTreatmentBeds`: lay giuong/phong tri lieu.
- `getTreatmentHistory`: lay lich hen va phien tri lieu.
- `createSpaBooking`: tao lich hen `BOOKED`.
- `startTreatmentSession`: mo/nhan phien `IN_HOUSE`.
- `markTreatmentNoShow`: danh dau khach khong den.
- `addTreatmentServiceItem`: them dich vu/san pham vao phien.
- `updateTreatmentServiceItem`, `deleteTreatmentServiceItem`: sua/xoa phat sinh trong phien.
- `updateTreatmentSessionTime`: sua thoi gian phien.
- `completeTreatmentSession`: ket thuc phien va cap nhat ton kho neu co san pham.

## 7) Rule dong bo
- Rule nghiep vu validate tren UI/React; GAS va local adapter chi doc/ghi sheet.
- Local adapter va GAS adapter mirror cung hanh vi persistence (khong validate nghiep vu o adapter).
- BE chi giu persistence guard: thieu ID, khong tim thay row, loi sheet/IO, auth.
- FE validators: `productValidators`, `inventoryValidators`, `treatmentCatalogValidators`, `sessionScheduleValidators`, `staff*Helpers`.
- Cache invalidation sau checkout phai lam moi phien, giuong/phong, danh muc san pham va ton kho.
- Sheet duoc doc/ghi theo header, them cot moi khong duoc lam mat du lieu cu.
- Audit: `docs/audit/CACHE_COMPLIANCE_MATRIX.md`, `docs/audit/VALIDATION_MATRIX.md`.
