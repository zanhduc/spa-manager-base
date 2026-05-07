# BẮT BUỘC: CONCURRENCY GUARD (LOCK + QUEUE)

Tất cả API ghi dữ liệu GAS phải chạy trong `DocumentLock` và có hàng đợi (QUEUE) để tránh đè dữ liệu khi nhiều người thao tác cùng lúc.

**Thiết lập bắt buộc:**
1. Thêm scope sau vào `appsscript.json`:
   - `https://www.googleapis.com/auth/script.scriptapp`
2. Chạy hàm `setupQueueInfrastructure()` trong GAS Editor để:
   - tạo sheet `QUEUE`
   - tạo trigger `processQueue`
3. Nếu bị báo thiếu quyền, cấp quyền và chạy lại.

**Cách đưa vào API (bắt buộc):**
- Mọi hàm ghi dữ liệu phải bọc theo mẫu:

```
function myAction(payload) {
  return runWithLockOrQueue_("MY_ACTION", { payload: payload }, function() {
    return myActionInternal_(payload);
  });
}

function myActionInternal_(payload) {
  // logic ghi sheet ở đây
}
```

- Khi lock bận: trả về `{ queued: true, jobId }` để UI báo “đang xếp hàng”.
- Không cho phép ghi song song vào sheet.

---

# GAS React Base - Development Rules

Tài liệu này là quy chuẩn bắt buộc cho mọi dev sử dụng base này.

---

## 1. Nguyên tắc môi trường

Base có 2 môi trường:

- DEV (`npm run dev`) -> dùng local adapter
- PROD (`npm run build` + `clasp push`) -> dùng GAS adapter

Tuyệt đối không:
- Hardcode URL GAS trong component
- Gọi fetch trực tiếp trong page/component

Mọi API phải đi qua:
`src/client/api`

---

## 2. Kiến trúc bắt buộc

Flow chuẩn:

React (UI)  
-> api wrapper  
-> adapter (local / gas)  
-> data source

Component không được:
- Gọi `SpreadsheetApp`
- Viết logic GAS
- Xử lý business logic phức tạp

---

## 3. Business Logic

Business logic phải:
- Viết thuần JavaScript

Ví dụ:
- Tính tổng đơn
- Validate trạng thái nợ
- Chuẩn hóa dữ liệu

Không viết logic tính toán trực tiếp trong `Code.js` nếu có thể tách ra.

---

## 4. UI / CSS Rule

UI phải ưu tiên mobile-first để thuận tiện cho khách khi dùng trên mobile.

### Tailwind First

- Ưu tiên dùng Tailwind CSS.
- Không viết CSS tay nếu Tailwind có thể dùng được.

### Layout

Luôn dùng fluid layout:
- `w-full`
- `max-w-*`
- `mx-auto`

Không hardcode width bằng px.

### Responsive

Áp dụng:
- Mobile-first design
- Default = mobile
- Chỉ thêm breakpoint khi cần
- Đa số trường hợp chỉ nên thêm breakpoint cho `md` (tablet)

Ví dụ:
- `grid-cols-1 md:grid-cols-2`
- `text-sm md:text-base`

Không tạo file CSS riêng cho từng component/file.

---

## 5. State & Loading

Mọi API call phải có:
- loading state
- error handling

Không được gọi API trực tiếp trong `useEffect` mà không xử lý lỗi.

---

## 6. Cấu trúc thư mục

- `client/` -> UI
- `components/` -> component tái sử dụng/chia nhỏ page để dễ debug
- `pages/` -> page-level component
- `api/` -> gọi API
- `core/` -> logic tính toán (các function)

Không để lẫn file lung tung.

---

## 7. Không được làm

- Không chỉnh trực tiếp file trong `dist/`
- Không push base gốc lên GitHub project
- Không commit `node_modules`
- Không sửa cấu trúc base nếu chưa thống nhất

---

## 8. Tư duy bắt buộc

GAS chỉ là adapter kết nối Google Sheet.  
React + Business Logic mới là sản phẩm thật sự.

---

## 9. Bổ sung (General Rules)

### 9.1 UTF-8 Only
- Toàn bộ file code/text (`.js`, `.jsx`, `.ts`, `.tsx`, `.json`, `.md`, `.html`, `.css`) phải dùng UTF-8.
- Không chấp nhận ký tự lỗi mã hóa (mojibake).
- Nếu phát hiện lỗi encode, sửa ngay trước khi tiếp tục tính năng khác.

### 9.2 State + Error Handling Bắt Buộc
- Mọi luồng async phải có đủ 3 trạng thái: `loading`, `success`, `error`.
- Không gọi API mà bỏ qua xử lý lỗi.
- Không để UI im lặng khi thao tác thất bại; phải có phản hồi rõ ràng (toast/banner/message).

### 9.3 UI Consistency
- Cùng loại thao tác phải dùng cùng pattern UI.
- Thao tác nguy hiểm (xóa, reset, ghi đè) phải có xác nhận.
- Trạng thái nút phải nhất quán: `disabled`, `loading`, `success/error`.
- Cùng một khái niệm thì dùng cùng tên hiển thị, cùng màu, cùng badge/dropdown style.

### 9.4 Test Critical Flows First
- Ưu tiên test các luồng ảnh hưởng dữ liệu/tiền trước:
  - Thêm / sửa / xóa dữ liệu
  - Đồng bộ đa nguồn dữ liệu
  - Tính toán tổng tiền, công nợ, trạng thái
- Mỗi thay đổi lớn phải có checklist test nhanh trước khi merge/deploy.
