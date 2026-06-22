import {
  buildOxuComCommand,
  buildOxuSuccessCommand,
  buildVietQrUrl,
  formatOxuAmountDisplay,
  generateVietQrPayload,
  normalizeVietQrText,
  readVietQrBankSettings,
  writeVietQrBankSettings,
} from "./vietqr";
import {
  connectOxuSerialPort,
  hasGrantedOxuSerialPort,
  isDirectSerialUsable,
  isWebSerialSupported,
  mustUseOxuHostBridge,
  primeOxuBridgePopupSync,
  sendOxuComCommand,
  syncOxuPopupCheckoutView,
} from "./oxuSerial";

const normalizeBankLookupKey = (value = "") =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const CHECKOUT_QR_CACHE_KEY = "spa.checkout_qr_cache.v1";
const CHECKOUT_QR_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** Tên ngân hàng ASCII hiển thị trên màn OXU (firmware không hỗ trợ tiếng Việt). */
const OXU_BANK_LABELS = {
  agribank: "AGRIBANK",
  mbbank: "MB BANK",
  mb: "MB BANK",
  "mb bank": "MB BANK",
  vietcombank: "VIETCOMBANK",
  vcb: "VIETCOMBANK",
  techcombank: "TECHCOMBANK",
  tcb: "TECHCOMBANK",
  bidv: "BIDV",
  vietinbank: "VIETINBANK",
  vpbank: "VPBANK",
  tpbank: "TPBANK",
  acb: "ACB",
  sacombank: "SACOMBANK",
  hdbank: "HDBANK",
  ocb: "OCB",
  msb: "MSB",
  shb: "SHB",
  eximbank: "EXIMBANK",
  vib: "VIB",
  lpbank: "LPBANK",
  seabank: "SEABANK",
};

const resolveOxuBankLabel = (candidate = "") => {
  const key = normalizeBankLookupKey(candidate);
  if (!key) return "";
  if (OXU_BANK_LABELS[key]) return OXU_BANK_LABELS[key];
  if (/^(mbbank|mb bank|mb)\b/.test(key)) return "MB BANK";
  return "";
};

export const formatCheckoutBankLabel = (bankCode = "") => {
  const key = normalizeBankLookupKey(bankCode);
  if (!key) return "";

  const withoutParens = key.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
  return (
    resolveOxuBankLabel(key) ||
    resolveOxuBankLabel(withoutParens) ||
    normalizeVietQrText(withoutParens, 24)
  );
};

export const isOptimisticSessionCode = (value = "") =>
  /^TEMP[-_]/i.test(String(value || "").trim());

/** Mã tham chiếu cho nội dung CK — không dùng mã optimistic TEMP. */
export const resolveCheckoutReferenceCode = (stay = {}) => {
  const maPhien = String(stay.maPhien || "").trim();
  if (maPhien && !isOptimisticSessionCode(maPhien)) return maPhien;

  const maLichHen = String(stay.maLichHen || "").trim();
  if (maLichHen && !isOptimisticSessionCode(maLichHen)) return maLichHen;

  const phone = String(stay.soDienThoai || stay.sdt || "")
    .replace(/\D/g, "")
    .slice(-10);
  if (phone.length >= 9) return phone;

  return "";
};

export const buildCheckoutQrAddInfo = (stay = {}) => {
  const ref = resolveCheckoutReferenceCode(stay);
  if (ref) {
    return normalizeVietQrText(`TT ${ref}`, 25);
  }

  const customer = String(stay.tenKhach || "").trim();
  if (customer) {
    return normalizeVietQrText(`TT ${customer}`, 25);
  }

  return normalizeVietQrText("THANHTOAN SPA", 25);
};

const normalizeBankConfig = (data = {}, source = "") => {
  if (!data?.bankCode || !data?.accountNumber) return null;
  return {
    bankCode: String(data.bankCode).trim(),
    accountNumber: String(data.accountNumber).trim(),
    accountName: String(data.accountName || "").trim(),
    source,
  };
};

export const resolveCheckoutBankConfig = async (getBankConfigFn, { forceRefresh = false } = {}) => {
  const local = normalizeBankConfig(readVietQrBankSettings(), "localStorage");
  if (local && !forceRefresh) return local;

  if (typeof getBankConfigFn === "function") {
    try {
      const res = await getBankConfigFn();
      const sheetConfig = res?.success ? normalizeBankConfig(res?.data, "sheet") : null;
      if (sheetConfig) {
        writeVietQrBankSettings(sheetConfig);
        return sheetConfig;
      }
    } catch (_) {
      // fallback localStorage below
    }
  }

  return null;
};

const readCheckoutQrCacheStore = () => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CHECKOUT_QR_CACHE_KEY);
    return raw ? JSON.parse(raw) || {} : {};
  } catch (_) {
    return {};
  }
};

const writeCheckoutQrCacheStore = (store) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CHECKOUT_QR_CACHE_KEY, JSON.stringify(store || {}));
  } catch (_) {
    // noop
  }
};

