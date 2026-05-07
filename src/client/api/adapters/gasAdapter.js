import {
  publishInvoiceHSM,
  cancelInvoiceHSM,
  replaceInvoiceHSM,
  sendErrorNoticeHSM,
  getInvoiceDetailsHSM,
  getInvoicePdfBlobHSM,
} from "../../../core/easyInvoice.js";
const IS_DEV = import.meta.env.DEV;
const GAS_WEBAPP_URL = import.meta.env.VITE_GAS_WEBAPP_URL ?? "";

// ===== Cấu hình Gửi Email khi có lỗi =====
var ERROR_MAIL_CONFIG = {
  enable: true,
  developerEmail: "buituananhhy0@gmail.com", // Bắt buộc nhận
  projectName: "Soạn Hàng - Công Nợ", // Tên dự án
  customerName: "Tên Khách Hàng", // Tên khách hàng
  customerLink: "Link Zalo/FB khách hàng", // Link liên hệ (FB, Zalo,...)
};

function gasRun(fnName, ...args) {
  return new Promise((resolve, reject) => {
    window.google.script.run
      .withSuccessHandler(resolve)
      .withFailureHandler(reject)
      [fnName](...args);
  });
}

async function gasFetch(fnName, ...args) {
  const params = new URLSearchParams({
    fn: fnName,
    args: JSON.stringify(args),
  });
  const res = await fetch(`/gas-proxy?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const text = await res.text();
  if (text.trimStart().startsWith("<")) {
    throw new Error(
      "GAS trả về HTML thay vì JSON — kiểm tra:\n" +
        "1. VITE_GAS_WEBAPP_URL trong .env phải là URL deployment (dạng AKfycb...)\n" +
        "2. Deploy → Web App → Who has access: Anyone",
    );
  }
  return JSON.parse(text);
}

const call = (fnName, ...args) => {
  return IS_DEV ? gasFetch(fnName, ...args) : gasRun(fnName, ...args);
};

/* ── GAS Server Functions ── */

function doGet(e) {
  var params = e && e.parameter ? e.parameter : {};
  if (params.printPdf) {
    return buildReceiptPdf_(String(params.printPdf || "").trim());
  }
  if (params.printText) {
    return buildReceiptBridgeText_(
      String(params.printText || "").trim(),
      String(params.size || "58").trim(),
    );
  }

  if (params.sw === "1") {
    var swCode =
      "self.addEventListener('install', function(e) { self.skipWaiting(); });" +
      "self.addEventListener('activate', function(e) { e.waitUntil(self.clients.claim()); });" +
      "self.addEventListener('fetch', function(e) { });";
    return ContentService.createTextOutput(swCode).setMimeType(
      ContentService.MimeType.JAVASCRIPT,
    );
  }

  return HtmlService.createHtmlOutputFromFile("index")
    .setTitle("Soạn Hàng - Công Nợ")
    .addMetaTag(
      "viewport",
      "width=device-width, initial-scale=1, viewport-fit=cover",
    )
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

var APP_CACHE_VERSION_KEY = "app_cache_version";

function getAppCacheVersion_() {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty(APP_CACHE_VERSION_KEY);
  if (!raw) {
    props.setProperty(APP_CACHE_VERSION_KEY, "1");
    return "1";
  }
  return String(raw);
}

function getSyncVersion() {
  return {
    success: true,
    data: {
      version: String(getAppCacheVersion_()),
    },
  };
}

function bumpAppCacheVersion_() {
  var props = PropertiesService.getScriptProperties();
  var next = String((Number(getAppCacheVersion_()) || 1) + 1);
  props.setProperty(APP_CACHE_VERSION_KEY, next);
  return next;
}

function buildCacheKey_(key) {
  return "v" + getAppCacheVersion_() + ":" + String(key || "");
}

function getJsonCache_(key) {
  try {
    var cache = CacheService.getScriptCache();
    var raw = cache.get(buildCacheKey_(key));
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function putJsonCache_(key, value, ttlSeconds) {
  try {
    CacheService.getScriptCache().put(
      buildCacheKey_(key),
      JSON.stringify(value),
      Math.max(1, ttlSeconds || 60),
    );
  } catch (e) {
    // Ignore cache failures to avoid affecting business flow.
  }
}

function withSuccessCache_(key, ttlSeconds, loader) {
  var cached = getJsonCache_(key);
  if (cached && cached.success) return cached;
  var fresh = loader();
  if (fresh && fresh.success) putJsonCache_(key, fresh, ttlSeconds);
  return fresh;
}

// ===== Auth / Info (GAS) =====
function normalizeHeader_(v) {
  return String(v || "")
    .trim()
    .toLowerCase();
}

function getAccountSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var preferred = ["ACCOUNT", "account", "Account", "ACCOUNTS", "accounts"];
  for (var i = 0; i < preferred.length; i++) {
    var s = ss.getSheetByName(preferred[i]);
    if (s) return s;
  }

  var sheets = ss.getSheets();
  for (var j = 0; j < sheets.length; j++) {
    var sheet = sheets[j];
    var lastCol = sheet.getLastColumn();
    if (lastCol < 1) continue;
    var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var h = header.map(normalizeHeader_);
    if (h.indexOf("email") !== -1 && h.indexOf("password") !== -1) {
      return sheet;
    }
  }
  return null;
}

function readAccounts_() {
  var sheet = getAccountSheet_();
  if (!sheet) {
    throw new Error(
      "Không tìm thấy sheet ACCOUNT (hoặc header email/password)",
    );
  }

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  var headers = values[0].map(normalizeHeader_);
  var idxEmail = headers.indexOf("email");
  var idxPassword = headers.indexOf("password");
  var idxName = headers.indexOf("name");
  var idxRole = headers.indexOf("role");
  var idxDept = headers.indexOf("department");

  if (idxEmail < 0 || idxPassword < 0) {
    throw new Error("Sheet ACCOUNT thiếu cột email/password");
  }

  var accounts = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var email = row[idxEmail];
    if (!email) continue;
    accounts.push({
      email: String(email).trim(),
      password: String(row[idxPassword] || "").trim(),
      name: idxName >= 0 ? String(row[idxName] || "").trim() : "",
      role: idxRole >= 0 ? String(row[idxRole] || "").trim() : "",
      department: idxDept >= 0 ? String(row[idxDept] || "").trim() : "",
    });
  }
  return accounts;
}

function getDemoAccounts() {
  try {
    var accounts = readAccounts_();
    return {
      success: true,
      data: accounts.map(function (a) {
        return {
          email: a.email,
          password: a.password,
          role: a.role,
          name: a.name,
        };
      }),
    };
  } catch (e) {
    return { success: false, message: "Lỗi: " + e.message };
  }
}

var DEVICE_TOKEN_VERSION = "v1";
var DEVICE_TOKEN_PREFIX = "auth_device_token:";
var DEVICE_TOKEN_SECRET_KEY = "AUTH_DEVICE_TOKEN_SECRET";
var DEVICE_TOKEN_TTL_DAYS = 180;

function normalizeAppScope_(scope) {
  return String(scope || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .slice(0, 64) || "default";
}

function getDeviceTokenSecret_() {
  var props = PropertiesService.getScriptProperties();
  var secret = String(props.getProperty(DEVICE_TOKEN_SECRET_KEY) || "").trim();
  if (!secret) {
    secret = Utilities.getUuid() + ":" + Utilities.getUuid();
    props.setProperty(DEVICE_TOKEN_SECRET_KEY, secret);
  }
  return secret;
}

function bytesToHex_(bytes) {
  var out = [];
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i];
    if (b < 0) b += 256;
    var hex = b.toString(16);
    out.push(hex.length === 1 ? "0" + hex : hex);
  }
  return out.join("");
}

function sha256Hex_(text) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(text || ""),
    Utilities.Charset.UTF_8,
  );
  return bytesToHex_(digest);
}

function randomTokenPart_(byteLength) {
  var targetLen = Math.max(16, Number(byteLength || 16) * 2);
  var out = "";
  while (out.length < targetLen) {
    var seed =
      Utilities.getUuid() +
      ":" +
      Utilities.getUuid() +
      ":" +
      String(Date.now()) +
      ":" +
      String(Math.random());
    var digest = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      seed,
      Utilities.Charset.UTF_8,
    );
    out += Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, "");
  }
  return out.slice(0, targetLen);
}

function buildTokenRecordKey_(scope, tokenId) {
  return (
    DEVICE_TOKEN_PREFIX + normalizeAppScope_(scope) + ":" + String(tokenId || "")
  );
}

function buildAuthUserData_(user, deviceToken, expiresAtMs) {
  return {
    email: user.email,
    name: user.name,
    role: user.role,
    department: user.department,
    deviceToken: String(deviceToken || ""),
    deviceTokenExpiresAt: Number(expiresAtMs || 0),
  };
}

function issueDeviceTokenForUser_(user, appScope) {
  var scope = normalizeAppScope_(appScope);
  var tokenId = randomTokenPart_(12);
  var tokenSecret = randomTokenPart_(24);
  var token = DEVICE_TOKEN_VERSION + "." + tokenId + "." + tokenSecret;
  var now = Date.now();
  var expiresAt = now + DEVICE_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
  var tokenHash = sha256Hex_(
    tokenId + "." + tokenSecret + "." + getDeviceTokenSecret_(),
  );
  var payload = {
    email: String(user.email || "").trim().toLowerCase(),
    scope: scope,
    tokenId: tokenId,
    tokenHash: tokenHash,
    issuedAt: now,
    lastUsedAt: now,
    expiresAt: expiresAt,
    revoked: false,
  };
  PropertiesService.getScriptProperties().setProperty(
    buildTokenRecordKey_(scope, tokenId),
    JSON.stringify(payload),
  );
  return { token: token, expiresAt: expiresAt };
}

function readUserByEmail_(email) {
  var target = String(email || "").trim().toLowerCase();
  if (!target) return null;
  var accounts = readAccounts_();
  for (var i = 0; i < accounts.length; i++) {
    var acc = accounts[i];
    if (String(acc.email || "").trim().toLowerCase() === target) return acc;
  }
  return null;
}

function verifyDeviceToken_(deviceToken, appScope) {
  var scope = normalizeAppScope_(appScope);
  var raw = String(deviceToken || "").trim();
  var parts = raw.split(".");
  if (
    parts.length !== 3 ||
    parts[0] !== DEVICE_TOKEN_VERSION ||
    !parts[1] ||
    !parts[2]
  ) {
    return { success: false, message: "Token không hợp lệ" };
  }
  var tokenId = parts[1];
  var tokenSecret = parts[2];
  var recordKey = buildTokenRecordKey_(scope, tokenId);
  var rawRecord = PropertiesService.getScriptProperties().getProperty(recordKey);
  if (!rawRecord) return { success: false, message: "Token đã hết hạn" };

  var record = null;
  try {
    record = JSON.parse(rawRecord);
  } catch (e) {
    return { success: false, message: "Token không hợp lệ" };
  }
  if (!record || record.revoked) return { success: false, message: "Token đã thu hồi" };
  if (Number(record.expiresAt || 0) <= Date.now()) {
    return { success: false, message: "Token đã hết hạn" };
  }

  var expectedHash = sha256Hex_(
    tokenId + "." + tokenSecret + "." + getDeviceTokenSecret_(),
  );
  if (String(record.tokenHash || "") !== expectedHash) {
    return { success: false, message: "Token không hợp lệ" };
  }

  return {
    success: true,
    scope: scope,
    recordKey: recordKey,
    record: record,
  };
}

function login(email, password, appScope) {
  try {
    var accounts = readAccounts_();
    var user = accounts.find(function (u) {
      return u.email === email && u.password === password;
    });
    if (user) {
      var issued = issueDeviceTokenForUser_(user, appScope);
      return {
        success: true,
        data: buildAuthUserData_(user, issued.token, issued.expiresAt),
        message: "Đăng nhập thành công!",
      };
    }
    return {
      success: false,
      data: null,
      message: "Email hoặc mật khẩu không đúng!",
    };
  } catch (e) {
    return { success: false, message: "Lỗi: " + e.message };
  }
}

function loginWithDeviceToken(deviceToken, appScope) {
  try {
    var verified = verifyDeviceToken_(deviceToken, appScope);
    if (!verified.success) {
      return {
        success: false,
        data: null,
        message: verified.message || "Token đăng nhập không hợp lệ",
      };
    }

    var user = readUserByEmail_(verified.record.email);
    if (!user) {
      return {
        success: false,
        data: null,
        message: "Tài khoản không còn tồn tại",
      };
    }

    verified.record.lastUsedAt = Date.now();
    PropertiesService.getScriptProperties().setProperty(
      verified.recordKey,
      JSON.stringify(verified.record),
    );

    return {
      success: true,
      data: buildAuthUserData_(
        user,
        String(deviceToken || ""),
        Number(verified.record.expiresAt || 0),
      ),
      message: "Khôi phục đăng nhập thành công",
    };
  } catch (e) {
    return { success: false, message: "Lỗi: " + e.message };
  }
}

function revokeDeviceToken(deviceToken, appScope) {
  try {
    var verified = verifyDeviceToken_(deviceToken, appScope);
    if (!verified.success) {
      return { success: true, data: null, message: "Token không còn hiệu lực" };
    }
    verified.record.revoked = true;
    verified.record.revokedAt = Date.now();
    PropertiesService.getScriptProperties().setProperty(
      verified.recordKey,
      JSON.stringify(verified.record),
    );
    return { success: true, data: null, message: "Đã đăng xuất thiết bị" };
  } catch (e) {
    return { success: false, message: "Lỗi: " + e.message };
  }
}

function getUserInfo(email) {
  try {
    var accounts = readAccounts_();
    var user = accounts.find(function (u) {
      return u.email === email;
    });
    if (user) {
      return {
        success: true,
        data: {
          email: user.email,
          name: user.name,
          role: user.role,
          department: user.department,
        },
      };
    }
    return {
      success: false,
      message: "Không tìm thấy tài khoản",
    };
  } catch (e) {
    return { success: false, message: "Lỗi: " + e.message };
  }
}

var GLOBAL_NOTICE_SPREADSHEET_ID =
  "1BIP63sE_yEA3Asl0CyvypoWNEmLNYSPGFBqeVosIh98";

function normalizeNoticeHeader_(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function parseBooleanCell_(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  var raw = String(value || "")
    .trim()
    .toLowerCase();
  return (
    raw === "true" || raw === "1" || raw === "yes" || raw === "y" || raw === "x"
  );
}

function findNoticeSheet_(ss) {
  var preferredNames = ["notify", "Notify", "NOTIFY", "SystemBroadcast"];
  for (var i = 0; i < preferredNames.length; i++) {
    var direct = ss.getSheetByName(preferredNames[i]);
    if (direct) return direct;
  }

  var sheets = ss.getSheets();
  for (var j = 0; j < sheets.length; j++) {
    var sh = sheets[j];
    var lastCol = sh.getLastColumn();
    if (lastCol < 1) continue;
    var headerRow = sh.getRange(2, 1, 1, lastCol).getDisplayValues()[0];
    var normalizedHeaders = headerRow.map(normalizeNoticeHeader_);
    if (
      normalizedHeaders.indexOf("message") !== -1 &&
      normalizedHeaders.indexOf("active") !== -1
    ) {
      return sh;
    }
  }
  return null;
}

function getGlobalNotice() {
  try {
    var ss = SpreadsheetApp.openById(GLOBAL_NOTICE_SPREADSHEET_ID);
    var sheet = findNoticeSheet_(ss);
    if (!sheet) {
      throw new Error("Không tìm thấy sheet notify/SystemBroadcast");
    }

    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 3 || lastCol < 1) return [];

    var headers = sheet
      .getRange(2, 1, 1, lastCol)
      .getDisplayValues()[0]
      .map(normalizeNoticeHeader_);
    var idxBase = headers.indexOf("base");
    var idxMessage = headers.indexOf("message");
    var idxLevel = headers.indexOf("level");
    var idxActive = headers.indexOf("active");
    var idxVersion = headers.indexOf("version");
    var idxChangelog =
      headers.indexOf("noidungcapnhap") !== -1
        ? headers.indexOf("noidungcapnhap")
        : headers.indexOf("changelog");

    if (idxMessage < 0) return [];

    var values = sheet.getRange(3, 1, lastRow - 2, lastCol).getValues();
    var notices = [];

    for (var r = 0; r < values.length; r++) {
      var row = values[r];
      var message = String(row[idxMessage] || "").trim();
      if (!message) continue;

      var isActive = idxActive < 0 ? true : parseBooleanCell_(row[idxActive]);
      if (!isActive) continue;

      notices.push({
        base: idxBase >= 0 ? String(row[idxBase] || "").trim() : "",
        message: message,
        level:
          idxLevel >= 0
            ? String(row[idxLevel] || "info")
                .trim()
                .toLowerCase()
            : "info",
        version: idxVersion >= 0 ? String(row[idxVersion] || "").trim() : "",
        changelog:
          idxChangelog >= 0 ? String(row[idxChangelog] || "").trim() : "",
      });
    }

    return notices;
  } catch (e) {
    return [
      {
        base: "",
        message: "Không tải được thông báo hệ thống: " + e.message,
        level: "warning",
        version: "",
        changelog: "",
      },
    ];
  }
}

function getAppSetting(key) {
  try {
    var props = PropertiesService.getScriptProperties();
    var val = props.getProperty(key);
    return { success: true, data: val };
  } catch (e) {
    return { success: false, message: e.message, data: null };
  }
}

function setAppSetting(payload) {
  return runWithLockOrQueue_("SET_SETTING", { payload: payload }, function () {
    try {
      var key = payload && payload.key;
      var value = payload && payload.value;
      if (!key) throw new Error("Missing key");
      var props = PropertiesService.getScriptProperties();
      props.setProperty(key, String(value));
      bumpAppCacheVersion_();
      return { success: true, message: "Đã lưu cài đặt" };
    } catch (e) {
      return { success: false, message: e.message };
    }
  });
}

function getTodayInputDate_() {
  var tz = Session.getScriptTimeZone() || "Asia/Ho_Chi_Minh";
  return Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
}

function incrementOrderCode_(value, defaultVal) {
  var raw = String(value == null ? "" : value).trim();
  if (!raw) return defaultVal || "01";

  var m = raw.match(/^(.*?)(\d+)$/);
  if (!m) return raw + "1";

  var prefix = m[1];
  var digits = m[2];
  var next = String(parseInt(digits, 10) + 1);
  while (next.length < digits.length) next = "0" + next;
  return prefix + next;
}

function getNextOrderFormDefaults() {
  var today = getTodayInputDate_();

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetDH = ss.getSheetByName("DON_HANG");
    if (!sheetDH) {
      throw new Error("Khong tim thay sheet DON_HANG");
    }

    // Latest order is always at row 3, column C (ma phieu)
    var latestCode = String(
      sheetDH.getRange(3, 3, 1, 1).getDisplayValues()[0][0] || "",
    ).trim();
    var nextCode = incrementOrderCode_(latestCode, "DH00001");

    return {
      success: true,
      data: {
        maPhieu: nextCode,
        ngayBan: today,
      },
    };
  } catch (e) {
    return {
      success: false,
      message: "Loi: " + e.message,
      data: {
        maPhieu: "DH00001",
        ngayBan: today,
      },
    };
  }
}

function getNextInventoryReceiptDefaults() {
  var today = getTodayInputDate_();

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetNhap = ss.getSheetByName("NHAP_HANG");
    if (!sheetNhap) {
      throw new Error("Khong tim thay sheet NHAP_HANG");
    }

    // Latest receipt is at row 3, column C (phiếu nhập)
    var latestCode = String(
      sheetNhap.getRange(3, 3, 1, 1).getDisplayValues()[0][0] || "",
    ).trim();
    var nextCode = incrementOrderCode_(latestCode, "PN00001");

    return {
      success: true,
      data: {
        maPhieu: nextCode,
        ngayNhap: today,
      },
    };
  } catch (e) {
    return {
      success: false,
      message: "Loi: " + e.message,
      data: {
        maPhieu: "PN00001",
        ngayNhap: today,
      },
    };
  }
}

function parseMoneyNumber_(value) {
  if (typeof value === "number") return value;
  var raw = String(value || "").trim();
  if (!raw) return 0;
  var normalized = raw
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .replace(/[^\d.-]/g, "");
  var n = Number(normalized);
  return isNaN(n) ? 0 : n;
}

function formatMoneyNumber_(value) {
  var num = parseMoneyNumber_(value);
  var n = Math.round(num);
  var str = String(n);
  return str.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function normalizeProductKeyPart_(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function buildProductKey_(tenSanPham, donVi) {
  return (
    normalizeProductKeyPart_(tenSanPham) +
    "||" +
    normalizeProductKeyPart_(donVi)
  );
}

function setImageHyperlink_(sheet, row, col, url) {
  var cell = sheet.getRange(row, col);
  if (!url) {
    cell.setValue("");
    return;
  }
  try {
    var fullUrl = String(url).trim();
    if (fullUrl.indexOf("://") < 0) fullUrl = "https://" + fullUrl;
    var richText = SpreadsheetApp.newRichTextValue()
      .setText("ảnh sản phẩm")
      .setLinkUrl(fullUrl)
      .build();
    cell.setRichTextValue(richText);
  } catch (e) {
    cell.setValue(url);
  }
}

function getImageUrlFromRichText_(richTextValue, fallbackText) {
  if (richTextValue) {
    try {
      var linkUrl = richTextValue.getLinkUrl();
      if (linkUrl) return String(linkUrl).trim();
    } catch (e) {}
  }
  return String(
    fallbackText || (richTextValue ? richTextValue.getText() : "") || "",
  ).trim();
}

function getLastDataRowByCol_(sheet, col, dataStartRow) {
  var lastRow = sheet.getLastRow();
  if (lastRow < dataStartRow) return dataStartRow - 1;
  var values = sheet
    .getRange(dataStartRow, col, lastRow - dataStartRow + 1, 1)
    .getDisplayValues();
  for (var i = values.length - 1; i >= 0; i--) {
    if (String(values[i][0] || "").trim()) return dataStartRow + i;
  }
  return dataStartRow - 1;
}

function copyRowFormat_(sheet, sourceRow, targetRow, rowCount, colCount) {
  if (!sheet || rowCount <= 0 || sourceRow < 1 || targetRow < 1) return;

  var maxRows = sheet.getMaxRows();
  var targetLastRow = targetRow + rowCount - 1;
  if (targetLastRow > maxRows) {
    sheet.insertRowsAfter(maxRows, targetLastRow - maxRows);
  }

  var maxCols = sheet.getMaxColumns();
  var cols = Math.max(
    1,
    Math.min(colCount || sheet.getLastColumn() || maxCols, maxCols),
  );
  if (sourceRow > sheet.getMaxRows()) return;

  try {
    sheet
      .getRange(sourceRow, 1, 1, cols)
      .copyTo(
        sheet.getRange(targetRow, 1, rowCount, cols),
        SpreadsheetApp.CopyPasteType.PASTE_FORMAT,
        false,
      );
  } catch (e) {
    Logger.log("WARN copyRowFormat_: " + e.message);
  }
}

function copyLatestFormatForTopInsert_(
  sheet,
  dataStartRow,
  insertedRowCount,
  colCount,
) {
  if (!sheet || insertedRowCount <= 0) return;
  var sourceRow = dataStartRow + insertedRowCount;
  if (sourceRow > sheet.getLastRow()) sourceRow = dataStartRow - 1;
  if (sourceRow < 1) return;
  copyRowFormat_(sheet, sourceRow, dataStartRow, insertedRowCount, colCount);
}

function copyLatestFormatForAppend_(
  sheet,
  dataStartRow,
  appendStartRow,
  insertedRowCount,
  colCount,
) {
  if (!sheet || insertedRowCount <= 0) return;
  var sourceRow = appendStartRow - 1;
  if (sourceRow < dataStartRow) {
    sourceRow =
      sheet.getLastRow() >= dataStartRow ? dataStartRow : dataStartRow - 1;
  }
  if (sourceRow < 1) return;
  copyRowFormat_(sheet, sourceRow, appendStartRow, insertedRowCount, colCount);
}

function syncProductCatalog_(ss, products) {
  var sheetSP = ss.getSheetByName("SAN_PHAM");
  if (!sheetSP) throw new Error("Không tìm thấy sheet SAN_PHAM");
  if (!products || !products.length) return { inserted: 0, updated: 0 };

  var dataStartRow = 3;
  var lastDataRow = getLastDataRowByCol_(sheetSP, 2, dataStartRow);
  var existingByKey = {};

  if (lastDataRow >= dataStartRow) {
    // B:G = TEN SAN PHAM | ANH SAN PHAM | NHOM HANG | DON VI | GIA | GIA VON
    var numRows = lastDataRow - dataStartRow + 1;
    var existing = sheetSP.getRange(dataStartRow, 2, numRows, 6).getValues();
    var richTexts = sheetSP
      .getRange(dataStartRow, 3, numRows, 1)
      .getRichTextValues();
    for (var i = 0; i < existing.length; i++) {
      var row = existing[i];
      var tenSanPham = String(row[0] || "").trim();
      var donVi = String(row[3] || "").trim();
      if (!tenSanPham || !donVi) continue;
      existingByKey[buildProductKey_(tenSanPham, donVi)] = {
        row: dataStartRow + i,
        anhSanPham: getImageUrlFromRichText_(richTexts[i][0], row[1]),
        nhomHang: String(row[2] || "").trim(),
        donGiaBan: parseMoneyNumber_(row[4]),
        giaVon: parseMoneyNumber_(row[5]),
        donViLon: "", // Default empty as sheet no longer has them
        quyCach: 0,
      };
    }
  }

  // Gộp các sản phẩm trùng key trong cùng đơn, lấy giá trị cuối cùng người dùng gửi.
  var incomingByKey = {};
  for (var j = 0; j < products.length; j++) {
    var p = products[j] || {};
    var ten = String(p.tenSanPham || "").trim();
    var dv = String(p.donVi || "").trim();
    if (!ten || !dv) continue;
    incomingByKey[buildProductKey_(ten, dv)] = {
      tenSanPham: ten,
      anhSanPham: String(p.anhSanPham || "").trim(),
      nhomHang: String(p.nhomHang || "").trim(),
      donVi: dv,
      donGiaBan: parseMoneyNumber_(p.donGiaBan),
      giaVon: parseMoneyNumber_(p.giaVon),
      donViLon: String(p.donViChan || p.donViLon || "").trim(),
      quyCach: parseMoneyNumber_(p.quyDoi || p.quyCach) || 0,
    };
  }

  var keys = Object.keys(incomingByKey);
  var inserts = [];
  var newProductsForKho = [];
  var updated = 0;

  for (var k = 0; k < keys.length; k++) {
    var key = keys[k];
    var incomingProduct = incomingByKey[key];
    var matched = existingByKey[key];

    if (matched) {
      if (!incomingProduct.nhomHang && matched.nhomHang) {
        incomingProduct.nhomHang = matched.nhomHang;
      }
      var finalDonGiaBan =
        incomingProduct.donGiaBan > 0
          ? incomingProduct.donGiaBan
          : matched.donGiaBan || 0;
      var finalGiaVon =
        incomingProduct.giaVon > 0
          ? incomingProduct.giaVon
          : matched.giaVon || 0;

      var changedPrice =
        Math.abs((matched.donGiaBan || 0) - finalDonGiaBan) > 0.0001;
      var changedCost = Math.abs((matched.giaVon || 0) - finalGiaVon) > 0.0001;
      var changedGroup =
        normalizeProductKeyPart_(matched.nhomHang || "") !==
        normalizeProductKeyPart_(incomingProduct.nhomHang || "");
      var changedImage =
        incomingProduct.anhSanPham &&
        incomingProduct.anhSanPham !== matched.anhSanPham;

      var changedMulti =
        matched.donViLon !== incomingProduct.donViLon ||
        Math.abs((matched.quyCach || 0) - (incomingProduct.quyCach || 0)) >
          0.0001;

      if (changedPrice || changedCost || changedGroup || changedImage) {
        if (changedPrice || changedCost || changedGroup) {
          sheetSP
            .getRange(matched.row, 4, 1, 4)
            .setValues([
              [
                incomingProduct.nhomHang || "",
                incomingProduct.donVi || "",
                finalDonGiaBan,
                finalGiaVon,
              ],
            ]);
        }
        if (changedImage) {
          setImageHyperlink_(
            sheetSP,
            matched.row,
            3,
            incomingProduct.anhSanPham,
          );
        }

        var isInventoryEnabled =
          PropertiesService.getScriptProperties().getProperty(
            "enable_inventory",
          ) === "true";
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var sheetKho = isInventoryEnabled
          ? ss.getSheetByName("QUAN_LY_KHO") || ss.getSheetByName("QUẢN LÝ KHO")
          : null;
        if (sheetKho && incomingProduct.nhomHang) {
          var khoRow = findKhoRowByName_(
            sheetKho,
            3,
            incomingProduct.tenSanPham,
          );
          if (khoRow) {
            sheetKho
              .getRange(khoRow, 3, 1, 1)
              .setValue(incomingProduct.nhomHang);
          }
        }
        updated++;
      }
    } else {
      // Thêm mới nếu chưa có key name+unit (bao gồm case cùng tên nhưng khác đơn vị).
      inserts.push([
        incomingProduct.tenSanPham,
        incomingProduct.anhSanPham || "",
        incomingProduct.nhomHang || "",
        incomingProduct.donVi,
        incomingProduct.donGiaBan || 0,
        incomingProduct.giaVon || 0,
      ]);
      newProductsForKho.push(incomingProduct);
    }
  }

  var inserted = 0;
  if (inserts.length) {
    var appendStartRow = getLastDataRowByCol_(sheetSP, 2, dataStartRow) + 1;
    if (appendStartRow < dataStartRow) appendStartRow = dataStartRow;
    var needLastRow = appendStartRow + inserts.length - 1;
    if (needLastRow > sheetSP.getMaxRows()) {
      sheetSP.insertRowsAfter(
        sheetSP.getMaxRows(),
        needLastRow - sheetSP.getMaxRows(),
      );
    }

    copyLatestFormatForAppend_(
      sheetSP,
      dataStartRow,
      appendStartRow,
      inserts.length,
      Math.max(7, sheetSP.getLastColumn()),
    );

    sheetSP.getRange(appendStartRow, 2, inserts.length, 6).setValues(inserts);
    for (var idx = 0; idx < inserts.length; idx++) {
      if (inserts[idx][1]) {
        setImageHyperlink_(sheetSP, appendStartRow + idx, 3, inserts[idx][1]);
      }
    }
    inserted = inserts.length;
    updateSTT_(sheetSP, dataStartRow);

    var isInventoryEnabled =
      PropertiesService.getScriptProperties().getProperty(
        "enable_inventory",
      ) === "true";
    var sheetKho =
      ss.getSheetByName("QUAN_LY_KHO") || ss.getSheetByName("QUẢN LÝ KHO");
    if (isInventoryEnabled && sheetKho && newProductsForKho.length) {
      var groupedByName = {};
      for (var npIdx = 0; npIdx < newProductsForKho.length; npIdx++) {
        var np = newProductsForKho[npIdx];
        var nameKey = normalizeProductKeyPart_(np.tenSanPham);
        if (!nameKey) continue;

        if (!groupedByName[nameKey]) {
          groupedByName[nameKey] = {
            tenSanPham: np.tenSanPham,
            nhomHang: np.nhomHang || "",
            donViChan: "",
            giaVonChan: 0,
            quyDoi: 1,
            donViLe: "",
            giaVonLe: 0,
          };
        }

        var entry = groupedByName[nameKey];
        if (!entry.nhomHang && np.nhomHang) entry.nhomHang = np.nhomHang;

        var unit = String(np.donVi || "").trim();
        var unitLon = String(np.donViLon || unit).trim();
        var unitKey = normalizeProductKeyPart_(unit);
        var unitLonKey = normalizeProductKeyPart_(unitLon);
        var quyDoi = Math.max(parseMoneyNumber_(np.quyCach), 1);
        var giaVon = Math.max(parseMoneyNumber_(np.giaVon), 0);

        if (!entry.donViChan) entry.donViChan = unitLon || unit;
        if (quyDoi > 1) entry.quyDoi = quyDoi;

        if (unit && unitLon && unitKey && unitLonKey && unitKey !== unitLonKey) {
          entry.donViLe = unit;
          if (giaVon > 0) entry.giaVonLe = giaVon;
        } else {
          if (!entry.donViChan) entry.donViChan = unit || unitLon;
          if (giaVon > 0) entry.giaVonChan = giaVon;
          if (!entry.donViLe && entry.quyDoi <= 1) {
            entry.donViLe = entry.donViChan;
            entry.giaVonLe = giaVon;
          }
        }
      }

      var khoInserts = [];
      var groupedKeys = Object.keys(groupedByName);
      for (var gk = 0; gk < groupedKeys.length; gk++) {
        var grouped = groupedByName[groupedKeys[gk]];
        var existKho = findKhoRowByName_(sheetKho, 3, grouped.tenSanPham);
        if (!existKho) {
          var quyDoiFinal = Math.max(parseMoneyNumber_(grouped.quyDoi), 1);
          var donViChanFinal = grouped.donViChan || grouped.donViLe || "";
          var donViLeFinal = grouped.donViLe || donViChanFinal;
          var giaVonChanFinal = Math.max(parseMoneyNumber_(grouped.giaVonChan), 0);
          var giaVonLeFinal = Math.max(parseMoneyNumber_(grouped.giaVonLe), 0);

          if (!giaVonChanFinal && giaVonLeFinal) {
            giaVonChanFinal = giaVonLeFinal * quyDoiFinal;
          }
          if (!giaVonLeFinal && giaVonChanFinal) {
            giaVonLeFinal =
              quyDoiFinal > 0 ? giaVonChanFinal / quyDoiFinal : giaVonChanFinal;
          }

          khoInserts.push([
            grouped.tenSanPham,
            grouped.nhomHang || "",
            donViChanFinal,
            giaVonChanFinal,
            quyDoiFinal,
            donViLeFinal,
            giaVonLeFinal,
            0,
          ]);
        }
      }

      if (khoInserts.length > 0) {
        var lastKhoRow = sheetKho.getLastRow();
        var appendKhoRow = lastKhoRow + 1;
        if (appendKhoRow < 3) appendKhoRow = 3;
        copyLatestFormatForAppend_(
          sheetKho,
          3,
          appendKhoRow,
          khoInserts.length,
          Math.max(8, sheetKho.getLastColumn()),
        );
        sheetKho
          .getRange(appendKhoRow, 2, khoInserts.length, 8)
          .setValues(khoInserts);
        updateSTT_(sheetKho, 3);
      }
    }
  }

  return { inserted: inserted, updated: updated };
}

function getProductCatalog() {
  return withSuccessCache_("read:product_catalog", 45, function () {
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var sheet = ss.getSheetByName("SAN_PHAM");
      if (!sheet) throw new Error("Không tìm thấy sheet SAN_PHAM");

      var lastRow = sheet.getLastRow();
      if (lastRow < 3) {
        return { success: true, data: [] };
      }

      // B:G = TEN SAN PHAM | ANH SAN PHAM | NHOM HANG | DON VI | GIA | GIA VON
      var numRows = lastRow - 2;
      var values = sheet.getRange(3, 2, numRows, 6).getDisplayValues();
      var richTexts = sheet.getRange(3, 3, numRows, 1).getRichTextValues();
      var data = [];
      for (var i = 0; i < values.length; i++) {
        var row = values[i];
        var tenSanPham = String(row[0] || "").trim();
        if (!tenSanPham) continue;
        data.push({
          tenSanPham: tenSanPham,
          anhSanPham: getImageUrlFromRichText_(richTexts[i][0], row[1]),
          nhomHang: String(row[2] || "").trim(),
          donVi: String(row[3] || "").trim(),
          donGiaBan: parseMoneyNumber_(row[4]),
          giaVon: parseMoneyNumber_(row[5]),
        });
      }

      var sheetKho =
        ss.getSheetByName("QUAN_LY_KHO") || ss.getSheetByName("QUẢN LÝ KHO");
      if (sheetKho) {
        var lastKhoRow = sheetKho.getLastRow();
        if (lastKhoRow >= 3) {
          // B:I = Tên(B), Nhóm(C), Đơn Vị Chẵn(D), Giá Vốn Chẵn(E), Quy Đổi(F), Đơn Vị Lẻ(G), Giá Vốn Lẻ(H), Tồn Kho Lẻ(I)
          var khoValues = sheetKho
            .getRange(3, 2, lastKhoRow - 2, 8)
            .getDisplayValues();
          var khoMap = {};
          for (var k = 0; k < khoValues.length; k++) {
            var kTen = normalizeProductKeyPart_(String(khoValues[k][0] || ""));
            if (kTen) {
              var rawDonViLon = String(khoValues[k][2] || "").trim();
              var rawDonViNho = String(khoValues[k][5] || "").trim();
              khoMap[kTen] = {
                donViLon: rawDonViLon,
                donViLonKey: normalizeProductKeyPart_(rawDonViLon),
                quyCach: Math.max(parseMoneyNumber_(khoValues[k][4]), 1),
                donViNho: rawDonViNho,
                donViNhoKey: normalizeProductKeyPart_(rawDonViNho),
                tonKhoLe: parseMoneyNumber_(khoValues[k][7]) || 0,
              };
            }
          }
          for (var p = 0; p < data.length; p++) {
            var pTen = normalizeProductKeyPart_(data[p].tenSanPham);
            var pDv = normalizeProductKeyPart_(data[p].donVi);
            var kMatch = khoMap[pTen];
            if (kMatch) {
              data[p].donViLon = kMatch.donViLon;
              data[p].donViNho = kMatch.donViNho;
              data[p].quyCach = kMatch.quyCach;
              if (pDv === kMatch.donViNhoKey) {
                data[p].tonKho = kMatch.tonKhoLe;
              } else if (pDv === kMatch.donViLonKey) {
                data[p].tonKho = Math.floor(kMatch.tonKhoLe / kMatch.quyCach);
              } else {
                data[p].tonKho = kMatch.tonKhoLe; // fallback
              }
            }
          }
        }
      }

      return { success: true, data: data };
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message, data: [] };
    }
  });
}

function getInventorySuggestions() {
  return withSuccessCache_("read:inventory_suggestions", 30, function () {
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var sheetKho =
        ss.getSheetByName("QUAN_LY_KHO") || ss.getSheetByName("QUẢN LÝ KHO");
      var sheetNhap = ss.getSheetByName("NHAP_HANG");

      var suggestionsMap = {};

      // 1. Ưu tiên lấy từ QUAN_LY_KHO làm mốc (Danh mục sản phẩm hiện có cấu trúc)
      if (sheetKho) {
        var lastKhoRow = sheetKho.getLastRow();
        if (lastKhoRow >= 3) {
          var khoValues = sheetKho
            .getRange(3, 2, lastKhoRow - 2, 8)
            .getDisplayValues();
          for (var k = 0; k < khoValues.length; k++) {
            var name = String(khoValues[k][0] || "").trim();
            if (!name) continue;

            var unitChan = String(khoValues[k][2] || "").trim();
            var unitLe = String(khoValues[k][5] || "").trim();
            var group = String(khoValues[k][1] || "").trim();
            var quyDoi = Math.max(parseMoneyNumber_(khoValues[k][4]), 1);
            var giaVonChan = parseMoneyNumber_(khoValues[k][3]) || 0;

            // Gợi ý cho đơn vị chẵn
            if (unitChan) {
              var keyChan = buildProductKey_(name, unitChan);
              suggestionsMap[keyChan] = {
                tenSanPham: name,
                nhomHang: group,
                donViChan: unitChan,
                donViLe: unitLe,
                quyDoi: quyDoi,
                giaNhapChan: giaVonChan,
                source: "KHO",
              };
            }
          }
        }
      }

      // 2. Lấy từ NHAP_HANG (Lịch sử nhập mới nhất)
      if (sheetNhap) {
        var lastNhapRow = sheetNhap.getLastRow();
        var numRows = Math.min(lastNhapRow - 2, 500); // Lấy 500 dòng gần nhất
        if (numRows > 0) {
          // D:L = Tên(D), Nhóm(E), SL(F), ĐV(G), Giá(H), Thành tiền(I), Tổng(J), Ghi chú(K), Trạng thái(L)
          var nhapValues = sheetNhap
            .getRange(3, 4, numRows, 9)
            .getDisplayValues();
          // Duyệt từ dưới lên để các dòng ở trên (mới hơn) ghi đè
          for (var n = nhapValues.length - 1; n >= 0; n--) {
            var nameN = String(nhapValues[n][0] || "").trim();
            var unitN = String(nhapValues[n][3] || "").trim();
            if (!nameN || !unitN) continue;

            var keyN = buildProductKey_(nameN, unitN);
            var current = suggestionsMap[keyN];

            suggestionsMap[keyN] = {
              tenSanPham: nameN,
              nhomHang: String(nhapValues[n][1] || "").trim(),
              donViChan: unitN,
              donViLe: current ? current.donViLe : "",
              quyDoi: current ? current.quyDoi : 1,
              giaNhapChan: parseMoneyNumber_(nhapValues[n][4]) || 0,
              soLuong: parseMoneyNumber_(nhapValues[n][2]) || 0,
              source: "NHAP",
            };
          }
        }
      }

      var result = Object.keys(suggestionsMap).map(function (k) {
        return suggestionsMap[k];
      });
      return { success: true, data: result };
    } catch (e) {
      return { success: false, message: "Lỗi gợi ý: " + e.message, data: [] };
    }
  });
}

function normalizeBankKey_(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function getBankConfig() {
  return withSuccessCache_("read:bank_config", 45, function () {
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var sheet = ss.getSheetByName("BANK");
      if (!sheet) throw new Error("Không tìm thấy sheet BANK");

      var lastRow = sheet.getLastRow();
      if (lastRow < 1) throw new Error("Sheet BANK trống");

      var lastCol = sheet.getLastColumn();
      if (lastCol < 1) throw new Error("Sheet BANK trống");
      var values = sheet.getRange(1, 1, lastRow, lastCol).getDisplayValues();
      var bankCode = "";
      var accountNumber = "";
      var accountName = "";

      function mapBankFieldByKey_(key) {
        if (
          key === "nganhang" ||
          key === "bank" ||
          key === "bankcode" ||
          key === "manganhang"
        ) {
          return "bankCode";
        }
        if (
          key === "stk" ||
          key === "sotaikhoan" ||
          key === "accountnumber" ||
          key === "sotk"
        ) {
          return "accountNumber";
        }
        if (
          key === "tenchutk" ||
          key === "chutk" ||
          key === "tentaikhoan" ||
          key === "accountname" ||
          key === "tenchutaikhoan" ||
          key === "chutaikhoan"
        ) {
          return "accountName";
        }
        return "";
      }

      // Mode 1: key-value theo cột (A=key, B=value)
      for (var i = 0; i < values.length; i++) {
        var key = normalizeBankKey_(values[i][0]);
        var field = mapBankFieldByKey_(key);
        if (!field) continue;
        var val = String(values[i][1] || "").trim();
        if (!val) continue;
        // Skip header-like rows in horizontal layout (e.g. A2=NGÂN HÀNG, B2=SỐ TÀI KHOẢN).
        var valAsKey = normalizeBankKey_(val);
        if (mapBankFieldByKey_(valAsKey)) continue;
        if (field === "bankCode" && !bankCode) bankCode = val;
        if (field === "accountNumber" && !accountNumber) accountNumber = val;
        if (field === "accountName" && !accountName) accountName = val;
      }

      // Mode 2: key theo hàng header, data ở hàng dưới (A2:C3)
      if (!bankCode || !accountNumber) {
        for (var r = 0; r < values.length - 1; r++) {
          var colMap = {};
          var headerRow = values[r];
          for (var c = 0; c < headerRow.length; c++) {
            var hKey = normalizeBankKey_(headerRow[c]);
            var mapped = mapBankFieldByKey_(hKey);
            if (mapped && colMap[mapped] === undefined) colMap[mapped] = c;
          }

          if (
            colMap.bankCode === undefined ||
            colMap.accountNumber === undefined
          ) {
            continue;
          }

          for (var d = r + 1; d < values.length; d++) {
            var dataRow = values[d];
            var bankVal = String(dataRow[colMap.bankCode] || "").trim();
            var accVal = String(dataRow[colMap.accountNumber] || "").trim();
            var nameVal =
              colMap.accountName === undefined
                ? ""
                : String(dataRow[colMap.accountName] || "").trim();
            if (!bankVal && !accVal && !nameVal) continue;

            if (!bankCode && bankVal) bankCode = bankVal;
            if (!accountNumber && accVal) accountNumber = accVal;
            if (!accountName && nameVal) accountName = nameVal;
            break;
          }

          if (bankCode && accountNumber) break;
        }
      }

      if (!bankCode || !accountNumber) {
        throw new Error(
          "Thiếu thông tin ngân hàng hoặc số tài khoản trong sheet BANK",
        );
      }

      return {
        success: true,
        data: {
          bankCode: bankCode,
          accountNumber: accountNumber,
          accountName: accountName,
        },
      };
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message, data: null };
    }
  });
}

function findProductRowByKey_(sheet, dataStartRow, tenSanPham, donVi) {
  var lastDataRow = getLastDataRowByCol_(sheet, 2, dataStartRow);
  if (lastDataRow < dataStartRow) return 0;
  var key = buildProductKey_(tenSanPham, donVi);
  var values = sheet
    .getRange(dataStartRow, 2, lastDataRow - dataStartRow + 1, 4)
    .getDisplayValues();
  for (var i = 0; i < values.length; i++) {
    if (buildProductKey_(values[i][0], values[i][3]) === key) {
      return dataStartRow + i;
    }
  }
  return 0;
}

function findKhoRowByName_(sheet, dataStartRow, tenSanPham) {
  var lastDataRow = getLastDataRowByCol_(sheet, 2, dataStartRow);
  if (lastDataRow < dataStartRow) return 0;
  var key = normalizeProductKeyPart_(tenSanPham);
  var values = sheet
    .getRange(dataStartRow, 2, lastDataRow - dataStartRow + 1, 1)
    .getDisplayValues();
  for (var i = 0; i < values.length; i++) {
    if (normalizeProductKeyPart_(String(values[i][0])) === key) {
      return dataStartRow + i;
    }
  }
  return 0;
}

function updateProductCatalogItem(payload) {
  return runWithLockOrQueue_(
    "UPDATE_PRODUCT",
    { payload: payload },
    function () {
      var res = updateProductCatalogItemInternal_(payload);
      if (res && res.success) bumpAppCacheVersion_();
      return res;
    },
  );
}

function updateProductCatalogItemInternal_(payload) {
  try {
    var p = payload || {};
    var originalTenSanPham = String(p.originalTenSanPham || "").trim();
    var originalDonVi = String(p.originalDonVi || "").trim();
    var tenSanPham = String(p.tenSanPham || "").trim();
    var nhomHang = String(p.nhomHang || "").trim();
    var donVi = String(p.donVi || "").trim();
    var donGiaBan = Math.max(parseMoneyNumber_(p.donGiaBan), 0);
    var giaVon = Math.max(parseMoneyNumber_(p.giaVon), 0);
    var anhSanPham =
      p.anhSanPham !== undefined ? String(p.anhSanPham || "").trim() : null;
    var donViLon = String(p.donViLon || "").trim();
    var quyCach = Math.max(parseMoneyNumber_(p.quyCach), 0);

    if (!originalTenSanPham || !originalDonVi) {
      throw new Error("Thiếu thông tin sản phẩm gốc");
    }
    if (!tenSanPham) throw new Error("Tên sản phẩm không được để trống");
    if (!donVi) throw new Error("Đơn vị không được để trống");
    if (donGiaBan <= 0) throw new Error("Đơn giá bán phải lớn hơn 0");

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("SAN_PHAM");
    if (!sheet) throw new Error("Không tìm thấy sheet SAN_PHAM");

    var dataStartRow = 3;
    var sourceRow = findProductRowByKey_(
      sheet,
      dataStartRow,
      originalTenSanPham,
      originalDonVi,
    );
    if (!sourceRow) throw new Error("Không tìm thấy sản phẩm để cập nhật");

    if (anhSanPham === null) {
      var rt = sheet.getRange(sourceRow, 3).getRichTextValue();
      anhSanPham = getImageUrlFromRichText_(
        rt,
        String(sheet.getRange(sourceRow, 3).getValue() || ""),
      );
    }

    var targetRow = sourceRow;
    var oldKey = buildProductKey_(originalTenSanPham, originalDonVi);
    var newKey = buildProductKey_(tenSanPham, donVi);
    if (newKey !== oldKey) {
      var matchedRow = findProductRowByKey_(
        sheet,
        dataStartRow,
        tenSanPham,
        donVi,
      );
      if (matchedRow && matchedRow !== sourceRow) {
        targetRow = matchedRow;
      }
    }

    sheet
      .getRange(targetRow, 2, 1, 6)
      .setValues([[tenSanPham, "", nhomHang, donVi, donGiaBan, giaVon]]);
    setImageHyperlink_(sheet, targetRow, 3, anhSanPham);
    if (targetRow !== sourceRow) {
      sheet.deleteRow(sourceRow);
      if (targetRow > sourceRow) targetRow = targetRow - 1;
    }
    // DEFER STT UPDATE
    // updateSTT_(sheet, dataStartRow);

    var isInventoryEnabled =
      PropertiesService.getScriptProperties().getProperty(
        "enable_inventory",
      ) === "true";
    var sheetKho = isInventoryEnabled
      ? ss.getSheetByName("QUAN_LY_KHO") || ss.getSheetByName("QUẢN LÝ KHO")
      : null;
    if (sheetKho) {
      var oldKhoRow = findKhoRowByName_(sheetKho, 3, originalTenSanPham);
      if (oldKhoRow) {
        if (originalTenSanPham !== tenSanPham) {
          sheetKho.getRange(oldKhoRow, 2).setValue(tenSanPham);
        }
        // Vì nhóm hàng ở QUAN_LY_KHO nằm ở Cột C (3)
        sheetKho.getRange(oldKhoRow, 3).setValue(nhomHang);
        // DEFER STT UPDATE
        // updateSTT_(sheetKho, 3);
      }
    }

    return {
      success: true,
      message: "Cập nhật sản phẩm thành công",
    };
  } catch (e) {
    return { success: false, message: "Lỗi: " + e.message };
  }
}

function createProductCatalogItem(payload) {
  return runWithLockOrQueue_(
    "CREATE_PRODUCT",
    { payload: payload },
    function () {
      var res = createProductCatalogItemInternal_(payload);
      if (res && res.success) bumpAppCacheVersion_();
      return res;
    },
  );
}

function createProductCatalogItemInternal_(payload) {
  try {
    var p = payload || {};
    var tenSanPham = String(p.tenSanPham || "").trim();
    var nhomHang = String(p.nhomHang || "").trim();
    var donVi = String(p.donVi || "").trim();
    var donGiaBan = Math.max(parseMoneyNumber_(p.donGiaBan), 0);
    var giaVon = Math.max(parseMoneyNumber_(p.giaVon), 0);
    var anhSanPham = String(p.anhSanPham || "").trim();
    var donViLon = String(p.donViLon || "").trim();
    var quyCach = Math.max(parseMoneyNumber_(p.quyCach), 0);

    if (!tenSanPham) throw new Error("Tên sản phẩm không được để trống");
    if (!donVi) throw new Error("Đơn vị không được để trống");
    if (donGiaBan <= 0) throw new Error("Đơn giá bán phải lớn hơn 0");

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("SAN_PHAM");
    if (!sheet) throw new Error("Không tìm thấy sheet SAN_PHAM");

    var dataStartRow = 3;
    var existed = findProductRowByKey_(sheet, dataStartRow, tenSanPham, donVi);
    if (existed) throw new Error("Sản phẩm với đơn vị này đã tồn tại");

    var appendStartRow = getLastDataRowByCol_(sheet, 2, dataStartRow) + 1;
    if (appendStartRow < dataStartRow) appendStartRow = dataStartRow;
    if (appendStartRow > sheet.getMaxRows()) {
      sheet.insertRowsAfter(
        sheet.getMaxRows(),
        appendStartRow - sheet.getMaxRows(),
      );
    }
    copyLatestFormatForAppend_(
      sheet,
      dataStartRow,
      appendStartRow,
      1,
      Math.max(7, sheet.getLastColumn()),
    );

    sheet
      .getRange(appendStartRow, 2, 1, 6)
      .setValues([[tenSanPham, "", nhomHang, donVi, donGiaBan, giaVon]]);
    setImageHyperlink_(sheet, appendStartRow, 3, anhSanPham);
    // DEFER STT UPDATE
    // updateSTT_(sheet, dataStartRow);

    var isInventoryEnabled =
      PropertiesService.getScriptProperties().getProperty(
        "enable_inventory",
      ) === "true";
    var sheetKho =
      ss.getSheetByName("QUAN_LY_KHO") || ss.getSheetByName("QUẢN LÝ KHO");
    if (isInventoryEnabled && sheetKho) {
      var existKho = findKhoRowByName_(sheetKho, 3, tenSanPham);
      // Chỉ tạo dòng ở KHO nếu Tên sản phẩm chưa từng xuất hiện
      if (!existKho) {
        var lastKhoRow = sheetKho.getLastRow();
        var appendKhoRow = lastKhoRow + 1;
        if (appendKhoRow < 3) appendKhoRow = 3;
        copyLatestFormatForAppend_(
          sheetKho,
          3,
          appendKhoRow,
          1,
          Math.max(8, sheetKho.getLastColumn()),
        );
        sheetKho
          .getRange(appendKhoRow, 2, 1, 7)
          .setValues([[tenSanPham, nhomHang, donVi, 1, donVi, "", 0]]);
        // DEFER STT UPDATE
        // updateSTT_(sheetKho, 3);
      }
    }

    return { success: true, message: "Đã thêm sản phẩm thành công" };
  } catch (e) {
    return { success: false, message: "Lỗi: " + e.message };
  }
}

function deleteProductCatalogItem(payload) {
  return runWithLockOrQueue_(
    "DELETE_PRODUCT",
    { payload: payload },
    function () {
      var res = deleteProductCatalogItemInternal_(payload);
      if (res && res.success) bumpAppCacheVersion_();
      return res;
    },
  );
}

function deleteProductCatalogItemInternal_(payload) {
  try {
    var p = payload || {};
    var tenSanPham = String(p.tenSanPham || "").trim();
    var donVi = String(p.donVi || "").trim();
    if (!tenSanPham || !donVi)
      throw new Error("Thiếu tên sản phẩm hoặc đơn vị");

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("SAN_PHAM");
    if (!sheet) throw new Error("Không tìm thấy sheet SAN_PHAM");

    var dataStartRow = 3;
    var row = findProductRowByKey_(sheet, dataStartRow, tenSanPham, donVi);
    if (!row) throw new Error("Không tìm thấy sản phẩm để xóa");

    sheet.deleteRow(row);
    // DEFER STT UPDATE
    // if (sheet.getLastRow() >= dataStartRow) updateSTT_(sheet, dataStartRow);
    return { success: true, message: "Đã xóa sản phẩm" };
  } catch (e) {
    return { success: false, message: "Lỗi: " + e.message };
  }
}

function isGuestCustomerName_(name) {
  var folded = normalizeCompareText_(name);
  return folded === "khách ghé thăm";
}

function getCustomerCatalog() {
  return withSuccessCache_("read:customer_catalog", 30, function () {
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var sheet = ss.getSheetByName("CONG_NO_KHACH");
      if (!sheet) throw new Error("Không tìm thấy sheet CONG_NO_KHACH");

      var lastRow = sheet.getLastRow();
      if (lastRow < 3) {
        return { success: true, data: [] };
      }

      // B:D = Tên khách | Ngày bán | Số điện thoại
      var values = sheet.getRange(3, 2, lastRow - 2, 3).getDisplayValues();
      var data = [];
      var seen = {};

      for (var i = 0; i < values.length; i++) {
        var row = values[i];
        var tenKhach = String(row[0] || "").trim();
        var soDienThoai = String(row[2] || "").trim();

        if (!tenKhach || isGuestCustomerName_(tenKhach)) continue;

        var key =
          normalizeCompareText_(tenKhach) +
          "||" +
          String(soDienThoai).replace(/[^\d]/g, "");
        if (seen[key]) continue;
        seen[key] = true;

        data.push({
          tenKhach: tenKhach,
          soDienThoai: soDienThoai,
        });
      }

      return { success: true, data: data };
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message, data: [] };
    }
  });
}

function isGuestSupplierName_(name) {
  var folded = normalizeCompareText_(name);
  return folded === "nhà cung cấp lạ" || folded === "nha cung cap la";
}

function getSupplierCatalog() {
  return withSuccessCache_("read:supplier_catalog", 30, function () {
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var sheet = ss.getSheetByName("CONG_NO_NCC");
      if (!sheet) throw new Error("Không tìm thấy sheet CONG_NO_NCC");

      var lastRow = sheet.getLastRow();
      if (lastRow < 3) {
        return { success: true, data: [] };
      }

      // B:D = Tên NCC | Ngày cung cấp | Số điện thoại
      var values = sheet.getRange(3, 2, lastRow - 2, 3).getDisplayValues();
      var data = [];
      var seen = {};

      for (var i = 0; i < values.length; i++) {
        var row = values[i];
        var tenNCC = String(row[0] || "").trim();
        var soDienThoai = String(row[2] || "").trim(); // Col D is index 2

        if (!tenNCC || isGuestSupplierName_(tenNCC)) continue;

        var key =
          normalizeCompareText_(tenNCC) +
          "||" +
          String(soDienThoai).replace(/[^\d]/g, "");
        if (seen[key]) continue;
        seen[key] = true;

        data.push({
          tenNCC: tenNCC,
          soDienThoai: soDienThoai,
        });
      }

      return { success: true, data: data };
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message, data: [] };
    }
  });
}

function getDebtCustomers() {
  return withSuccessCache_("read:debt_customers", 20, function () {
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var sheet = ss.getSheetByName("CONG_NO_KHACH");
      if (!sheet) throw new Error("Không tìm thấy sheet CONG_NO_KHACH");

      var lastRow = sheet.getLastRow();
      if (lastRow < 3) return { success: true, data: [] };

      // A:H = STT | Tên khách | Ngày bán | SĐT | Mã phiếu | Tiền nợ | Trạng thái | Ghi chú
      var rows = sheet.getRange(3, 1, lastRow - 2, 8).getDisplayValues();
      var out = [];
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var maPhieu = String(row[4] || "").trim();
        if (!maPhieu) continue;
        out.push({
          stt: parseMoneyNumber_(row[0]),
          tenKhach: String(row[1] || "").trim() || "Khách ghé thăm",
          ngayBan: String(row[2] || "").trim(),
          soDienThoai: String(row[3] || "").trim(),
          maPhieu: maPhieu,
          tienNo: parseMoneyNumber_(row[5]),
          trangThai: String(row[6] || "").trim() || "Đã thanh toán",
          ghiChu: String(row[7] || "").trim() || "-",
        });
      }
      return { success: true, data: out };
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message, data: [] };
    }
  });
}

function getSupplierDebts() {
  return withSuccessCache_("read:supplier_debts", 20, function () {
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var sheet = ss.getSheetByName("CONG_NO_NCC");
      if (!sheet) throw new Error("Không tìm thấy sheet CONG_NO_NCC");

      var lastRow = sheet.getLastRow();
      if (lastRow < 3) return { success: true, data: [] };

      // B:H = Tên NCC | Ngày | SĐT | Mã phiếu | Tiền nợ | Trạng thái | Ghi chú
      var values = sheet.getRange(3, 2, lastRow - 2, 7).getValues();
      var data = [];
      for (var i = 0; i < values.length; i++) {
        var row = values[i];
        var tenNCC = String(row[0] || "").trim();
        var maPhieu = String(row[3] || "").trim();
        if (!tenNCC && !maPhieu) continue;

        data.push({
          nhaCungCap: tenNCC,
          ngayNhap: row[1]
            ? Utilities.formatDate(new Date(row[1]), "GMT+7", "dd/mm/yyyy")
            : "",
          soDienThoai: String(row[2] || ""),
          maPhieu: maPhieu,
          tienNo: parseMoneyNumber_(row[4]),
          trangThai: String(row[5] || "Nợ"),
          ghiChu: String(row[6] || "-"),
        });
      }
      return { success: true, data: data };
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message };
    }
  });
}

function findCustomerRowByOrderCode_(sheetKH, maPhieu) {
  var key = String(maPhieu || "").trim();
  if (!key) return 0;
  var lastRow = sheetKH.getLastRow();
  if (lastRow < 3) return 0;
  var values = sheetKH.getRange(3, 5, lastRow - 2, 1).getDisplayValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0] || "").trim() === key) return i + 3;
  }
  return 0;
}

function findSupplierDebtRowByOrderCode_(sheet, code) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 3) return null;
  var colE = sheet.getRange(3, 5, lastRow - 2, 1).getValues();
  var folded = normalizeCompareText_(code);
  for (var i = 0; i < colE.length; i++) {
    if (normalizeCompareText_(colE[i][0]) === folded) return i + 3;
  }
  return null;
}

function updateDebtCustomer(payload) {
  return runWithLockOrQueue_("UPDATE_DEBT", { payload: payload }, function () {
    var res = updateDebtCustomerInternal_(payload);
    if (res && res.success) bumpAppCacheVersion_();
    return res;
  });
}

function updateDebtCustomerInternal_(payload) {
  try {
    var input = payload || {};
    var maPhieuOriginal = String(
      input.maPhieuOriginal || input.maPhieu || "",
    ).trim();
    if (!maPhieuOriginal) throw new Error("Thiếu mã phiếu gốc");

    var tenKhach = String(input.tenKhach || "").trim() || "Khách ghé thăm";
    var ngayBan = String(input.ngayBan || "").trim();
    var soDienThoai = normalizePhoneForSheet_(input.soDienThoai || "");
    var maPhieu = String(input.maPhieu || "").trim() || maPhieuOriginal;
    var tienNo = Math.max(parseMoneyNumber_(input.tienNo), 0);
    var ghiChu = String(input.ghiChu || "-").trim() || "-";
    var normalizedStatus = normalizeOrderStatus_(input.trangThai);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetKH = ss.getSheetByName("CONG_NO_KHACH");
    var sheetDH = ss.getSheetByName("DON_HANG");
    if (!sheetKH) throw new Error("Không tìm thấy sheet CONG_NO_KHACH");
    if (!sheetDH) throw new Error("Không tìm thấy sheet DON_HANG");

    // --- PHASE 1: READ ---
    var rowKH = findCustomerRowByOrderCode_(sheetKH, maPhieuOriginal);
    if (!rowKH)
      throw new Error("Không tìm thấy dữ liệu khách hàng để cập nhật");
    var statusRuleKH = getStatusRuleFromSheet_(sheetKH, 7, 3);
    var statusRuleDH = getStatusRuleFromSheet_(sheetDH, 12, 3);
    var statusValueKH = resolveStatusForRule_(normalizedStatus, statusRuleKH);
    var statusValueDH = resolveStatusForRule_(normalizedStatus, statusRuleDH);

    var mapped = getEffectiveOrderRows_(sheetDH, 3);
    var lastRowDH = sheetDH.getLastRow();
    var dhValues = null;
    if (lastRowDH >= 3) {
      dhValues = sheetDH.getRange(3, 1, lastRowDH - 2, 12).getValues();
    }

    // --- PHASE 2: PROCESS ---
    var changedDH = false;
    var targetRows = {};
    for (var i = 0; i < mapped.length; i++) {
      if (mapped[i].effectiveMaPhieu === maPhieuOriginal)
        targetRows[mapped[i].row] = true;
    }

    if (dhValues) {
      for (var j = 0; j < dhValues.length; j++) {
        var rowNum = j + 3;
        if (!targetRows[rowNum]) continue;
        dhValues[j][1] = ngayBan;
        dhValues[j][2] = maPhieu;
        dhValues[j][10] = ghiChu;
        dhValues[j][11] = statusValueDH;
        changedDH = true;
      }
    }

    // --- PHASE 3: WRITE ---
    sheetKH
      .getRange(rowKH, 2, 1, 7)
      .setValues([
        [
          tenKhach,
          ngayBan,
          soDienThoai,
          maPhieu,
          tienNo,
          statusValueKH,
          ghiChu,
        ],
      ]);

    if (changedDH && dhValues) {
      sheetDH.getRange(3, 1, dhValues.length, 12).setValues(dhValues);
    }

    // DEFER TASKS
    try {
      applyKnownStatusValidation_(sheetKH, rowKH, 1, 7, statusRuleKH);
      if (changedDH && dhValues) {
        applyKnownStatusValidation_(
          sheetDH,
          3,
          dhValues.length,
          12,
          statusRuleDH,
        );
      }
    } catch (e) {}

    return {
      success: true,
      message: "Cập nhật công nợ thành công",
    };
  } catch (e) {
    return { success: false, message: "Lỗi: " + e.message };
  }
}

/** Supplier Debts */
function updateSupplierDebt(payload) {
  return runWithLockOrQueue_(
    "UPDATE_SUPPLIER_DEBT",
    { payload: payload },
    function () {
      var res = updateSupplierDebtInternal_(payload);
      if (res && res.success) bumpAppCacheVersion_();
      return res;
    },
  );
}

function updateSupplierDebtInternal_(payload) {
  try {
    var input = payload || {};
    var maPhieuOriginal = String(
      input.maPhieuOriginal || input.maPhieu || "",
    ).trim();
    if (!maPhieuOriginal) throw new Error("Thiếu mã phiếu gốc");

    var nhaCungCap = String(input.nhaCungCap || "").trim() || "Nhà cung cấp lạ";
    var ngayNhap = String(input.ngayNhap || "").trim();
    var soDienThoai = normalizePhoneForSheet_(input.soDienThoai || "");
    var maPhieu = String(input.maPhieu || "").trim() || maPhieuOriginal;
    var tienNo = Math.max(parseMoneyNumber_(input.tienNo), 0);
    var ghiChu = String(input.ghiChu || "-").trim() || "-";
    var normalizedStatus = normalizeOrderStatus_(input.trangThai);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetNCC = ss.getSheetByName("CONG_NO_NCC");
    var sheetNhap = ss.getSheetByName("NHAP_HANG");
    if (!sheetNCC) throw new Error("Không tìm thấy sheet CONG_NO_NCC");
    if (!sheetNhap) throw new Error("Không tìm thấy sheet NHAP_HANG");

    // --- PHASE 1: READ ---
    var rowNCC = findSupplierDebtRowByOrderCode_(sheetNCC, maPhieuOriginal);
    if (!rowNCC)
      throw new Error("Không tìm thấy dữ liệu nhà cung cấp để cập nhật");

    var statusKey = getStatusKey_(normalizedStatus);
    if (statusKey === "PAID") {
      tienNo = 0;
    }

    var lastNhap = sheetNhap.getLastRow();
    var nhapData = null;
    if (lastNhap >= 3) {
      nhapData = sheetNhap.getRange(3, 1, lastNhap - 2, 12).getValues();
    }

    // --- PHASE 2: PROCESS ---
    var changed = false;
    if (nhapData) {
      for (var i = 0; i < nhapData.length; i++) {
        if (String(nhapData[i][2]).trim() === maPhieuOriginal) {
          nhapData[i][1] = nhaCungCap;
          nhapData[i][2] = maPhieu;
          nhapData[i][10] = ghiChu;
          nhapData[i][11] = normalizedStatus;
          changed = true;
        }
      }
    }

    // --- PHASE 3: WRITE ---
    sheetNCC
      .getRange(rowNCC, 2, 1, 7)
      .setValues([
        [
          nhaCungCap,
          ngayNhap,
          soDienThoai,
          maPhieu,
          tienNo,
          normalizedStatus,
          ghiChu,
        ],
      ]);

    if (changed && nhapData) {
      sheetNhap.getRange(3, 1, nhapData.length, 12).setValues(nhapData);
    }

    return { success: true, message: "Đã cập nhật công nợ nhà cung cấp" };
  } catch (e) {
    return { success: false, message: "Lỗi cập nhật: " + e.message };
  }
}

function settleAllDebtCustomers() {
  return runWithLockOrQueue_("SETTLE_DEBT", {}, function () {
    var res = settleAllDebtCustomersInternal_();
    if (res && res.success) bumpAppCacheVersion_();
    return res;
  });
}

function settleAllDebtCustomersInternal_() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetKH = ss.getSheetByName("CONG_NO_KHACH");
    var sheetDH = ss.getSheetByName("DON_HANG");
    if (!sheetKH) throw new Error("Không tìm thấy sheet CONG_NO_KHACH");
    if (!sheetDH) throw new Error("Không tìm thấy sheet DON_HANG");

    var lastRowKH = sheetKH.getLastRow();
    if (lastRowKH < 3) {
      return {
        success: true,
        message: "Không có dữ liệu công nợ để cập nhật",
        data: { affected: 0 },
      };
    }

    var rows = sheetKH.getRange(3, 1, lastRowKH - 2, 8).getValues();
    var statusRuleKH = getStatusRuleFromSheet_(sheetKH, 7, 3);
    var statusRuleDH = getStatusRuleFromSheet_(sheetDH, 12, 3);
    var paidStatusKH = resolveStatusForRule_("Đã thanh toán", statusRuleKH);
    var paidStatusDH = resolveStatusForRule_("Đã thanh toán", statusRuleDH);
    var changedOrderCodes = {};
    var affected = 0;

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var maPhieu = String(row[4] || "").trim();
      if (!maPhieu) continue;
      var tienNo = parseMoneyNumber_(row[5]);
      var statusKey = getStatusKey_(row[6]);
      if (statusKey === "DEBT" || statusKey === "PARTIAL" || tienNo > 0) {
        row[5] = 0;
        row[6] = paidStatusKH;
        changedOrderCodes[maPhieu] = true;
        affected++;
      }
    }

    if (!affected) {
      return {
        success: true,
        message: "Không có khách nào đang nợ để cập nhật",
        data: { affected: 0 },
      };
    }

    sheetKH.getRange(3, 1, rows.length, 8).setValues(rows);
    applyKnownStatusValidation_(sheetKH, 3, rows.length, 7, statusRuleKH);

    clearOrderMerges_(sheetDH);
    var lastRowDH = sheetDH.getLastRow();
    if (lastRowDH >= 3) {
      var dhValues = sheetDH.getRange(3, 1, lastRowDH - 2, 12).getValues();
      var carryMaPhieu = "";
      for (var j = 0; j < dhValues.length; j++) {
        var directCode = String(dhValues[j][2] || "").trim();
        if (directCode) carryMaPhieu = directCode;
        var effectiveCode = directCode || carryMaPhieu;
        if (!changedOrderCodes[effectiveCode]) continue;
        dhValues[j][11] = paidStatusDH;
      }
      sheetDH.getRange(3, 1, dhValues.length, 12).setValues(dhValues);
      applyKnownStatusValidation_(
        sheetDH,
        3,
        dhValues.length,
        12,
        statusRuleDH,
      );
    }
    if (sheetDH.getLastRow() >= 3) rebuildOrderMerges_(sheetDH);
    updateSTT_(sheetKH, 3);

    return {
      success: true,
      message: "Đã cập nhật nhanh công nợ thành công",
      data: { affected: affected },
    };
  } catch (e) {
    return { success: false, message: "Lỗi: " + e.message };
  }
}

function getOrderHistory() {
  return withSuccessCache_("read:order_history", 5, function () {
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var sheet = ss.getSheetByName("DON_HANG");
      if (!sheet) throw new Error("Không tìm thấy sheet DON_HANG");

      var lastRow = sheet.getLastRow();
      if (lastRow < 3) return { success: true, data: [] };

      // A:P = ... TRẠNG THÁI HĐĐT, MÃ CQT
      var rows = sheet.getRange(3, 1, lastRow - 2, 16).getDisplayValues();

      var customerByMaPhieu = {};
      var phoneByMaPhieu = {};
      var debtByMaPhieu = {};
      var sheetKH = ss.getSheetByName("CONG_NO_KHACH");
      if (sheetKH) {
        var lastRowKH = sheetKH.getLastRow();
        if (lastRowKH >= 3) {
          // B:F = TÊN KHÁCH, NGÀY BÁN, SĐT, MÃ PHIẾU, TIỀN NỢ
          var khRows = sheetKH
            .getRange(3, 2, lastRowKH - 2, 5)
            .getDisplayValues();
          for (var c = 0; c < khRows.length; c++) {
            var tenKhach = String(khRows[c][0] || "").trim();
            var maPhieuKH = String(khRows[c][3] || "").trim();
            var tienNoKH = parseMoneyNumber_(khRows[c][4]);
            if (!maPhieuKH || !tenKhach) continue;
            if (!customerByMaPhieu[maPhieuKH]) {
              customerByMaPhieu[maPhieuKH] = tenKhach;
            }
            if (!phoneByMaPhieu[maPhieuKH]) {
              phoneByMaPhieu[maPhieuKH] = String(khRows[c][2] || "").trim();
            }
            if (debtByMaPhieu[maPhieuKH] == null) {
              debtByMaPhieu[maPhieuKH] = tienNoKH;
            }
          }
        }
      }
      var orderMap = {};
      var orderList = [];

      var carryNgayBan = "";
      var carryMaPhieu = "";
      var carryTongHoaDon = "";
      var carryGhiChu = "";
      var carryTrangThai = "";
      var carryInvoiceNo = "";
      var carryLookupCode = "";
      var carryStatusText = "";
      var carryTaxAuthCode = "";

      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];

        var rawMaPhieu = String(row[2] || "").trim();
        if (rawMaPhieu && rawMaPhieu !== carryMaPhieu) {
          // Khi chuyển sang một Đơn hàng mới, phải XÓA TRẮNG bộ nhớ đệm hóa đơn cũ
          carryNgayBan = "";
          carryTongHoaDon = "";
          carryGhiChu = "";
          carryTrangThai = "";
          carryInvoiceNo = "";
          carryLookupCode = "";
          carryStatusText = "";
          carryTaxAuthCode = "";
          carryMaPhieu = rawMaPhieu;
        }

        var ngayBan = String(row[1] || "").trim() || carryNgayBan;
        var maPhieu = rawMaPhieu || carryMaPhieu;
        var tenSanPham = String(row[3] || "").trim();
        var donVi = String(row[4] || "").trim();
        var soLuong = parseMoneyNumber_(row[5]);
        var giaVon = parseMoneyNumber_(row[6]);
        var donGiaBan = parseMoneyNumber_(row[7]);
        var thanhTien = parseMoneyNumber_(row[8]);
        var tongHoaDonCell = String(row[9] || "").trim() || carryTongHoaDon;
        var ghiChu = String(row[10] || "").trim() || carryGhiChu;
        var trangThai = String(row[11] || "").trim() || carryTrangThai;

        var invoiceNo = String(row[12] || "").trim() || carryInvoiceNo;
        var lookupCode = String(row[13] || "").trim() || carryLookupCode;
        var statusText = String(row[14] || "").trim() || carryStatusText;
        var taxAuthCode = String(row[15] || "").trim() || carryTaxAuthCode;

        if (ngayBan) carryNgayBan = ngayBan;
        if (tongHoaDonCell) carryTongHoaDon = tongHoaDonCell;
        if (ghiChu) carryGhiChu = ghiChu;
        if (trangThai) carryTrangThai = trangThai;
        if (invoiceNo) carryInvoiceNo = invoiceNo;
        if (lookupCode) carryLookupCode = lookupCode;
        if (statusText) carryStatusText = statusText;
        if (taxAuthCode) carryTaxAuthCode = taxAuthCode;
        var taxAuthCode = String(row[15] || "").trim() || carryTaxAuthCode;
        if (taxAuthCode) carryTaxAuthCode = taxAuthCode;

        if (!maPhieu || !tenSanPham) continue;

        var key = maPhieu;
        if (!orderMap[key]) {
          orderMap[key] = {
            maPhieu: maPhieu,
            ngayBan: ngayBan,
            tenKhach: customerByMaPhieu[maPhieu] || "Khách ghé thăm",
            soDienThoai: phoneByMaPhieu[maPhieu] || "",
            tienNo: debtByMaPhieu[maPhieu] == null ? 0 : debtByMaPhieu[maPhieu],
            tongHoaDon: parseMoneyNumber_(tongHoaDonCell),
            ghiChu: ghiChu || "-",
            trangThai: trangThai || "Đã thanh toán",
            invoiceNo: invoiceNo,
            lookupCode: lookupCode,
            statusText: statusText,
            taxAuthorityCode: taxAuthCode,
            products: [],
            _index: i,
          };
          orderList.push(orderMap[key]);
        }

        orderMap[key].products.push({
          tenSanPham: tenSanPham,
          donVi: donVi,
          soLuong: soLuong,
          giaVon: giaVon,
          donGiaBan: donGiaBan,
          thanhTien: thanhTien,
        });
      }

      for (var j = 0; j < orderList.length; j++) {
        if (!orderList[j].tongHoaDon || orderList[j].tongHoaDon <= 0) {
          orderList[j].tongHoaDon = orderList[j].products.reduce(function (
            sum,
            p,
          ) {
            return sum + (p.thanhTien || 0);
          }, 0);
        }
        delete orderList[j]._index;
      }

      return { success: true, data: orderList };
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message, data: [] };
    }
  });
}

function escapeHtml_(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDisplayDate_(value) {
  var raw = String(value || "").trim();
  if (!raw) return "-";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw.slice(8, 10) + "/" + raw.slice(5, 7) + "/" + raw.slice(0, 4);
  }
  return raw;
}

function buildReceiptPdfHtml_(order) {
  var totalFromItems = (order.products || []).reduce(function (sum, p) {
    return sum + (p.soLuong || 0) * (p.donGiaBan || 0);
  }, 0);
  var total = order.tongHoaDon || totalFromItems;
  var tienNo = Math.max(Number(order.tienNo || 0), 0);
  var daTra = Math.max(total - tienNo, 0);
  var createdAt = formatDisplayDate_(order.ngayBan);
  var customerName = order.tenKhach || "Khách ghé thăm";
  var phone = order.soDienThoai || "";
  var note = order.ghiChu || "-";
  var statusText = order.trangThai || "Đã thanh toán";

  var rows = (order.products || [])
    .map(function (p) {
      var thanhTien = (p.soLuong || 0) * (p.donGiaBan || 0);
      return (
        "<tr>" +
        "<td>" +
        escapeHtml_(p.tenSanPham || "") +
        "</td>" +
        "<td>" +
        escapeHtml_(p.donVi || "-") +
        "</td>" +
        '<td style="text-align:right;">' +
        formatMoneyNumber_(p.soLuong || 0) +
        "</td>" +
        '<td style="text-align:right;">' +
        formatMoneyNumber_(p.donGiaBan || 0) +
        "</td>" +
        '<td style="text-align:right; font-weight:700; color:#be123c;">' +
        formatMoneyNumber_(thanhTien) +
        "</td>" +
        "</tr>"
      );
    })
    .join("");

  if (!rows)
    rows =
      '<tr><td colspan="5" style="text-align:center; color:#64748b; padding:16px;">Không có sản phẩm</td></tr>';

  return (
    "<!doctype html>" +
    '<html lang="vi">' +
    '<head><meta charset="utf-8" />' +
    "<style>" +
    "@page { size: A4; margin: 18mm; }" +
    "body { font-family: Arial, sans-serif; color:#0f172a; }" +
    ".sheet { background:#ffffff; }" +
    ".header { border:1px solid #fecdd3; background: linear-gradient(90deg,#fff1f2, #ffffff); padding:16px; border-radius:14px; }" +
    ".brand { font-weight:800; font-size:22px; color:#be123c; letter-spacing:1px; }" +
    ".muted { color:#64748b; font-size:12px; }" +
    ".box { border:1px solid #e2e8f0; border-radius:12px; padding:14px; }" +
    "table { width:100%; border-collapse: collapse; margin-top:16px; }" +
    "thead th { background:#ffe4e6; color:#be123c; text-transform:uppercase; font-size:11px; letter-spacing:.5px; padding:10px; text-align:left; border-bottom:1px solid #fecdd3; }" +
    "tbody td { border-top:1px solid #f1f5f9; padding:10px; font-size:12px; }" +
    ".summary { border:1px solid #fecdd3; background:#fff1f2; padding:12px; border-radius:12px; width:280px; }" +
    ".summary .row { display:flex; justify-content:space-between; font-size:12px; margin-top:6px; }" +
    ".summary .total { font-weight:800; color:#be123c; }" +
    ".footer { margin-top:24px; font-size:11px; color:#94a3b8; display:flex; justify-content:space-between; }" +
    "</style></head><body>" +
    '<div class="sheet">' +
    '<div class="header">' +
    '<div style="display:flex; justify-content:space-between; align-items:flex-start;">' +
    "<div>" +
    '<div class="brand">DULIA</div>' +
    '<div class="muted">Hóa đơn bán lẻ chuyên nghiệp</div>' +
    "</div>" +
    '<div style="text-align:right;">' +
    '<div class="muted" style="text-transform:uppercase; letter-spacing:.6px; color:#f43f5e;">Mã phiếu</div>' +
    '<div style="font-size:22px; font-weight:800;">' +
    escapeHtml_(order.maPhieu || "") +
    "</div>" +
    '<div class="muted">Ngày bán: ' +
    escapeHtml_(createdAt) +
    "</div>" +
    "</div>" +
    "</div></div>" +
    '<div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:16px;">' +
    '<div class="box">' +
    '<div class="muted" style="text-transform:uppercase; font-weight:700; color:#be123c;">Thông tin khách hàng</div>' +
    '<div style="margin-top:8px; font-size:13px;">' +
    '<div style="display:flex; justify-content:space-between;"><span class="muted">Tên</span><strong>' +
    escapeHtml_(customerName) +
    "</strong></div>" +
    (phone
      ? '<div style="display:flex; justify-content:space-between; margin-top:6px;"><span class="muted">SĐT</span><strong>' +
        escapeHtml_(phone) +
        "</strong></div>"
      : "") +
    '<div style="display:flex; justify-content:space-between; margin-top:6px;"><span class="muted">Trạng thái</span><strong>' +
    escapeHtml_(statusText) +
    "</strong></div>" +
    "</div></div>" +
    '<div class="box">' +
    '<div class="muted" style="text-transform:uppercase; font-weight:700; color:#be123c;">Ghi chú đơn hàng</div>' +
    '<div style="margin-top:8px; font-size:13px; min-height:70px;">' +
    escapeHtml_(note) +
    "</div>" +
    "</div></div>" +
    "<table><colgroup>" +
    '<col style="width:40%" />' +
    '<col style="width:14%" />' +
    '<col style="width:10%" />' +
    '<col style="width:18%" />' +
    '<col style="width:18%" />' +
    "</colgroup><thead><tr>" +
    '<th>Sản phẩm</th><th>Đơn vị</th><th style="text-align:right;">SL</th><th style="text-align:right;">Đơn giá</th><th style="text-align:right;">Thành tiền</th>' +
    "</tr></thead><tbody>" +
    rows +
    "</tbody></table>" +
    '<div style="display:flex; justify-content:flex-end; margin-top:16px;">' +
    '<div class="summary">' +
    '<div class="row"><span class="muted">Tổng cộng</span><span class="total">' +
    formatMoneyNumber_(total) +
    "</span></div>" +
    '<div class="row"><span class="muted">Đã trả</span><strong>' +
    formatMoneyNumber_(daTra) +
    "</strong></div>" +
    (tienNo > 0
      ? '<div class="row"><span class="muted">Còn nợ</span><strong>' +
        formatMoneyNumber_(tienNo) +
        "</strong></div>"
      : "") +
    "</div></div>" +
    '<div class="footer"><div>Hóa đơn được tạo bởi <strong style="color:#be123c;">DULIA</strong></div><div>In từ hệ thống bán hàng</div></div>' +
    "</div></body></html>"
  );
}

function buildReceiptPdf_(maPhieu) {
  if (!maPhieu) {
    return HtmlService.createHtmlOutput("Thiếu mã phiếu để in.");
  }
  var res = getOrderHistory();
  if (!res || !res.success) {
    return HtmlService.createHtmlOutput("Không tải được dữ liệu hóa đơn.");
  }
  var order = null;
  for (var i = 0; i < res.data.length; i++) {
    if (String(res.data[i].maPhieu || "").trim() === maPhieu) {
      order = res.data[i];
      break;
    }
  }
  if (!order) {
    return HtmlService.createHtmlOutput("Không tìm thấy hóa đơn cần in.");
  }
  var html = buildReceiptPdfHtml_(order);
  var blob = HtmlService.createHtmlOutput(html).getAs("application/pdf");
  blob.setName("Hoa-don-" + maPhieu + ".pdf");
  return blob;
}

function getOrderByMaPhieu_(maPhieu) {
  var res = getOrderHistory();
  if (!res || !res.success || !res.data) return null;
  for (var i = 0; i < res.data.length; i++) {
    if (String(res.data[i].maPhieu || "").trim() === maPhieu) {
      return res.data[i];
    }
  }
  return null;
}

function buildReceiptBridgeText_(maPhieu, size) {
  if (!maPhieu) {
    return ContentService.createTextOutput("Thieu ma phieu de in.");
  }
  var order = getOrderByMaPhieu_(maPhieu);
  if (!order) {
    return ContentService.createTextOutput(
      "Khong tim thay hoa don can in: " + maPhieu,
    );
  }

  var lines = [];
  var products = order.products || [];
  var total = parseMoneyNumber_(order.tongHoaDon);
  if (!total) {
    for (var i = 0; i < products.length; i++) {
      var p = products[i] || {};
      total += parseMoneyNumber_(p.soLuong) * parseMoneyNumber_(p.donGiaBan);
    }
  }
  var tienNo = Math.max(parseMoneyNumber_(order.tienNo), 0);
  var daTra = Math.max(total - tienNo, 0);
  var paper = size === "80" ? "80mm" : "58mm";

  lines.push("DULIA");
  lines.push("Hoa don ban hang");
  lines.push("Kho giay: " + paper);
  lines.push("--------------------------------");
  lines.push("Ma phieu: " + String(order.maPhieu || maPhieu));
  lines.push("Ngay ban: " + String(order.ngayBan || "-"));
  lines.push("Khach hang: " + String(order.tenKhach || "Khach le"));
  if (order.soDienThoai) {
    lines.push("SDT: " + String(order.soDienThoai));
  }
  lines.push("--------------------------------");

  for (var j = 0; j < products.length; j++) {
    var item = products[j] || {};
    var name = String(item.tenHang || "San pham").trim();
    var sl = parseMoneyNumber_(item.soLuong) || 0;
    var price = parseMoneyNumber_(item.donGiaBan) || 0;
    var lineTotal = parseMoneyNumber_(item.thanhTien) || sl * price;
    lines.push(name);
    lines.push("  " + sl + " x " + formatMoneyNumber_(price) + " = " + formatMoneyNumber_(lineTotal));
  }

  lines.push("--------------------------------");
  lines.push("Tong cong: " + formatMoneyNumber_(total));
  lines.push("Da tra: " + formatMoneyNumber_(daTra));
  if (tienNo > 0) {
    lines.push("Con no: " + formatMoneyNumber_(tienNo));
  }
  lines.push("Trang thai: " + String(order.trangThai || "Da thanh toan"));
  if (order.ghiChu) {
    lines.push("Ghi chu: " + String(order.ghiChu));
  }
  lines.push("--------------------------------");
  lines.push("Cam on quy khach");

  return ContentService.createTextOutput(lines.join("\n")).setMimeType(
    ContentService.MimeType.TEXT,
  );
}

function ensureReceiptFolder_() {
  var name = "DULIA_HOA_DON_PDF";
  var folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
}

function createReceiptPdf(maPhieu) {
  try {
    var key = String(maPhieu || "").trim();
    if (!key) return { success: false, message: "Thiếu mã phiếu." };
    var order = getOrderByMaPhieu_(key);
    if (!order)
      return {
        success: false,
        message: "Không tìm thấy hóa đơn.",
      };
    var html = buildReceiptPdfHtml_(order);
    var blob = HtmlService.createHtmlOutput(html).getAs("application/pdf");
    blob.setName("Hoa-don-" + key + ".pdf");
    var folder = ensureReceiptFolder_();
    var file = folder.createFile(blob);
    return {
      success: true,
      url: file.getUrl(),
      downloadUrl: file.getDownloadUrl(),
      name: file.getName(),
    };
  } catch (e) {
    return { success: false, message: "Lỗi: " + e.message };
  }
}

function authorizeDrive() {
  ensureReceiptFolder_();
  return { success: true, message: "Drive permission granted." };
}

function getEffectiveOrderRows_(sheet, dataStartRow) {
  var lastRow = sheet.getLastRow();
  if (lastRow < dataStartRow) return [];
  var rows = sheet
    .getRange(dataStartRow, 1, lastRow - dataStartRow + 1, 12)
    .getDisplayValues();
  var out = [];
  var carryMaPhieu = "";
  for (var i = 0; i < rows.length; i++) {
    var maPhieu = String(rows[i][2] || "").trim() || carryMaPhieu;
    if (String(rows[i][2] || "").trim())
      carryMaPhieu = String(rows[i][2] || "").trim();
    out.push({
      row: dataStartRow + i,
      effectiveMaPhieu: maPhieu,
    });
  }
  return out;
}

function clearOrderMerges_(sheet) {
  var dataStartRow = 3;
  var lastRow = sheet.getLastRow();
  if (lastRow < dataStartRow) return;
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return;
  // Break all merged ranges in data area to avoid partial-merge write errors.
  var merged = sheet
    .getRange(dataStartRow, 1, lastRow - dataStartRow + 1, lastCol)
    .getMergedRanges();
  for (var i = 0; i < merged.length; i++) {
    merged[i].breakApart();
  }
}

function deleteRowsByIndexes_(sheet, rowIndexes) {
  if (!rowIndexes || !rowIndexes.length) return 0;
  var rows = rowIndexes
    .map(function (r) {
      return Number(r) || 0;
    })
    .filter(function (r) {
      return r > 0;
    })
    .sort(function (a, b) {
      return a - b;
    });
  if (!rows.length) return 0;

  var deleted = 0;
  var i = rows.length - 1;
  while (i >= 0) {
    var end = rows[i];
    var start = end;
    i--;
    while (i >= 0 && rows[i] === start - 1) {
      start = rows[i];
      i--;
    }
    var count = end - start + 1;
    sheet.deleteRows(start, count);
    deleted += count;
  }
  return deleted;
}

function buildInventoryIndexByProductName_(khoValues) {
  var indexByName = {};
  for (var i = 0; i < khoValues.length; i++) {
    var key = normalizeProductKeyPart_(String(khoValues[i][0] || ""));
    if (key && typeof indexByName[key] === "undefined") {
      indexByName[key] = i;
    }
  }
  return indexByName;
}

function applyInventoryDeltaByProducts_(
  khoValues,
  products,
  deltaSign,
  options,
) {
  options = options || {};
  if (!khoValues || !khoValues.length || !products || !products.length)
    return false;

  var indexByName = buildInventoryIndexByProductName_(khoValues);
  var changed = false;
  for (var i = 0; i < products.length; i++) {
    var p = products[i] || {};
    var productKey = normalizeProductKeyPart_(String(p.tenSanPham || ""));
    if (!productKey || typeof indexByName[productKey] === "undefined") continue;

    var rowIdx = indexByName[productKey];
    var row = khoValues[rowIdx];
    var qty = Number(p.soLuong) || 0;
    if (!qty) continue;

    var dvInput = normalizeProductKeyPart_(String(p.donVi || ""));
    var dvChan = normalizeProductKeyPart_(String(row[2] || ""));
    var dvLe = normalizeProductKeyPart_(String(row[5] || ""));
    var quyDoi = Math.max(parseMoneyNumber_(row[4]), 1);
    var qtyLe = 0;
    if (dvInput && dvInput === dvLe) qtyLe = qty;
    else if (dvChan && dvInput === dvChan) qtyLe = qty * quyDoi;
    else qtyLe = qty;

    row[7] = (parseMoneyNumber_(row[7]) || 0) + deltaSign * qtyLe;

    if (options.updateCostFromProducts) {
      var giaNhapChan = parseMoneyNumber_(p.giaNhapChan);
      if (giaNhapChan > 0) {
        row[3] = giaNhapChan;
        row[6] = quyDoi > 0 ? giaNhapChan / quyDoi : giaNhapChan;
      }
    }
    changed = true;
  }
  return changed;
}

function rebuildOrderMerges_(sheet) {
  var dataStartRow = 3;
  var rows = getEffectiveOrderRows_(sheet, dataStartRow);
  if (!rows.length) return;
  var mergeCols = [2, 3, 10, 11, 12];
  var start = 0;
  while (start < rows.length) {
    var end = start;
    while (
      end + 1 < rows.length &&
      rows[end + 1].effectiveMaPhieu === rows[start].effectiveMaPhieu
    ) {
      end++;
    }
    var rowCount = end - start + 1;
    if (rowCount > 1 && rows[start].effectiveMaPhieu) {
      for (var c = 0; c < mergeCols.length; c++) {
        var range = sheet.getRange(rows[start].row, mergeCols[c], rowCount, 1);
        range.mergeVertically();
        range.setVerticalAlignment("middle");
      }
    }
    start = end + 1;
  }
}

function deleteRowsByOrderCode_(sheetDH, maPhieu, options) {
  options = options || {};
  var key = String(maPhieu || "").trim();
  if (!key) return 0;
  // Bỏ clearOrderMerges_ để tăng tốc
  var mappedRows = getEffectiveOrderRows_(sheetDH, 3);
  var targetRows = [];
  for (var i = 0; i < mappedRows.length; i++) {
    if (mappedRows[i].effectiveMaPhieu === key)
      targetRows.push(mappedRows[i].row);
  }
  deleteRowsByIndexes_(sheetDH, targetRows);
  // Bỏ updateSTT_ và rebuildOrderMerges_ ra khỏi block này
  return targetRows.length;
}

function deleteCustomerRowsByOrderCode_(sheetKH, maPhieu) {
  var key = String(maPhieu || "").trim();
  if (!key) return 0;
  var lastRow = sheetKH.getLastRow();
  if (lastRow < 3) return 0;
  var values = sheetKH.getRange(3, 5, lastRow - 2, 1).getDisplayValues();
  var rows = [];
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0] || "").trim() === key) rows.push(i + 3);
  }
  deleteRowsByIndexes_(sheetKH, rows);
  // Bỏ updateSTT_ ra khỏi block này
  return rows.length;
}

function deleteOrder(maPhieu) {
  return runWithLockOrQueue_("DELETE_ORDER", { maPhieu: maPhieu }, function () {
    var res = deleteOrderInternal_(maPhieu);
    if (res && res.success) bumpAppCacheVersion_();
    return res;
  });
}

/**
 * Tải file PDF từ EasyInvoice và chuyển sang Base64 cho UI
 */
function downloadInvoicePDF(payload) {
  try {
    var maPhieu = String(payload.maPhieu || "").trim();
    if (!maPhieu) throw new Error("Chưa truyền mã phiếu");

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("DON_HANG");
    if (!sheet) throw new Error("Không tìm thấy sheet DON_HANG");

    var lastRow = sheet.getLastRow();
    if (lastRow < 3) throw new Error("Không có dữ liệu đơn hàng");

    // Lấy ikey từ cột N (Column 14)
    var rows = sheet.getRange(3, 1, lastRow - 2, 14).getDisplayValues();
    var lookupStr = "";
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][2] || "").trim() === maPhieu) {
        lookupStr = String(rows[i][13] || "").trim();
        break;
      }
    }

    var ikey = maPhieu;
    if (lookupStr.indexOf("|IKEY:") !== -1) {
      ikey = lookupStr.split("|IKEY:")[1].trim();
    }

    var result = getInvoicePdfBlobHSM(ikey);
    if (!result.success) throw new Error(result.message);

    var blob = result.blob;
    var base64 = Utilities.base64Encode(blob.getBytes());

    return {
      success: true,
      base64: base64,
      filename: "HoaDon_" + maPhieu + ".pdf",
      contentType: "application/pdf",
    };
  } catch (e) {
    return { success: false, message: "Lỗi tải PDF: " + e.message };
  }
}

function deleteOrderInternal_(maPhieu) {
  try {
    var key = String(maPhieu || "").trim();
    if (!key) throw new Error("Thiếu mã phiếu");
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetDH = ss.getSheetByName("DON_HANG");
    var sheetKH = ss.getSheetByName("CONG_NO_KHACH");
    if (!sheetDH) throw new Error("Không tìm thấy sheet DON_HANG");
    if (!sheetKH) throw new Error("Không tìm thấy sheet CONG_NO_KHACH");

    // Lấy thông tin sản phẩm để trả lại kho
    var returnedProducts = [];
    var mappedRows = getEffectiveOrderRows_(sheetDH, 3);
    var lastRowDH = sheetDH.getLastRow();
    if (lastRowDH >= 3 && mappedRows.length) {
      var dhRows = sheetDH.getRange(3, 4, lastRowDH - 2, 3).getDisplayValues();
      for (var i = 0; i < mappedRows.length; i++) {
        if (mappedRows[i].effectiveMaPhieu !== key) continue;
        var idx = mappedRows[i].row - 3;
        if (idx < 0 || idx >= dhRows.length) continue;
        var tTen = String(dhRows[idx][0] || "").trim();
        var tDv = String(dhRows[idx][1] || "").trim();
        var tSl = parseMoneyNumber_(dhRows[idx][2]);
        if (tTen && tDv) {
          returnedProducts.push({ tenSanPham: tTen, donVi: tDv, soLuong: tSl });
        }
      }
    }

    var deletedDH = deleteRowsByOrderCode_(sheetDH, key);
    var deletedKH = deleteCustomerRowsByOrderCode_(sheetKH, key);
    if (deletedDH === 0 && deletedKH === 0) {
      return {
        success: false,
        message: "Không tìm thấy hóa đơn để xóa",
      };
    }

    // Cập nhật lại kho (cộng lại)
    var isInventoryEnabled =
      PropertiesService.getScriptProperties().getProperty(
        "enable_inventory",
      ) === "true";
    var sheetKho =
      ss.getSheetByName("QUAN_LY_KHO") || ss.getSheetByName("QUẢN LÝ KHO");
    if (isInventoryEnabled && sheetKho && returnedProducts.length > 0) {
      var lastKhoRow = sheetKho.getLastRow();
      if (lastKhoRow >= 3) {
        // B:J = Tên(B), Nhóm(C), Đơn Vị Chẵn(D), Giá Vốn Chẵn(E), Quy Đổi(F), Đơn Vị Lẻ(G), Giá Vốn Lẻ(H), Tồn Kho Lẻ(I), HSD(J)
        var khoValues = sheetKho.getRange(3, 2, lastKhoRow - 2, 9).getValues();
        var updated = applyInventoryDeltaByProducts_(
          khoValues,
          returnedProducts,
          1,
        );
        if (updated) {
          sheetKho.getRange(3, 2, khoValues.length, 9).setValues(khoValues);
        }
      }
    }
    return {
      success: true,
      message: "Đã xóa hóa đơn thành công",
    };
  } catch (e) {
    return { success: false, message: "Lỗi: " + e.message };
  }
}

function updateOrder(payload) {
  return runWithLockOrQueue_("UPDATE_ORDER", { payload: payload }, function () {
    var res = updateOrderInternal_(payload);
    if (res && res.success) bumpAppCacheVersion_();
    return res;
  });
}

function updateOrderInternal_(payload) {
  try {
    var maPhieuOriginal = String(
      (payload && payload.maPhieuOriginal) || "",
    ).trim();
    if (!maPhieuOriginal) throw new Error("Thiếu mã phiếu gốc");
    var orderInfo = (payload && payload.orderInfo) || {};
    var products = (payload && payload.products) || [];
    var customer = payload.customer || null;
    if (!products.length)
      throw new Error("Đơn hàng phải có ít nhất một sản phẩm");

    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // === PHASE 1: READ ALL CẦN THIẾT ===
    var sheetDH = ss.getSheetByName("DON_HANG");
    var sheetKH = ss.getSheetByName("CONG_NO_KHACH");
    if (!sheetDH) throw new Error("Không tìm thấy sheet DON_HANG");
    if (!sheetKH) throw new Error("Không tìm thấy sheet CONG_NO_KHACH");

    var allDHRows = getEffectiveOrderRows_(sheetDH, 3);
    var oldDHRows = allDHRows.filter(function (r) {
      return r.effectiveMaPhieu === maPhieuOriginal;
    });
    if (!oldDHRows.length)
      throw new Error("Không tìm thấy hóa đơn để cập nhật trong DON_HANG");

    var rowKH = findCustomerRowByOrderCode_(sheetKH, maPhieuOriginal);
    if (!rowKH)
      throw new Error("Không tìm thấy dữ liệu khách hàng để cập nhật");

    var oldProducts = [];
    var dhDisplayVals = sheetDH
      .getRange(3, 4, sheetDH.getLastRow() - 2, 3)
      .getDisplayValues();
    for (var i = 0; i < oldDHRows.length; i++) {
      var idx = oldDHRows[i].row - 3;
      if (idx >= 0 && idx < dhDisplayVals.length) {
        var tTen = String(dhDisplayVals[idx][0] || "").trim();
        var tDv = String(dhDisplayVals[idx][1] || "").trim();
        var tSl = parseMoneyNumber_(dhDisplayVals[idx][2]);
        if (tTen && tDv) {
          oldProducts.push({ tenSanPham: tTen, donVi: tDv, soLuong: tSl });
        }
      }
    }

    var statusColDH = 12;
    var statusRuleDH = getStatusRuleFromSheet_(sheetDH, statusColDH, 3);
    var statusColKH = 7;
    var statusRuleKH =
      sheetKH.getRange(rowKH, statusColKH).getDataValidation() ||
      getStatusRuleFromSheet_(sheetKH, statusColKH, 3);

    var isInventoryEnabled =
      PropertiesService.getScriptProperties().getProperty(
        "enable_inventory",
      ) === "true";
    var sheetKho =
      ss.getSheetByName("QUAN_LY_KHO") || ss.getSheetByName("QUẢN LÝ KHO");
    var khoValues = null;
    if (isInventoryEnabled && sheetKho) {
      var lastKhoRow = sheetKho.getLastRow();
      if (lastKhoRow >= 3) {
        khoValues = sheetKho.getRange(3, 2, lastKhoRow - 2, 9).getValues();
      }
    }

    // === PHASE 2: PROCESS (Tính toán thuần JS) ===
    var tongHoaDon = products.reduce(function (sum, p) {
      return sum + (p.soLuong || 0) * (p.donGiaBan || 0);
    }, 0);

    var ngayBan = orderInfo.ngayBan || "";
    var maPhieu = orderInfo.maPhieu || maPhieuOriginal;
    var normalizedStatus = normalizeOrderStatusFromInfo_(orderInfo);
    var statusCode = getOrderStatusCode_(orderInfo);
    var soTienDaTra = parseMoneyNumber_(orderInfo.soTienDaTra);
    var tienNo = tongHoaDon;
    if (statusCode === "PAID") tienNo = 0;
    else if (statusCode === "PARTIAL")
      tienNo = Math.max(tongHoaDon - Math.max(soTienDaTra, 0), 0);

    var customerName = String((customer && customer.tenKhach) || "").trim();
    if (!customerName) customerName = "Khách ghé thăm";
    var customerPhone = normalizePhoneForSheet_(
      (customer && customer.soDienThoai) || "",
    );

    var statusForKH = resolveStatusForRule_(normalizedStatus, statusRuleKH);
    var statusForDH = resolveStatusForRule_(normalizedStatus, statusRuleDH);

    var oldProductCount = oldDHRows.length;
    var newProductCount = products.length;
    var startRowDH = oldDHRows[0].row;

    var orderRows = [];
    var statusRows = [];
    for (var j = 0; j < products.length; j++) {
      var p = products[j];
      var isFirst = j === 0;
      var thanhTien = (p.soLuong || 0) * (p.donGiaBan || 0);

      orderRows.push([
        ngayBan,
        maPhieu,
        p.tenSanPham || "",
        p.donVi || "",
        p.soLuong || 0,
        p.giaVon || 0,
        p.donGiaBan || 0,
        thanhTien,
        isFirst ? tongHoaDon : "",
        isFirst ? orderInfo.ghiChu || "-" : "-",
        statusForDH,
      ]);
      statusRows.push([statusForDH]);
    }

    var rowKHData = [
      customerName,
      ngayBan,
      customerPhone,
      maPhieu,
      tienNo,
      statusForKH,
      orderInfo.ghiChu || "-",
    ];

    var khoUpdated = false;
    if (khoValues) {
      var changedOld = applyInventoryDeltaByProducts_(
        khoValues,
        oldProducts,
        1,
      );
      var changedNew = applyInventoryDeltaByProducts_(khoValues, products, -1);
      khoUpdated = changedOld || changedNew;
    }

    var paymentMethod = normalizeCompareText_(orderInfo.paymentMethod || "");
    var normalizedStatusKey = normalizeCompareText_(normalizedStatus);
    var isBankTransfer =
      paymentMethod === "bank" || normalizedStatusKey.indexOf("qr") !== -1;
    var paidAmount = 0;
    if (isBankTransfer) {
      if (statusCode === "PARTIAL") paidAmount = Math.max(soTienDaTra, 0);
      else if (statusCode === "PAID") paidAmount = Math.max(tongHoaDon, 0);
    }
    var orderCode = String(maPhieu || "").trim();
    var transferContent = orderCode;
    if (statusCode === "PARTIAL") {
      var remainAmount = Math.max(tongHoaDon - paidAmount, 0);
      if (remainAmount > 0 && orderCode)
        transferContent = orderCode + " con thieu " + remainAmount + "d";
    }

    // === PHASE 3: WRITE ALL (Auto-batch) ===

    // 3.1 Adjust DON_HANG rows length
    if (newProductCount > oldProductCount) {
      var diff = newProductCount - oldProductCount;
      sheetDH.insertRowsAfter(startRowDH + oldProductCount - 1, diff);
      copyLatestFormatForAppend_(
        sheetDH,
        3,
        startRowDH + oldProductCount,
        diff,
        Math.max(12, sheetDH.getLastColumn()),
      );
    } else if (newProductCount < oldProductCount) {
      var diff = oldProductCount - newProductCount;
      sheetDH.deleteRows(startRowDH + newProductCount, diff);
    }

    // 3.2 Write CONG_NO_KHACH
    sheetKH.getRange(rowKH, 2, 1, 7).setValues([rowKHData]);
    try {
      applyKnownStatusValidation_(sheetKH, rowKH, 1, statusColKH, statusRuleKH);
    } catch (ex) {}

    // 3.3 Write DON_HANG
    try {
      sheetDH.getRange(startRowDH, 2, newProductCount, 11).setValues(orderRows);
    } catch (dhWriteErr) {
      sheetDH.getRange(startRowDH, 2, newProductCount, 10).setValues(
        orderRows.map(function (r) {
          return r.slice(0, 10);
        }),
      );
      try {
        applyKnownStatusValidation_(
          sheetDH,
          startRowDH,
          newProductCount,
          statusColDH,
          statusRuleDH,
        );
      } catch (ex) {}
      sheetDH
        .getRange(startRowDH, 12, newProductCount, 1)
        .setValues(statusRows);
    }

    // 3.4 Write KHO
    if (khoUpdated && sheetKho && khoValues) {
      sheetKho.getRange(3, 2, khoValues.length, 9).setValues(khoValues);
    }

    // === DEFER TASKS ===
    try {
      syncProductCatalog_(ss, products);

      if (isBankTransfer) {
        appendBankTransferHistory_({
          ngay: ngayBan || new Date(),
          khach: customerName,
          soTien: paidAmount,
          noiDung: transferContent,
          maDonHang: orderCode,
          trangThai: normalizedStatus || statusForKH || "",
        });
      }
    } catch (e) {
      Logger.log("WARN Background task failed: " + e.message);
    }

    return {
      success: true,
      message: "Cập nhật hóa đơn thành công!",
    };
  } catch (e) {
    return { success: false, message: "Lỗi: " + e.message };
  }
}

/**
 * Auto cập nhật STT (cột A) cho sheet, bắt đầu từ dataStartRow.
 * STT = 1, 2, 3, ... cho mỗi dòng có dữ liệu.
 */
function updateSTT_(sheet, dataStartRow) {
  var lastRow = sheet.getLastRow();
  if (lastRow < dataStartRow) return;
  var numRows = lastRow - dataStartRow + 1;
  var rowValues = sheet
    .getRange(dataStartRow, 1, numRows, sheet.getLastColumn())
    .getDisplayValues();
  var sttValues = new Array(numRows);
  var stt = 0;
  for (var i = 0; i < numRows; i++) {
    var row = rowValues[i];
    // A is STT itself, so detect actual data from column B onward.
    var hasData = false;
    for (var c = 1; c < row.length; c++) {
      if (String(row[c] || "").trim()) {
        hasData = true;
        break;
      }
    }
    if (hasData) {
      stt++;
      sttValues[i] = [stt];
    } else {
      sttValues[i] = [""];
    }
  }
  sheet.getRange(dataStartRow, 1, numRows, 1).setValues(sttValues);
}

function normalizeOrderStatus_(status) {
  var raw = String(status || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (
    raw.indexOf("da thanh toan qr") !== -1 ||
    raw.indexOf("đã thanh toán qr") !== -1
  )
    return "Đã thanh toán QR";
  if (
    raw.indexOf("tra một phan qr") !== -1 ||
    raw.indexOf("trả một phần qr") !== -1 ||
    raw.indexOf("tra mot phan qr") !== -1
  )
    return "Trả một phần QR";
  if (raw === "tra một phan" || raw === "trả một phần") return "Trả một phần";
  if (raw === "tra một phần" || raw === "trả một phần") return "Trả một phần";
  if (raw === "tra mot phan" || raw === "trả mot phan") return "Trả một phần";
  if (raw === "no" || raw === "nợ") return "Nợ";
  return "Đã thanh toán";
}

function normalizeOrderStatusFromInfo_(orderInfo) {
  var code = String((orderInfo && orderInfo.trangThaiCode) || "")
    .trim()
    .toUpperCase();
  var label = String((orderInfo && orderInfo.trangThai) || "").trim();
  if (code === "PAID") {
    if (normalizeCompareText_(label).indexOf("da thanh toan qr") !== -1)
      return "Đã thanh toán QR";
    return "Đã thanh toán";
  }
  if (code === "PARTIAL") {
    if (normalizeCompareText_(label).indexOf("tra mot phan qr") !== -1)
      return "Trả một phần QR";
    return "Trả một phần";
  }
  if (code === "DEBT") return "Nợ";
  return normalizeOrderStatus_(orderInfo && orderInfo.trangThai);
}

function getOrderStatusCode_(orderInfo) {
  var code = String((orderInfo && orderInfo.trangThaiCode) || "")
    .trim()
    .toUpperCase();
  if (code === "PARTIAL" || code === "DEBT" || code === "PAID") return code;
  var normalized = normalizeOrderStatusFromInfo_(orderInfo);
  if (normalized === "Trả một phần") return "PARTIAL";
  if (normalized === "Nợ") return "DEBT";
  return "PAID";
}

function normalizeCompareText_(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getStatusKey_(status) {
  var s = normalizeCompareText_(status);
  if (!s) return "";
  if (s.indexOf("da thanh toan") !== -1) return "PAID";
  if (s.indexOf("tra mot phan") !== -1 || s.indexOf("tra một phan") !== -1)
    return "PARTIAL";
  if (s === "no" || s.indexOf(" no ") !== -1 || s.endsWith(" no"))
    return "DEBT";
  return "";
}

function getValidationList_(rule) {
  if (!rule) return [];
  var criteriaType = rule.getCriteriaType();
  var criteriaValues = rule.getCriteriaValues();
  if (!criteriaType || !criteriaValues || !criteriaValues.length) return [];

  if (
    criteriaType === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST &&
    criteriaValues[0]
  ) {
    return criteriaValues[0].map(function (v) {
      return String(v || "").trim();
    });
  }

  if (
    criteriaType === SpreadsheetApp.DataValidationCriteria.VALUE_IN_RANGE &&
    criteriaValues[0]
  ) {
    var range = criteriaValues[0];
    return range
      .getValues()
      .flat()
      .map(function (v) {
        return String(v || "").trim();
      })
      .filter(function (v) {
        return v;
      });
  }

  return [];
}

function buildStatusValidationRule_() {
  var statusOptions = [
    "Đã thanh toán",
    "Đã thanh toán QR",
    "Trả một phần",
    "Trả một phần QR",
    "Nợ",
  ];
  return SpreadsheetApp.newDataValidation()
    .requireValueInList(statusOptions, true)
    .setAllowInvalid(false)
    .build();
}

function getStatusRuleFromSheet_(sheet, statusCol, dataStartRow) {
  var startRow = dataStartRow || 3;
  try {
    if (sheet && startRow >= 1 && startRow <= sheet.getMaxRows()) {
      var directRule = sheet.getRange(startRow, statusCol).getDataValidation();
      if (directRule) return directRule;
      var lastRow = sheet.getLastRow();
      if (lastRow >= startRow) {
        var rules = sheet
          .getRange(startRow, statusCol, lastRow - startRow + 1, 1)
          .getDataValidations();
        for (var i = 0; i < rules.length; i++) {
          if (rules[i][0]) return rules[i][0];
        }
      }
    }
  } catch (e) {
    Logger.log("WARN getStatusRuleFromSheet_: " + e.message);
  }
  return buildStatusValidationRule_();
}

function resolveStatusForRule_(desiredStatus, rule) {
  var desired = normalizeOrderStatus_(desiredStatus);
  var options = getValidationList_(rule);
  if (!options.length) return desired;
  if (options.indexOf(desired) !== -1) return desired;

  var desiredKey = getStatusKey_(desired);
  if (desiredKey) {
    for (var i = 0; i < options.length; i++) {
      if (getStatusKey_(options[i]) === desiredKey) return options[i];
    }
  }

  for (var j = 0; j < options.length; j++) {
    if (getStatusKey_(options[j]) === "PAID") return options[j];
  }
  return options[0];
}

function normalizePhoneForSheet_(phoneValue) {
  var raw = String(phoneValue || "").trim();
  if (!raw) return "";
  var numeric = raw.replace(/\D/g, "");
  if (!numeric) return "";
  numeric = numeric.slice(0, 15);
  if (numeric.charAt(0) === "0") {
    return "'" + numeric;
  }
  return numeric;
}

function applyStatusValidation_(sheet, startRow, rowCount) {
  var statusCol = 12; // Cột L
  var templateRow = startRow + rowCount;
  if (templateRow > sheet.getMaxRows()) return;

  var rule = sheet.getRange(templateRow, statusCol).getDataValidation();
  if (!rule) return;

  sheet.getRange(startRow, statusCol, rowCount, 1).setDataValidation(rule);
}

function applyKnownStatusValidation_(
  sheet,
  startRow,
  rowCount,
  statusCol,
  rule,
) {
  if (!rule || rowCount <= 0) return;
  sheet.getRange(startRow, statusCol, rowCount, 1).setDataValidation(rule);
}

function setStatusValidationAndValue_(
  sheet,
  row,
  statusCol,
  statusValue,
  rule,
) {
  var cell = sheet.getRange(row, statusCol);
  if (rule) cell.setDataValidation(rule);
  cell.setValues([[statusValue]]);
}

function applySingleStatusValidation_(sheet, startRow, statusCol) {
  var templateRow = startRow + 1;
  if (templateRow > sheet.getMaxRows()) return null;
  var templateRule = sheet.getRange(templateRow, statusCol).getDataValidation();
  if (!templateRule) return null;
  sheet.getRange(startRow, statusCol).setDataValidation(templateRule);
  return templateRule;
}

function mergeOrderSharedColumns_(sheet, startRow, rowCount) {
  if (!sheet || rowCount <= 1) return;
  // B: NGÀY BÁN, C: MÃ PHIẾU, J: TỔNG HÓA ĐƠN, K: GHI CHÚ, L: TRẠNG THÁI
  var colsToMerge = [2, 3, 10, 11, 12];
  for (var i = 0; i < colsToMerge.length; i++) {
    var col = colsToMerge[i];
    var range = sheet.getRange(startRow, col, rowCount, 1);
    range.breakApart();
    range.mergeVertically();
    range.setVerticalAlignment("middle");
  }
}

function ensureQueueSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("QUEUE");
  if (!sheet) {
    sheet = ss.insertSheet("QUEUE");
    sheet
      .getRange(1, 1, 1, 7)
      .setValues([
        [
          "createdAt",
          "status",
          "action",
          "payload",
          "result",
          "error",
          "updatedAt",
        ],
      ]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function ensureQueueTrigger_() {
  try {
    var triggers = ScriptApp.getProjectTriggers();
    var hasQueueTrigger = triggers.some(function (t) {
      return t.getHandlerFunction && t.getHandlerFunction() === "processQueue";
    });
    if (!hasQueueTrigger) {
      // Ensure authorization is prompted when needed.
      ScriptApp.newTrigger("processQueue").timeBased().everyMinutes(1).create();
    }
    return true;
  } catch (e) {
    Logger.log("WARN ensureQueueTrigger_: " + e.message);
    return false;
  }
}

function setupQueueInfrastructure() {
  ensureQueueSheet_();
  var ok = ensureQueueTrigger_();
  return {
    success: ok,
    message: ok
      ? "Queue đã sẵn sàng."
      : "Không tạo được trigger. Hãy cấp quyền script.scriptapp và chạy lại.",
  };
}

function enqueueOperation_(action, payload) {
  var sheet = ensureQueueSheet_();
  var now = new Date();
  var row = [
    now,
    "PENDING",
    action,
    JSON.stringify(payload || {}),
    "",
    "",
    now,
  ];
  var targetRow = sheet.getLastRow() + 1;
  if (targetRow > sheet.getMaxRows()) {
    sheet.insertRowsAfter(sheet.getMaxRows(), targetRow - sheet.getMaxRows());
  }
  sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
  ensureQueueTrigger_();
  return targetRow;
}

function runWithLockOrQueue_(action, payload, fn, options) {
  options = options || {};
  if (options.skipLock) {
    return fn();
  }
  var lock = LockService.getDocumentLock();
  var locked = false;
  try {
    lock.waitLock(5000);
    locked = true;
  } catch (e) {
    var jobId = enqueueOperation_(action, payload);
    return {
      success: true,
      queued: true,
      jobId: jobId,
      message: "Hệ thống đang bận, yêu cầu đã được đưa vào hàng đợi.",
    };
  }
  try {
    return fn();
  } finally {
    if (locked) lock.releaseLock();
  }
}

function processQueue() {
  var lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    var sheet = ensureQueueSheet_();
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { success: true, processed: 0 };
    var header = data[0];
    var idxStatus = 1;
    var idxAction = 2;
    var idxPayload = 3;
    var idxResult = 4;
    var idxError = 5;
    var idxUpdated = 6;
    var processed = 0;
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (row[idxStatus] !== "PENDING") continue;
      var action = row[idxAction];
      var payload = {};
      try {
        payload = JSON.parse(row[idxPayload] || "{}");
      } catch (e) {
        payload = {};
      }
      try {
        var result = dispatchQueueAction_(action, payload);
        row[idxStatus] = "SUCCESS";
        row[idxResult] = JSON.stringify(result || {});
        row[idxError] = "";
      } catch (err) {
        row[idxStatus] = "FAILED";
        row[idxError] = String(err && err.message ? err.message : err);
      }
      row[idxUpdated] = new Date();
      processed++;
    }
    if (processed > 0) {
      sheet
        .getRange(2, 1, data.length - 1, header.length)
        .setValues(data.slice(1));
    }
    return { success: true, processed: processed };
  } finally {
    lock.releaseLock();
  }
}

function dispatchQueueAction_(action, payload) {
  var result = null;
  if (action === "CREATE_ORDER")
    result = createOrderInternal_(payload.orderData, payload.options || {});
  else if (action === "UPDATE_ORDER")
    result = updateOrderInternal_(payload.payload);
  else if (action === "DELETE_ORDER")
    result = deleteOrderInternal_(payload.maPhieu);
  else if (action === "UPDATE_DEBT")
    result = updateDebtCustomerInternal_(payload.payload);
  else if (action === "SETTLE_DEBT") result = settleAllDebtCustomersInternal_();
  else if (action === "UPDATE_PRODUCT")
    result = updateProductCatalogItemInternal_(payload.payload);
  else if (action === "CREATE_PRODUCT")
    result = createProductCatalogItemInternal_(payload.payload);
  else if (action === "DELETE_PRODUCT")
    result = deleteProductCatalogItemInternal_(payload.payload);
  else if (action === "CREATE_RECEIPT")
    result = createInventoryReceiptInternal_(payload.payload);
  else if (action === "UPDATE_SUPPLIER_DEBT")
    result = updateSupplierDebtInternal_(payload.payload);
  else if (action === "ISSUE_EASYINVOICE")
    result = issueEasyInvoice(payload.payload, { skipLock: true });
  else if (action === "CANCEL_EASYINVOICE")
    result = cancelEasyInvoice(payload.payload, { skipLock: true });
  else if (action === "REPLACE_EASYINVOICE")
    result = replaceEasyInvoice(payload.payload, { skipLock: true });
  if (action === "SET_SETTING") {
    var props = PropertiesService.getScriptProperties();
    props.setProperty(payload.payload.key, String(payload.payload.value));
    result = { success: true, message: "Đã lưu cài đặt" };
  }
  if (!result && action !== "SET_SETTING") {
    throw new Error("Unknown queue action: " + action);
  }
  if (result && result.success) {
    bumpAppCacheVersion_();
  }
  return result;
}

function createOrder(orderData, options) {
  return runWithLockOrQueue_(
    "CREATE_ORDER",
    { orderData: orderData, options: options || {} },
    function () {
      var res = createOrderInternal_(orderData, options || {});
      if (res && res.success) bumpAppCacheVersion_();
      return res;
    },
  );
}

function appendBankTransferHistory_(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("BANK");
  if (!sheet) return false;

  var startRow = 8;
  var lastRow = sheet.getLastRow();
  var targetRow = Math.max(startRow, lastRow + 1);
  if (targetRow > sheet.getMaxRows()) {
    sheet.insertRowsAfter(sheet.getMaxRows(), targetRow - sheet.getMaxRows());
  }
  copyLatestFormatForAppend_(
    sheet,
    startRow,
    targetRow,
    1,
    Math.max(6, sheet.getLastColumn()),
  );

  var ngayCell = payload && payload.ngay ? payload.ngay : new Date();
  if (typeof ngayCell === "string") {
    var parsed = new Date(ngayCell);
    if (!isNaN(parsed.getTime())) ngayCell = parsed;
  }

  sheet
    .getRange(targetRow, 1, 1, 6)
    .setValues([
      [
        ngayCell,
        (payload && payload.khach) || "",
        (payload && payload.soTien) || 0,
        (payload && payload.noiDung) || "",
        (payload && payload.maDonHang) || "",
        (payload && payload.trangThai) || "",
      ],
    ]);

  return true;
}

function createOrderInternal_(orderData, options) {
  try {
    options = options || {};
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // === PHASE 1: READ ALL CẦN THIẾT ===
    var sheetDH = ss.getSheetByName("DON_HANG");
    var sheetKH = ss.getSheetByName("CONG_NO_KHACH");
    if (!sheetDH) throw new Error("Không tìm thấy sheet DON_HANG");
    if (!sheetKH) throw new Error("Không tìm thấy sheet CONG_NO_KHACH");

    var products = orderData.products || [];
    var orderInfo = orderData.orderInfo || {};
    var customer = orderData.customer || null;
    if (!products.length) throw new Error("Đơn hàng chưa có sản phẩm");

    // 1.1 Đọc mã phiếu (chống trùng)
    try {
      var latestCode = sheetDH.getRange(3, 3, 1, 1).getDisplayValues()[0][0];
      // Generate new code if collision detected or requested as next
      orderInfo.maPhieu = incrementOrderCode_(latestCode, "DH00001");
    } catch (codeErr) {
      if (!orderInfo.maPhieu) orderInfo.maPhieu = "DH01";
    }

    // 1.2 Đọc rules Data Validation (Rất nhẹ, gộp chung pha Read)
    var statusColDH = 12;
    var statusRuleDH = getStatusRuleFromSheet_(sheetDH, statusColDH, 3);
    var statusColKH = 7;
    var statusRuleKH = getStatusRuleFromSheet_(sheetKH, statusColKH, 3);

    // 1.3 Đọc dữ liệu Kho
    var isInventoryEnabled =
      PropertiesService.getScriptProperties().getProperty(
        "enable_inventory",
      ) === "true";
    var sheetKho =
      ss.getSheetByName("QUAN_LY_KHO") || ss.getSheetByName("QUẢN LÝ KHO");
    var khoValues = null;
    if (isInventoryEnabled && sheetKho) {
      var khoLastRow = sheetKho.getLastRow();
      if (khoLastRow >= 3) {
        khoValues = sheetKho.getRange(3, 2, khoLastRow - 2, 9).getValues();
      }
    }

    // === PHASE 2: PROCESS (Tính toán thuần JS) ===
    var tongHoaDon = products.reduce(function (sum, p) {
      return sum + (p.soLuong || 0) * (p.donGiaBan || 0);
    }, 0);

    var ngayBan = orderInfo.ngayBan || "";
    var normalizedStatus = normalizeOrderStatusFromInfo_(orderInfo);
    var statusCode = getOrderStatusCode_(orderInfo);
    var statusForDH = resolveStatusForRule_(normalizedStatus, statusRuleDH);
    var statusForKH = resolveStatusForRule_(normalizedStatus, statusRuleKH);

    // Build DON_HANG rows
    var rowCount = products.length;
    var orderRows = [];
    var statusRows = [];
    for (var i = 0; i < products.length; i++) {
      var p = products[i];
      var thanhTien = (p.soLuong || 0) * (p.donGiaBan || 0);
      var giaVon = p.giaVon || 0;
      var isFirst = i === 0;
      orderRows.push([
        "", // STT để trống, trigger chạy ngầm sẽ bù sau
        ngayBan,
        orderInfo.maPhieu || "",
        p.tenSanPham || "",
        p.donVi || "",
        p.soLuong || 0,
        giaVon,
        p.donGiaBan || 0,
        thanhTien,
        isFirst ? tongHoaDon : "",
        isFirst ? orderInfo.ghiChu || "-" : "-",
        statusForDH,
      ]);
      statusRows.push([statusForDH]);
    }

    // Build CONG_NO_KHACH row
    var customerName = String((customer && customer.tenKhach) || "").trim();
    if (!customerName) customerName = "Khách ghé thăm";
    var customerPhone = normalizePhoneForSheet_(
      (customer && customer.soDienThoai) || "",
    );
    var soTienDaTra = parseMoneyNumber_(orderInfo.soTienDaTra);
    var tienNo = tongHoaDon;
    if (statusCode === "PAID") tienNo = 0;
    else if (statusCode === "PARTIAL")
      tienNo = Math.max(tongHoaDon - Math.max(soTienDaTra, 0), 0);

    var khRow = [
      "", // STT
      customerName,
      ngayBan,
      customerPhone,
      orderInfo.maPhieu || "",
      tienNo,
      statusForKH,
      orderInfo.ghiChu || "-",
    ];

    // Build KHO update
    var khoUpdated = false;
    if (khoValues) {
      khoUpdated = applyInventoryDeltaByProducts_(khoValues, products, -1);
    }

    // Build BANK transfer data
    var paymentMethod = normalizeCompareText_(orderInfo.paymentMethod || "");
    var normalizedStatusKey = normalizeCompareText_(normalizedStatus);
    var isBankTransfer =
      paymentMethod === "bank" || normalizedStatusKey.indexOf("qr") !== -1;
    var paidAmount = 0;
    if (isBankTransfer) {
      if (statusCode === "PARTIAL") paidAmount = Math.max(soTienDaTra, 0);
      else if (statusCode === "PAID") paidAmount = Math.max(tongHoaDon, 0);
    }
    var orderCode = String(orderInfo.maPhieu || "").trim();
    var transferContent = orderCode;
    if (statusCode === "PARTIAL") {
      var remainAmount = Math.max(tongHoaDon - paidAmount, 0);
      if (remainAmount > 0 && orderCode)
        transferContent = orderCode + " con thieu " + remainAmount + "d";
    }

    // === PHASE 3: WRITE ALL (Auto-batch) ===

    // 3.1 Insert Rows (Tạo khoảng trống trước)
    sheetDH.insertRowsBefore(3, rowCount);
    sheetKH.insertRowBefore(3);

    // 3.2 Ghi vào DON_HANG
    copyLatestFormatForTopInsert_(
      sheetDH,
      3,
      rowCount,
      Math.max(12, sheetDH.getLastColumn()),
    );
    try {
      sheetDH.getRange(3, 1, rowCount, 12).setValues(orderRows);
    } catch (rowWriteErr) {
      sheetDH.getRange(3, 1, rowCount, 11).setValues(
        orderRows.map(function (r) {
          return r.slice(0, 11);
        }),
      );
      applyKnownStatusValidation_(sheetDH, 3, rowCount, 12, statusRuleDH);
      sheetDH.getRange(3, 12, rowCount, 1).setValues(statusRows);
    }

    // 3.3 Ghi vào CONG_NO_KHACH
    copyLatestFormatForTopInsert_(
      sheetKH,
      3,
      1,
      Math.max(8, sheetKH.getLastColumn()),
    );
    try {
      sheetKH.getRange(3, 1, 1, 8).setValues([khRow]);
    } catch (khRowWriteErr) {
      sheetKH
        .getRange(3, 1, 1, 6)
        .setValues([
          [khRow[0], khRow[1], khRow[2], khRow[3], khRow[4], khRow[5]],
        ]);
      setStatusValidationAndValue_(sheetKH, 3, 7, khRow[6], statusRuleKH);
      sheetKH.getRange(3, 8, 1, 1).setValues([[khRow[7]]]);
    }

    // 3.4 Ghi vào KHO
    if (khoUpdated && sheetKho && khoValues) {
      sheetKho.getRange(3, 2, khoValues.length, 9).setValues(khoValues);
    }

    // === DEFER TASKS (Giảm độ trễ trả về) ===
    try {
      // Bỏ qua updateSTT_ và merge cells (Để Time-Driven Trigger lo sau)
      // Chạy các lệnh push phụ cuối cùng để không break batch
      syncProductCatalog_(ss, products);

      if (isBankTransfer) {
        appendBankTransferHistory_({
          ngay: ngayBan || new Date(),
          khach: customerName,
          soTien: paidAmount,
          noiDung: transferContent,
          maDonHang: orderCode,
          trangThai: normalizedStatus || statusForKH || "",
        });
      }
    } catch (e) {
      Logger.log("WARN Background task failed: " + e.message);
    }

    return {
      success: true,
      message: "Đơn hàng " + orderInfo.maPhieu + " đã được tạo thành công!",
      maPhieu: orderInfo.maPhieu,
    };
  } catch (e) {
    return { success: false, message: "Lỗi: " + e.message };
  }
}

function getInventory() {
  return withSuccessCache_("read:inventory", 20, function () {
    try {
      var isInventoryEnabled =
        PropertiesService.getScriptProperties().getProperty(
          "enable_inventory",
        ) === "true";
      if (!isInventoryEnabled) return { success: true, data: [] };

      // Tồn kho và Giá vốn/Giá bán đã được map đầy đủ bên trong getProductCatalog
      return getProductCatalog();
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message, data: [] };
    }
  });
}

function getReceiptHistory() {
  return withSuccessCache_("read:receipt_history", 20, function () {
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var sheet = ss.getSheetByName("NHAP_HANG");
      if (!sheet) throw new Error("Không tìm thấy sheet NHAP_HANG");

      var lastRow = sheet.getLastRow();
      if (lastRow < 3) return { success: true, data: [] };

      // Layout A:L
      // A Ngày | B NCC | C Phiếu nhập | D Tên SP | E Nhóm hàng
      // F Số lượng | G Đơn vị | H Giá nhập | I Thành tiền
      // J Tổng tiền | K Ghi chú | L Trạng thái nợ
      var values = sheet.getRange(3, 1, lastRow - 2, 12).getDisplayValues();
      var data = [];

      var carryNgayNhap = "";
      var carryNhaCungCap = "";
      var carryMaPhieu = "";
      var carryGhiChu = "";
      var carryTongTien = "";
      var carryTrangThai = "";

      for (var i = 0; i < values.length; i++) {
        var ngayNhap = String(values[i][0] || "").trim() || carryNgayNhap;
        var nhaCungCap = String(values[i][1] || "").trim() || carryNhaCungCap;
        var maPhieu = String(values[i][2] || "").trim() || carryMaPhieu;
        var tongTienPhieu = String(values[i][9] || "").trim() || carryTongTien;
        var ghiChu = String(values[i][10] || "").trim() || carryGhiChu;
        var trangThai = String(values[i][11] || "").trim() || carryTrangThai;

        if (ngayNhap) carryNgayNhap = ngayNhap;
        if (nhaCungCap) carryNhaCungCap = nhaCungCap;
        if (maPhieu) carryMaPhieu = maPhieu;
        if (tongTienPhieu) carryTongTien = tongTienPhieu;
        if (ghiChu) carryGhiChu = ghiChu;
        if (trangThai) carryTrangThai = trangThai;

        var ten = String(values[i][3] || "").trim();
        if (!maPhieu && !ten) continue;

        data.push({
          nhaCungCap: nhaCungCap,
          ngayNhap: ngayNhap,
          maPhieu: maPhieu,
          ghiChu: ghiChu,
          tenSanPham: ten,
          nhomHang: String(values[i][4] || "").trim(),
          donVi: String(values[i][6] || "").trim(),
          soLuong: parseMoneyNumber_(values[i][5]),
          donGiaNhap: parseMoneyNumber_(values[i][7]),
          thanhTien: parseMoneyNumber_(values[i][8]),
          tongTienPhieu: parseMoneyNumber_(tongTienPhieu),
          trangThai: trangThai,
        });
      }
      return { success: true, data: data };
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message, data: [] };
    }
  });
}

function clearReceiptMerges_(sheet) {
  var dataStartRow = 3;
  var lastRow = sheet.getLastRow();
  if (lastRow < dataStartRow) return;
  var merged = sheet
    .getRange(
      dataStartRow,
      1,
      lastRow - dataStartRow + 1,
      sheet.getLastColumn(),
    )
    .getMergedRanges();
  for (var i = 0; i < merged.length; i++) {
    merged[i].breakApart();
  }
}

function rebuildReceiptMerges_(sheet) {
  var dataStartRow = 3;
  var lastRow = sheet.getLastRow();
  if (lastRow < dataStartRow) return;

  var values = sheet
    .getRange(dataStartRow, 3, lastRow - dataStartRow + 1, 1)
    .getDisplayValues(); // Cột C (Mã phiếu)
  var rows = [];
  var carryMaPhieu = "";
  for (var i = 0; i < values.length; i++) {
    var val = String(values[i][0] || "").trim();
    if (val) carryMaPhieu = val;
    rows.push({ row: dataStartRow + i, maPhieu: val || carryMaPhieu });
  }

  // Các cột merge theo mã phiếu: A (Ngày), B (NCC), C (Phiếu nhập), J (Tổng tiền), K (Ghi chú), L (Trạng thái nợ)
  var mergeCols = [1, 2, 3, 10, 11, 12];
  var start = 0;
  while (start < rows.length) {
    var end = start;
    while (
      end + 1 < rows.length &&
      rows[end + 1].maPhieu === rows[start].maPhieu
    ) {
      end++;
    }
    var rowCount = end - start + 1;
    if (rowCount > 1 && rows[start].maPhieu) {
      for (var c = 0; c < mergeCols.length; c++) {
        var range = sheet.getRange(rows[start].row, mergeCols[c], rowCount, 1);
        range.mergeVertically();
        range.setVerticalAlignment("middle");
      }
    }
    start = end + 1;
  }
}

function createInventoryReceipt(payload) {
  return runWithLockOrQueue_(
    "CREATE_RECEIPT",
    { payload: payload },
    function () {
      var res = createInventoryReceiptInternal_(payload);
      if (res && res.success) bumpAppCacheVersion_();
      return res;
    },
  );
}

function createInventoryReceiptInternal_(payload) {
  try {
    var isInventoryEnabled =
      PropertiesService.getScriptProperties().getProperty(
        "enable_inventory",
      ) === "true";
    if (!isInventoryEnabled)
      throw new Error("Tính năng quản lý kho đang bị tắt.");

    var receiptInfo = payload.receiptInfo || {};
    var products = payload.products || [];
    if (!products.length) throw new Error("Không có mặt hàng nào trong phiếu");

    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // === PHASE 1: READ ALL ===
    var sheetKho =
      ss.getSheetByName("QUAN_LY_KHO") || ss.getSheetByName("QUẢN LÝ KHO");
    var sheetNhap = ss.getSheetByName("NHAP_HANG");
    var sheetNCC = ss.getSheetByName("CONG_NO_NCC");

    if (!sheetKho) throw new Error("Chưa có sheet QUAN_LY_KHO");
    if (!sheetNhap) throw new Error("Chưa có sheet NHAP_HANG");

    try {
      var latestReceiptCode = sheetNhap
        .getRange(3, 3, 1, 1)
        .getDisplayValues()[0][0];
      receiptInfo.maPhieu = incrementOrderCode_(latestReceiptCode, "PN00001");
    } catch (receiptCodeErr) {
      if (!receiptInfo.maPhieu) receiptInfo.maPhieu = "NK01";
    }

    var khoValues = null;
    if (sheetKho) {
      var lastKhoRow = sheetKho.getLastRow();
      if (lastKhoRow >= 3) {
        khoValues = sheetKho.getRange(3, 2, lastKhoRow - 2, 8).getValues();
      }
    }

    // === PHASE 2: PROCESS ===
    var tongTienPhieu = 0;
    for (var i = 0; i < products.length; i++) {
      tongTienPhieu +=
        (Number(products[i].soLuong) || 0) *
        (Number(products[i].giaNhapChan) || 0);
    }

    var trangThai = normalizeOrderStatus_(
      receiptInfo.trangThai || "Đã thanh toán",
    );
    var trangThaiKey = getStatusKey_(trangThai) || "PAID";
    var soTienDaTra = 0;
    var tienNo = 0;
    if (trangThaiKey === "PARTIAL") {
      soTienDaTra = Math.max(parseMoneyNumber_(receiptInfo.soTienDaTra), 0);
      tienNo = Math.max(tongTienPhieu - soTienDaTra, 0);
    } else if (trangThaiKey === "DEBT") {
      soTienDaTra = 0;
      tienNo = tongTienPhieu;
    } else {
      trangThai = "Đã thanh toán";
      soTienDaTra = tongTienPhieu;
      tienNo = 0;
    }

    var rawNgayNhap = receiptInfo.ngayNhap || "";
    var parsedNgayNhap = rawNgayNhap;
    if (rawNgayNhap && typeof rawNgayNhap === "string") {
      var d = new Date(rawNgayNhap);
      if (!isNaN(d.getTime())) {
        var dd = String(d.getDate()).padStart(2, "0");
        var mm = String(d.getMonth() + 1).padStart(2, "0");
        var yyyy = d.getFullYear();
        parsedNgayNhap = dd + "/" + mm + "/" + yyyy;
      }
    }

    var rowCount = products.length;
    var nRows = [];
    for (var r = 0; r < products.length; r++) {
      var p = products[r];
      var isFirst = r === 0;
      nRows.push([
        isFirst ? parsedNgayNhap : "",
        isFirst ? receiptInfo.nhaCungCap || "" : "",
        isFirst ? receiptInfo.maPhieu || "" : "",
        p.tenSanPham || "",
        p.nhomHang || "",
        p.soLuong || 0,
        p.donViChan || "",
        p.giaNhapChan || 0,
        (p.soLuong || 0) * (p.giaNhapChan || 0),
        isFirst ? tongTienPhieu : "",
        isFirst ? receiptInfo.ghiChu || "-" : "",
        isFirst ? trangThai : "",
      ]);
    }

    var nccRow = sheetNCC
      ? [
          "",
          receiptInfo.nhaCungCap || "Nhà cung cấp lạ",
          parsedNgayNhap,
          normalizePhoneForSheet_(receiptInfo.soDienThoai),
          receiptInfo.maPhieu || "",
          tienNo,
          trangThai,
          receiptInfo.ghiChu || "-",
        ]
      : null;

    var khoUpdated = false;
    if (khoValues) {
      khoUpdated = applyInventoryDeltaByProducts_(khoValues, products, 1, {
        updateCostFromProducts: true,
      });
    }

    var syncProducts = [];
    products.forEach(function (p) {
      syncProducts.push({
        tenSanPham: p.tenSanPham,
        nhomHang: p.nhomHang,
        donVi: p.donViChan,
        donGiaBan: 0,
        giaVon: p.giaNhapChan,
        donViChan: p.donViChan,
        quyDoi: p.quyDoi,
      });
      if (p.donViLe && p.donViLe !== p.donViChan) {
        syncProducts.push({
          tenSanPham: p.tenSanPham,
          nhomHang: p.nhomHang,
          donVi: p.donViLe,
          donGiaBan: 0,
          giaVon: p.quyDoi > 0 ? p.giaNhapChan / p.quyDoi : p.giaNhapChan,
          donViChan: p.donViChan,
          quyDoi: p.quyDoi,
        });
      }
    });

    // === PHASE 3: WRITE ALL (Auto-batch) ===

    // 3.1 Insert rows
    sheetNhap.insertRowsBefore(3, rowCount);
    if (sheetNCC) {
      sheetNCC.insertRowBefore(3);
    }

    // 3.2 Write NHAP_HANG
    copyLatestFormatForTopInsert_(
      sheetNhap,
      3,
      rowCount,
      Math.max(12, sheetNhap.getLastColumn()),
    );
    sheetNhap.getRange(3, 1, rowCount, 12).setValues(nRows);

    // 3.3 Write CONG_NO_NCC
    if (sheetNCC && nccRow) {
      copyLatestFormatForTopInsert_(
        sheetNCC,
        3,
        1,
        Math.max(8, sheetNCC.getLastColumn()),
      );
      try {
        sheetNCC.getRange(3, 1, 1, 8).setValues([nccRow]);
      } catch (e) {
        Logger.log("WARN CONG_NO_NCC: " + e.message);
      }
    }

    // 3.4 Write QUAN_LY_KHO
    if (khoUpdated && sheetKho && khoValues) {
      sheetKho.getRange(3, 2, khoValues.length, 8).setValues(khoValues);
    }

    // === DEFER TASKS ===
    try {
      syncProductCatalog_(ss, syncProducts);
    } catch (e) {
      Logger.log("WARN Background task failed: " + e.message);
    }

    return {
      success: true,
      message: "Phiếu nhập " + receiptInfo.maPhieu + " đã được tạo thành công!",
      maPhieu: receiptInfo.maPhieu,
    };
  } catch (e) {
    return { success: false, message: "Lỗi: " + e.message };
  }
}

function uploadImageToImgBB(base64Data) {
  try {
    var apiKey =
      PropertiesService.getScriptProperties().getProperty("IMGBB_API_KEY");
    if (!apiKey)
      throw new Error(
        "Ch\u01b0a c\u1ea5u h\u00ecnh IMGBB_API_KEY trong Script Properties",
      );

    var cleanBase64 = String(base64Data || "").replace(
      /^data:image\/[^;]+;base64,/,
      "",
    );
    if (!cleanBase64) throw new Error("D\u1eef li\u1ec7u \u1ea3nh tr\u1ed1ng");

    var response = UrlFetchApp.fetch("https://api.imgbb.com/1/upload", {
      method: "post",
      payload: {
        key: apiKey,
        image: cleanBase64,
      },
    });

    var json = JSON.parse(response.getContentText());
    if (json && json.data && json.data.url) {
      return {
        success: true,
        data: {
          url: json.data.url,
          thumb: (json.data.thumb && json.data.thumb.url) || json.data.url,
        },
      };
    }
    throw new Error("ImgBB response invalid");
  } catch (e) {
    return {
      success: false,
      message: "L\u1ed7i upload \u1ea3nh: " + e.message,
    };
  }
}

/* EASYINVOICE INTEGRATION */
function issueEasyInvoice(payload, options) {
  return runWithLockOrQueue_(
    "ISSUE_EASYINVOICE",
    { payload: payload },
    function () {
      try {
        var maPhieu = String(payload.maPhieu || "").trim();
        if (!maPhieu) throw new Error("Chưa truyền mã phiếu");

        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var sheet = ss.getSheetByName("DON_HANG");
        if (!sheet) throw new Error("Không tìm thấy sheet DON_HANG");

        var lastRow = sheet.getLastRow();
        if (lastRow < 3) throw new Error("Không có dữ liệu đơn hàng");

        var rows = sheet.getRange(3, 1, lastRow - 2, 12).getDisplayValues();
        var matchRows = [];
        var startRowIdx = -1;
        var carryMaPhieu = "";
        var carryNgayBan = "";

        for (var i = 0; i < rows.length; i++) {
          var rowNgay = String(rows[i][1] || "").trim();
          if (rowNgay) carryNgayBan = rowNgay;

          var rowCode = String(rows[i][2] || "").trim();
          if (rowCode) carryMaPhieu = rowCode;

          if (carryMaPhieu === maPhieu) {
            if (startRowIdx === -1) {
              startRowIdx = i;
              var orderNgayBan = carryNgayBan; // Lấy ngày của đơn
            }

            matchRows.push({
              name: String(rows[i][3] || "").trim(),
              unit: String(rows[i][4] || "").trim(),
              quantity: parseMoneyNumber_(rows[i][5]),
              price: parseMoneyNumber_(rows[i][7]),
            });
          }
        }

        if (matchRows.length === 0)
          throw new Error("Không tìm thấy dữ liệu phiếu " + maPhieu);

        // Tìm tên khách hàng, số điện thoại
        var customerName = "Khách vãng lai";
        var customerPhone = "";
        var sheetKH = ss.getSheetByName("CONG_NO_KHACH");
        if (sheetKH) {
          var lastRowKH = sheetKH.getLastRow();
          if (lastRowKH >= 3) {
            var khRows = sheetKH
              .getRange(3, 2, lastRowKH - 2, 4)
              .getDisplayValues();
            for (var c = 0; c < khRows.length; c++) {
              if (String(khRows[c][3] || "").trim() === maPhieu) {
                customerName = String(khRows[c][0] || "").trim();
                customerPhone = String(khRows[c][2] || "").trim();
                break;
              }
            }
          }
        }

        var orderData = {
          id: maPhieu,
          ngayBan:
            orderNgayBan ||
            Utilities.formatDate(new Date(), "Asia/Ho_Chi_Minh", "dd/MM/yyyy"),
          customerName: customerName,
          customerPhone: customerPhone,
          products: matchRows,
        };

        var result = publishInvoiceHSM(orderData);

        if (result.success) {
          var actualRow = startRowIdx + 3;
          var mergedRowCount = matchRows.length;

          // Unmerge first if necessary (optional, but robust)
          try {
            sheet.getRange(actualRow, 13, mergedRowCount, 4).breakApart(); // M:P
          } catch (e) {}

          var actualLookupCode =
            result.lookupCode + (result.ikey ? "|IKEY:" + result.ikey : "");
          var range = sheet.getRange(actualRow, 13, 1, 4); // Columns M, N, O, P
          range.setValues([
            [
              result.invoiceNo,
              actualLookupCode,
              result.statusText,
              result.taxAuthorityCode || "",
            ],
          ]);

          if (mergedRowCount > 1) {
            sheet
              .getRange(actualRow, 13, mergedRowCount, 1)
              .merge()
              .setVerticalAlignment("middle");
            sheet
              .getRange(actualRow, 14, mergedRowCount, 1)
              .merge()
              .setVerticalAlignment("middle");
            sheet
              .getRange(actualRow, 15, mergedRowCount, 1)
              .merge()
              .setVerticalAlignment("middle");
            sheet
              .getRange(actualRow, 16, mergedRowCount, 1)
              .merge()
              .setVerticalAlignment("middle");
          }

          return { success: true, message: result.message, data: result };
        } else {
          throw new Error(result.message);
        }
      } catch (e) {
        return { success: false, message: e.message };
      }
    },
    options,
  );
}

function cancelEasyInvoice(payload, options) {
  return runWithLockOrQueue_(
    "CANCEL_EASYINVOICE",
    { payload: payload },
    function () {
      try {
        var maPhieu = String(payload.maPhieu || "").trim();
        if (!maPhieu) throw new Error("Chưa truyền mã phiếu");

        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var sheet = ss.getSheetByName("DON_HANG");
        if (!sheet) throw new Error("Không tìm thấy sheet DON_HANG");

        var lastRow = sheet.getLastRow();
        if (lastRow < 3) throw new Error("Không có dữ liệu đơn hàng");

        var rows = sheet.getRange(3, 1, lastRow - 2, 14).getDisplayValues(); // Read up to column 14 (N)
        var startRowIdx = -1;
        var matchCount = 0;
        var carryMaPhieu = "";
        var oldLookupStr = "";

        for (var i = 0; i < rows.length; i++) {
          var rowCode = String(rows[i][2] || "").trim();
          if (rowCode) carryMaPhieu = rowCode;
          if (carryMaPhieu === maPhieu) {
            if (startRowIdx === -1) {
              startRowIdx = i;
              oldLookupStr = String(rows[i][13] || "").trim(); // Column N
            }
            matchCount++;
          }
        }

        if (startRowIdx === -1)
          throw new Error("Không tìm thấy dữ liệu phiếu " + maPhieu);

        // Extract Ikey if present, else default to maPhieu
        var actualIkey = maPhieu;
        if (oldLookupStr.indexOf("|IKEY:") !== -1) {
          actualIkey = oldLookupStr.split("|IKEY:")[1].trim();
        }

        var result = cancelInvoiceHSM(actualIkey);

        if (result.success) {
          var actualRow = startRowIdx + 3;
          // Cập nhật trạng thái thành Đã hủy. Số hóa đơn (cột 13) và mã tra cứu (cột 14) vẫn giữ để back-trace
          sheet.getRange(actualRow, 15, matchCount, 1).setValue("Đã hủy (5)");
          return { success: true, message: result.message };
        } else if (
          result.message.indexOf("không hợp lệ") !== -1 ||
          result.message.indexOf("không được phép huỷ") !== -1
        ) {
          // SMART CANCEL: Nếu hủy trực tiếp bị lỗi (do TT78 đã ký), ta thử gửi Thông báo sai sót (Mẫu 04)
          var detailResult = getInvoiceDetailsHSM(actualIkey);
          if (detailResult.success) {
            var inv = detailResult.data;
            var noticeResult = sendErrorNoticeHSM({
              pattern: inv.Pattern,
              serial: inv.Serial,
              no: inv.No,
              arisingDate: inv.ArisingDate,
              taxAuthorityCode: inv.TaxAuthorityCode,
              note: "Người mua hủy đơn hàng",
            });

            if (noticeResult.success) {
              var actualRow = startRowIdx + 3;
              sheet
                .getRange(actualRow, 15, matchCount, 1)
                .setValue("Đã hủy (Mẫu 04)");
              return {
                success: true,
                message:
                  "Đã gửi thông báo sai sót (Mẫu 04) thành công. Hóa đơn sẽ được hệ thống hủy sau khi CQT chấp nhận.",
              };
            } else {
              throw new Error("Lỗi gửi Mẫu 04: " + noticeResult.message);
            }
          } else {
            throw new Error(
              "Không thể lấy thông tin hđ để gửi Mẫu 04: " +
                detailResult.message,
            );
          }
        } else {
          throw new Error(result.message);
        }
      } catch (e) {
        return { success: false, message: e.message };
      }
    },
    options,
  );
}

function replaceEasyInvoice(payload, options) {
  return runWithLockOrQueue_(
    "REPLACE_EASYINVOICE",
    { payload: payload },
    function () {
      try {
        var maPhieu = String(payload.maPhieu || "").trim();
        if (!maPhieu) throw new Error("Chưa truyền mã phiếu");

        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var sheet = ss.getSheetByName("DON_HANG");
        if (!sheet) throw new Error("Không tìm thấy sheet DON_HANG");

        var lastRow = sheet.getLastRow();
        if (lastRow < 3) throw new Error("Không có dữ liệu đơn hàng");

        var rows = sheet.getRange(3, 1, lastRow - 2, 14).getDisplayValues(); // Đọc ra cả cột M, N
        var startRowIdx = -1;
        var matchRows = [];
        var carryMaPhieu = "";
        var carryNgayBan = "";
        var orderNgayBan = "";
        var oldLookupStr = "";

        for (var i = 0; i < rows.length; i++) {
          var rowNgay = String(rows[i][1] || "").trim();
          if (rowNgay) carryNgayBan = rowNgay;

          var rowCode = String(rows[i][2] || "").trim();
          if (rowCode) carryMaPhieu = rowCode;

          if (carryMaPhieu === maPhieu) {
            if (startRowIdx === -1) {
              startRowIdx = i;
              orderNgayBan = carryNgayBan;
              oldLookupStr = String(rows[i][13] || "").trim(); // Cột N (14)
            }

            matchRows.push({
              name: String(rows[i][3] || "").trim(),
              unit: String(rows[i][4] || "").trim(),
              quantity: parseMoneyNumber_(rows[i][5]),
              price: parseMoneyNumber_(rows[i][7]),
            });
          }
        }

        if (startRowIdx === -1)
          throw new Error("Không tìm thấy dữ liệu phiếu " + maPhieu);

        // Lấy Old Ikey từ chuỗi LookupCode cũ (Cột N)
        var oldIkey = maPhieu;
        if (oldLookupStr.indexOf("|IKEY:") !== -1) {
          var parts = oldLookupStr.split("|IKEY:");
          oldIkey = parts[1].trim();
        }

        var customerName = "Khách vãng lai";
        var customerPhone = "";
        var sheetKH = ss.getSheetByName("CONG_NO_KHACH");
        if (sheetKH) {
          var lastRowKH = sheetKH.getLastRow();
          if (lastRowKH >= 3) {
            var khRows = sheetKH
              .getRange(3, 2, lastRowKH - 2, 4)
              .getDisplayValues();
            for (var c = 0; c < khRows.length; c++) {
              if (String(khRows[c][3] || "").trim() === maPhieu) {
                customerName = String(khRows[c][0] || "").trim();
                customerPhone = String(khRows[c][2] || "").trim();
                break;
              }
            }
          }
        }

        var orderData = {
          id: maPhieu,
          ngayBan:
            orderNgayBan ||
            Utilities.formatDate(new Date(), "Asia/Ho_Chi_Minh", "dd/MM/yyyy"),
          customerName: customerName,
          customerPhone: customerPhone,
          products: matchRows,
        };

        var newIkey = Utilities.getUuid().replace(/-/g, "").toLowerCase();

        // Fetch original invoice details for RelatedInvoice (TT78 requirements)
        var relatedInvoiceInfo = null;
        var detailResult = getInvoiceDetailsHSM(oldIkey);
        if (detailResult.success) {
          relatedInvoiceInfo = {
            pattern: detailResult.data.Pattern,
            serial: detailResult.data.Serial,
            no: detailResult.data.No,
            arisingDate: detailResult.data.ArisingDate,
          };
        }

        var result = replaceInvoiceHSM(
          oldIkey,
          newIkey,
          orderData,
          relatedInvoiceInfo,
        );

        if (result.success) {
          var actualRow = startRowIdx + 3;
          var mergedRowCount = matchRows.length;

          // Unmerge first if necessary
          try {
            sheet.getRange(actualRow, 13, mergedRowCount, 4).breakApart(); // M:P
          } catch (e) {}

          var actualLookupCode =
            result.lookupCode + (result.ikey ? "|IKEY:" + result.ikey : "");
          var range = sheet.getRange(actualRow, 13, 1, 4); // Columns M, N, O, P
          range.setValues([
            [
              result.invoiceNo,
              actualLookupCode,
              result.statusText,
              result.taxAuthorityCode || "",
            ],
          ]);

          if (mergedRowCount > 1) {
            sheet
              .getRange(actualRow, 13, mergedRowCount, 1)
              .merge()
              .setVerticalAlignment("middle");
            sheet
              .getRange(actualRow, 14, mergedRowCount, 1)
              .merge()
              .setVerticalAlignment("middle");
            sheet
              .getRange(actualRow, 15, mergedRowCount, 1)
              .merge()
              .setVerticalAlignment("middle");
            sheet
              .getRange(actualRow, 16, mergedRowCount, 1)
              .merge()
              .setVerticalAlignment("middle");
          }

          return { success: true, message: result.message, data: result };
        } else {
          throw new Error(result.message);
        }
      } catch (e) {
        return { success: false, message: e.message };
      }
    },
    options,
  );
}

// ===== HOMESTAY MODULE =====
var HOMESTAY_ROOM_STATUSES = {
  AVAILABLE: "Trống",
  IN_HOUSE: "Đang ở",
  CLEANING: "Đang dọn",
  BOOKED: "Đã đặt trước",
  MAINTENANCE: "Bảo trì",
};

var HOMESTAY_STAY_STATUSES = {
  BOOKED: "BOOKED",
  IN_HOUSE: "IN_HOUSE",
  CHECKED_OUT: "CHECKED_OUT",
  CANCELLED: "CANCELLED",
};

var HOMESTAY_ROOM_HEADERS = [
  "STT",
  "maPhong",
  "tenPhong",
  "loaiPhong",
  "trangThaiPhong",
  "giaTheoDem",
  "giaTheoGio",
  "soKhachToiDa",
  "ghiChu",
  "updatedAt",
];
var HOMESTAY_STAY_HEADERS = [
  "STT",
  "maLuuTru",
  "maDatPhong",
  "maPhong",
  "tenKhach",
  "soDienThoai",
  "giayTo",
  "hinhThucTinhGia",
  "checkinAt",
  "checkoutAtDuKien",
  "checkoutAtThucTe",
  "soDem",
  "soGio",
  "donGiaPhongApDung",
  "tienPhong",
  "tienDichVu",
  "tongThanhToan",
  "daThuCheckin",
  "canThuCheckout",
  "trangThaiLuuTru",
  "ghiChu",
];
var HOMESTAY_SERVICE_HEADERS = [
  "STT",
  "maLuuTru",
  "thoiGian",
  "maSanPham",
  "tenSanPham",
  "nhomHang",
  "donVi",
  "soLuong",
  "donGia",
  "thanhTien",
  "ghiChu",
];

function ensureHomestaySheet_(name, headers, seedRows) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastColumn() < headers.length) {
    sh.insertColumnsAfter(sh.getLastColumn() || 1, headers.length);
  }
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  sh.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  sh.setFrozenRows(1);
  if (sh.getLastRow() < 2 && seedRows && seedRows.length) {
    sh.getRange(2, 1, seedRows.length, headers.length).setValues(seedRows);
  }
  return sh;
}

function readHomestayRows_(sheet, headers) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var rows = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var hasVal = false;
    for (var c = 0; c < row.length; c++) {
      if (String(row[c] || "").trim()) {
        hasVal = true;
        break;
      }
    }
    if (!hasVal) continue;
    var obj = { __row: i + 2 };
    for (var h = 0; h < headers.length; h++) obj[headers[h]] = row[h];
    rows.push(obj);
  }
  return rows;
}

function writeHomestayRow_(sheet, headers, rowNumber, payload) {
  var row = [];
  for (var i = 0; i < headers.length; i++) {
    row.push(payload[headers[i]] === undefined ? "" : payload[headers[i]]);
  }
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([row]);
}

function appendHomestayRow_(sheet, headers, payload) {
  var rowNo = Math.max(2, sheet.getLastRow() + 1);
  writeHomestayRow_(sheet, headers, rowNo, payload);
  return rowNo;
}

function normalizeRoomStatus_(status) {
  var s = normalizeCompareText_(status);
  if (s.indexOf("dang o") !== -1) return HOMESTAY_ROOM_STATUSES.IN_HOUSE;
  if (s.indexOf("dang don") !== -1) return HOMESTAY_ROOM_STATUSES.CLEANING;
  if (s.indexOf("dat truoc") !== -1) return HOMESTAY_ROOM_STATUSES.BOOKED;
  if (s.indexOf("bao tri") !== -1) return HOMESTAY_ROOM_STATUSES.MAINTENANCE;
  return HOMESTAY_ROOM_STATUSES.AVAILABLE;
}

function normalizeStayStatus_(status) {
  var s = String(status || "").trim().toUpperCase();
  if (s === "IN_HOUSE") return "IN_HOUSE";
  if (s === "CHECKED_OUT") return "CHECKED_OUT";
  if (s === "CANCELLED") return "CANCELLED";
  return "BOOKED";
}

function parseIsoOrNow_(value) {
  var raw = String(value || "").trim();
  if (!raw) return new Date().toISOString();
  var d = new Date(raw);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function diffHoursRoundedUp_(startIso, endIso) {
  var s = new Date(startIso).getTime();
  var e = new Date(endIso).getTime();
  if (!isFinite(s) || !isFinite(e) || e <= s) return 1;
  return Math.max(1, Math.ceil((e - s) / 3600000));
}

function diffNightsRoundedUp_(startIso, endIso) {
  var s = new Date(startIso).getTime();
  var e = new Date(endIso).getTime();
  if (!isFinite(s) || !isFinite(e) || e <= s) return 1;
  return Math.max(1, Math.ceil((e - s) / 86400000));
}

function nextCodeFromRows_(rows, key, prefix, defaultCode) {
  var latest = "";
  for (var i = 0; i < rows.length; i++) {
    var code = String(rows[i][key] || "").trim();
    if (code.indexOf(prefix) === 0) {
      latest = code;
      break;
    }
  }
  if (!latest) latest = defaultCode;
  return incrementOrderCode_(latest, defaultCode);
}

function buildStaySummary_(stay, serviceRows) {
  var items = serviceRows.filter(function (x) {
    return String(x.maLuuTru || "").trim() === String(stay.maLuuTru || "").trim();
  });
  var tienDichVu = items.reduce(function (sum, x) {
    return sum + Number(x.thanhTien || 0);
  }, 0);
  var tienPhong = Number(stay.tienPhong || 0);
  return {
    maLuuTru: String(stay.maLuuTru || "").trim(),
    maDatPhong: String(stay.maDatPhong || "").trim(),
    maPhong: String(stay.maPhong || "").trim(),
    tenKhach: String(stay.tenKhach || "").trim(),
    soDienThoai: String(stay.soDienThoai || "").trim(),
    giayTo: String(stay.giayTo || "").trim(),
    hinhThucTinhGia: String(stay.hinhThucTinhGia || "THEO_DEM").trim(),
    checkinAt: String(stay.checkinAt || ""),
    checkoutAtDuKien: String(stay.checkoutAtDuKien || ""),
    checkoutAtThucTe: String(stay.checkoutAtThucTe || ""),
    soDem: Number(stay.soDem || 0),
    soGio: Number(stay.soGio || 0),
    donGiaPhongApDung: Number(stay.donGiaPhongApDung || 0),
    tienPhong: tienPhong,
    tienDichVu: tienDichVu,
    tongThanhToan: tienPhong + tienDichVu,
    daThuCheckin: Number(stay.daThuCheckin || 0),
    canThuCheckout: Math.max(tienDichVu, 0),
    trangThaiLuuTru: normalizeStayStatus_(stay.trangThaiLuuTru),
    ghiChu: String(stay.ghiChu || "").trim(),
    serviceItems: items.map(function (x) {
      return {
        maLuuTru: String(x.maLuuTru || "").trim(),
        thoiGian: String(x.thoiGian || ""),
        maSanPham: String(x.maSanPham || "").trim(),
        tenSanPham: String(x.tenSanPham || "").trim(),
        nhomHang: String(x.nhomHang || "").trim(),
        donVi: String(x.donVi || "").trim(),
        soLuong: Number(x.soLuong || 0),
        donGia: Number(x.donGia || 0),
        thanhTien: Number(x.thanhTien || 0),
        ghiChu: String(x.ghiChu || "").trim(),
      };
    }),
  };
}

function ensureHomestayFoundation_() {
  var sampleRooms = [
    ["1", "P101", "Phòng 101", "Deluxe", HOMESTAY_ROOM_STATUSES.AVAILABLE, 650000, 120000, 2, "", ""],
    ["2", "P102", "Phòng 102", "Standard", HOMESTAY_ROOM_STATUSES.CLEANING, 520000, 95000, 2, "", ""],
    ["3", "P201", "Phòng 201", "Family", HOMESTAY_ROOM_STATUSES.BOOKED, 880000, 160000, 4, "", ""],
    ["4", "P202", "Phòng 202", "Suite", HOMESTAY_ROOM_STATUSES.MAINTENANCE, 1200000, 250000, 3, "Đang sửa điều hòa", ""],
  ];
  var roomSheet = ensureHomestaySheet_("PHONG", HOMESTAY_ROOM_HEADERS, sampleRooms);
  var staySheet = ensureHomestaySheet_("LUU_TRU", HOMESTAY_STAY_HEADERS, []);
  var serviceSheet = ensureHomestaySheet_(
    "LUU_TRU_DICH_VU",
    HOMESTAY_SERVICE_HEADERS,
    [],
  );
  return { roomSheet: roomSheet, staySheet: staySheet, serviceSheet: serviceSheet };
}

function getRooms() {
  return withSuccessCache_("read:homestay_rooms", 15, function () {
    try {
      var foundation = ensureHomestayFoundation_();
      var rows = readHomestayRows_(foundation.roomSheet, HOMESTAY_ROOM_HEADERS);
      return {
        success: true,
        data: rows.map(function (r) {
          return {
            maPhong: String(r.maPhong || "").trim(),
            tenPhong: String(r.tenPhong || "").trim(),
            loaiPhong: String(r.loaiPhong || "").trim(),
            trangThaiPhong: normalizeRoomStatus_(r.trangThaiPhong),
            giaTheoDem: Number(r.giaTheoDem || 0),
            giaTheoGio: Number(r.giaTheoGio || 0),
            soKhachToiDa: Number(r.soKhachToiDa || 0),
            ghiChu: String(r.ghiChu || "").trim(),
            updatedAt: String(r.updatedAt || ""),
          };
        }),
      };
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message, data: [] };
    }
  });
}

function getStayHistory(filters) {
  return withSuccessCache_("read:homestay_stays", 10, function () {
    try {
      var req = filters || {};
      var foundation = ensureHomestayFoundation_();
      var stays = readHomestayRows_(foundation.staySheet, HOMESTAY_STAY_HEADERS);
      var services = readHomestayRows_(
        foundation.serviceSheet,
        HOMESTAY_SERVICE_HEADERS,
      );
      var items = stays.map(function (x) {
        return buildStaySummary_(x, services);
      });
      var keyword = normalizeCompareText_(req.keyword || "");
      var st = String(req.trangThai || "").trim().toUpperCase();
      var room = String(req.maPhong || "").trim();
      if (st) {
        items = items.filter(function (x) {
          return String(x.trangThaiLuuTru || "").toUpperCase() === st;
        });
      }
      if (room) {
        items = items.filter(function (x) {
          return String(x.maPhong || "").trim() === room;
        });
      }
      if (keyword) {
        items = items.filter(function (x) {
          var source = normalizeCompareText_(
            [x.maLuuTru, x.maPhong, x.tenKhach, x.soDienThoai].join(" "),
          );
          return source.indexOf(keyword) !== -1;
        });
      }
      items.sort(function (a, b) {
        return new Date(b.checkinAt || 0).getTime() - new Date(a.checkinAt || 0).getTime();
      });
      return { success: true, data: items };
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message, data: [] };
    }
  });
}

function createBooking(payload) {
  try {
    var req = payload || {};
    var maPhong = String(req.maPhong || "").trim();
    var tenKhach = String(req.tenKhach || "").trim();
    if (!maPhong || !tenKhach) return { success: false, message: "Thiếu mã phòng hoặc tên khách." };
    var foundation = ensureHomestayFoundation_();
    var rooms = readHomestayRows_(foundation.roomSheet, HOMESTAY_ROOM_HEADERS);
    var stays = readHomestayRows_(foundation.staySheet, HOMESTAY_STAY_HEADERS);
    var room = null;
    for (var i = 0; i < rooms.length; i++) {
      if (String(rooms[i].maPhong || "").trim() === maPhong) room = rooms[i];
    }
    if (!room) return { success: false, message: "Không tìm thấy phòng." };
    var roomStatus = normalizeRoomStatus_(room.trangThaiPhong);
    if (roomStatus === HOMESTAY_ROOM_STATUSES.IN_HOUSE)
      return { success: false, message: "Phòng đang có khách ở." };
    if (roomStatus === HOMESTAY_ROOM_STATUSES.MAINTENANCE)
      return { success: false, message: "Phòng đang bảo trì." };

    var maDatPhong = nextCodeFromRows_(stays, "maDatPhong", "BK", "BK00001");
    var maLuuTru = nextCodeFromRows_(stays, "maLuuTru", "LT", "LT00001");
    appendHomestayRow_(foundation.staySheet, HOMESTAY_STAY_HEADERS, {
      STT: "",
      maLuuTru: maLuuTru,
      maDatPhong: maDatPhong,
      maPhong: maPhong,
      tenKhach: tenKhach,
      soDienThoai: String(req.soDienThoai || "").trim(),
      giayTo: String(req.giayTo || "").trim(),
      hinhThucTinhGia: String(req.hinhThucTinhGia || "THEO_DEM").trim().toUpperCase(),
      checkinAt: "",
      checkoutAtDuKien: parseIsoOrNow_(req.checkoutAtDuKien),
      checkoutAtThucTe: "",
      soDem: 0,
      soGio: 0,
      donGiaPhongApDung: 0,
      tienPhong: 0,
      tienDichVu: 0,
      tongThanhToan: 0,
      daThuCheckin: 0,
      canThuCheckout: 0,
      trangThaiLuuTru: HOMESTAY_STAY_STATUSES.BOOKED,
      ghiChu: String(req.ghiChu || "").trim(),
    });

    room.trangThaiPhong = HOMESTAY_ROOM_STATUSES.BOOKED;
    room.updatedAt = new Date().toISOString();
    writeHomestayRow_(foundation.roomSheet, HOMESTAY_ROOM_HEADERS, room.__row, room);

    bumpAppCacheVersion_();
    return { success: true, message: "Đã đặt trước phòng.", data: { maDatPhong: maDatPhong, maLuuTru: maLuuTru } };
  } catch (e) {
    return { success: false, message: "Lỗi: " + e.message };
  }
}

function checkInRoom(payload) {
  try {
    var req = payload || {};
    var maPhong = String(req.maPhong || "").trim();
    var tenKhach = String(req.tenKhach || "").trim();
    if (!maPhong || !tenKhach) return { success: false, message: "Thiếu mã phòng hoặc tên khách." };
    var foundation = ensureHomestayFoundation_();
    var rooms = readHomestayRows_(foundation.roomSheet, HOMESTAY_ROOM_HEADERS);
    var stays = readHomestayRows_(foundation.staySheet, HOMESTAY_STAY_HEADERS);
    var room = null;
    for (var i = 0; i < rooms.length; i++) {
      if (String(rooms[i].maPhong || "").trim() === maPhong) room = rooms[i];
    }
    if (!room) return { success: false, message: "Không tìm thấy phòng." };
    var roomStatus = normalizeRoomStatus_(room.trangThaiPhong);
    if (roomStatus === HOMESTAY_ROOM_STATUSES.IN_HOUSE)
      return { success: false, message: "Phòng đang có khách ở." };
    if (roomStatus === HOMESTAY_ROOM_STATUSES.MAINTENANCE)
      return { success: false, message: "Phòng đang bảo trì." };

    var pricingType = String(req.hinhThucTinhGia || "THEO_DEM").trim().toUpperCase();
    if (pricingType !== "THEO_GIO") pricingType = "THEO_DEM";
    var checkinAt = parseIsoOrNow_(req.checkinAt);
    var checkoutAtDuKien = parseIsoOrNow_(req.checkoutAtDuKien || req.checkinAt);
    var donGia = Math.max(
      0,
      Number(req.donGiaPhongApDung || (pricingType === "THEO_GIO" ? room.giaTheoGio : room.giaTheoDem)),
    );
    var soGio = pricingType === "THEO_GIO" ? diffHoursRoundedUp_(checkinAt, checkoutAtDuKien) : 0;
    var soDem = pricingType === "THEO_DEM" ? diffNightsRoundedUp_(checkinAt, checkoutAtDuKien) : 0;
    var tienPhong = pricingType === "THEO_GIO" ? soGio * donGia : soDem * donGia;

    var bookedStay = null;
    for (var j = 0; j < stays.length; j++) {
      if (
        String(stays[j].maPhong || "").trim() === maPhong &&
        normalizeStayStatus_(stays[j].trangThaiLuuTru) === HOMESTAY_STAY_STATUSES.BOOKED
      ) {
        bookedStay = stays[j];
        break;
      }
    }
    var maLuuTru = bookedStay
      ? String(bookedStay.maLuuTru || "").trim()
      : nextCodeFromRows_(stays, "maLuuTru", "LT", "LT00001");
    var maDatPhong = bookedStay ? String(bookedStay.maDatPhong || "").trim() : "";
    var saveStay = {
      STT: "",
      maLuuTru: maLuuTru,
      maDatPhong: maDatPhong,
      maPhong: maPhong,
      tenKhach: tenKhach,
      soDienThoai: String(req.soDienThoai || "").trim(),
      giayTo: String(req.giayTo || "").trim(),
      hinhThucTinhGia: pricingType,
      checkinAt: checkinAt,
      checkoutAtDuKien: checkoutAtDuKien,
      checkoutAtThucTe: "",
      soDem: soDem,
      soGio: soGio,
      donGiaPhongApDung: donGia,
      tienPhong: tienPhong,
      tienDichVu: Number(bookedStay ? bookedStay.tienDichVu || 0 : 0),
      tongThanhToan: tienPhong + Number(bookedStay ? bookedStay.tienDichVu || 0 : 0),
      daThuCheckin: tienPhong,
      canThuCheckout: Number(bookedStay ? bookedStay.tienDichVu || 0 : 0),
      trangThaiLuuTru: HOMESTAY_STAY_STATUSES.IN_HOUSE,
      ghiChu: String(req.ghiChu || "").trim(),
    };

    if (bookedStay) {
      writeHomestayRow_(foundation.staySheet, HOMESTAY_STAY_HEADERS, bookedStay.__row, saveStay);
    } else {
      appendHomestayRow_(foundation.staySheet, HOMESTAY_STAY_HEADERS, saveStay);
    }

    room.trangThaiPhong = HOMESTAY_ROOM_STATUSES.IN_HOUSE;
    room.updatedAt = new Date().toISOString();
    writeHomestayRow_(foundation.roomSheet, HOMESTAY_ROOM_HEADERS, room.__row, room);
    appendBankTransferHistory_({
      ngay: new Date(),
      khach: tenKhach,
      soTien: tienPhong,
      noiDung: maLuuTru + " checkin",
      maDonHang: maLuuTru,
      trangThai: "Thu tiền phòng",
    });

    bumpAppCacheVersion_();
    return { success: true, message: "Checkin thành công.", data: { maLuuTru: maLuuTru } };
  } catch (e) {
    return { success: false, message: "Lỗi: " + e.message };
  }
}

function addStayServiceItem(payload) {
  try {
    var req = payload || {};
    var maLuuTru = String(req.maLuuTru || "").trim();
    if (!maLuuTru) return { success: false, message: "Thiếu mã lưu trú." };
    var foundation = ensureHomestayFoundation_();
    var stays = readHomestayRows_(foundation.staySheet, HOMESTAY_STAY_HEADERS);
    var services = readHomestayRows_(foundation.serviceSheet, HOMESTAY_SERVICE_HEADERS);
    var stay = null;
    for (var i = 0; i < stays.length; i++) {
      if (String(stays[i].maLuuTru || "").trim() === maLuuTru) stay = stays[i];
    }
    if (!stay) return { success: false, message: "Không tìm thấy hồ sơ lưu trú." };
    if (normalizeStayStatus_(stay.trangThaiLuuTru) !== HOMESTAY_STAY_STATUSES.IN_HOUSE) {
      return { success: false, message: "Phòng không ở trạng thái Đang ở." };
    }

    var maSanPham = String(req.maSanPham || "").trim();
    var tenSanPham = String(req.tenSanPham || "").trim();
    var sp = null;
    var catalog = getProductCatalog();
    if (catalog && catalog.success && Array.isArray(catalog.data)) {
      for (var c = 0; c < catalog.data.length; c++) {
        if (
          (maSanPham && String(catalog.data[c].maSanPham || "").trim() === maSanPham) ||
          (tenSanPham && String(catalog.data[c].tenSanPham || "").trim() === tenSanPham)
        ) {
          sp = catalog.data[c];
          break;
        }
      }
    }
    if (!sp) return { success: false, message: "Không tìm thấy dịch vụ/món trong SAN_PHAM." };
    var soLuong = Math.max(1, Number(req.soLuong || 1));
    var donGia = Math.max(0, Number(req.donGia || sp.donGiaBan || 0));
    var thanhTien = soLuong * donGia;
    appendHomestayRow_(foundation.serviceSheet, HOMESTAY_SERVICE_HEADERS, {
      STT: "",
      maLuuTru: maLuuTru,
      thoiGian: new Date().toISOString(),
      maSanPham: String(sp.maSanPham || "").trim(),
      tenSanPham: String(sp.tenSanPham || "").trim(),
      nhomHang: String(sp.nhomHang || "").trim(),
      donVi: String(sp.donVi || "").trim(),
      soLuong: soLuong,
      donGia: donGia,
      thanhTien: thanhTien,
      ghiChu: String(req.ghiChu || "").trim(),
    });

    services = readHomestayRows_(foundation.serviceSheet, HOMESTAY_SERVICE_HEADERS);
    var summary = buildStaySummary_(stay, services);
    stay.tienDichVu = summary.tienDichVu;
    stay.tongThanhToan = summary.tongThanhToan;
    stay.canThuCheckout = summary.canThuCheckout;
    writeHomestayRow_(foundation.staySheet, HOMESTAY_STAY_HEADERS, stay.__row, stay);

    bumpAppCacheVersion_();
    return { success: true, message: "Đã thêm dịch vụ phát sinh.", data: summary };
  } catch (e) {
    return { success: false, message: "Lỗi: " + e.message };
  }
}

function checkoutRoom(payload) {
  try {
    var req = payload || {};
    var maLuuTru = String(req.maLuuTru || "").trim();
    if (!maLuuTru) return { success: false, message: "Thiếu mã lưu trú." };
    var foundation = ensureHomestayFoundation_();
    var stays = readHomestayRows_(foundation.staySheet, HOMESTAY_STAY_HEADERS);
    var services = readHomestayRows_(foundation.serviceSheet, HOMESTAY_SERVICE_HEADERS);
    var rooms = readHomestayRows_(foundation.roomSheet, HOMESTAY_ROOM_HEADERS);
    var stay = null;
    for (var i = 0; i < stays.length; i++) {
      if (String(stays[i].maLuuTru || "").trim() === maLuuTru) stay = stays[i];
    }
    if (!stay) return { success: false, message: "Không tìm thấy hồ sơ lưu trú." };
    if (normalizeStayStatus_(stay.trangThaiLuuTru) !== HOMESTAY_STAY_STATUSES.IN_HOUSE) {
      return { success: false, message: "Hồ sơ lưu trú không ở trạng thái Đang ở." };
    }
    var summary = buildStaySummary_(stay, services);
    stay.checkoutAtThucTe = parseIsoOrNow_(req.checkoutAtThucTe);
    stay.trangThaiLuuTru = HOMESTAY_STAY_STATUSES.CHECKED_OUT;
    stay.tienDichVu = summary.tienDichVu;
    stay.tongThanhToan = summary.tongThanhToan;
    stay.canThuCheckout = summary.canThuCheckout;
    stay.ghiChu = String(req.ghiChu || stay.ghiChu || "").trim();
    writeHomestayRow_(foundation.staySheet, HOMESTAY_STAY_HEADERS, stay.__row, stay);

    for (var r = 0; r < rooms.length; r++) {
      if (String(rooms[r].maPhong || "").trim() === String(stay.maPhong || "").trim()) {
        rooms[r].trangThaiPhong = HOMESTAY_ROOM_STATUSES.CLEANING;
        rooms[r].updatedAt = new Date().toISOString();
        writeHomestayRow_(foundation.roomSheet, HOMESTAY_ROOM_HEADERS, rooms[r].__row, rooms[r]);
      }
    }
    if (summary.canThuCheckout > 0) {
      appendBankTransferHistory_({
        ngay: new Date(),
        khach: String(stay.tenKhach || "").trim(),
        soTien: summary.canThuCheckout,
        noiDung: maLuuTru + " checkout",
        maDonHang: maLuuTru,
        trangThai: "Thu tiền phát sinh",
      });
    }

    bumpAppCacheVersion_();
    return { success: true, message: "Checkout thành công.", data: summary };
  } catch (e) {
    return { success: false, message: "Lỗi: " + e.message };
  }
}

function updateRoomStatus(payload) {
  try {
    var req = payload || {};
    var maPhong = String(req.maPhong || "").trim();
    var trangThaiPhong = String(req.trangThaiPhong || "").trim();
    if (!maPhong || !trangThaiPhong) return { success: false, message: "Thiếu mã phòng hoặc trạng thái." };
    var foundation = ensureHomestayFoundation_();
    var rooms = readHomestayRows_(foundation.roomSheet, HOMESTAY_ROOM_HEADERS);
    for (var i = 0; i < rooms.length; i++) {
      if (String(rooms[i].maPhong || "").trim() === maPhong) {
        rooms[i].trangThaiPhong = normalizeRoomStatus_(trangThaiPhong);
        rooms[i].updatedAt = new Date().toISOString();
        rooms[i].ghiChu = String(req.ghiChu || rooms[i].ghiChu || "").trim();
        writeHomestayRow_(foundation.roomSheet, HOMESTAY_ROOM_HEADERS, rooms[i].__row, rooms[i]);
        bumpAppCacheVersion_();
        return { success: true, message: "Đã cập nhật trạng thái phòng.", data: rooms[i] };
      }
    }
    return { success: false, message: "Không tìm thấy phòng." };
  } catch (e) {
    return { success: false, message: "Lỗi: " + e.message };
  }
}

/* CLIENT_API_WRAPPERS */
const loginClient = (email, password, appScope) =>
  call("login", email, password, appScope);
const loginWithDeviceTokenClient = (deviceToken, appScope) =>
  call("loginWithDeviceToken", deviceToken, appScope);
const revokeDeviceTokenClient = (deviceToken, appScope) =>
  call("revokeDeviceToken", deviceToken, appScope);
const getUserInfoClient = (email) => call("getUserInfo", email);
const getDemoAccountsClient = () => call("getDemoAccounts");
const getGlobalNoticeClient = () => call("getGlobalNotice");
const getSyncVersionClient = () => call("getSyncVersion");
const getNextOrderFormDefaultsClient = () => call("getNextOrderFormDefaults");
const issueEasyInvoiceClient = (payload) => call("issueEasyInvoice", payload);
const cancelEasyInvoiceClient = (payload) => call("cancelEasyInvoice", payload);
const replaceEasyInvoiceClient = (payload) =>
  call("replaceEasyInvoice", payload);
const downloadInvoicePDFClient = (payload) =>
  call("downloadInvoicePDF", payload);
const getNextInventoryReceiptDefaultsClient = () =>
  call("getNextInventoryReceiptDefaults");
const getProductCatalogClient = () => call("getProductCatalog");
const getBankConfigClient = () => call("getBankConfig");
const getRoomsClient = () => call("getRooms");
const getStayHistoryClient = (filters) => call("getStayHistory", filters || {});
const createBookingClient = (payload) => call("createBooking", payload);
const checkInRoomClient = (payload) => call("checkInRoom", payload);
const addStayServiceItemClient = (payload) => call("addStayServiceItem", payload);
const checkoutRoomClient = (payload) => call("checkoutRoom", payload);
const updateRoomStatusClient = (payload) => call("updateRoomStatus", payload);
const updateProductCatalogItemClient = (payload) =>
  call("updateProductCatalogItem", payload);
const createProductCatalogItemClient = (payload) =>
  call("createProductCatalogItem", payload);
const deleteProductCatalogItemClient = (payload) =>
  call("deleteProductCatalogItem", payload);
const getInventorySuggestionsClient = () => call("getInventorySuggestions");
const getCustomerCatalogClient = () => call("getCustomerCatalog");
const getSupplierCatalogClient = () => call("getSupplierCatalog");
const getDebtCustomersClient = () => call("getDebtCustomers");
const updateDebtCustomerClient = (payload) =>
  call("updateDebtCustomer", payload);
const settleAllDebtCustomersClient = () => call("settleAllDebtCustomers");
const getOrderHistoryClient = () => call("getOrderHistory");
const createReceiptPdfClient = (maPhieu) => call("createReceiptPdf", maPhieu);
const updateOrderClient = (payload) => call("updateOrder", payload);
const deleteOrderClient = (maPhieu) => call("deleteOrder", maPhieu);
const getSupplierDebtsClient = () => call("getSupplierDebts");
const updateSupplierDebtClient = (payload) =>
  call("updateSupplierDebt", payload);
const uploadImageToImgBBClient = (base64Data) =>
  call("uploadImageToImgBB", base64Data);

export const gasAdapter = {
  call,
  login: loginClient,
  loginWithDeviceToken: loginWithDeviceTokenClient,
  revokeDeviceToken: revokeDeviceTokenClient,
  getUserInfo: getUserInfoClient,
  getDemoAccounts: getDemoAccountsClient,
  getGlobalNotice: getGlobalNoticeClient,
  getSyncVersion: getSyncVersionClient,
  getNextOrderFormDefaults: getNextOrderFormDefaultsClient,
  getNextInventoryReceiptDefaults: getNextInventoryReceiptDefaultsClient,
  getProductCatalog: getProductCatalogClient,
  getBankConfig: getBankConfigClient,
  getRooms: getRoomsClient,
  getStayHistory: getStayHistoryClient,
  createBooking: createBookingClient,
  checkInRoom: checkInRoomClient,
  addStayServiceItem: addStayServiceItemClient,
  checkoutRoom: checkoutRoomClient,
  updateRoomStatus: updateRoomStatusClient,
  updateProductCatalogItem: updateProductCatalogItemClient,
  createProductCatalogItem: createProductCatalogItemClient,
  deleteProductCatalogItem: deleteProductCatalogItemClient,
  getCustomerCatalog: getCustomerCatalogClient,
  getSupplierCatalog: getSupplierCatalogClient,
  getDebtCustomers: getDebtCustomersClient,
  updateDebtCustomer: updateDebtCustomerClient,
  settleAllDebtCustomers: settleAllDebtCustomersClient,
  getOrderHistory: getOrderHistoryClient,
  createReceiptPdf: createReceiptPdfClient,
  createOrder: (orderData) => call("createOrder", orderData),
  getInventorySuggestions: getInventorySuggestionsClient,
  createInventoryReceipt: (payload) => call("createInventoryReceipt", payload),
  updateOrder: updateOrderClient,
  deleteOrder: deleteOrderClient,
  getInventory: () => call("getInventory"),
  getReceiptHistory: () => call("getReceiptHistory"),
  getAppSetting: (key) => call("getAppSetting", key),
  setAppSetting: (payload) => call("setAppSetting", payload),
  getSupplierDebts: getSupplierDebtsClient,
  updateSupplierDebt: updateSupplierDebtClient,
  uploadImageToImgBB: uploadImageToImgBBClient,
  issueEasyInvoice: issueEasyInvoiceClient,
  cancelEasyInvoice: cancelEasyInvoiceClient,
  replaceEasyInvoice: replaceEasyInvoiceClient,
  downloadInvoicePDF: downloadInvoicePDFClient,
  logAction: (payload) => call("logAction", payload),
  formatAllSheets: () => call("formatAllSheets"),
};

// === BACKGROUND FORMATTING TASKS ===
// Chạy hàm này thủ công 1 lần để cài script tự động dọn dẹp format (STT, Merge rows)
// mỗi 1 phút / 5 phút trên server, không làm nghẽn client.
function setupFormattingTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  var exists = triggers.some(function (t) {
    return t.getHandlerFunction() === "formatAllSheets_";
  });
  if (!exists) {
    ScriptApp.newTrigger("formatAllSheets_")
      .timeBased()
      .everyMinutes(1)
      .create();
    return "Đã cài đặt Trigger chạy formatAllSheets_ mỗi 1 phút.";
  }
  return "Trigger đã tồn tại.";
}

// Client-callable function
function formatAllSheets() {
  return formatAllSheets_();
}

function formatAllSheets_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var sheetDH = ss.getSheetByName("DON_HANG");
  if (sheetDH) {
    updateSTT_(sheetDH, 3);
    clearOrderMerges_(sheetDH);
    rebuildOrderMerges_(sheetDH);
    // Optional: Re-apply status data validation if needed
    var ruleDH = getStatusRuleFromSheet_(sheetDH, 12, 3);
    applyKnownStatusValidation_(
      sheetDH,
      3,
      sheetDH.getLastRow() - 2,
      12,
      ruleDH,
    );
  }

  var sheetKH = ss.getSheetByName("CONG_NO_KHACH");
  if (sheetKH) updateSTT_(sheetKH, 3);

  var sheetNhap = ss.getSheetByName("NHAP_HANG");
  if (sheetNhap) {
    clearReceiptMerges_(sheetNhap);
    rebuildReceiptMerges_(sheetNhap);
  }

  var sheetNCC = ss.getSheetByName("CONG_NO_NCC");
  if (sheetNCC) updateSTT_(sheetNCC, 3);

  var sheetBank = ss.getSheetByName("BANK");
  if (sheetBank) updateSTT_(sheetBank, 8);

  var sheetKho =
    ss.getSheetByName("QUAN_LY_KHO") || ss.getSheetByName("QUẢN LÝ KHO");
  if (sheetKho) updateSTT_(sheetKho, 3);

  var sheetSP = ss.getSheetByName("SAN_PHAM");
  if (sheetSP) updateSTT_(sheetSP, 3);

  return { success: true, message: "Đã format lại các sheet" };
}

// ===== Action Log =====

function sendErrorEmailNotification_(
  userName,
  changeDescription,
  errorMessage,
) {
  if (!ERROR_MAIL_CONFIG.enable) return;
  try {
    var toEmail =
      ERROR_MAIL_CONFIG.developerEmail || Session.getEffectiveUser().getEmail();
    if (!toEmail) return;

    var ssUrl = "";
    try {
      ssUrl = SpreadsheetApp.getActiveSpreadsheet().getUrl();
    } catch (e) {
      ssUrl = "Không lấy được link";
    }

    var subject = "⚠️ [System Error] Dự án: " + ERROR_MAIL_CONFIG.projectName;
    var body =
      "Phát hiện lỗi trong hệ thống dự án Apps Script:\n\n" +
      "- Tên dự án: " +
      ERROR_MAIL_CONFIG.projectName +
      "\n" +
      "- Tên khách hàng: " +
      ERROR_MAIL_CONFIG.customerName +
      "\n" +
      "- Link liên hệ khách hàng: " +
      ERROR_MAIL_CONFIG.customerLink +
      "\n" +
      "- Link Sheet dự án: " +
      ssUrl +
      "\n\n" +
      "=== THEO DÕI LỖI ===\n" +
      "- Người dùng thao tác: " +
      userName +
      "\n" +
      "- Hành động đang thao tác: " +
      changeDescription +
      "\n" +
      "- Chi tiết thông báo lỗi: " +
      errorMessage +
      "\n\n" +
      "Vui lòng vào Sheet dự án hoặc xem Log để kiểm tra, khắc phục lỗi hệ thống.";

    MailApp.sendEmail({
      to: toEmail,
      subject: subject,
      body: body,
    });
  } catch (e) {
    Logger.log("Không thể gửi email cảnh báo: " + e.message);
  }
}

function getOrCreateLogSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Log");
  if (sheet) return sheet;

  sheet = ss.insertSheet("Log");
  sheet
    .getRange(1, 1, 1, 5)
    .setValues([
      ["Ngày giờ", "Người dùng", "Thay đổi", "Trạng thái", "Thông báo lỗi"],
    ]);
  sheet.getRange(1, 1, 1, 5).setFontWeight("bold").setBackground("#f1f5f9");
  sheet.setColumnWidth(1, 160);
  sheet.setColumnWidth(2, 120);
  sheet.setColumnWidth(3, 350);
  sheet.setColumnWidth(4, 100);
  sheet.setColumnWidth(5, 300);
  return sheet;
}

function logAction(payload) {
  try {
    var p = payload || {};
    var userName = String(p.userName || "unknown").trim();
    var changeDescription = String(p.changeDescription || "").trim();
    var status = String(p.status || "SUCCESS")
      .trim()
      .toUpperCase();
    var errorMessage = String(p.errorMessage || "").trim();

    var tz = Session.getScriptTimeZone() || "Asia/Ho_Chi_Minh";
    var timestamp = Utilities.formatDate(new Date(), tz, "d.M.yyyy H:mm:ss");

    var sheet = getOrCreateLogSheet_();
    var lastRow = sheet.getLastRow();
    var newRow = lastRow + 1;

    if (newRow > sheet.getMaxRows()) {
      sheet.insertRowsAfter(sheet.getMaxRows(), 1);
    }

    sheet
      .getRange(newRow, 1, 1, 5)
      .setValues([
        [timestamp, userName, changeDescription, status, errorMessage],
      ]);

    // Color code the status cell
    var statusCell = sheet.getRange(newRow, 4);
    if (status === "SUCCESS") {
      statusCell.setFontColor("#16a34a");
    } else if (status === "ERROR") {
      statusCell.setFontColor("#dc2626").setFontWeight("bold");

      // Gửi warning email
      sendErrorEmailNotification_(userName, changeDescription, errorMessage);
    }

    return { success: true };
  } catch (e) {
    return { success: false, message: e.message };
  }
}
