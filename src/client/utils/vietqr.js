// Mapping tên ngân hàng → BIN (acqId) theo API công khai VietQR
// Source: https://api.vietqr.io/v2/banks
export const BANK_NAME_TO_BIN = {
  // ===== Tên đầy đủ từ danh sách sheet (lowercase) =====
  "mbbank (quân đội)": "970422",
  vietcombank: "970436",
  techcombank: "970407",
  acb: "970416",
  bidv: "970418",
  vpbank: "970432",
  tpbank: "970423",
  vietinbank: "970415",
  sacombank: "970403",
  hdbank: "970437",
  agribank: "970405",
  ocb: "970448",
  "msb (hàng hải)": "970426",
  "shb (sài gòn - hà nội)": "970443",
  eximbank: "970431",
  vib: "970441",
  "lpbank (lộc phát)": "970449",
  "scb (sài gòn)": "970429",
  namabank: "970428",
  "abbank (an bình)": "970425",
  seabank: "970440",
  kienlongbank: "970452",
  "ncb (quốc dân)": "970419",
  bacabank: "970409",
  pgbank: "970430",
  baovietbank: "970438",
  pvcombank: "970412",
  vietabank: "970427",
  vietbank: "970433",
  "coopbank (hợp tác xã)": "970446",
  "cake by vpbank": "546034",
  shinhanbank: "970424",
  ubank: "546035",
  momo: "971025",
  kbank: "668888",
  cimb: "422589",
  // ===== Short aliases (code / tên viết tắt) =====
  mb: "970422",
  "mb bank": "970422",
  mbbank: "970422",
  vcb: "970436",
  tcb: "970407",
  vpb: "970432",
  tpb: "970423",
  icb: "970415",
  stb: "970403",
  hdb: "970437",
  vba: "970405",
  msb: "970426",
  shb: "970443",
  eib: "970431",
  lpb: "970449",
  lpbank: "970449",
  scb: "970429",
  nab: "970428",
  abb: "970425",
  abbank: "970425",
  klb: "970452",
  ncb: "970419",
  bab: "970409",
  pgb: "970430",
  bvb: "970438",
  pvcb: "970412",
  vab: "970427",
  seab: "970440",
  coopbank: "970446",
  cake: "546034",
  shbvn: "970424",
  shinhan: "970424",
  saigonbank: "970400",
  woori: "970457",
  vrb: "970421",
};

const foldVietQrText = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]/g, "");

const BANK_FOLDED_ENTRIES = Object.entries(BANK_NAME_TO_BIN)
  .map(([key, bin]) => ({ key, bin, folded: foldVietQrText(key) }))
  .sort((a, b) => b.folded.length - a.folded.length);

export const resolveVietQrBankBin = (raw) => {
  const input = String(raw || "").trim();
  if (!input) return "";
  if (/^\d{6}$/.test(input)) return input;

  const lower = input.toLowerCase();
  if (BANK_NAME_TO_BIN[lower]) return BANK_NAME_TO_BIN[lower];

  const folded = foldVietQrText(input);
  if (!folded) return "";

  const exactFoldedMatch = BANK_FOLDED_ENTRIES.find((entry) => entry.folded === folded);
  if (exactFoldedMatch) return exactFoldedMatch.bin;

  const partialFoldedMatch = BANK_FOLDED_ENTRIES.find(
    (entry) => entry.folded.length >= 4 && folded.includes(entry.folded),
  );
  if (partialFoldedMatch) return partialFoldedMatch.bin;

  console.warn("[VietQR] Không tìm thấy BIN cho ngân hàng:", input);
  return "";
};

export const buildVietQrUrl = ({
  bankCode,
  accountNumber,
  accountName,
  amount,
  addInfo,
}) => {
  const bank = resolveVietQrBankBin(bankCode);
  const account = String(accountNumber || "")
    .replace(/\s+/g, "")
    .trim();
  if (!/^\d{6}$/.test(bank) || !account) return "";
  const params = new URLSearchParams();
  if (amount && Number(amount) > 0) {
    params.set("amount", String(Math.round(Number(amount))));
  }
  if (addInfo) params.set("addInfo", String(addInfo).trim());
  if (accountName) params.set("accountName", String(accountName).trim());
  const query = params.toString();
  return `https://img.vietqr.io/image/${encodeURIComponent(bank)}-${encodeURIComponent(account)}-compact2.png${query ? `?${query}` : ""}`;
};