export const buildCheckoutQrCacheKey = ({ bankConfig, stay = {}, addInfo = "" } = {}) =>
  [
    String(bankConfig?.bankCode || "").trim().toLowerCase(),
    String(bankConfig?.accountNumber || "").trim(),
    Math.max(Number(stay.tongThanhToan || 0), 0),
    String(addInfo || buildCheckoutQrAddInfo(stay)).trim(),
  ].join("|");

export const readCheckoutQrCache = (key) => {
  if (!key) return null;
  const item = readCheckoutQrCacheStore()[key];
  if (!item || !item.qrCode) return null;
  if (Date.now() - Number(item.savedAt || 0) > CHECKOUT_QR_CACHE_TTL_MS) return null;
  return item;
};

export const writeCheckoutQrCache = (key, payload = {}) => {
  if (!key || !payload.qrCode) return;
  const store = readCheckoutQrCacheStore();
  store[key] = {
    qrCode: String(payload.qrCode || "").trim(),
    qrDataURL: String(payload.qrDataURL || "").trim(),
    savedAt: Date.now(),
  };
  writeCheckoutQrCacheStore(store);
};

export const buildCheckoutQrPresentation = ({
  bankConfig,
  stay = {},
  generateResult = null,
} = {}) => {
  const amount = Math.max(Number(stay.tongThanhToan || 0), 0);
  const addInfo = buildCheckoutQrAddInfo(stay);

  if (generateResult?.ok && generateResult.qrCode) {
    return {
      ok: true,
      qrImageUrl:
        generateResult.qrDataURL ||
        buildVietQrUrl({
          bankCode: bankConfig.bankCode,
          accountNumber: bankConfig.accountNumber,
          accountName: bankConfig.accountName,
          amount,
          addInfo,
        }),
      qrCode: generateResult.qrCode,
      mode: "api",
    };
  }

  const qrImageUrl = buildVietQrUrl({
    bankCode: bankConfig.bankCode,
    accountNumber: bankConfig.accountNumber,
    accountName: bankConfig.accountName,
    amount,
    addInfo,
  });
  if (!qrImageUrl) {
    return { ok: false, message: "Không tạo được ảnh VietQR." };
  }

  return {
    ok: true,
    qrImageUrl,
    qrCode: "",
    mode: "static",
    warning:
      generateResult?.message ||
      "Không tạo được payload EMVCo — chỉ hiện ảnh tĩnh, không gửi được lên OXU.",
  };
};

export const buildCheckoutOxuCommand = ({ bankConfig, stay = {}, qrCode = "" } = {}) => {
  const payload = String(qrCode || "").trim();
  if (!payload) return "";

  const amount = Math.max(Number(stay.tongThanhToan || 0), 0);
  const accountNumber = String(bankConfig?.accountNumber || "").trim();
  return buildOxuComCommand({
    qrCode: payload,
    bankLabel: formatCheckoutBankLabel(bankConfig?.bankCode),
    accountDisplay: accountNumber ? `STK: ${accountNumber}` : "",
    amountDisplay: amount > 0 ? formatOxuAmountDisplay(amount) : "",
    jumpToQrScreen: true,
  });
};

export const buildOxuPopupCheckoutPayload = ({
  bankConfig,
  stay = {},
  presentation = {},
} = {}) => {
  const qrCode = String(presentation?.qrCode || "").trim();
  const amount = Math.max(Number(stay?.tongThanhToan || 0), 0);
  const accountNumber = String(bankConfig?.accountNumber || "").trim();
  return {
    qrImageUrl: String(presentation?.qrImageUrl || "").trim(),
    command: buildCheckoutOxuCommand({ bankConfig, stay, qrCode }),
    amountLabel: amount > 0 ? `${formatOxuAmountDisplay(amount)} đ` : "",
    bankLabel: formatCheckoutBankLabel(bankConfig?.bankCode),
    accountLabel: accountNumber ? `STK: ${accountNumber}` : "",
  };
};

/** Mở popup OXU và hiển thị QR checkout (không tự gửi COM — user bấm trong popup). */
export const syncCheckoutQrToOxuPopup = ({
  bankConfig,
  stay = {},
  presentation = {},
} = {}) => {
  const qrCode = String(presentation?.qrCode || "").trim();
  if (!qrCode || !bankConfig) {
    return { ok: false, message: "Thiếu dữ liệu QR để hiển thị popup OXU." };
  }

  primeOxuBridgePopupSync();
  const payload = buildOxuPopupCheckoutPayload({ bankConfig, stay, presentation });
  const posted = syncOxuPopupCheckoutView(payload);
  if (!posted) {
    return {
      ok: false,
      message: "Không mở được popup OXU. Cho phép popup trên trình duyệt.",
      command: payload.command,
    };
  }

  return { ok: true, command: payload.command, popup: true };
};

