# Windows One-Click Bridge Installer

Bo nay dung de cai `print bridge` tren may Windows theo kieu 1 click:
- chay bridge dang Windows Service
- tu khoi dong cung he dieu hanh
- mo firewall port `15321`
- test nhanh endpoint `/health` va `/printers`

## 1) Chuan bi bo cai gui cho khach

Trong thu muc nay, ban can co:
- `install-bridge.bat`
- `install-bridge.ps1`
- `check-bridge.ps1`
- `uninstall-bridge.bat`
- `uninstall-bridge.ps1`
- file bridge executable: `soanhang-print-bridge.exe`

Luu y:
- Ten mac dinh executable la `soanhang-print-bridge.exe`.
- Neu executable ten khac, doi ten file hoac truyen tham so `-BridgeExeName`.

## 2) Cach cai tren may khach (1 lan duy nhat)

1. Chuot phai `install-bridge.bat` -> `Run as administrator`.
2. Doi script chay xong, nhin dong:
   - `[OK] Hoan tat cai dat bridge.`
3. Neu script bao loi, mo PowerShell admin va chay:

```powershell
cd <thu_muc_installer>
.\install-bridge.ps1 -BridgeArgs "--port 15321"
```

## 3) Kiem tra nhanh sau cai dat

Mo PowerShell:

```powershell
cd <thu_muc_installer>
.\check-bridge.ps1
```

Ky vong:
- Service `SoanHangPrintBridge` dang `Running`
- `/health` tra ve OK
- `/printers` tra danh sach may in

## 4) Dung voi app web

App da khoa mode in `bridge` va endpoint mac dinh:
- `http://127.0.0.1:15321`

Sau khi cai bridge + cai driver may in:
- dang nhap app
- app se tu auto setup bridge/printer
- in se chay thang khong can preview browser

## 5) Lenh tuy chinh thuong dung

Cai bridge tu executable o duong dan khac:

```powershell
.\install-bridge.ps1 -BridgeExePath "D:\pkg\bridge.exe" -BridgeArgs "--port 15321"
```

Mo firewall cho LAN (neu ban can may khac trong mang goi bridge):

```powershell
.\install-bridge.ps1 -AllowLan
```

Go cai dat:

```powershell
.\uninstall-bridge.ps1
```

Go cai dat + xoa file:

```powershell
.\uninstall-bridge.ps1 -PurgeFiles
```

## 6) Checklist loi thuong gap

1. Service khong len:
   - Sai `BridgeArgs` so voi executable.
   - Chay thu cong executable de xem tham so dung.
2. `/health` timeout:
   - Bridge khong bind dung port `15321`.
   - Firewall/antivirus chan.
3. `/printers` rong:
   - Chua cai driver may in nhiet.
   - May in chua duoc Windows nhan.
