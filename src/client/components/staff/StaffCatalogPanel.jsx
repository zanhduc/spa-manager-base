import { useMemo, useRef, useState, useCallback } from "react";
import toast from "react-hot-toast";
import { CustomDropdown } from "../CustomDropdown";
import { useConfirm } from "../ConfirmDialog";
import { useFormDraft } from "../../hooks/useFormDraft.js";
import { FORM_DRAFT_KEYS } from "../../utils/formDraftCache.js";
import {
  STAFF_ROLE_OPTIONS,
  STAFF_STATUS_OPTIONS,
  STAFF_SHIFT_DEFINITIONS,
  buildStaffForm,
  formatStaffDateDisplay,
  formatStaffShiftLabel,
  formatVnNumber,
  getStaffRoleLabel,
  inferStaffRole,
  matchesStaffStatusFilter,
  normalizeStaffPayload,
  parseVnNumber,
  toStaffDateInputValue,
} from "./staffConstants";

export function StaffCatalogPanel({
  staffs = [],
  stays = [],
  onCreate,
  onUpdate,
  onDelete,
  DropdownComponent,
  roleFilter = "ALL",
  statusFilter = "ALL",
  keyword = "",
}) {
  const [editingCode, setEditingCode] = useState("");
  const buildNewStaffForm = useCallback(
    () => buildStaffForm({}, staffs, { isNew: true }),
    [staffs],
  );
  const {
    value: newStaffForm,
    setValue: setNewStaffForm,
    clearDraft: clearNewStaffDraft,
    resetValue: resetNewStaffForm,
  } = useFormDraft(FORM_DRAFT_KEYS.staffCatalog, buildNewStaffForm, {
    enabled: !editingCode,
    page: "staff-management",
  });
  const [editForm, setEditForm] = useState(() => buildStaffForm({}, staffs, { isNew: true }));
  const form = editingCode ? editForm : newStaffForm;
  const setForm = editingCode ? setEditForm : setNewStaffForm;
  const formSectionRef = useRef(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const resetForm = () => {
    setEditingCode("");
    clearNewStaffDraft();
    resetNewStaffForm(buildNewStaffForm());
  };

  const linkedStayCountByStaff = useMemo(() => {
    const map = new Map();
    stays.forEach((stay) => {
      const code = String(stay.maNhanVien || "").trim();
      if (!code) return;
      if (!["BOOKED", "IN_HOUSE"].includes(String(stay.trangThaiPhien || "").toUpperCase())) return;
      map.set(code, (map.get(code) || 0) + 1);
    });
    return map;
  }, [stays]);

  const filteredStaffs = useMemo(() => {
    const lowerKeyword = String(keyword || "").trim().toLowerCase();
    return staffs
      .filter((staff) => {
        if (roleFilter !== "ALL" && inferStaffRole(staff) !== roleFilter) return false;
        if (!matchesStaffStatusFilter(staff, statusFilter)) return false;
        if (!lowerKeyword) return true;
        const haystack = [
          staff.maNhanVien,
          staff.tenNhanVien,
          staff.chucVu,
          staff.soDienThoai,
          staff.ghiChu,
          getStaffRoleLabel(staff),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(lowerKeyword);
      })
      .sort((a, b) => String(a.maNhanVien || "").localeCompare(String(b.maNhanVien || ""), "vi"));
  }, [keyword, roleFilter, staffs, statusFilter]);

  const startEdit = (staff) => {
    setEditingCode(String(staff?.maNhanVien || "").trim());
    setEditForm(buildStaffForm(staff, staffs));
    window.requestAnimationFrame(() => {
      formSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  };

  const submit = async () => {
    if (!form.tenNhanVien) {
      toast.error("Cần nhập tên nhân viên.");
      return;
    }
    if (!form.chucVu) {
      toast.error("Chọn vai trò nhân viên.");
      return;
    }
    if (!form.shiftSang && !form.shiftChieu && !form.shiftToi) {
      toast.error("Chọn ít nhất một ca làm việc.");
      return;
    }
    const payload = normalizeStaffPayload(form);
    const staffCode = String(payload.maNhanVien || "").trim();
    if (
      !editingCode &&
      staffs.some((staff) => String(staff.maNhanVien || "").trim() === staffCode)
    ) {
      toast.error(`Mã nhân viên ${staffCode} đã tồn tại.`);
      return;
    }
    const ok = editingCode ? await onUpdate(payload) : await onCreate(payload);
    if (ok !== false) resetForm();
  };

  const remove = async (staff) => {
    const code = String(staff?.maNhanVien || "").trim();
    if (!code) return;
    if ((linkedStayCountByStaff.get(code) || 0) > 0) {
      toast.error("Nhân viên đang có lịch hẹn hoặc phiên mở, không thể xóa.");
      return;
    }
    const ok = await confirm({
      message: `Xóa nhân viên ${staff?.tenNhanVien || code}?`,
      yesLabel: "Xóa",
      yesStyle: "danger",
    });
    if (!ok) return;
    const deleted = await onDelete({ maNhanVien: code });
    if (deleted !== false && editingCode === code) resetForm();
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_360px]">
      {confirmDialog}
      <div className="space-y-3">
        <div className="hidden rounded-xl border border-slate-200 bg-white md:block">
          <div className="grid grid-cols-[100px_minmax(0,1fr)_120px_120px_120px_90px] gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            <span>Mã</span>
            <span>Nhân viên</span>
            <span>Vai trò</span>
            <span>Ca mặc định</span>
            <span>Trạng thái</span>
            <span className="text-right">Hành động</span>
          </div>
          <div className="max-h-[68vh] overflow-y-auto">
            {filteredStaffs.length === 0 ? (
              <div className="px-3 py-6 text-sm text-slate-500">Chưa có nhân viên phù hợp bộ lọc.</div>
            ) : (
              filteredStaffs.map((staff) => {
                const code = String(staff.maNhanVien || "");
                const joinLabel = staff.ngayVaoLam
                  ? formatStaffDateDisplay(staff.ngayVaoLam)
                  : "";
                return (
                  <div
                    key={`staff-row-${code}`}
                    className={`grid grid-cols-[100px_minmax(0,1fr)_120px_120px_120px_90px] gap-2 border-b border-slate-100 px-3 py-3 text-sm last:border-b-0 ${
                      editingCode === code ? "bg-amber-50/60" : ""
                    }`}
                  >
                    <div className="font-semibold text-slate-700">{code}</div>
                    <div>
                      <p className="font-semibold text-slate-800">{staff.tenNhanVien || "-"}</p>
                      <p className="text-xs text-slate-500">
                        {staff.soDienThoai || "Chưa có SĐT"}
                        {joinLabel ? ` • Vào ${joinLabel}` : ""}
                      </p>
                      <p className="text-xs text-slate-400">{staff.ghiChu || ""}</p>
                    </div>
                    <div className="text-xs text-slate-600">{getStaffRoleLabel(staff)}</div>
                    <div className="text-xs text-slate-600">
                      {formatStaffShiftLabel(staff.caLamViec, STAFF_SHIFT_DEFINITIONS)}
                    </div>
                    <div className="text-slate-600">{staff.trangThai || STAFF_STATUS_OPTIONS[2]}</div>
                    <div className="flex items-start justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(staff)}
                        className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                      >
                        Sửa
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(staff)}
                        className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                      >
                        Xóa
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="space-y-2 md:hidden">
          {filteredStaffs.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-6 text-sm text-slate-500">
              Chưa có nhân viên phù hợp bộ lọc.
            </div>
          ) : (
            filteredStaffs.map((staff) => {
              const code = String(staff.maNhanVien || "");
              return (
                <div
                  key={`staff-card-${code}`}
                  className={`rounded-xl border bg-white p-3 text-sm shadow-sm ${
                    editingCode === code ? "border-amber-300 bg-amber-50/40" : "border-slate-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-800">{staff.tenNhanVien || "-"}</p>
                      <p className="text-xs text-slate-500">{code}</p>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
                      {staff.trangThai || STAFF_STATUS_OPTIONS[2]}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-slate-600">
                    <p>Vai trò: {getStaffRoleLabel(staff)}</p>
                    <p>Ca: {formatStaffShiftLabel(staff.caLamViec, STAFF_SHIFT_DEFINITIONS)}</p>
                    <p>{staff.soDienThoai || "Chưa có SĐT"}</p>
                    {staff.ghiChu ? <p className="text-slate-400">{staff.ghiChu}</p> : null}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(staff)}
                      className="flex-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-xs font-semibold text-amber-700"
                    >
                      Sửa
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(staff)}
                      className="flex-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-2 text-xs font-semibold text-rose-700"
                    >
                      Xóa
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <section
        ref={formSectionRef}
        className={`rounded-2xl border p-4 transition-colors ${
          editingCode
            ? "border-amber-300 bg-amber-50/50 ring-2 ring-amber-200/80"
            : "border-slate-200 bg-slate-50/70"
        }`}
      >
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-black text-slate-800">
            {editingCode ? `Sửa nhân viên ${editingCode}` : "Thêm nhân viên mới"}
          </h4>
          {editingCode ? (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
            >
              Hủy sửa
            </button>
          ) : null}
        </div>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Mã nhân viên</label>
            <input
              value={form.maNhanVien}
              disabled={Boolean(editingCode)}
              onChange={(e) => setForm((prev) => ({ ...prev, maNhanVien: String(e.target.value || "").trim() }))}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Tên nhân viên *</label>
            <input
              value={form.tenNhanVien}
              onChange={(e) => setForm((prev) => ({ ...prev, tenNhanVien: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Vai trò *</label>
            {DropdownComponent ? (
              <DropdownComponent
                value={form.chucVu}
                onChange={(next) => setForm((prev) => ({ ...prev, chucVu: String(next || "") }))}
                options={[
                  { value: "", label: "Chọn vai trò" },
                  ...STAFF_ROLE_OPTIONS.map((role) => ({ value: role.value, label: role.label })),
                ]}
                buttonClassName="py-2"
              />
            ) : (
              <CustomDropdown
                value={form.chucVu}
                onChange={(next) => setForm((prev) => ({ ...prev, chucVu: String(next || "") }))}
                placeholder="Chọn vai trò"
                preferPlaceholderWhenEmpty
                options={STAFF_ROLE_OPTIONS}
              />
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Số điện thoại</label>
              <input
                value={form.soDienThoai}
                onChange={(e) => setForm((prev) => ({ ...prev, soDienThoai: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Ngày vào làm</label>
              <input
                type="date"
                value={toStaffDateInputValue(form.ngayVaoLam)}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, ngayVaoLam: e.target.value }))
                }
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Trạng thái</label>
            {DropdownComponent ? (
              <DropdownComponent
                value={form.trangThai}
                onChange={(next) =>
                  setForm((prev) => ({ ...prev, trangThai: String(next || STAFF_STATUS_OPTIONS[2]) }))
                }
                options={STAFF_STATUS_OPTIONS.map((status) => ({ value: status, label: status }))}
                buttonClassName="py-2"
              />
            ) : (
              <CustomDropdown
                value={form.trangThai}
                onChange={(next) =>
                  setForm((prev) => ({ ...prev, trangThai: String(next || STAFF_STATUS_OPTIONS[2]) }))
                }
                options={STAFF_STATUS_OPTIONS.map((status) => ({ value: status, label: status }))}
              />
            )}
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-600">Ca làm việc mặc định *</label>
            <div className="flex flex-wrap gap-2">
              {STAFF_SHIFT_DEFINITIONS.map((shift) => {
                const field =
                  shift.code === "SANG" ? "shiftSang" : shift.code === "CHIEU" ? "shiftChieu" : "shiftToi";
                return (
                  <label
                    key={`staff-shift-${shift.code}`}
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${
                      form[field]
                        ? "border-sky-300 bg-sky-50 text-sky-700"
                        : "border-slate-200 bg-white text-slate-600"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(form[field])}
                      onChange={(e) => setForm((prev) => ({ ...prev, [field]: e.target.checked }))}
                      className="rounded border-slate-300"
                    />
                    {shift.label}
                  </label>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Lương cơ bản / tháng (VND)</label>
              <input
                type="text"
                inputMode="numeric"
                value={form.luongCoBanThang}
                onChange={(e) => {
                  const parsed = parseVnNumber(e.target.value);
                  setForm((prev) => ({
                    ...prev,
                    luongCoBanThang:
                      parsed === "" ? "" : formatVnNumber(parsed),
                  }));
                }}
                placeholder="VD: 8.000.000"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">% thưởng doanh số DV</label>
              <input
                type="number"
                min={0}
                max={100}
                value={form.tyLeThuongDichVu}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, tyLeThuongDichVu: e.target.value }))
                }
                placeholder="Để trống = mặc định theo vai trò"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Ghi chú</label>
            <textarea
              value={form.ghiChu}
              onChange={(e) => setForm((prev) => ({ ...prev, ghiChu: e.target.value }))}
              rows={3}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={submit}
            className="w-full rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700"
          >
            {editingCode ? "Lưu thay đổi" : "Thêm nhân viên"}
          </button>
        </div>
      </section>
    </div>
  );
}
