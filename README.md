# 🔒 Quy định sử dụng Base Template

## ❗ Không được push trực tiếp Base này lên Git chung

Base này chỉ dùng làm **template khởi tạo dự án mới**.

Không được:

- Push trực tiếp base này lên Git production
- Sử dụng chung 1 repository cho nhiều dự án
- Đẩy code khách hàng vào repository base
- Chỉnh sửa base gốc để làm dự án khách hàng

---

## ✅ Cách sử dụng đúng

### 1️⃣ Clone base về máy

```bash
git clone <base-repo>
```

### 2️⃣ Xoá git history của base

```bash
rm -rf .git
```

### 3️⃣ Tạo repository mới cho dự án

```bash
git init
git remote add origin <new-project-repo>
```

### 4️⃣ Commit và push lên repo riêng

```bash
git add .
git commit -m "Initial commit from base"
git push -u origin main
```

---

# 📦 Mỗi dự án bắt buộc phải có

- Repository Git riêng
- ScriptId riêng (`.clasp.json`)
- Google Apps Script project riêng
- Spreadsheet riêng (nếu có sử dụng)
- Deployment riêng

---

# 🚨 Tuyệt đối không

- Dùng chung 1 Apps Script project cho nhiều khách hàng
- Dùng chung 1 Spreadsheet cho nhiều hệ thống
- Push nhầm `scriptId` của dự án khác
- Push file `.clasp.json` chứa `scriptId` production của dự án khác

---

# 🎯 Lý do

- Tránh rò rỉ dữ liệu khách hàng
- Tránh ghi đè nhầm project production
- Tránh xung đột scriptId khi deploy
- Giữ mỗi dự án độc lập và dễ bảo trì

---

# 🧠 Nguyên tắc công ty

Base = Template  
Project = Repository riêng  
Client = GAS project riêng  

Không bao giờ dùng chung tài nguyên giữa các dự án.

---

# Realtime Multi-User (Firebase)

Base đã hỗ trợ realtime đồng bộ nhiều máy theo kiểu signal:

- Khi mutation API thành công (tạo/sửa/xóa), client ghi 1 signal lên Firestore.
- Các máy khác đang mở cùng dự án nhận signal tức thì và tự clear cache + reload dữ liệu trang.
- Listener realtime chỉ chạy khi tab đang `visible` để giảm chi phí reads.
- Nếu Firebase chưa cấu hình hoặc auth/rules lỗi, app tự fallback về polling phiên bản cache như cũ.
- Khi mở app lại sau thời gian offline, hệ thống tự so sánh signal gần nhất để bắt kịp thay đổi trước đó.

## Setup nhanh

1. Tạo project trên Firebase Console.
2. Bật `Authentication` -> `Sign-in method` -> `Anonymous`.
3. Bật `Firestore Database` (Native mode).
4. Tạo Web App trong Firebase và copy config.
5. Copy `.env.example` thành `.env`, điền:

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
VITE_REALTIME_PROJECT_KEY=
```

`VITE_REALTIME_PROJECT_KEY` có thể để trống, hệ thống tự derive từ `VITE_GAS_WEBAPP_URL`.
Nếu cả 2 đều không có key hợp lệ, realtime sẽ tự tắt để tránh lẫn dữ liệu giữa dự án.

## Firestore Rules khuyến nghị

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /soanhang_sync_signals/{projectKey} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Rule này yêu cầu user anonymous auth hợp lệ, tránh mở public gây phát sinh chi phí ngoài ý muốn.