export const pushCheckoutSuccessToOxu = async ({
  stay = {},
  sendImpl = sendOxuComCommand,
  requestNewPort = false,
} = {}) => {
  if (!isWebSerialSupported()) {
    return {
      ok: false,
      skipped: true,
      message: "Cần Chrome/Edge trên HTTPS hoặc localhost để gửi OXU.",
    };
  }

  const hasPort = await hasGrantedOxuSerialPort();
  if (!hasPort && !requestNewPort) {
    return {
      ok: false,
      skipped: true,
      message: "Chưa chọn cổng COM — bỏ qua màn thành công OXU.",
    };
  }

  const amount = Math.max(Number(stay.tongThanhToan || 0), 0);
  const ref = resolveCheckoutReferenceCode(stay);
  const customer = String(stay.tenKhach || "").trim();
  const subtitle = ref ? `Phien ${ref}` : customer;
  const command = buildOxuSuccessCommand({
    title: "THANH TOAN THANH CONG",
    subtitle,
    amountDisplay: amount > 0 ? formatOxuAmountDisplay(amount) : "",
  });

  try {
    if (!mustUseOxuHostBridge() && (await isDirectSerialUsable())) {
      await connectOxuSerialPort({ requestNew: requestNewPort });
    }
    await sendImpl(command, { requestNew: requestNewPort });
    return { ok: true, command };
  } catch (error) {
    return {
      ok: false,
      message: error?.message || "Gửi màn thành công OXU thất bại.",
      command,
    };
  }
};

export const pushCheckoutQrToOxu = async ({
  bankConfig,
  stay = {},
  qrCode = "",
  sendImpl = sendOxuComCommand,
  requestNewPort = false,
} = {}) => {
  const payload = String(qrCode || "").trim();
  if (!payload) {
    return { ok: false, message: "Thiếu chuỗi EMVCo để gửi OXU." };
  }
  if (!isWebSerialSupported()) {
    return {
      ok: false,
      message: "Cần Chrome/Edge trên HTTPS hoặc localhost để gửi OXU.",
    };
  }

  const command = buildCheckoutOxuCommand({ bankConfig, stay, qrCode: payload });
  if (!command) {
    return { ok: false, message: "Không ghép được lệnh COM OXU." };
  }

  try {
    if (!mustUseOxuHostBridge() && (await isDirectSerialUsable())) {
      await connectOxuSerialPort({ requestNew: requestNewPort });
    }
    await sendImpl(command, { requestNew: requestNewPort });
    return { ok: true, command };
  } catch (error) {
    return {
      ok: false,
      message: error?.message || "Gửi COM OXU thất bại.",
      command,
    };
  }
};

export const prepareCheckoutQrExperience = async ({
  stay = {},
  getBankConfigFn,
  generateImpl = generateVietQrPayload,
  pushOxuImpl = pushCheckoutQrToOxu,
  sendOxuImpl,
  autoPushOxu = false,
  forceRefreshBank = false,
  forceRefreshQr = false,
} = {}) => {
  const bankConfig = await resolveCheckoutBankConfig(getBankConfigFn, {
    forceRefresh: forceRefreshBank,
  });
  if (!bankConfig) {
    return {
      ok: false,
      message:
        "Chưa cấu hình tài khoản ngân hàng trong sheet BANK hoặc trang Test QR OXU.",
    };
  }

  const amount = Math.max(Number(stay.tongThanhToan || 0), 0);
  const addInfo = buildCheckoutQrAddInfo(stay);
  const qrCacheKey = buildCheckoutQrCacheKey({ bankConfig, stay, addInfo });
  const cachedQr = !forceRefreshQr ? readCheckoutQrCache(qrCacheKey) : null;
  const generateResult = cachedQr
    ? {
        ok: true,
        qrCode: cachedQr.qrCode,
        qrDataURL: cachedQr.qrDataURL,
        cached: true,
      }
    : await generateImpl({
        bankCode: bankConfig.bankCode,
        accountNumber: bankConfig.accountNumber,
        accountName: bankConfig.accountName,
        amount,
        addInfo,
      });
  if (generateResult?.ok && generateResult.qrCode && !generateResult.cached) {
    writeCheckoutQrCache(qrCacheKey, generateResult);
  }

  const presentation = buildCheckoutQrPresentation({
    bankConfig,
    stay,
    generateResult,
  });
  if (!presentation.ok) {
    return { ok: false, message: presentation.message, bankConfig };
  }

  let oxu = { ok: false, skipped: true };
  if (autoPushOxu && presentation.qrCode) {
    oxu = await pushOxuImpl({
      bankConfig,
      stay,
      qrCode: presentation.qrCode,
      sendImpl: sendOxuImpl,
      requestNewPort: false,
    });
  } else if (presentation.qrCode) {
    oxu = {
      ok: false,
      skipped: true,
      message: autoPushOxu
        ? "Chưa chọn cổng COM — bấm «Hiển thị lại lên màn hình» để chọn cổng và gửi."
        : "",
    };
  }

  return {
    ok: true,
    bankConfig,
    presentation,
    oxu,
    generateResult,
  };
};
