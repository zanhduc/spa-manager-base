# Manual E2E checklist — cache/sync nghiệm thu

## Cache-first mount
- [ ] Mở `products`, `stock`, `history`, `customer-progress` khi đã có cache → thấy data ngay, không spinner full-page
- [ ] Mở `receipt?code=...` khi order đã trong cache → render ngay, fetch nền silent

## Cross-sync (2 tab)
- [ ] Tab A checkout → Tab B `history` + `customer-progress` + timeline cập nhật
- [ ] Tab A chấm công → Tab B payroll thấy ngay
- [ ] Tab A sửa products → Tab B `stock` / `inventory` suggestions sync
- [ ] Version bump / Firebase → toast tối đa 1 lần, UI tự hydrate

## Toast policy
- [ ] Mutation local (checkout, lưu SP) → không toast remote sync
- [ ] Bấm「Tải lại」→ không toast
- [ ] Sheet đổi từ nguồn khác → toast khi `hadChanges: true`

## Form draft
- [ ] Products row mới → rời trang → quay lại còn draft
- [ ] Treatment catalog tab/dữ liệu → Tải lại xóa draft đúng lúc
- [ ] Create-order booking modal → draft theo mode room

## Validation FE-only
- [ ] Thao tác UI cho phép → BE không `success: false` vì rule nghiệp vụ spa
- [ ] Trùng lịch giường/NV bị chặn trên timeline trước khi gọi API