export const VIETQR_CREDENTIALS_STORAGE = {
  clientId: "spa.vietqr.clientId",
  apiKey: "spa.vietqr.apiKey",
  bankCode: "spa.vietqr.bankCode",
  accountNumber: "spa.vietqr.accountNumber",
  accountName: "spa.vietqr.accountName",
};

const VIETQR_GENERATE_PATH = "/v2/generate";

export const getVietQrGenerateUrl = () => {
  if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
    return `/vietqr-proxy${VIETQR_GENERATE_PATH}`;
  }
  return `https://api.vietqr.io${VIETQR_GENERATE_PATH}`;
};

/** Chuẩn hóa nội dung VietQR: không dấu, không ký tự đặc biệt. */
export const normalizeVietQrText = (value, maxLen = 25) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .slice(0, maxLen);

export const formatOxuAmountDisplay = (amount) => {
  const value = Math.max(Number(amount) || 0, 0);
  return new Intl.NumberFormat("vi-VN").format(value);
};

const sanitizeOxuText = (value) =>
  String(value || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/[;,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const sanitizeOxuQrPayload = (value) =>
  String(value || "")
    .replace(/[\r\n]+/g, "")
    .replace(/;/g, "")
    .trim();

/** Ghép lệnh COM theo tài liệu OXU QRVIEW. */
export const buildOxuComCommand = ({
  qrCode = "",
  bankLabel = "",
  accountDisplay = "",
  amountDisplay = "",
  brightness = null,
  jumpToQrScreen = true,
} = {}) => {
  const parts = [];
  const safeBankLabel = sanitizeOxuText(bankLabel);
  const safeAccountDisplay = sanitizeOxuText(accountDisplay);
  const safeAmountDisplay = sanitizeOxuText(amountDisplay);
  const payload = sanitizeOxuQrPayload(qrCode);

  if (jumpToQrScreen) parts.push("JUMP(1)");
  if (safeBankLabel) parts.push(`SET_TXT(0,${safeBankLabel})`);
  if (safeAccountDisplay) parts.push(`SET_TXT(1,${safeAccountDisplay})`);
  if (safeAmountDisplay) parts.push(`SET_TXT(2,${safeAmountDisplay})`);
  if (brightness !== null && brightness !== undefined && brightness !== "") {
    const parsedBrightness = Number(brightness);
    if (Number.isFinite(parsedBrightness)) {
      const level = Math.min(255, Math.max(0, Math.round(parsedBrightness)));
      parts.push(`BL(${level})`);
    }
  }
  if (payload) parts.push(`QBAR(0,${payload})`);
  return parts.length ? `${parts.join(";")};` : "";
};

/** Chuyển OXU sang màn success (screen 2). */
export const buildOxuCompleteCommand = () => "JUMP(2);";

/** Lệnh COM hiển thị màn «Thanh toán thành công» trên OXU (popup Hoàn thành). */
export const buildOxuSuccessCommand = ({
  title = "THANH TOAN THANH CONG",
  subtitle = "",
  amountDisplay = "",
} = {}) => {
  const parts = ["JUMP(2)"];
  parts.push(`SET_TXT(0,${sanitizeOxuText(title) || "THANH TOAN THANH CONG"})`);
  parts.push(`SET_TXT(1,${sanitizeOxuText(subtitle)})`);
  parts.push(`SET_TXT(2,${sanitizeOxuText(amountDisplay)})`);
  return `${parts.join(";")};`;
};

export const readVietQrCredentials = () => {
  const env = typeof import.meta !== "undefined" ? import.meta.env : undefined;
  const envClientId = String(env?.VITE_VIETQR_CLIENT_ID || "").trim();
  const envApiKey = String(env?.VITE_VIETQR_API_KEY || "").trim();
  let clientId = envClientId;
  let apiKey = envApiKey;
  if (typeof window !== "undefined") {
    if (!clientId) {
      clientId = String(
        window.localStorage.getItem(VIETQR_CREDENTIALS_STORAGE.clientId) || "",
      ).trim();
    }
    if (!apiKey) {
      apiKey = String(
        window.localStorage.getItem(VIETQR_CREDENTIALS_STORAGE.apiKey) || "",
      ).trim();
    }
  }
  return { clientId, apiKey };
};

/**
 * Đọc thông tin tài khoản ngân hàng đã lưu (dùng để hiển thị QR tĩnh).
 */
export const readVietQrBankSettings = () => {
  if (typeof window === "undefined") return { bankCode: "", accountNumber: "", accountName: "" };
  return {
    bankCode: String(window.localStorage.getItem(VIETQR_CREDENTIALS_STORAGE.bankCode) || "").trim(),
    accountNumber: String(window.localStorage.getItem(VIETQR_CREDENTIALS_STORAGE.accountNumber) || "").trim(),
    accountName: String(window.localStorage.getItem(VIETQR_CREDENTIALS_STORAGE.accountName) || "").trim(),
  };
};

/**
 * Lưu thông tin tài khoản ngân hàng.
 */
export const writeVietQrBankSettings = ({ bankCode = "", accountNumber = "", accountName = "" } = {}) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(VIETQR_CREDENTIALS_STORAGE.bankCode, String(bankCode).trim());
  window.localStorage.setItem(VIETQR_CREDENTIALS_STORAGE.accountNumber, String(accountNumber).trim());
  window.localStorage.setItem(VIETQR_CREDENTIALS_STORAGE.accountName, String(accountName).trim());
};

export const writeVietQrCredentials = ({ clientId = "", apiKey = "" } = {}) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    VIETQR_CREDENTIALS_STORAGE.clientId,
    String(clientId || "").trim(),
  );
  window.localStorage.setItem(
    VIETQR_CREDENTIALS_STORAGE.apiKey,
    String(apiKey || "").trim(),
  );
};

