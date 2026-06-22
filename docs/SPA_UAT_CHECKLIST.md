# SPA UAT CHECKLIST (PARITY REVIEW - KIOTVIET)

Tai lieu nay dung de ra soat parity tinh nang SPA theo chuan `code + anh KiotViet`.
Muc tieu: dam bao tinh nang dang co trong du an duoc bao phu day du theo man hinh/nut/popup/logic.

## 1) Scope va input

- Scope doi chieu:
  - Codebase hien tai (`src/client/*`, `src/client/api/*`, docs nghiep vu).
  - Bo anh KiotViet tham chieu.
- Khong yeu cau giong 100% UI KiotViet.
- Bat buoc:
  - Khong thieu luong chinh.
  - Khong thua nut gay nhieu/sai nghiep vu.
  - Khong co popup mo coi (mo duoc nhung xu ly khong day du).

## 2) Trang thai va muc do loi

- Ket qua TC: `PASS` | `FAIL` | `N/A`.
- Severity:
  - `P0`: crash, mat du lieu, sai nghiep vu nghiem trong (tien/ton kho/tien trinh khach/checkout).
  - `P1`: sai luong chinh, thieu control chinh, submit sai logic.
  - `P2`: sai UI, sai text, sai trang thai empty-state, van co workaround.

## 3) Mau ghi ket qua cho moi TC

- `TC ID`:
- `Steps`:
- `Expected`:
- `Actual`:
- `Result`:
- `Severity neu FAIL`:
- `Evidence`:
  - Anh: `<duong_dan_anh>`
  - Log/API: `<log hoac payload>`
  - Ghi chu: `<so sanh voi control trong ma tran>`

## 4) Preconditions va seed data

1. Chay `runSpaBootstrapForEditor`.
2. Co du sheet bat buoc:
  - `DON_HANG`, `NHAP_HANG`, `SAN_PHAM`, `QUAN_LY_KHO`, `TIEN_TRINH_KHACH`.
  - `GIUONG_TRI_LIEU`, `PHIEN_DICH_VU`, `CHI_TIET_DICH_VU`, `NHAN_VIEN`.
  - `DM_PHAC_DO`, `DM_DICH_VU`, `DM_GOI_DIEU_TRI`.
3. Dang nhap role co quyen thao tac.
4. Seed data toi thieu:
  - >= 5 hoa don co du lieu doanh thu.
  - >= 3 phieu nhap (co NCC khac nhau).
  - >= 3 nhan vien active.
  - >= 3 giuong voi trang thai khac nhau.
  - >= 1 lich BOOKED, >= 1 phien IN_HOUSE.

---

## UT-01: Dashboard (`stats`)

### TM1 - Filter thoi gian va KPI

- `TC-UT01-TM01-01`: Chuyen `7 ngay qua` / `6-12 thang qua` / `Thang nay` / `Nam nay`, KPI cap nhat khong NaN.
- `TC-UT01-TM01-02`: Kiem tra 5 KPI dang co: `Doanh thu thuan`, `Von`, `Lai`, `Khach moi`, `Khach cu quay lai`.

### TM2 - Bieu do va responsive

- `TC-UT01-TM02-01`: Bieu do `Luong khach` hien cot + label dung.
- `TC-UT01-TM02-02`: Bieu do `Doanh thu thuan` hien gia tri dung format.
- `TC-UT01-TM02-03`: Test mobile/tablet/desktop, khong vo layout.

### TM3 - Top ban nhieu

- `TC-UT01-TM03-01`: Chuyen tab `Dich vu` -> `Goi dich vu` -> `The tai khoan`.
- `TC-UT01-TM03-02`: Ky khong co du lieu phai hien empty-state ro rang.

### TM4 - Alter flow

- `TC-UT01-TM04-01`: Tao hoa don moi, quay lai Dashboard va xac nhan cache refresh dung.

---

## UT-02: Dieu phoi tri lieu (`create-order`)

### TM1 - Dieu huong/tab/filter

- `TC-UT02-TM01-01`: Chuyen `Danh sach` / `Luoi thoi gian` / `Luoi nhan vien`.
- `TC-UT02-TM01-02`: Filter `trang thai giuong`, `nhan vien`, `ngay/tuan`.
- `TC-UT02-TM01-03`: Doi `buoc luoi` 60/30/15 phut.

### TM2 - Popup chon khung gio (`SelectTimeModal`)

- `TC-UT02-TM02-01`: `Open` popup bang nut `+`.
- `TC-UT02-TM02-02`: `Submit valid` chon slot hop le -> mo `CheckinModal`.
- `TC-UT02-TM02-03`: `Submit invalid/cancel` dong popup khong tao du lieu.

### TM3 - Popup mo phien/dat lich (`CheckinModal`)

