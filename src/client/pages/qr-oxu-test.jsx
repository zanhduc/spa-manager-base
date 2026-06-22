import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  BANK_NAME_TO_BIN,
  buildOxuComCommand,
  buildVietQrUrl,
  formatOxuAmountDisplay,
  generateVietQrPayload,
  normalizeVietQrText,
  readVietQrBankSettings,
  readVietQrCredentials,
  writeVietQrBankSettings,
  writeVietQrCredentials,
} from "../utils/vietqr";
import {
  connectOxuSerialPort,
  isWebSerialSupported,
  sendOxuComCommand,
} from "../utils/oxuSerial";

const BANK_OPTIONS = [
  { label: "Agribank", value: "agribank" },
  { label: "Vietcombank", value: "vietcombank" },
  { label: "MB Bank", value: "mbbank" },
  { label: "Techcombank", value: "techcombank" },
  { label: "BIDV", value: "bidv" },
  { label: "ACB", value: "acb" },
  { label: "VPBank", value: "vpbank" },
  { label: "TPBank", value: "tpbank" },
];

const DOC_PRESETS = [
  {
    id: "logo",
    label: "JUMP(0) — Logo",
    command: "JUMP(0);",
  },
  {
    id: "qr-link",
    label: "QBAR link (oxu.vn)",
    command: "JUMP(1);QBAR(0,oxu.vn);",
  },
  {
    id: "brightness",
    label: "BL(20) — Độ sáng",
    command: "BL(20);",
  },
];

