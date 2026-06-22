export const STAFF_MANAGEMENT_TABS = [
  { id: "catalog", label: "Danh sách nhân viên", group: "Hồ sơ", icon: "👥" },
  { id: "schedule", label: "Lịch ca", group: "Vận hành ca", icon: "📅" },
  { id: "attendance", label: "Chấm công", group: "Vận hành ca", icon: "⏱️" },
  { id: "checklist", label: "Checklist ca", group: "Vận hành ca", icon: "✅" },
  { id: "kpi", label: "KPI", group: "Đánh giá & lương", icon: "📊" },
  { id: "payroll", label: "Bảng lương", group: "Đánh giá & lương", icon: "💰" },
  { id: "violations", label: "Vi phạm", group: "Hành chính", icon: "⚠️" },
  { id: "leave", label: "Nghỉ phép", group: "Hành chính", icon: "🏖️" },
  { id: "training", label: "Đào tạo", group: "Hành chính", icon: "📚" },
];

const tabButtonClass = (active) =>
  `inline-flex min-w-fit items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
    active
      ? "border border-rose-200 bg-rose-500 text-white shadow-sm"
      : "border border-slate-200 bg-white text-slate-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
  }`;

export function StaffManagementNav({ activeTab, onNavigate, tabs = STAFF_MANAGEMENT_TABS }) {
  const activeTabMeta = tabs.find((tab) => tab.id === activeTab);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-rose-500">Điều hướng</p>
          <p className="mt-1 text-sm font-bold text-slate-800">
            {activeTabMeta?.icon || "📋"} {activeTabMeta?.label || "Quản lý nhân sự"}
          </p>
        </div>
        <p className="hidden text-xs text-slate-500 md:block">Chọn nhanh mục cần xem</p>
      </div>

      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            data-testid={`staff-tab-${tab.id}`}
            onClick={() => onNavigate(tab.id)}
            className={tabButtonClass(activeTab === tab.id)}
          >
            <span aria-hidden className="text-base leading-none">
              {tab.icon}
            </span>
            <span className="whitespace-nowrap">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
