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

## 8.1 GAS adapter — chỉ đọc/ghi, không validate nghiệp vụ

- Mọi rule nghiệp vụ (bắt buộc field, trạng thái chặn, trùng mã, chặn xóa khi còn phiên, ...) **phải nằm ở UI/React**.
- `gasAdapter.js` (GAS backend) chỉ được:
  - đọc/ghi sheet theo header
  - chuẩn hóa format lưu (trim, ngày giờ, `updatedAt`)
  - lock + queue concurrency
  - báo lỗi **kỹ thuật** (không tìm thấy dòng để update/delete, exception hệ thống)
- **Không** validate nghiệp vụ trong GAS (không `return { success: false }` vì rule spa).
- `localAdapter.js` mirror cùng nguyên tắc để DEV/PROD hành xử giống nhau.

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

### 9.5 Auto Push Sau Khi Hoan Tat Sua
- Sau khi hoàn tất một lượt sửa code theo yêu cầu user, bắt buộc chạy:
  - `npm run push`
- Chỉ được coi là hoàn tất khi:
  1. Build pass (`npm run build`)
  2. Push GAS pass (`clasp push`)
- Nếu push lỗi, phải báo lỗi cụ thể và tiếp tục xử lý đến khi push thành công.

---

# Global AI Agent Coding Rules

**[SYSTEM DIRECTIVE]**
You are an AI coding assistant. You must strictly adhere to the following 13 architectural and coding rules for all tasks, suggestions, and code generation. Do not deviate from these rules under any circumstances.

---

**1. Toàn bộ việc xác thực dữ liệu (validate) phải nằm ở UI và FE.** 
Frontend là nguồn duy nhất và tuyệt đối để xác thực luồng nghiệp vụ. Nếu UI cho phép một hành động và không hiển thị cảnh báo hoặc chặn, backend phải hoàn thành hành động đó thành công; ngoại trừ các trường hợp lỗi máy chủ, lỗi quyền truy cập, lỗi mạng hoặc dữ liệu hệ thống thực sự bị hỏng.

**2. Backend chỉ đảm nhiệm vai trò duy nhất là giao tiếp với Sheet.** 
Trách nhiệm của BE là tạo, cập nhật, xóa, lưu trữ dữ liệu bền vững xuống Sheet, tạo định danh, ghi log và trả về kết quả. Tuyệt đối không thêm các quy tắc nghiệp vụ hoặc logic validate ở BE nhằm chặn một luồng đã được frontend phê duyệt.

**3. Ưu tiên tối ưu hóa hành vi UI.** 
Khi người dùng thực hiện các hành động vận hành, UI phải cập nhật ngay lập tức từ bộ nhớ đệm (cache) hoặc trạng thái cục bộ (local state). Quá trình lưu trữ dữ liệu xuống Sheet phải được chạy ngầm. Không bắt UI phải chờ quá trình lưu trữ từ xa hoàn tất rồi mới phản hồi hành động của người dùng.

**4. Dữ liệu cache là nguồn hiển thị tức thời và tự động đồng bộ.** 
Sau một thay đổi dữ liệu, UI phải thấy kết quả ngay từ cache. Khi dữ liệu dưới Sheet thay đổi, UI phải tự động đồng bộ (auto-sync) ngầm mà không làm gián đoạn trải nghiệm người dùng. **Tuyệt đối loại bỏ khái niệm tải lại trang thủ công (manual reloads)**; không cho phép các sự kiện realtime cũ làm giao diện bị khôi phục về trạng thái trước đó. Đừng bao giờ sử dụng lệnh `window.location.reload()`.

**5. Realtime dùng để đồng bộ hóa ngầm.** 
Khi xảy ra xung đột, ưu tiên thay đổi cục bộ mới nhất. **Chỉ hiển thị thông báo (toast) khi có sự khác biệt hoặc xung đột thực sự** giữa trạng thái thao tác của người dùng và dữ liệu từ Sheet (ví dụ: dữ liệu vừa sửa bị người khác ghi đè). Không hiển thị các toast thông báo thành công dư thừa cho các luồng hoạt động bình thường.

**6. Xử lý lỗi lưu trữ ngầm an toàn.** 
Các lỗi lưu dữ liệu xuống Sheet phải được ghi log rõ ràng và chỉ hiển thị lỗi qua toast cho chính bản ghi bị ảnh hưởng. Lỗi không được gây ra hiện tượng nhảy UI, cập nhật chéo, hoặc vô tình thay đổi bản ghi khác. Chỉ khôi phục (rollback) thực thể bị lỗi, giữ nguyên hoạt động trơn tru của toàn bộ trang. Không bao giờ tải lại toàn bộ trang khi có lỗi.

**7. Hiểu rõ luồng dữ liệu trước khi sửa đổi.** 
Hãy đọc toàn bộ luồng liên quan từ đầu đến cuối qua UI, API, cache, BE, Sheet và mọi màn hình dùng chung một khóa dữ liệu (data key). Đối với tính năng dòng thời gian/lập lịch, phải kiểm tra kỹ trạng thái phiên, tài nguyên, đặt lịch, thanh toán, v.v.

**8. Không thay đổi logic nghiệp vụ theo cảm tính.** 
Nếu việc thay đổi một quy tắc có thể ảnh hưởng đến các luồng khác, phải rà soát các kịch bản thay thế (bắt đầu ngay, đặt lịch trước, đến muộn, hủy, chỉnh sửa thời gian, đa tài nguyên, đa nhân sự...).

**9. Bảo vệ nghiêm ngặt màn hình điều hành (Timeline/Scheduler).** 
Đây là các bề mặt thao tác trọng yếu. Không cho phép các khối dữ liệu nhảy tài nguyên, nhảy trạng thái, lệch khỏi mốc thời gian hoặc biến mất sau khi tương tác. Mọi thay đổi ở đây phải đi kèm unit/helper tests và E2E tests (nếu có).

**10. Bảo vệ định dạng mã hóa ngôn ngữ.** 
Luôn giữ nguyên định dạng UTF-8 cho các văn bản không phải tiếng Anh. Ưu tiên sử dụng `apply_patch`. Không sử dụng các lệnh đọc/ghi có thể làm mất bảng mã (như `Get-Content`/`Set-Content` không an toàn). Chạy công cụ bảo vệ bảng mã (encoding guard) trước khi hoàn tất sửa đổi.

**11. Quy hoạch Component hợp lý.** 
Tách nhỏ component khi tệp quá lớn hoặc UI có các vùng độc lập (popup, timeline, modal). Không chia tách các logic nghiệp vụ nhạy cảm nếu chưa có test hoặc biện pháp bảo vệ rõ ràng.

**12. Tuân thủ quy trình kiểm tra sau khi sửa đổi.** 
Sau khi thay đổi, bắt buộc chạy tối thiểu: build, unit tests liên quan, diff check và encoding guard. Không được khẳng định code đã an toàn để đưa lên production nếu chưa qua các bước xác thực này.

**13. Lập kế hoạch trước khi code (với các yêu cầu phức tạp).** 
Với các thay đổi lớn, phải tạo một kế hoạch triển khai chi tiết: chỉ ra module ảnh hưởng, luồng dữ liệu, điểm chạm API/cache/Sheet, vùng rủi ro, và chiến lược rollback. Không bắt tay vào viết code khi kế hoạch chưa đủ rõ ràng để chống lỗi hồi quy.

---
**[ENFORCEMENT]**
Before proposing or writing any code, silently verify your approach against these 13 rules. If your solution violates any rule (e.g., adding a manual page reload, putting business logic validation in the BE, or spamming toasts), you must self-correct before outputting the response.
