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

export const resolveVietQrBankBin = (raw) => {
  const input = String(raw || "").trim();
  if (!input) return "";
  const lower = input.toLowerCase();
  // 1. Exact match (case-insensitive)
  if (BANK_NAME_TO_BIN[lower]) return BANK_NAME_TO_BIN[lower];
  // 2. Nếu input đã là BIN (toàn số, 6 chữ số), dùng trực tiếp
  if (/^\d{6}$/.test(input)) return input;
  // 3. Normalize: bỏ dấu tiếng Việt + ký tự đặc biệt, thử lại
  const folded = lower
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]/g, "");
  for (const [key, bin] of Object.entries(BANK_NAME_TO_BIN)) {
    const keyFolded = key
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/[^a-z0-9]/g, "");
    if (keyFolded === folded) return bin;
  }
  // 4. Partial: kiểm tra input có chứa tên ngân hàng không
  for (const [key, bin] of Object.entries(BANK_NAME_TO_BIN)) {
    const keyFolded = key
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/[^a-z0-9]/g, "");
    if (keyFolded.length >= 3 && folded.includes(keyFolded)) return bin;
  }
  console.warn("[VietQR] Không tìm thấy BIN cho ngân hàng:", input);
  return input;
};

export const buildVietQrUrl = ({
  bankCode,
  accountNumber,
  accountName,
  amount,
  addInfo,
}) => {
  const bank = resolveVietQrBankBin(bankCode);
  const account = String(accountNumber || "").trim();
  if (!bank || !account) return "";
  const params = new URLSearchParams();
  if (amount && Number(amount) > 0)
    params.set("amount", String(Math.round(Number(amount))));
  if (addInfo) params.set("addInfo", String(addInfo));
  if (accountName) params.set("accountName", String(accountName));
  const query = params.toString();
  return `https://img.vietqr.io/image/${encodeURIComponent(bank)}-${encodeURIComponent(account)}-compact2.png${query ? `?${query}` : ""}`;
};