export default function QrOxuTestPage() {
  const initialCreds = readVietQrCredentials();
  const initialBankSettings = readVietQrBankSettings();
  const [bankCode, setBankCode] = useState("agribank");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [amount, setAmount] = useState("");
  const [addInfo, setAddInfo] = useState("THANHTOAN");
  const [bankLabel, setBankLabel] = useState("AGRIBANK");
  const [brightness, setBrightness] = useState("20");
  const [clientId, setClientId] = useState(initialCreds.clientId);
  const [apiKey, setApiKey] = useState(initialCreds.apiKey);
  // Cấu hình tài khoản mặc định cho QR thu ngân
  const [defaultBankCode, setDefaultBankCode] = useState(initialBankSettings.bankCode);
  const [defaultAccountNumber, setDefaultAccountNumber] = useState(initialBankSettings.accountNumber);
  const [defaultAccountName, setDefaultAccountName] = useState(initialBankSettings.accountName);
  const [qrCode, setQrCode] = useState("");
  const [qrImageUrl, setQrImageUrl] = useState("");
  const [comCommand, setComCommand] = useState("JUMP(1);QBAR(0,oxu.vn);");
  const [manualCommand, setManualCommand] = useState("");
  const [busy, setBusy] = useState("");
  const [logLines, setLogLines] = useState([]);

  const serialSupported = isWebSerialSupported();

  const appendLog = (message) => {
    const line = `[${new Date().toLocaleTimeString("vi-VN")}] ${message}`;
    setLogLines((prev) => [line, ...prev].slice(0, 80));
  };

  const amountDisplay = useMemo(
    () => formatOxuAmountDisplay(amount),
    [amount],
  );

  const accountDisplay = useMemo(() => {
    const stk = String(accountNumber || "").trim();
    return stk ? `STK: ${stk}` : "";
  }, [accountNumber]);

  const rebuildComCommand = (nextQrCode) => {
    const command = buildOxuComCommand({
      qrCode: nextQrCode,
      bankLabel: String(bankLabel || "").trim().toUpperCase(),
      accountDisplay,
      amountDisplay: amountDisplay !== "0" ? amountDisplay : "",
      brightness,
      jumpToQrScreen: true,
    });
    setComCommand(command);
    return command;
  };

  const handleSaveCredentials = () => {
    writeVietQrCredentials({ clientId, apiKey });
    appendLog("Lưu Client ID / API Key.");
  };

  const handleSaveBankSettings = () => {
    if (!defaultBankCode.trim() || !defaultAccountNumber.trim()) {
      toast.error("Nhập đầy đủ tên ngân hàng và số tài khoản.");
      return;
    }
    writeVietQrBankSettings({
      bankCode: defaultBankCode,
      accountNumber: defaultAccountNumber,
      accountName: defaultAccountName,
    });
    appendLog(`Lưu TK: ${defaultBankCode} / ${defaultAccountNumber}`);
  };

  const handleGenerate = async () => {
    setBusy("generate");
    try {
      writeVietQrCredentials({ clientId, apiKey });
      const result = await generateVietQrPayload({
        bankCode,
        accountNumber,
        accountName,
        amount,
        addInfo,
        clientId,
        apiKey,
      });
      if (!result.ok) {
        toast.error(result.message);
        appendLog(`Gen VietQR lỗi: ${result.message}`);
        return;
      }

      setQrCode(result.qrCode);
      setQrImageUrl(
        result.qrDataURL ||
          buildVietQrUrl({
            bankCode,
            accountNumber,
            accountName,
            amount,
            addInfo: normalizeVietQrText(addInfo, 25),
          }),
      );
      const command = rebuildComCommand(result.qrCode);
      appendLog(`Gen OK — qrCode ${result.qrCode.length} ký tự.`);
      appendLog(`COM: ${command}`);
    } catch (error) {
      toast.error(error?.message || "Không tạo được VietQR.");
      appendLog(`Gen exception: ${error?.message || "unknown"}`);
    } finally {
      setBusy("");
    }
  };

  const handleSendCom = async (command) => {
    const text = String(command || "").trim();
    if (!text) {
      toast.error("Lệnh COM trống.");
      return;
    }
    if (!serialSupported) {
      toast.error("Cần Chrome/Edge và HTTPS hoặc localhost.");
      return;
    }
    setBusy("send");
    try {
      await sendOxuComCommand(text);
      appendLog(`Gửi OK: ${text.slice(0, 120)}${text.length > 120 ? "…" : ""}`);
    } catch (error) {
      toast.error(error?.message || "Gửi COM thất bại.");
      appendLog(`Gửi lỗi: ${error?.message || "unknown"}`);
    } finally {
      setBusy("");
    }
  };

  const handleConnectPort = async () => {
    if (!serialSupported) {
      toast.error("Web Serial không khả dụng.");
      return;
    }
    setBusy("connect");
    try {
      await connectOxuSerialPort({ requestNew: true });
      appendLog("Kết nối COM thành công.");
    } catch (error) {
      toast.error(error?.message || "Không mở được cổng COM.");
      appendLog(`COM lỗi: ${error?.message || "unknown"}`);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 pb-24 md:p-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-black text-slate-800">Test QR OXU (COM)</h1>
        <p className="text-sm text-slate-600">
          Trang thử nghiệm theo tài liệu QRVIEW: nhập STK/số tiền → gọi VietQR{" "}
          <code className="rounded bg-slate-100 px-1">/v2/generate</code> → lấy chuỗi EMVCo →
          gửi <code className="rounded bg-slate-100 px-1">QBAR(0,...)</code> qua cổng COM 115200.
        </p>
        {!serialSupported ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Web Serial chưa sẵn sàng. Dùng Chrome/Edge trên HTTPS hoặc localhost.
          </p>
        ) : null}
      </header>

      <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            VietQR API (my.vietqr.io)
          </h2>
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="Client ID"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="API Key"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={handleSaveCredentials}
            className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700"
          >
            Lưu credentials
          </button>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            Thông tin chuyển khoản
          </h2>
          <select
            value={bankCode}
            onChange={(e) => {
              setBankCode(e.target.value);
              const label = BANK_OPTIONS.find((item) => item.value === e.target.value)?.label;
              if (label) setBankLabel(label.toUpperCase());
            }}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            {BANK_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label} (BIN {BANK_NAME_TO_BIN[item.value] || "—"})
              </option>
            ))}
          </select>
          <input
            type="text"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            placeholder="Số tài khoản"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          <input
            type="text"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder="Tên chủ TK (không dấu)"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Số tiền (VND)"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              type="text"
              value={addInfo}
              onChange={(e) => setAddInfo(e.target.value)}
              placeholder="Nội dung CK"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={bankLabel}
              onChange={(e) => setBankLabel(e.target.value)}
              placeholder="SET_TXT(0) — Tên NH hiển thị"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              type="number"
              min="0"
              max="255"
              value={brightness}
              onChange={(e) => setBrightness(e.target.value)}
              placeholder="BL 0-255"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </section>

      {/* Cấu hình tài khoản ngân hàng mặc định dùng cho QR thu ngân */}
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-emerald-700">
          Tài khoản ngân hàng mặc định (dùng cho QR thu ngân)
        </h2>
        <p className="text-xs text-slate-500">
          Cấu hình một lần tại đây. Khi thu ngân chọn thanh toán QR trong màn tạo đơn, hệ thống sẽ dùng tài khoản này.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Tên ngân hàng</label>
            <input
              type="text"
              value={defaultBankCode}
              onChange={(e) => setDefaultBankCode(e.target.value)}
              placeholder="vd: agribank, mbbank, vietcombank"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Số tài khoản</label>
            <input
              type="text"
              value={defaultAccountNumber}
              onChange={(e) => setDefaultAccountNumber(e.target.value)}
              placeholder="Số tài khoản"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Tên chủ tài khoản</label>
            <input
              type="text"
              value={defaultAccountName}
              onChange={(e) => setDefaultAccountName(e.target.value)}
              placeholder="Tên chủ TK (không dấu)"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={handleSaveBankSettings}
          className="rounded-xl border border-emerald-200 bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-800"
        >
          Lưu tài khoản ngân hàng mặc định
        </button>
      </section>

      <section className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy === "generate"}
          onClick={handleGenerate}
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 disabled:opacity-50"
        >
          {busy === "generate" ? "Đang tạo…" : "1. Tạo VietQR payload"}
        </button>
        <button
          type="button"
          disabled={busy === "connect"}
          onClick={handleConnectPort}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
        >
          Chọn cổng COM
        </button>
        <button
          type="button"
          disabled={busy === "send" || !comCommand}
          onClick={() => handleSendCom(comCommand)}
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50"
        >
          {busy === "send" ? "Đang gửi…" : "2. Gửi lệnh COM → OXU"}
        </button>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
            qrCode (EMVCo / CRC16)
          </label>
          <textarea
            readOnly
            value={qrCode}
            rows={5}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs"
            placeholder="Bấm Tạo VietQR payload…"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Lệnh COM (tự ghép theo tài liệu)
          </label>
          <textarea
            value={comCommand}
            onChange={(e) => setComCommand(e.target.value)}
            rows={5}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs text-rose-700"
          />
        </div>
      </section>

      {qrImageUrl ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Xem trước QR (đối chiếu)</h3>
          <img
            src={qrImageUrl}
            alt="VietQR preview"
            className="mx-auto max-h-64 rounded-lg border border-slate-100"
          />
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">Lệnh thủ công / preset tài liệu</h3>
        <div className="flex flex-wrap gap-2">
          {DOC_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                setManualCommand(preset.command);
                setComCommand(preset.command);
              }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              {preset.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={manualCommand}
          onChange={(e) => setManualCommand(e.target.value)}
          placeholder="JUMP(1);QBAR(0,...);"
          className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm"
        />
        <button
          type="button"
          disabled={busy === "send"}
          onClick={() => handleSendCom(manualCommand)}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
        >
          Gửi lệnh thủ công
        </button>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Nhật ký</h3>
        <div className="max-h-48 overflow-y-auto font-mono text-xs text-slate-600 space-y-1">
          {logLines.length === 0 ? (
            <div>Chưa có log.</div>
          ) : (
            logLines.map((line) => <div key={line}>{line}</div>)
          )}
        </div>
      </section>
    </div>
  );
}