/**
 * Gọi VietQR API v2/generate — trả chuỗi EMVCo (qrCode) cho QBAR(0,...).
 * Cần client-id + api-key từ https://my.vietqr.io
 */
export const generateVietQrPayload = async ({
  bankCode,
  accountNumber,
  accountName,
  amount,
  addInfo,
  clientId,
  apiKey,
  fetchImpl = fetch,
} = {}) => {
  const acqId = resolveVietQrBankBin(bankCode);
  const accountNo = String(accountNumber || "")
    .replace(/\s+/g, "")
    .trim();
  if (!acqId || !/^\d{6}$/.test(String(acqId))) {
    return { ok: false, message: "Ngân hàng không hợp lệ hoặc thiếu BIN." };
  }
  if (!accountNo) {
    return { ok: false, message: "Nhập số tài khoản." };
  }

  const creds = readVietQrCredentials();
  const resolvedClientId = String(clientId || creds.clientId || "").trim();
  const resolvedApiKey = String(apiKey || creds.apiKey || "").trim();
  if (!resolvedClientId || !resolvedApiKey) {
    return {
      ok: false,
      message: "Thiếu VietQR Client ID / API Key (my.vietqr.io).",
    };
  }

  const body = {
    accountNo,
    acqId: Number(acqId),
    format: "text",
    template: "compact2",
  };
  /** @type {{ accountNo: string; acqId: number; format: string; template: string; accountName?: string; amount?: string; addInfo?: string }} */
  const requestBody = body;
  const normalizedName = normalizeVietQrText(accountName, 50);
  if (normalizedName.length >= 5) requestBody.accountName = normalizedName;

  const roundedAmount = Math.round(Number(amount));
  if (Number.isFinite(roundedAmount) && roundedAmount > 0) {
    requestBody.amount = String(roundedAmount);
  }

  const normalizedInfo = normalizeVietQrText(addInfo, 25);
  if (normalizedInfo) requestBody.addInfo = normalizedInfo;

  let response;
  try {
    response = await fetchImpl(getVietQrGenerateUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-client-id": resolvedClientId,
        "x-api-key": resolvedApiKey,
      },
      body: JSON.stringify(requestBody),
    });
  } catch (error) {
    return {
      ok: false,
      message: error?.message || "Không kết nối được VietQR API.",
    };
  }

  let json = null;
  try {
    json = await response.json();
  } catch (_) {
    return { ok: false, message: "VietQR API trả dữ liệu không hợp lệ." };
  }

  if (!response.ok || String(json?.code || "") !== "00") {
    return {
      ok: false,
      message: String(json?.desc || json?.message || "Không tạo được VietQR."),
      raw: json,
    };
  }

  const qrCode = String(json?.data?.qrCode || "").trim();
  if (!qrCode) {
    return { ok: false, message: "API không trả qrCode (chuỗi EMVCo).", raw: json };
  }

  return {
    ok: true,
    qrCode,
    qrDataURL: String(json?.data?.qrDataURL || "").trim(),
    data: json.data || {},
    requestBody,
  };
};
