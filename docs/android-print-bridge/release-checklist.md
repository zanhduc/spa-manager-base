# Release Checklist - Android Bridge APK

## A. Build config

1. App ID co suffix environment (dev/stg/prod)
2. Version code + version name tang dung quy tac
3. Min SDK phu hop may POS hien tai
4. Foreground service permission day du
5. Boot receiver duoc khai bao

## B. Runtime config

1. Port mac dinh `15321`
2. Bind `127.0.0.1` (khong public LAN) cho ban prod
3. Token auth bat buoc
4. CORS allowlist dung domain app

## C. Smoke test tren 1 may POS

1. Cai APK
2. Mo app bridge -> service status phai la `Running`
3. Test `GET /health` tu browser tren may POS
4. Test `GET /printers` co list may in
5. In test 58mm tu web app
6. In test 80mm tu web app
7. Reboot may -> service tu len lai

## D. Observability

1. Co man hinh xem 200 dong log gan nhat
2. Co nut export log ra file txt
3. Co thong tin:
   - app version
   - printer selected
   - last health ping
   - last print error

## E. Rollout plan

1. Pilot 1-3 cua hang
2. Theo doi:
   - ty le in thanh cong
   - trung binh thoi gian in
   - loi top 3
3. Khi on dinh, rollout toan bo

## F. Runbook su co nhanh

1. `/health` fail:
   - service chua chay
   - port conflict
2. `/printers` rong:
   - driver/chanel USB-LAN-BT chua dung
3. `/print` timeout:
   - printer offline
   - ket noi LAN loi
4. Web app bao unauthorized:
   - token sai / het han
