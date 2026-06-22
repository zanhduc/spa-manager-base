import { useCallback, useState } from "react";

const YES_STYLES = {
  danger: "border-rose-200 bg-rose-600 text-white hover:bg-rose-700",
  warning: "border-amber-200 bg-amber-500 text-white hover:bg-amber-600",
  primary: "border-sky-200 bg-sky-600 text-white hover:bg-sky-700",
};

export function ConfirmDialog({
  open,
  message,
  subMessage = "",
  yesLabel = "Đồng ý",
  noLabel = "Huỷ",
  yesStyle = "danger",
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  const yesClass = YES_STYLES[yesStyle] || YES_STYLES.danger;

  return (
    <div className="fixed inset-0 z-[10050] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Đóng"
        className="absolute inset-0 bg-slate-900/45"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <p className="text-sm font-semibold text-slate-800">{message}</p>
        {subMessage ? <p className="mt-2 text-xs text-slate-500">{subMessage}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {noLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-lg border px-4 py-2 text-sm font-semibold ${yesClass}`}
          >
            {yesLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Hook trả về confirm() async và JSX dialog — thay thế window.confirm */
export function useConfirm() {
  const [state, setState] = useState(null);

  const confirm = useCallback(
    ({
      message = "",
      subMessage = "",
      yesLabel = "Đồng ý",
      noLabel = "Huỷ",
      yesStyle = "danger",
    } = {}) =>
      new Promise((resolve) => {
        setState({
          message,
          subMessage,
          yesLabel,
          noLabel,
          yesStyle,
          resolve,
        });
      }),
    [],
  );

  const close = useCallback(
    (result) => {
      if (state?.resolve) state.resolve(result);
      setState(null);
    },
    [state],
  );

  const dialog = (
    <ConfirmDialog
      open={Boolean(state)}
      message={state?.message || ""}
      subMessage={state?.subMessage || ""}
      yesLabel={state?.yesLabel || "Đồng ý"}
      noLabel={state?.noLabel || "Huỷ"}
      yesStyle={state?.yesStyle || "danger"}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  );

  return { confirm, dialog };
}
