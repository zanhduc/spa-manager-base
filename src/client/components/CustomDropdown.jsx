import { useEffect, useRef, useState } from "react";

export function CustomDropdown({
  value,
  options = [],
  onChange,
  disabled = false,
  placeholder = "Nhấp vào để chọn",
  preferPlaceholderWhenEmpty = false,
  className = "",
  buttonClassName = "",
  menuClassName = "",
  buttonTestId,
  optionTestIdPrefix = "",
  highlightSelectedButton = false,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const shouldShowPlaceholder =
    preferPlaceholderWhenEmpty && !String(value ?? "").trim();
  const selectableOptions = options.filter((opt) => opt?.type !== "header");
  const selected = shouldShowPlaceholder
    ? null
    : selectableOptions.find((opt) => String(opt.value) === String(value));
  const selectedButtonClass = highlightSelectedButton && selected
    ? "border-rose-200 bg-rose-50 text-rose-800"
    : "border-slate-200 bg-white text-slate-700";

  useEffect(() => {
    const onDocClick = (event) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div className={`relative ${className}`} ref={rootRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        data-testid={buttonTestId}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm disabled:bg-slate-100 disabled:text-slate-400 ${selectedButtonClass} ${buttonClassName}`}
      >
        <span className={`flex min-w-0 items-center gap-2 truncate text-left ${selected ? "" : "text-slate-400"}`}>
          {selected?.icon ? <span aria-hidden className="shrink-0">{selected.icon}</span> : null}
          <span className="truncate">{selected?.label || placeholder}</span>
        </span>
        <span className="shrink-0 text-xs text-slate-500">▾</span>
      </button>
      {open && !disabled ? (
        <div
          className={`absolute z-[9800] mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl ${menuClassName}`}
        >
          {options.map((opt, index) => {
            if (opt?.type === "header") {
              return (
                <div
                  key={`dd-header-${opt.label}-${index}`}
                  className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-slate-400"
                >
                  {opt.label}
                </div>
              );
            }
            const active = String(opt.value) === String(value);
            const optionTestId = optionTestIdPrefix
              ? `${optionTestIdPrefix}${opt.value}`
              : opt.testId;
            return (
              <button
                key={`dd-opt-${String(opt.value)}-${index}`}
                type="button"
                data-testid={optionTestId}
                onClick={() => {
                  onChange?.(opt.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                  active
                    ? "bg-rose-600 text-white"
                    : "text-slate-700 hover:bg-rose-50 hover:text-rose-700"
                }`}
              >
                {opt.icon ? <span aria-hidden className="shrink-0">{opt.icon}</span> : null}
                <span className="truncate">{opt.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
