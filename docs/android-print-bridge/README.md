# Android Print Bridge (POS) - Implementation Spec

Muc tieu: tao 1 APK nhe chay tren Android POS de web app goi `http://127.0.0.1:<port>` va in thang ra may in nhiet.

Khong xay lai he thong POS. Chi them 1 app bridge trung gian.

## 1. Scope MVP

- Chay local HTTP server tren Android (`127.0.0.1:15321` mac dinh)
- API can co:
  - `GET /health`
  - `GET /printers`
  - `POST /print`
  - `OPTIONS *` (CORS preflight)
- Ho tro in:
  - URL hoa don (`type=receipt-url`)
  - HTML text (`type=receipt-html`, optional)
  - Raw ESC/POS (`type=raw-escpos`, optional phase 2)
- Queue in tuan tu (1 luong), co timeout + retry co kiem soat
- Tu khoi dong cung may POS
- Ghi log local de debug su co

## 2. Khuyen nghi cong nghe

- Language: Kotlin
- HTTP server: Ktor (Netty/CIO)
- ESC/POS:
  - USB/Bluetooth: `DantSu/ESCPOS-ThermalPrinter-Android` hoac tuong duong
  - LAN/TCP9100: socket thuong + escpos command
- Persist config: DataStore
- Background runtime: Foreground Service + BootReceiver

## 3. Kien truc nhanh

1. `BridgeService`:
   - Chay foreground service
   - Start embedded HTTP server
2. `PrinterManager`:
   - Discover printer theo kenh USB/LAN/BT
   - Tra danh sach cho `/printers`
3. `PrintQueue`:
   - Nhan jobs tu `/print`
   - Xu ly tuan tu
4. `Renderer`:
   - `receipt-url`: WebView offscreen -> bitmap/text -> escpos
   - `receipt-html`: html -> bitmap/text -> escpos
5. `ConfigStore`:
   - port, token, allowed origins, default printer, timeout

## 4. API contract

Xem file [api-contract.md](./api-contract.md).

## 5. Bao mat can co

- Bind localhost (`127.0.0.1`) theo mac dinh
- Header token bat buoc: `X-Bridge-Token`
- Gioi han CORS origin theo allowlist
- Reject request khong co token / sai token
- Co endpoint rotate token trong man hinh setting noi bo

## 6. Rule van hanh

- Neu may in dang ban: response loi ro rang (`PRINTER_BUSY`)
- Neu khong tim thay may in: `PRINTER_NOT_FOUND`
- Neu timeout: `PRINT_TIMEOUT`
- Khong crash service khi 1 job loi
- Log JSON line: timestamp, event, code, printer, status, message

## 7. Tich hop web app hien tai

Web app da goi:
- `GET /health`
- `GET /printers`
- `POST /print` voi payload:
  - `type=receipt-url`
  - `url`
  - `code`
  - `size` (`58`/`80`)
  - `printerName` (optional)

Bridge Android can tuong thich 100% payload nay.

## 8. Build/release checklist

Xem file [release-checklist.md](./release-checklist.md).
## 9. Huong dan build/cai APK

Xem tai lieu chi tiet: [APK_BUILD_AND_RUN.md](./APK_BUILD_AND_RUN.md).

