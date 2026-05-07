import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  getPrintBridgeLogs,
  getPrintBridgeMetrics,
  listPrintBridgePrinters,
  openReceiptWithStrategy,
  pingPrintBridge,
  readPrintBridgeConfig,
  writePrintBridgeConfig,
} from "../utils/printStrategy";

function nowStr() {
  return new Date().toLocaleString("vi-VN");
}

function detectBrowser(userAgent) {
  const ua = String(userAgent || "").toLowerCase();
  if (ua.includes("edg/")) return "Edge";
  if (ua.includes("chrome/")) return "Chrome";
  if (ua.includes("firefox/")) return "Firefox";
  if (ua.includes("safari/")) return "Safari";
  return "Không xác định";
}

function isLikelyPrinterAddress(value) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  if (/^(usb|bt|tcp):\/\//i.test(raw)) return true;
  if (/^(\d{1,3}\.){3}\d{1,3}:\d{2,5}$/.test(raw)) return true;
  if (/^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i.test(raw)) return true;
  return false;
}

function normalizeBridgeEndpoint(rawEndpoint) {
  const raw = String(rawEndpoint || "").trim();
  if (!raw) return "";
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  try {
    const u = new URL(withScheme);
    return `${u.protocol}//${u.host}`.replace(/\/+$/, "");
  } catch (e) {
    return withScheme.replace(/\/+$/, "");
  }
}

function buildBridgeEndpointCandidates(rawEndpoint) {
  const normalized = normalizeBridgeEndpoint(rawEndpoint);
  if (!normalized) return [];
  const candidates = [normalized];
  try {
    const u = new URL(normalized);
    if (u.hostname === "127.0.0.1") {
      candidates.push(`${u.protocol}//localhost${u.port ? `:${u.port}` : ""}`);
    } else if (u.hostname === "localhost") {
      candidates.push(`${u.protocol}//127.0.0.1${u.port ? `:${u.port}` : ""}`);
    }
  } catch (e) {
    // noop
  }
  return [...new Set(candidates)];
}