- `TC-UT02-TM03-01`: `Open` form + goi y khach theo SDT.
- `TC-UT02-TM03-02`: `Submit valid` tao `BOOKED` hoac `IN_HOUSE` dung flow.
- `TC-UT02-TM03-03`: `Submit invalid` (gio ket thuc <= gio bat dau) phai chan.

### TM4 - Popup xu ly phien (`StayModal`)

- `TC-UT02-TM04-01`: `Open` tu card giuong/luoi.
- `TC-UT02-TM04-02`: `Submit valid` them dich vu/san pham, sua gio, checkout thanh cong.
- `TC-UT02-TM04-03`: `Submit invalid/cancel` khi du lieu sai khong duoc checkout.

### TM5 - Rule nghiep vu cot loi

- `TC-UT02-TM05-01`: Giuong dang `IN_HOUSE` khong mo phien moi.
- `TC-UT02-TM05-02`: Lich BOOKED trung gio cung giuong/cung nhan vien bi chan.
- `TC-UT02-TM05-03`: Lich hẹn trong 4h canh bao khi walk-in.
- `TC-UT02-TM05-04`: `Nhan khach hen` chuyen BOOKED -> IN_HOUSE, khong duplicate.
- `TC-UT02-TM05-05`: `No-show` giai phong slot dat lich.
- `TC-UT02-TM05-06`: Checkout tru ton san pham 1 lan (khong tru lap khi retry).

### TM6 - Empty/error state

- `TC-UT02-TM06-01`: Danh sach khong co lich -> empty-state dung.
- `TC-UT02-TM06-02`: API loi -> thong bao than thien, co the thu lai.

---

## UT-03: Lich su tri lieu (`history`)

### TM1 - Bo loc va tim kiem

- `TC-UT03-TM01-01`: Loc theo status, giuong, from/to date.
- `TC-UT03-TM01-02`: Tim theo ma phien/khach/SDT.

### TM2 - Popup chi tiet phien

- `TC-UT03-TM02-01`: `Open` popup chi tiet.
- `TC-UT03-TM02-02`: `Close` popup an toan, khong mat filter.
- `TC-UT03-TM02-03`: Kiem tra service items hien dung tong.

---

## UT-04: Hang hoa (`products`)

### TM1 - Danh sach va tim kiem

- `TC-UT04-TM01-01`: Search theo ten/nhom/don vi.
- `TC-UT04-TM01-02`: Toggle hien/an anh san pham.

### TM2 - CRUD popup inline item

- `TC-UT04-TM02-01`: `Open` item editor.
- `TC-UT04-TM02-02`: `Submit valid` tao/sua item.
- `TC-UT04-TM02-03`: `Submit invalid` (thieu ten/don vi/gia) phai chan.

### TM3 - Xoa item

- `TC-UT04-TM03-01`: `Open` modal xac nhan xoa.
- `TC-UT04-TM03-02`: `Confirm` xoa thanh cong.
- `TC-UT04-TM03-03`: `Cancel` giu nguyen du lieu.

---

## UT-05: Nhap hang (`inventory`)

### TM1 - Thong tin phieu

- `TC-UT05-TM01-01`: Ma phieu/Ngay nhap default dung.
- `TC-UT05-TM01-02`: Trang thai phieu nhap hien dung va khong tao sheet ke toan cu.

### TM2 - Popup suggestion (NCC + hang hoa)

- `TC-UT05-TM02-01`: `Open` suggestion NCC/hang hoa.
- `TC-UT05-TM02-02`: `Select` suggestion fill field dung.
- `TC-UT05-TM02-03`: `Cancel/no match` khong crash.

### TM3 - Tao phieu nhap

- `TC-UT05-TM03-01`: Add item valid -> tong tien cap nhat.
- `TC-UT05-TM03-02`: Save phieu -> ton kho tang, san pham duoc dong bo.
- `TC-UT05-TM03-03`: Validate invalid item (thieu ten/don vi/gia/so luong).

---

## UT-06: Kiem kho (`stock`)

### TM1 - Danh sach ton

- `TC-UT06-TM01-01`: Search theo ten/nhom.
- `TC-UT06-TM01-02`: Quy doi don vi lon/nho hien dung.
- `TC-UT06-TM01-03`: Tong gia tri ton cap nhat dung.

### TM2 - Empty/error state

- `TC-UT06-TM02-01`: Khong co du lieu -> empty-state.
- `TC-UT06-TM02-02`: API loi -> thong bao loi + retry.

---

## UT-07: In phieu (`receipt`)

### TM1 - Nap du lieu phieu

- `TC-UT08-TM01-01`: Tai phieu theo `maPhieu` tu order history.
- `TC-UT08-TM01-02`: Tải phiếu trị liệu theo `maPhien`.

### TM2 - Kich thuoc in va auto print

- `TC-UT08-TM02-01`: Chuyen size 58/80/PDF.
- `TC-UT08-TM02-02`: Auto print + auto back (neu co param).
- `TC-UT08-TM02-03`: Dry run khong goi print dialog.

