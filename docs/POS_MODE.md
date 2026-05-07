# POS Mode Guide

## Muc tieu

POS mode duoc thiet ke cho tablet/may POS:

- Thao tac 1 cham, nut lon, font input de doc
- Dieu huong nhanh bang thanh tab duoi cung
- Giu man hinh sang (wake lock) khi co ho tro
- Uu tien luong tao don + in nhiet lien tuc

## Cach bat POS mode

Co 3 cach:

1. Bat/tat ngay tren man hinh dang nhap (`POS mode: Bat/Tat`)
2. Bat/tat trong menu nguoi dung sau khi dang nhap
3. Them `?mode=pos` vao URL

App se nho che do da chon trong `localStorage`.

## Toi uu da ap dung

- Global:
  - `body.pos-mode` tang touch target
  - Input/textarea mac dinh 16px de tranh zoom tren mobile browser
  - Dieu huong duoi cung cho cac trang dung thuong xuyen
- Soan don:
  - Tu dong luu nhap (local draft)
  - Nut thao tac nhanh:
    - Luu nhap
    - Khoi phuc nhap
    - Nhan ban dong cuoi
    - An ban phim
    - Xoa nhanh form
  - Tu dong goi y khoi phuc nhap cu khi vao POS mode
- In:
  - Van dung luong Bridge Agent dang co
  - Nhat ky loi co thong diep than thien hon cho USB/Bluetooth

## Nghiep vu tien loi cho quay ban

- Don dang dang nhap lieu dang do -> tu dong luu de tranh mat du lieu
- Tao nhieu don cung mat hang -> dung `Nhan ban dong cuoi`
- Thu ngan muon thao tac nhanh -> dung tab duoi:
  - Soan don
  - Lich su
  - Cong no
  - Tu kiem tra in

## Luu y

- POS mode toi uu cho thao tac tai quay, khong thay the phan quyen nghiep vu.
- Neu can tiep tuc bo sung: shortcut ban phim cung, barcode scanner, va split-flow theo vai tro thu ngan/quan ly.