export default function PrintDiagnosticPage() {
  const [bridgeConfig, setBridgeConfig] = useState(() => readPrintBridgeConfig());
  const [logs, setLogs] = useState(() => [
    `[${nowStr()}] Mở trang tự kiểm tra in.`,
  ]);
  const [testCode, setTestCode] = useState(() => `TEST-${Date.now()}`);
  const [bridgePrinters, setBridgePrinters] = useState([]);
  const [busyAction, setBusyAction] = useState("");

  const addLog = (text) => {
    setLogs((prev) => [`[${nowStr()}] ${text}`, ...prev].slice(0, 200));
  };

  const envInfo = useMemo(() => {
    const ua = navigator.userAgent || "";
    let iframeState = false;
    try {
      iframeState = window.self !== window.top;
    } catch (e) {
      iframeState = true;
    }
    return {
      browser: detectBrowser(ua),
      userAgent: ua,
      inIframe: iframeState,
      referrer: document.referrer || "(trống)",
      href: window.location.href,
      origin: window.location.origin,
      path: window.location.pathname,
    };
  }, []);

  const endpointCandidates = useMemo(
    () => buildBridgeEndpointCandidates(bridgeConfig.endpoint),
    [bridgeConfig.endpoint],
  );

  const withBusy = async (actionKey, fn) => {
    if (busyAction) return;
    setBusyAction(actionKey);
    try {
      await fn();
    } finally {
      setBusyAction("");
    }
  };

  const saveBridgeConfig = (options = {}) => {
    const saved = writePrintBridgeConfig({
      ...bridgeConfig,
      mode: "bridge",
      timeoutMs: Math.max(1000, Number(bridgeConfig.timeoutMs || 8000)),
    });
    setBridgeConfig(saved);
    if (!options.silent) {
      addLog("Đã lưu cấu hình in.");
      toast.success("Đã lưu cấu hình in.");
    }
    return saved;
  };

  const runQuickChecks = () => {
    addLog(`Trình duyệt: ${envInfo.browser}`);
    addLog(`Đang chạy trong iframe: ${envInfo.inIframe ? "Có" : "Không"}`);
    addLog(`window.print khả dụng: ${typeof window.print === "function" ? "Có" : "Không"}`);
    addLog(`URL hiện tại: ${envInfo.href}`);

    try {
      const sample = JSON.stringify({
        maPhieu: testCode || "TEST",
        tenKhach: "Khách test",
        ngayBan: "2026-04-13",
      });
      const encoded = encodeURIComponent(sample);
      const decoded = decodeURIComponent(encoded);
      const ok = decoded === sample;
      addLog(`Mã hóa/giải mã dữ liệu preview: ${ok ? "OK" : "Lỗi"}`);
    } catch (e) {
      addLog(`Mã hóa dữ liệu preview lỗi: ${String(e?.message || e)}`);
    }
    addLog("Chế độ in hiện tại: Bridge Agent (khóa cứng).");
    addLog(`Bridge endpoint: ${bridgeConfig.endpoint || "(trống)"}`);
    if (endpointCandidates.length) {
      addLog(`Endpoint thử tự động: ${endpointCandidates.join(" | ")}`);
    }
    addLog(`Bridge printer: ${bridgeConfig.printerName || "(mặc định hệ điều hành)"}`);
    addLog(`Bridge printerAddress: ${bridgeConfig.printerAddress || "(mặc định bridge)"}`);
    addLog(`Bridge token: ${bridgeConfig.token ? "Đã bật" : "Chưa bật"}`);
    if (envInfo.inIframe) {
      addLog("Cảnh báo: đang chạy trong iframe, một số máy POS/webview có thể chặn gọi localhost.");
    }
    toast.success("Đã chạy kiểm tra nhanh.");
  };

  const testBridgePing = async () => {
    await withBusy("ping", async () => {
      try {
        const saved = saveBridgeConfig({ silent: true });
        await pingPrintBridge(saved.endpoint, saved.token);
        addLog("Bridge health: OK.");
        toast.success("Bridge đang hoạt động.");
      } catch (e) {
        const rawError = String(e?.message || e);
        addLog(`Bridge health: FAIL (${rawError})`);
        if (rawError.toLowerCase().includes("failed to fetch")) {
          addLog(
            "Gợi ý: nếu mở trực tiếp 127.0.0.1/health được nhưng web fail, đây thường là chặn CORS/PNA hoặc chặn localhost trong webview.",
          );
        }
        toast.error("Bridge chưa kết nối được.");
      }
    });
  };

  const loadBridgePrinters = async () => {
    await withBusy("printers", async () => {
      try {
        const saved = saveBridgeConfig({ silent: true });
        const printers = await listPrintBridgePrinters(saved.endpoint, saved.token);
        setBridgePrinters(printers);
        addLog(`Bridge trả về ${printers.length} máy in.`);
        if (!printers.length) {
          toast("Bridge không trả danh sách máy in.", { icon: "⚠️" });
          return;
        }
        toast.success("Đã lấy danh sách máy in.");
      } catch (e) {
        addLog(`Không lấy được danh sách máy in (${String(e?.message || e)})`);
        toast.error("Lấy danh sách máy in thất bại.");
      }
    });
  };

  const loadBridgeMetrics = async () => {
    await withBusy("metrics", async () => {
      try {
        const saved = saveBridgeConfig({ silent: true });
        const data = await getPrintBridgeMetrics(saved.endpoint, saved.token);
        addLog(
          `Bridge metrics: total=${data?.totalJobs ?? "-"} success=${data?.successJobs ?? "-"} failed=${data?.failedJobs ?? "-"} queue=${data?.queueSize ?? "-"}`,
        );
        const bridgeLogs = await getPrintBridgeLogs(saved.endpoint, 10, saved.token);
        if (bridgeLogs.length) {
          addLog(`Bridge logs tail (${bridgeLogs.length} dòng):`);
          bridgeLogs.forEach((line) => addLog(`bridge> ${line}`));
        } else {
          addLog("Bridge logs: trống.");
        }
        toast.success("Đã đọc metrics/logs từ bridge.");
      } catch (e) {
        addLog(`Không đọc được metrics/logs (${String(e?.message || e)})`);
        toast.error("Không đọc được metrics/logs.");
      }
    });
  };

  const openDryRun = async (size) => {
    await withBusy(`dry-${size}`, async () => {
      saveBridgeConfig({ silent: true });
      const result = await openReceiptWithStrategy(
        {
          code: testCode || `TEST-${Date.now()}`,
          size,
          autoPrint: true,
          autoBack: true,
          dryRun: true,
        },
        {
          onInfo: (msg) => addLog(msg),
        },
      );
      addLog(`Chạy test khô ${size}mm.`);
      if (result?.error) {
        addLog(`Kết quả test khô ${size}mm: FAIL (${String(result.error?.message || result.error)})`);
      }
    });
  };

  const openRealPrint = async (size) => {
    const ok = window.confirm(
      `Chạy test in thật ${size}mm sẽ gửi lệnh in trực tiếp qua Bridge.\nBạn muốn tiếp tục?`,
    );
    if (!ok) return;
    await withBusy(`real-${size}`, async () => {
      saveBridgeConfig({ silent: true });
      const result = await openReceiptWithStrategy(
        {
          code: testCode || `TEST-${Date.now()}`,
          size,
          autoPrint: true,
          autoBack: true,
          dryRun: false,
        },
        {
          onInfo: (msg) => addLog(msg),
        },
      );
      addLog(`Chạy test in thật ${size}mm.`);
      if (result?.error) {
        addLog(`Kết quả test in thật ${size}mm: FAIL (${String(result.error?.message || result.error)})`);
      } else {
        addLog(`Kết quả test in thật ${size}mm: đã gửi lệnh in.`);
      }
    });
  };

  const copyLogs = async () => {
    const content = [
      "=== PRINT SELF-TEST LOG ===",
      `Thời gian: ${nowStr()}`,
      `Browser: ${envInfo.browser}`,
      `In iframe: ${envInfo.inIframe ? "Có" : "Không"}`,
      `Referrer: ${envInfo.referrer}`,
      `Current URL: ${envInfo.href}`,
      "",
      ...logs,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(content);
      toast.success("Đã copy log.");
    } catch (e) {
      toast.error("Không copy được log. Hãy copy thủ công.");
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-white px-3 py-4 md:px-6 md:py-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-sm">
          <h1 className="text-lg font-black text-slate-900">Tự kiểm tra in</h1>
          <p className="mt-1 text-sm text-slate-600">
            Dùng trang này để test luồng in trên máy POS và gửi log cho quản trị.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              <p>Trình duyệt: <strong>{envInfo.browser}</strong></p>
              <p className="mt-1">Chạy trong iframe: <strong>{envInfo.inIframe ? "Có" : "Không"}</strong></p>
              <p className="mt-1 break-all">Referrer: {envInfo.referrer}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Mã phiếu test
              </label>
              <input
                value={testCode}
                onChange={(e) => setTestCode(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-rose-400"
              />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Endpoint đang dùng</p>
              <p className="mt-1 break-all text-xs font-bold text-slate-800">
                {bridgeConfig.endpoint || "(trống)"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Máy in mục tiêu</p>
              <p className="mt-1 break-all text-xs font-bold text-slate-800">
                {bridgeConfig.printerAddress || bridgeConfig.printerName || "(mặc định hệ điều hành)"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Trạng thái thao tác</p>
              <p className="mt-1 text-xs font-bold text-slate-800">
                {busyAction ? `Đang chạy: ${busyAction}` : "Sẵn sàng"}
              </p>
            </div>
          </div>
          {endpointCandidates.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {endpointCandidates.map((candidate) => (
                <span
                  key={candidate}
                  className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[11px] font-semibold text-cyan-700"
                >
                  {candidate}
                </span>
              ))}
            </div>
          )}
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Chế độ in
                </label>
                <div className="w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                  Bridge Agent (khóa cứng)
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Bridge endpoint
                </label>
                <input
                  value={bridgeConfig.endpoint}
                  onChange={(e) =>
                    setBridgeConfig((prev) => ({ ...prev, endpoint: e.target.value }))
                  }
                  placeholder="http://127.0.0.1:15321"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-rose-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Tên máy in (tùy chọn)
                </label>
                <input
                  value={bridgeConfig.printerName}
                  onChange={(e) =>
                    setBridgeConfig((prev) => ({ ...prev, printerName: e.target.value }))
                  }
                  placeholder="EPSON TM-T82"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-rose-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Printer address (ưu tiên cho Android bridge)
                </label>
                <input
                  value={bridgeConfig.printerAddress || ""}
                  onChange={(e) =>
                    setBridgeConfig((prev) => ({ ...prev, printerAddress: e.target.value }))
                  }
                  placeholder="usb://..., bt://..., 192.168.1.50:9100"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-rose-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Bridge token (tùy chọn)
                </label>
                <input
                  value={bridgeConfig.token || ""}
                  onChange={(e) =>
                    setBridgeConfig((prev) => ({ ...prev, token: e.target.value }))
                  }
                  placeholder="X-Bridge-Token"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-rose-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Timeout (ms)
                </label>
                <input
                  type="number"
                  min="1000"
                  step="500"
                  value={bridgeConfig.timeoutMs || 8000}
                  onChange={(e) =>
                    setBridgeConfig((prev) => ({
                      ...prev,
                      timeoutMs: Math.max(1000, Number(e.target.value || 8000)),
                    }))
                  }
                  placeholder="8000"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-rose-400"
                />
              </div>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <button
                type="button"
                onClick={saveBridgeConfig}
                disabled={Boolean(busyAction)}
                className="h-11 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Lưu cấu hình in
              </button>
              <button
                type="button"
                onClick={testBridgePing}
                disabled={Boolean(busyAction)}
                className="h-11 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Ping bridge
              </button>
              <button
                type="button"
                onClick={loadBridgePrinters}
                disabled={Boolean(busyAction)}
                className="h-11 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Lấy danh sách máy in
              </button>
              <button
                type="button"
                onClick={loadBridgeMetrics}
                disabled={Boolean(busyAction)}
                className="h-11 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Đọc metrics/logs
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-600">
              Luồng chuẩn: Ping bridge, lấy danh sách máy in, chọn máy in, lưu cấu hình in, rồi test in thật 58mm/80mm.
            </p>
            {bridgePrinters.length > 0 && (
              <div className="mt-3 rounded-xl border border-cyan-200 bg-cyan-50/40 p-3">
                <label className="block text-xs font-semibold text-cyan-700 mb-1">
                  Chọn máy in từ bridge (tên hoặc địa chỉ)
                </label>
                <select
                  value={bridgeConfig.printerAddress || bridgeConfig.printerName}
                  onChange={(e) => {
                    const selected = String(e.target.value || "").trim();
                    if (isLikelyPrinterAddress(selected)) {
                      setBridgeConfig((prev) => ({
                        ...prev,
                        printerAddress: selected,
                        printerName: "",
                      }));
                    } else {
                      setBridgeConfig((prev) => ({
                        ...prev,
                        printerName: selected,
                        printerAddress: "",
                      }));
                    }
                  }}
                  className="w-full rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-400"
                >
                  <option value="">(Mặc định hệ điều hành)</option>
                  {bridgePrinters.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-cyan-700">
                  Nên chọn trực tiếp từ danh sách để tránh lệch tên/địa chỉ máy in.
                </p>
              </div>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
            <button
              type="button"
              onClick={runQuickChecks}
              disabled={Boolean(busyAction)}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Chạy kiểm tra nhanh
            </button>
            <button
              type="button"
              onClick={() => openDryRun("58")}
              disabled={Boolean(busyAction)}
              className="h-11 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Test khô 58mm
            </button>
            <button
              type="button"
              onClick={() => openDryRun("80")}
              disabled={Boolean(busyAction)}
              className="h-11 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Test khô 80mm
            </button>
            <button
              type="button"
              onClick={() => openRealPrint("58")}
              disabled={Boolean(busyAction)}
              className="h-11 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Test in thật 58mm
            </button>
            <button
              type="button"
              onClick={() => openRealPrint("80")}
              disabled={Boolean(busyAction)}
              className="h-11 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Test in thật 80mm
            </button>
            <button
              type="button"
              onClick={copyLogs}
              disabled={Boolean(busyAction)}
              className="h-11 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Copy log
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-sm">
          <h2 className="text-sm font-black text-slate-900">Checklist ổn định kết nối thực tế</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-bold text-slate-800">USB (cắm dây)</p>
              <ul className="mt-2 list-disc pl-4 text-xs text-slate-700 space-y-1">
                <li>Cấp quyền USB cho app Bridge và chọn Always allow.</li>
                <li>Không dùng cáp sạc-only, ưu tiên cáp data tốt.</li>
                <li>Máy in phải hiển thị online trong danh sách /printers.</li>
                <li>Nếu chập chờn: rút cắm lại USB và mở lại app Bridge.</li>
              </ul>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-bold text-slate-800">LAN / Wi-Fi</p>
              <ul className="mt-2 list-disc pl-4 text-xs text-slate-700 space-y-1">
                <li>Ưu tiên IP tĩnh cho máy in LAN.</li>
                <li>Không đổi SSID liên tục, tránh mạng guest.</li>
                <li>Dùng printerAddress dạng `ip:port` nếu bridge hỗ trợ.</li>
                <li>Tăng timeout lên 8000-12000ms khi mạng không ổn định.</li>
              </ul>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-bold text-slate-800">Bluetooth</p>
              <ul className="mt-2 list-disc pl-4 text-xs text-slate-700 space-y-1">
                <li>Bật Bluetooth trước khi mở app Bridge.</li>
                <li>Pair lại nếu bridge báo không thấy máy in.</li>
                <li>Đặt máy in gần POS để giảm mất gói.</li>
                <li>Tắt tiết kiệm pin cho app Bridge để tránh ngủ nền.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-sm">
          <h2 className="text-sm font-black text-slate-900">Nhật ký kiểm tra</h2>
          <div className="mt-3 max-h-[50vh] overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
            {logs.length === 0 ? (
              <p className="text-xs text-slate-500">Chưa có log.</p>
            ) : (
              <pre className="whitespace-pre-wrap break-words text-xs text-slate-700">
                {logs.join("\n")}
              </pre>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