### TM3 - Empty/error state

- `TC-UT08-TM03-01`: Ma phieu khong ton tai -> thong bao dung.
- `TC-UT08-TM03-02`: Loi load du lieu -> retry va thong bao loi.

---

## UT-09: Dieu huong menu/route (`FloatingMenu` + `app.jsx`)

### TM1 - Mapping route

- `TC-UT09-TM01-01`: Menu den dung route `stats/create-order/history/customer-progress/treatment-catalogs/products/stock/inventory`.
- `TC-UT09-TM01-02`: Route default ve `stats`.
- `TC-UT09-TM01-03`: Khong co route chet/blank page.

### TM2 - Toggle feature

- `TC-UT09-TM02-01`: Toggle `enable_inventory` an/hien `stock` + `inventory`.
- `TC-UT09-TM02-02`: Logout clear token dung.

---

## UT-11: Quan ly nhan su (`#staff-management`)

**Precondition:** Sau `runSpaBootstrapForEditor`, co sheet `NHAN_VIEN`, `PHIEN_DICH_VU`, `DON_NGHI_PHEP`, `DAO_TAO_NV`, `BANG_LUONG`, `CHAM_CONG`, `LICH_CA`.

### TM1 - KPI KTV (theo PDF HCNS)

- `TC-UT11-TM01-01`: Mo tab KPI, loc KTV thang nay — hien `Doanh so DV`, `Phien HT`, `Ty le quay lai`.
- `TC-UT11-TM01-02`: Co phien CHECKED_OUT voi `diemHaiLongKhach` (1–5) — hien `HL TB` va `Ty le HL`.
- `TC-UT11-TM01-03`: Checkout phien moi, nhap diem hai long — KPI cap nhat sau reload tab.

### TM2 - Nghi phep

- `TC-UT11-TM02-01`: Tao don nghi hom nay → trang thai `Cho duyet`.
- `TC-UT11-TM02-02`: Duyet don trong ngay → NV chuyen `Nghi phep` (tab Danh sach).
- `TC-UT11-TM02-03`: Ngay sau `denNgay` (hoac reload sang ngay moi) → NV tu ve `Dang lam viec`.

### TM3 - Dao tao

- `TC-UT11-TM03-01`: NV trang thai `Dao tao`, lich CHUYEN_MON `Da len lich` → bam `Hoan thanh` → NV ve `Dang lam viec`.

### TM4 - Chot luong

- `TC-UT11-TM04-01`: Tab Bang luong ky thang nay co dong tinh luong (luong co ban + thuong DV).
- `TC-UT11-TM04-02`: Bam `Chot ky luong` + xac nhan → hien `Da chot ky`, khong cho chot lai.
- `TC-UT11-TM04-03`: In phieu luong tu dong da chot.

### TM5 - Gan KTV tren create-order

- `TC-UT11-TM05-01`: Mo phien / dat lich — chon KTV dang lam viec → luu `maNhanVien` tren phien.
- `TC-UT11-TM05-02`: KTV trang thai `Nghi phep` khong xuat hien trong dropdown gan phien.

**Playwright tu dong:** `tests/ui/staff-management.spec.ts`, `tests/ui/timeline.spec.ts` (mock GAS). Smoke tren GAS that: chay lai cac TC tren sau bootstrap.

---

## UT-10: Loai tru co chu dich (khong tinh fail parity)

Ghi nhan cac muc trong anh KiotViet nhung nam ngoai scope san pham hien tai:

- `Vay von`.
- `Cham cong nang cao`, `may cham cong`, `Zalo mini app`.
- `Bao cao tong hop nhieu loai`, `Thong bao day du`, `Thue & Ke toan`.
- `Nha cung cap` man hinh rieng, `Tra hang nhap`, `Kiem kho dang phieu`.

Voi moi muc tren:
- Neu UI khong co: danh dau `Intentional diff`.
- Neu UI co nhung chua hoan chinh: tao ticket P1/P2 tuy muc do anh huong.

---

## 5) Tong hop ket qua theo module

Mau tong hop:

- `UT code`:
- `Tong TC`:
- `PASS`:
- `FAIL`:
- `N/A`:
- `% Dat`:
- `P0/P1 can fix`:
  1. ...
  2. ...
- `Diff co chu dich`:
  1. ...
  2. ...

## 6) Definition of Done (DoD)

1. `P0 = 0`.
2. `P1` co phuong an fix ro rang (owner + due date).
3. 100% control trong bo anh tham chieu co trang thai:
   - `Match`, hoac
   - `Intentional diff`.
4. Khong con nut/popup mo coi, action khong co logic xu ly.
5. Ba luong tich hop bat buoc PASS:
   - `Dat lich -> nhan khach -> them dich vu/san pham -> checkout -> ton kho/tien trinh khach`.
   - `Nhap hang -> ton kho -> san pham`.
   - `Tao ban hang -> in phieu -> dashboard`.
