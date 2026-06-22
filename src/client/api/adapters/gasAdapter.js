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

const isGasRuntime = () =>
  Boolean(window.google?.script?.run) ||
  /script\.google\.com$/i.test(String(window.location?.hostname || ""));

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
  try {
    const params = new URLSearchParams({
      fn: fnName,
      args: JSON.stringify(args),
    });
    const res = await fetch(`/gas-proxy?${params}`);
    if (!res.ok) {
      return {
        success: false,
        message: `GAS proxy lỗi HTTP ${res.status}`,
        code: "GAS_PROXY_HTTP_ERROR",
      };
    }
    const text = await res.text();
    if (text.trimStart().startsWith("<")) {
      return {
        success: false,
        message:
          "GAS trả về HTML thay vì JSON. Kiểm tra cấu hình VITE_GAS_WEBAPP_URL và quyền deploy Web App (Anyone).",
        code: "GAS_PROXY_HTML_RESPONSE",
      };
    }
    return JSON.parse(text);
  } catch (error) {
    return {
      success: false,
      message: `Lỗi gọi GAS proxy: ${error?.message || "unknown"}`,
      code: "GAS_CALL_ERROR",
    };
  }
}

const call = async (fnName, ...args) => {
  try {
    if (args.length > 0 && typeof args[0] === "object" && args[0] !== null) {
      try {
        const rawAuth = window.localStorage.getItem("soanhang.auth.user");
        console.log("[Call] Đọc auth từ localStorage, key: soanhang.auth.user, tồn tại:", !!rawAuth);
        if (rawAuth) {
          const authData = JSON.parse(rawAuth);
          console.log("[Call] Auth data keys:", Object.keys(authData || {}));
          if (authData?.deviceToken) {
            args[0] = { ...args[0], __deviceToken: authData.deviceToken };
            console.log("[Call] Đã gắn deviceToken, độ dài:", authData.deviceToken.length);
          } else {
            console.log("[Call] CẢNH BÁO: authData.deviceToken không tồn tại");
          }
        } else {
          console.log("[Call] CẢNH BÁO: rawAuth không tồn tại trong localStorage");
        }
      } catch (e) {
        console.log("[Call] Lỗi đọc auth:", e.message);
      }
    }
    if (isGasRuntime() || !IS_DEV) {
      return await gasRun(fnName, ...args);
    }
    return await gasFetch(fnName, ...args);
  } catch (error) {
    return {
      success: false,
      message: `Lỗi gọi GAS: ${error?.message || error || "unknown"}`,
      code: "GAS_CALL_ERROR",
      error: String(error?.message || error || ""),
    };
  }
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
var AUTH_SESSION_MAP_PREFIX = "auth_session_map";
var AUTH_HOST_SECRET_PROP = "HOST_ASSERTION_SECRET";
var AUTH_NONCE_CACHE_PREFIX = "AUTH_NONCE_V1:";
var AUTH_HOST_ASSERTION_MAX_SKEW_MS = 2 * 60 * 1000;
var AUTH_NONCE_TTL_MS = 5 * 60 * 1000;

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

function decodeBase64WebSafeString_(value) {
  var bytes = Utilities.base64DecodeWebSafe(String(value || ""));
  return Utilities.newBlob(bytes).getDataAsString("UTF-8");
}

function encodeBase64WebSafeNoPadding_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, "");
}

function parseJsonSafe_(value) {
  try {
    return JSON.parse(String(value || ""));
  } catch (e) {
    return null;
  }
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

function getSessionKey_() {
  try {
    return String(Session.getTemporaryActiveUserKey() || "").trim();
  } catch (e) {
    return "";
  }
}

function buildSessionMapPropertyKey_(scope, sessionKey) {
  return (
    AUTH_SESSION_MAP_PREFIX +
    ":" +
    normalizeAppScope_(scope) +
    ":" +
    String(sessionKey || "").trim()
  );
}

function setSessionMappedEmail_(scope, sessionKey, email) {
  var sk = String(sessionKey || "").trim();
  var em = String(email || "").trim().toLowerCase();
  if (!sk || !em) return;
  PropertiesService.getScriptProperties().setProperty(
    buildSessionMapPropertyKey_(scope, sk),
    em,
  );
}

function getSessionMappedEmail_(scope, sessionKey) {
  var sk = String(sessionKey || "").trim();
  if (!sk) return "";
  return (
    PropertiesService.getScriptProperties().getProperty(
      buildSessionMapPropertyKey_(scope, sk),
    ) || ""
  );
}

function clearSessionMappedEmail_(scope, sessionKey) {
  var sk = String(sessionKey || "").trim();
  if (!sk) return;
  PropertiesService.getScriptProperties().deleteProperty(
    buildSessionMapPropertyKey_(scope, sk),
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
      setSessionMappedEmail_(appScope, getSessionKey_(), user.email);
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
    setSessionMappedEmail_(appScope, getSessionKey_(), user.email);

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

function loginWithSessionKey(appScope) {
  try {
    var scope = normalizeAppScope_(appScope);
    var sessionKey = getSessionKey_();
    if (!sessionKey) {
      return { success: false, message: "Không đọc được session key." };
    }
    var mappedEmail = String(getSessionMappedEmail_(scope, sessionKey) || "").trim();
    if (!mappedEmail) {
      return { success: false, message: "Session chưa được ghi nhớ." };
    }

    var user = readUserByEmail_(mappedEmail);
    if (!user) {
      clearSessionMappedEmail_(scope, sessionKey);
      return { success: false, message: "Tài khoản không còn tồn tại." };
    }

    var issued = issueDeviceTokenForUser_(user, scope);
    setSessionMappedEmail_(scope, sessionKey, user.email);
    return {
      success: true,
      data: buildAuthUserData_(user, issued.token, issued.expiresAt),
      message: "Khôi phục đăng nhập theo session thành công!",
    };
  } catch (e) {
    return { success: false, message: "Lỗi: " + e.message };
  }
}

function loginWithHostAssertion(assertion, appScope, nonce, ts) {
  try {
    var scope = normalizeAppScope_(appScope);
    var verifyResult = verifyHostAssertion_(assertion, scope, nonce, ts);
    if (!verifyResult.success) return verifyResult;

    var email = String(verifyResult?.data?.email || "").trim();
    if (!email) return { success: false, message: "Assertion thiếu email" };

    var user = readUserByEmail_(email);
    if (!user) {
      return { success: false, message: "Assertion hợp lệ nhưng email không tồn tại" };
    }

    var issued = issueDeviceTokenForUser_(user, scope);
    setSessionMappedEmail_(scope, getSessionKey_(), user.email);
    return {
      success: true,
      data: buildAuthUserData_(user, issued.token, issued.expiresAt),
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

function revokeSessionLogin(appScope) {
  try {
    clearSessionMappedEmail_(appScope, getSessionKey_());
    return { success: true };
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
  // Trả về US format "MM/DD/yyyy" để lưu xuống sheet
  var now = new Date();
  var m = String(now.getMonth() + 1).padStart(2, "0");
  var day = String(now.getDate()).padStart(2, "0");
  var y = now.getFullYear();
  return m + "/" + day + "/" + y;
}

function helloServer() {
  return {
    success: true,
    message: "GAS server is running",
    timestamp: getNowVnDateTime_(),
  };
}

function formatDateTimeVn24_(dateValue) {
  // Trả về VN format "HH:mm DD/MM/yyyy" (dd/MM/yyyy)
  var d = dateValue instanceof Date ? dateValue : new Date(dateValue || new Date());
  if (!(d instanceof Date) || isNaN(d.getTime())) d = new Date();
  var m = String(d.getMonth() + 1).padStart(2, "0");
  var day = String(d.getDate()).padStart(2, "0");
  var y = d.getFullYear();
  var h = String(d.getHours()).padStart(2, "0");
  var min = String(d.getMinutes()).padStart(2, "0");
  return h + ":" + min + " " + day + "/" + m + "/" + y;
}

function getNowVnDateTime_() {
  // Trả về VN format "HH:mm DD/MM/yyyy" (dd/MM/yyyy)
  return formatDateTimeVn24_(new Date());
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

// Rule 17: Parse date/datetime từ Sheet (Date object hoặc string) → luôn trả về string "DD/MM/YYYY" hoặc "DD/MM/YYYY HH:mm:ss"
function parseSheetDateToLocalString_(raw) {
  if (raw instanceof Date) {
    if (!Number.isNaN(raw.getTime())) {
      var y = raw.getFullYear();
      var m = String(raw.getMonth() + 1).padStart(2, "0");
      var d = String(raw.getDate()).padStart(2, "0");
      return d + "/" + m + "/" + y;
    }
    return "";
  }
  return String(raw || "").trim();
}

// Parse datetime: trả về "DD/MM/YYYY HH:mm:ss"
function parseSheetDateTimeToLocalString_(raw) {
  if (raw instanceof Date) {
    if (!Number.isNaN(raw.getTime())) {
      var y = raw.getFullYear();
      var m = String(raw.getMonth() + 1).padStart(2, "0");
      var d = String(raw.getDate()).padStart(2, "0");
      var h = String(raw.getHours()).padStart(2, "0");
      var min = String(raw.getMinutes()).padStart(2, "0");
      var s = String(raw.getSeconds()).padStart(2, "0");
      return d + "/" + m + "/" + y + " " + h + ":" + min + ":" + s;
    }
    return "";
  }
  return String(raw || "").trim();
}

// ============================================================
// US DATE FORMAT HELPERS - Rule 17 Compliance
// Format: "HH:mm MM/DD/YYYY" (datetime) hoặc "MM/DD/YYYY" (date)
// ============================================================

// Parse date/datetime từ Sheet → trả về US format "HH:mm MM/DD/YYYY" hoặc "MM/DD/YYYY"
function parseSheetDateToUsString_(raw) {
  if (!raw || raw === "") return "";
  
  // Xử lý Date object
  if (raw instanceof Date) {
    if (!Number.isNaN(raw.getTime())) {
      var y = raw.getFullYear();
      var m = String(raw.getMonth() + 1).padStart(2, "0");
      var d = String(raw.getDate()).padStart(2, "0");
      return m + "/" + d + "/" + y; // "MM/DD/YYYY"
    }
    return "";
  }
  
  var s = String(raw || "").trim();
  if (!s) return "";
  
  // Đã là US format rồi (MM/DD/YYYY) - detect bằng dấu /
  var parts = s.split(/\s+/);
  if (parts.length > 0 && parts[0].indexOf("/") > -1) {
    var dateParts = parts[0].split("/");
    if (dateParts.length === 3) {
      // Kiểm tra xem có phải US format không (tháng <= 12)
      var p0 = parseInt(dateParts[0], 10);
      var p1 = parseInt(dateParts[1], 10);
      if (p0 >= 1 && p0 <= 12 && p1 >= 1 && p1 <= 31) {
        return s; // Đã đúng format
      }
    }
  }
  
  // Parse từ VN format "DD/MM/YYYY" hoặc "DD/MM/YYYY HH:mm:ss"
  var vnMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (vnMatch) {
    var day = vnMatch[1].padStart(2, "0");
    var month = vnMatch[2].padStart(2, "0");
    var year = vnMatch[3];
    var time = "";
    if (vnMatch[4]) {
      var hour = vnMatch[4].padStart(2, "0");
      var min = (vnMatch[5] || "00").padStart(2, "0");
      time = hour + ":" + min;
      if (vnMatch[6]) time += ":" + vnMatch[6].padStart(2, "0");
    }
    return time ? (time + " " + month + "/" + day + "/" + year) : (month + "/" + day + "/" + year);
  }
  
  // Parse ISO format hoặc serial number
  try {
    var d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      var y = d.getFullYear();
      var m = String(d.getMonth() + 1).padStart(2, "0");
      var day = String(d.getDate()).padStart(2, "0");
      return m + "/" + day + "/" + y;
    }
  } catch (e) {}
  
  // Serial number (Google Sheets date)
  if (/^\d+(\.\d+)?$/.test(s)) {
    try {
      var serial = parseFloat(s);
      // Google Sheets serial date: days since Dec 30, 1899
      var ms = (serial - 25569) * 86400 * 1000;
      var dateObj = new Date(ms);
      if (!Number.isNaN(dateObj.getTime())) {
        var y = dateObj.getFullYear();
        var m = String(dateObj.getMonth() + 1).padStart(2, "0");
        var day = String(dateObj.getDate()).padStart(2, "0");
        return m + "/" + day + "/" + y;
      }
    } catch (e) {}
  }
  
  return s;
}

// Parse datetime từ Sheet → trả về US format "HH:mm MM/DD/YYYY"
function parseSheetDateTimeToVnString_(raw) {
  // Chuyển đổi bất kỳ datetime format nào sang VN "HH:mm DD/MM/yyyy"
  // Hỗ trợ: Date object, HH:mm DD/MM/YYYY, DD/MM/YYYY HH:mm, MM/DD/YYYY HH:mm, ISO...
  if (!raw || raw === "") return "";

  // Xử lý Date object (từ Google Sheets)
  if (raw instanceof Date) {
    if (!Number.isNaN(raw.getTime())) {
      var y = raw.getFullYear();
      var m = String(raw.getMonth() + 1).padStart(2, "0");
      var day = String(raw.getDate()).padStart(2, "0");
      var h = String(raw.getHours()).padStart(2, "0");
      var min = String(raw.getMinutes()).padStart(2, "0");
      return h + ":" + min + " " + day + "/" + m + "/" + y;
    }
    return "";
  }

  var s = String(raw || "").trim();
  if (!s) return "";

  // Format 1: "HH:mm DD/MM/YYYY" (VN datetime mới) - đã đúng
  var m1 = s.match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) {
    var h = m1[1].padStart(2, "0");
    var min = m1[2].padStart(2, "0");
    var day = m1[3].padStart(2, "0");
    var m = m1[4].padStart(2, "0");
    var y = m1[5];
    return h + ":" + min + " " + day + "/" + m + "/" + y;
  }

  // Format 2: "HH:mm MM/DD/YYYY" (US datetime) -> chuyển sang VN
  var m2 = s.match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m2) {
    var h = m2[1].padStart(2, "0");
    var min = m2[2].padStart(2, "0");
    var m = m2[3].padStart(2, "0");  // US: month
    var day = m2[4].padStart(2, "0"); // US: day
    var y = m2[5];
    return h + ":" + min + " " + day + "/" + m + "/" + y;
  }

  // Format 3: "DD/MM/YYYY HH:mm" (VN datetime ngược) -> chuyển sang VN
  var m3 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m3) {
    var day = m3[1].padStart(2, "0");
    var m = m3[2].padStart(2, "0");
    var y = m3[3];
    var h = m3[4].padStart(2, "0");
    var min = m3[5].padStart(2, "0");
    return h + ":" + min + " " + day + "/" + m + "/" + y;
  }

  // Format 4: "DD/MM/YYYY" (chỉ ngày, không có giờ)
  var m4 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m4) {
    var day = m4[1].padStart(2, "0");
    var m = m4[2].padStart(2, "0");
    var y = m4[3];
    return "00:00 " + day + "/" + m + "/" + y;
  }

  // Format 5: "MM/DD/YYYY" (US date only)
  var m5 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m5) {
    var m = m5[1].padStart(2, "0");
    var day = m5[2].padStart(2, "0");
    var y = m5[3];
    return "00:00 " + day + "/" + m + "/" + y;
  }

  // Format 6: ISO "YYYY-MM-DD HH:mm" hoặc "YYYY-MM-DD"
  var m6 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m6) {
    var y = m6[1];
    var m = m6[2].padStart(2, "0");
    var day = m6[3].padStart(2, "0");
    var h = m6[4] ? m6[4].padStart(2, "0") : "00";
    var min = m6[5] ? m6[5].padStart(2, "0") : "00";
    return h + ":" + min + " " + day + "/" + m + "/" + y;
  }

  // Format 7: Google Sheets Date object (serial number)
  var num = Number(s);
  if (!isNaN(num) && num > 25000 && num < 60000) {
    try {
      var d = new Date((num - 25569) * 86400 * 1000);
      if (!isNaN(d.getTime())) {
        var y = d.getFullYear();
        var m = String(d.getMonth() + 1).padStart(2, "0");
        var day = String(d.getDate()).padStart(2, "0");
        var h = String(d.getHours()).padStart(2, "0");
        var min = String(d.getMinutes()).padStart(2, "0");
        return h + ":" + min + " " + day + "/" + m + "/" + y;
      }
    } catch (e) {}
  }

  // Fallback: trả về nguyên dạng nếu không parse được
  return s;
}

// Chuyển date string từ payload FE (US format) sang Date object để lưu sheet
function parseUsDateTimeToDate_(value) {
  if (!value || value === "") return null;
  
  var s = String(value).trim();
  
  // Parse "HH:mm MM/DD/YYYY" hoặc "MM/DD/YYYY"
  var match = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    var hour = parseInt(match[1], 10);
    var min = parseInt(match[2], 10);
    var sec = match[3] ? parseInt(match[3], 10) : 0;
    var month = parseInt(match[4], 10) - 1;
    var day = parseInt(match[5], 10);
    var year = parseInt(match[6], 10);
    return new Date(year, month, day, hour, min, sec);
  }
  
  // Chỉ có date "MM/DD/YYYY"
  var dateMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dateMatch) {
    var month = parseInt(dateMatch[1], 10) - 1;
    var day = parseInt(dateMatch[2], 10);
    var year = parseInt(dateMatch[3], 10);
    return new Date(year, month, day);
  }
  
  // Fallback: thử parse trực tiếp
  try {
    var d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d;
  } catch (e) {}
  
  return null;
}

// Format ngày hiện tại sang US format để lưu sheet
function getNowUsDateTime_() {
  var now = new Date();
  var y = now.getFullYear();
  var m = String(now.getMonth() + 1).padStart(2, "0");
  var day = String(now.getDate()).padStart(2, "0");
  var h = String(now.getHours()).padStart(2, "0");
  var min = String(now.getMinutes()).padStart(2, "0");
  var s = String(now.getSeconds()).padStart(2, "0");
  return h + ":" + min + " " + m + "/" + day + "/" + y;
}

// Format ngày hiện tại sang US date format (không có time)
function getNowUsDate_() {
  var now = new Date();
  var y = now.getFullYear();
  var m = String(now.getMonth() + 1).padStart(2, "0");
  var day = String(now.getDate()).padStart(2, "0");
  return m + "/" + day + "/" + y;
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

function buildCatalogProductCode_(tenSanPham, donVi) {
  var base = normalizeProductKeyPart_(tenSanPham || "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
  var unit = normalizeProductKeyPart_(donVi || "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
  return "SP-" + (base || "ITEM") + (unit ? "-" + unit : "");
}

function buildServiceItemIdentity_(item) {
  var maPhien = String(item && item.maPhien ? item.maPhien : "").trim();
  var thoiGian = String(item && item.thoiGian ? item.thoiGian : "").trim();
  var maSanPham = String(item && item.maSanPham ? item.maSanPham : "").trim();
  var tenSanPham = normalizeProductKeyPart_(item && item.tenSanPham ? item.tenSanPham : "");
  return "svc|" + maPhien + "|" + thoiGian + "|" + (maSanPham || tenSanPham);
}

function resolveServiceItemRow_(serviceItems, req) {
  var serviceItemId = String(req && req.serviceItemId ? req.serviceItemId : "").trim();
  if (serviceItemId) {
    for (var i = 0; i < serviceItems.length; i++) {
      if (buildServiceItemIdentity_(serviceItems[i]) === serviceItemId) return serviceItems[i];
    }
    return null;
  }
  var index = Number(req && req.index);
  if (!isFinite(index) || index < 0 || index >= serviceItems.length) return null;
  return serviceItems[index] || null;
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

      // B:H = TEN SAN PHAM | ANH SAN PHAM | NHOM HANG | DON VI | GIA | GIA VON | ACTIVE
      var numRows = lastRow - 2;
      var values = sheet.getRange(3, 2, numRows, 7).getDisplayValues();
      var richTexts = sheet.getRange(3, 3, numRows, 1).getRichTextValues();
      var data = [];
      for (var i = 0; i < values.length; i++) {
        var row = values[i];
        var tenSanPham = String(row[0] || "").trim();
        var activeFlag = String(row[6] || "").trim().toUpperCase();
        if (!tenSanPham) continue;
        if (activeFlag === "FALSE" || activeFlag === "0" || activeFlag === "INACTIVE") continue;
        data.push({
          maSanPham: buildCatalogProductCode_(tenSanPham, String(row[3] || "").trim()),
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

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("SAN_PHAM");
    if (!sheet) throw new Error("Không tìm thấy sheet SAN_PHAM");

    var dataStartRow = 3;
    var existed = findProductRowByKey_(sheet, dataStartRow, tenSanPham, donVi);
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
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("SAN_PHAM");
    if (!sheet) throw new Error("Không tìm thấy sheet SAN_PHAM");

    var dataStartRow = 3;
    var row = findProductRowByKey_(sheet, dataStartRow, tenSanPham, donVi);
    if (!row) throw new Error("Không tìm thấy sản phẩm để xóa");

    // Xóa mềm: Set active = 0 ở cột 8 (H)
    sheet.getRange(row, 8).setValue(0);
    return { success: true, message: "Đã xóa (mềm) sản phẩm" };
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
      var data = [];
      var seen = {};
      var foundation = ensureSpaOperationalFoundation_();
      var stays = readSpaOpsRows_(foundation.staySheet, SPA_SESSION_HEADERS);
      for (var i = 0; i < stays.length; i++) {
        var tenKhach = String(stays[i].tenKhach || "").trim();
        var soDienThoai = String(stays[i].soDienThoai || "").trim();
        if (!tenKhach || isGuestCustomerName_(tenKhach)) continue;
        var key =
          normalizeCompareText_(tenKhach) +
          "||" +
          String(soDienThoai).replace(/[^\d]/g, "");
        if (seen[key]) continue;
        seen[key] = true;
        data.push({ tenKhach: tenKhach, soDienThoai: soDienThoai });
      }

      return { success: true, data: data };
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message, data: [] };
    }
  });
}

function buildCustomerProgressRowsFromStays_(stays) {
  var relevant = stays
    .filter(function (stay) {
      return isProgressTrackedStayStatus_(stay.trangThaiPhien);
    })
    .sort(function (a, b) {
      return toMsOrNaN_(b.batDauAt) - toMsOrNaN_(a.batDauAt);
    });
  var grouped = {};
  for (var i = 0; i < relevant.length; i++) {
    var totalForStay = Math.max(parseMoneyNumber_(relevant[i].tongBuoiCombo), 1);
    var baseProgressCode = String(relevant[i].maTienTrinh || relevant[i].maPhien || "").trim();
    var progressCode =
      totalForStay <= 1
        ? [baseProgressCode, relevant[i].maPhien, relevant[i].batDauAt].filter(String).join("::")
        : baseProgressCode;
    if (!progressCode) continue;
    if (!grouped[progressCode]) grouped[progressCode] = [];
    grouped[progressCode].push(relevant[i]);
  }
  var rows = [];
  Object.keys(grouped).forEach(function (progressCode) {
    var sessions = grouped[progressCode].sort(function (a, b) {
      return Math.max(parseMoneyNumber_(a.buoiThu), 1) - Math.max(parseMoneyNumber_(b.buoiThu), 1);
    });
    var totalSessions = Math.max(parseMoneyNumber_(sessions[0] && sessions[0].tongBuoiCombo), 1);
    for (var i = 0; i < sessions.length; i++) {
      var stay = sessions[i];
      var currentSessionNumber = Math.max(parseMoneyNumber_(stay.buoiThu), 1);
      var batDauMs = toMsOrNaN_(stay.batDauAt);
      rows.push({
        STT: "",
        tenKhach: String(stay.tenKhach || "").trim(),
        ngay: stay.batDauAt ? parseSheetDateTimeToVnString_(stay.batDauAt) : "",
        _sortMs: batDauMs,
        soDienThoai: String(stay.soDienThoai || "").trim(),
        maPhien: String(stay.maPhien || "").trim(),
        maTienTrinh: String(stay.maTienTrinh || progressCode).trim(),
        goiCombo: String(stay.tenGoi || stay.tenDichVu || "").trim(),
        soBuoiCuaCombo: totalSessions,
        soBuoiConLai: Math.max(totalSessions - currentSessionNumber, 0),
        buoiThu: currentSessionNumber,
        trangThai: normalizeStayStatus_(stay.trangThaiPhien),
        ghiChu: String(stay.ghiChu || "").trim(),
        lichTrinhChiTiet: String(stay.lichTrinhChiTiet || "").trim(),
      });
    }
  });
  rows.sort(function (a, b) {
    return (b._sortMs || 0) - (a._sortMs || 0);
  });
  rows.forEach(function (r) { delete r._sortMs; });
  return rows;
}

function rebuildCustomerProgressSheet_() {
  var foundation = ensureSpaOperationalFoundation_();
  var stays = readSpaOpsRows_(foundation.staySheet, SPA_SESSION_HEADERS);
  var rows = buildCustomerProgressRowsFromStays_(stays).map(function (row) {
    return SPA_CORE_SHEET_HEADERS.TIEN_TRINH_KHACH.map(function (header) {
      return row[header] === undefined ? "" : row[header];
    });
  });
  if (!rows.length) return;
  var progressSheet = ensureCoreBusinessSheet_(
    "TIEN_TRINH_KHACH",
    SPA_CORE_SHEET_HEADERS.TIEN_TRINH_KHACH,
    3,
  );
  clearSheetBody_(progressSheet, 3);
  progressSheet
    .getRange(3, 1, rows.length, SPA_CORE_SHEET_HEADERS.TIEN_TRINH_KHACH.length)
    .setValues(rows);
  updateSTT_(progressSheet, 3);
}

function backfillCtBanFromCheckedOutSessions_() {
  var foundation = ensureSpaOperationalFoundation_();
  var stays = readSpaOpsRows_(foundation.staySheet, SPA_SESSION_HEADERS);
  var services = readSpaOpsRows_(foundation.serviceSheet, SPA_SESSION_SERVICE_HEADERS);
  for (var i = 0; i < stays.length; i++) {
    if (normalizeStayStatus_(stays[i].trangThaiPhien) !== SPA_SESSION_STATUSES.CHECKED_OUT) continue;
    appendCtBanFromCheckout_(stays[i], services);
  }
}

function mapCtBanHistoryRow_(row) {
  return {
    ngayThuTien: parseSheetDateToUsString_(row.ngayThuTien),
    maPhieu: String(row.maPhieu || "").trim(),
    maTienTrinh: String(row.maTienTrinh || "").trim(),
    tenKhach: String(row.tenKhach || "").trim(),
    soDienThoai: String(row.soDienThoai || "").trim(),
    nguonThu: String(row.nguonThu || "").trim().toUpperCase(),
    tenSanPham: String(row.tenSanPham || "").trim(),
    tenGoi: String(row.tenGoi || "").trim(),
    soLuong: parseMoneyNumber_(row.soLuong),
    buoiThu: Math.max(parseMoneyNumber_(row.buoiThu), 0),
    doanhThu: parseMoneyNumber_(row.doanhThu),
    giaBan: parseMoneyNumber_(row.giaBan),
    giaVon: parseMoneyNumber_(row.giaVon),
    loiNhuan: (function () {
      if (row.loiNhuan != null && String(row.loiNhuan).trim() !== "") {
        return parseMoneyNumber_(row.loiNhuan);
      }
      var revenue = parseMoneyNumber_(row.doanhThu);
      var unitCost = parseMoneyNumber_(row.giaVon);
      var qty = Math.max(parseMoneyNumber_(row.soLuong), 1);
      return revenue - unitCost * qty;
    })(),
    tienCoc: parseMoneyNumber_(row.tienCoc),
    lichTrinhChiTiet: String(row.lichTrinhChiTiet || "").trim(),
  };
}

function getCtBanHistory() {
  try {
    var foundation = ensureSpaFoundation_();
    var ctBanRows = readSpaOpsRows_(foundation.ctBan, SPA_SHEET_HEADERS.CT_BAN);
    var mappedData = ctBanRows.map(mapCtBanHistoryRow_);
    putJsonCache_("read:ct_ban_history", { success: true, data: mappedData }, 900);
    return { success: true, data: mappedData };
  } catch (e) {
    Logger.log("[getCtBanHistory] Lỗi: " + e.message);
    return { success: false, message: "Lỗi: " + e.message, data: [] };
  }
}

/**
 * Lấy dữ liệu KPI từ PHIEN_DICH_VU - dùng date format VN trực tiếp
 */
function getCtBanKpiData(filters) {
  try {
    var req = filters || {};
    var fromDate = String(req.tuNgay || "").trim();
    var toDate = String(req.denNgay || "").trim();
    
    console.log("[getCtBanKpiData] === START ===");
    console.log("[getCtBanKpiData] filters:", JSON.stringify(req));
    console.log("[getCtBanKpiData] fromDate:", fromDate, "toDate:", toDate);
    
    var opsFoundation = ensureSpaOperationalFoundation_();
    var stayRows = readSpaOpsRows_(opsFoundation.staySheet, SPA_SESSION_HEADERS);
    
    console.log("[getCtBanKpiData] Total PHIEN_DICH_VU rows:", stayRows.length);
    if (stayRows.length > 0) {
      console.log("[getCtBanKpiData] Sample row batDauAt:", stayRows[0].batDauAt);
      console.log("[getCtBanKpiData] Sample row trangThaiPhien:", stayRows[0].trangThaiPhien);
    }
    
    // Parse date VN sang dd/MM/yyyy để so sánh
    // Format input: "04:26 16/06/2026" hoặc "16/06/2026" hoặc "2026-06-16"
    function parseDateVnToDdMmYyyy(val) {
      if (!val) return "";
      var s = String(val).trim();
      // Nếu có "HH:mm" prefix như "04:26 16/06/2026"
      var match = s.match(/(\d{2})\/(\d{2})\/(\d{4})$/);
      if (match) {
        return match[1] + "/" + match[2] + "/" + match[3]; // dd/MM/yyyy
      }
      // Nếu là ISO format "2026-06-16"
      match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        return match[3] + "/" + match[2] + "/" + match[1]; // dd/MM/yyyy
      }
      return s;
    }
    
    // Compare dates in dd/MM/yyyy format
    // Convert to YYYYMMDD for proper numeric comparison
    function compareDateVn(a, b) {
      if (!a || !b) return 0;
      var partsA = a.split("/");
      var partsB = b.split("/");
      var numA = parseInt(partsA[2] + partsA[1] + partsA[0], 10);
      var numB = parseInt(partsB[2] + partsB[1] + partsB[0], 10);
      return numA - numB;
    }
    
    // Filter by date range AND status CHECKED_OUT
    var filteredRows = stayRows.filter(function(row) {
      var status = String(row.trangThaiPhien || "").trim().toUpperCase();
      if (status !== "CHECKED_OUT") return false;
      
      // Parse date từ batDauAt - format VN "04:26 16/06/2026"
      var batDauAt = String(row.batDauAt || row.createdAt || row.ngay || "").trim();
      var ngayVn = parseDateVnToDdMmYyyy(batDauAt);
      
      if (!ngayVn) return false;
      
      // So sánh date đúng cách
      var ngayNum = parseInt(ngayVn.split("/")[2] + ngayVn.split("/")[1] + ngayVn.split("/")[0], 10);
      var fromNum = fromDate ? parseInt(fromDate.split("/")[2] + fromDate.split("/")[1] + fromDate.split("/")[0], 10) : 0;
      var toNum = toDate ? parseInt(toDate.split("/")[2] + toDate.split("/")[1] + toDate.split("/")[0], 10) : 99999999;
      
      console.log("[getCtBanKpiData] Row:", row.maPhien, "date:", ngayVn, "ngayNum:", ngayNum, "from:", fromNum, "to:", toNum, "inRange:", ngayNum >= fromNum && ngayNum <= toNum);
      
      if (fromDate && ngayNum < fromNum) return false;
      if (toDate && ngayNum > toNum) return false;
      return true;
    });
    
    console.log("[getCtBanKpiData] After filter:", filteredRows.length, "rows");
    
    // Transform to KPI format - lấy trực tiếp từ PHIEN_DICH_VU
    var result = filteredRows.map(function(stay) {
      return {
        maPhien: String(stay.maPhien || "").trim(),
        maTienTrinh: String(stay.maTienTrinh || "").trim(),
        ngay: parseDateVnToDdMmYyyy(stay.batDauAt || stay.createdAt || stay.ngay),
        tenKhach: String(stay.tenKhach || "").trim(),
        soDienThoai: String(stay.soDienThoai || "").trim(),
        nguonThu: "",
        maSanPham: "",
        tenSanPham: String(stay.tenDichVu || "").trim(),
        maDv: String(stay.maDv || "").trim(),
        maGoi: String(stay.maGoi || "").trim(),
        tenGoi: String(stay.tenGoi || "").trim(),
        tongBuoiCombo: Math.max(Number(stay.tongBuoiCombo || 1), 1),
        buoiThu: Math.max(Number(stay.buoiThu || 1), 1),
        giaBan: Number(stay.giaGoi || 0),
        doanhThu: Number(stay.tongThanhToan || 0),
        loiNhuan: 0,
        tienCoc: Number(stay.tienCoc || 0),
        maNhanVien: String(stay.maNhanVien || "").trim(),
        tenNhanVien: String(stay.tenNhanVien || "").trim(),
        diemHaiLongKhach: stay.diemHaiLongKhach ? Number(stay.diemHaiLongKhach) : null,
        trangThaiPhien: String(stay.trangThaiPhien || "").trim().toUpperCase(),
        maGiuong: String(stay.maGiuong || "").trim(),
      };
    });
    
    Logger.log("[getCtBanKpiData] Kết quả: " + result.length + " rows");
    if (result.length > 0) {
      console.log("[getCtBanKpiData] Sample:", JSON.stringify(result[0]));
    }
    
    console.log("[getCtBanKpiData] === END ===");
    return { success: true, data: result };
  } catch (e) {
    console.error("[getCtBanKpiData] ERROR:", e.message, e.stack);
    return { success: false, message: "Lỗi: " + e.message, data: [] };
  }
}

function getCustomerProgress() {
  return withSuccessCache_("read:customer_progress", 15, function () {
    try {
      rebuildCustomerProgressSheet_();
      var sheet = ensureCoreBusinessSheet_(
        "TIEN_TRINH_KHACH",
        SPA_CORE_SHEET_HEADERS.TIEN_TRINH_KHACH,
        3,
      );
      var lastRow = sheet.getLastRow();
      if (lastRow < 3) return { success: true, data: [] };
      var rows = readCoreBusinessRows_(sheet, SPA_CORE_SHEET_HEADERS.TIEN_TRINH_KHACH, 3);
      return {
        success: true,
        data: rows.map(function (row) {
          return {
            tenKhach: String(row.tenKhach || "").trim(),
            ngay: parseSheetDateToUsString_(row.ngay),
            soDienThoai: String(row.soDienThoai || "").trim(),
            maPhien: String(row.maPhien || "").trim(),
            maTienTrinh: String(row.maTienTrinh || "").trim(),
            goiCombo: String(row.goiCombo || "").trim(),
            soBuoiCuaCombo: Math.max(parseMoneyNumber_(row.soBuoiCuaCombo), 1),
            soBuoiConLai: Math.max(parseMoneyNumber_(row.soBuoiConLai), 0),
            buoiThu: Math.max(parseMoneyNumber_(row.buoiThu), 1),
            trangThai: String(row.trangThai || "").trim(),
            ghiChu: String(row.ghiChu || "").trim(),
            lichTrinhChiTiet: String(row.lichTrinhChiTiet || "").trim(),
          };
        }),
      };
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
      var sheet = ss.getSheetByName("NHAP_HANG");
      if (!sheet) return { success: true, data: [] };

      var lastRow = sheet.getLastRow();
      if (lastRow < 3) {
        return { success: true, data: [] };
      }

      // B:C = Tên NCC | Mã phiếu
      var values = sheet.getRange(3, 2, lastRow - 2, 2).getDisplayValues();
      var data = [];
      var seen = {};

      for (var i = 0; i < values.length; i++) {
        var row = values[i];
        var tenNCC = String(row[0] || "").trim();

        if (!tenNCC || isGuestSupplierName_(tenNCC)) continue;

        var key = normalizeCompareText_(tenNCC);
        if (seen[key]) continue;
        seen[key] = true;

        data.push({
          tenNCC: tenNCC,
          soDienThoai: "",
        });
      }

      return { success: true, data: data };
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message, data: [] };
    }
  });
}

function getOrderHistory() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("DON_HANG");
    if (!sheet) throw new Error("Không tìm thấy sheet DON_HANG");

    var lastRow = sheet.getLastRow();
    if (lastRow < 3) return { success: true, data: [] };

    var rows = sheet.getRange(3, 1, lastRow - 2, 16).getDisplayValues();
    Logger.log("[getOrderHistory] DON_HANG rows: " + rows.length);

    var customerByMaPhieu = {};
    var phoneByMaPhieu = {};
    var foundation = ensureSpaFoundation_();
    var ctBanRows = readSpaOpsRows_(foundation.ctBan, SPA_SHEET_HEADERS.CT_BAN);
    Logger.log("[getOrderHistory] CT_BAN rows: " + ctBanRows.length);
    for (var c = 0; c < ctBanRows.length; c++) {
        var maPhieuCT = String(ctBanRows[c].maPhieu || "").trim();
        var tenKhachCT = String(ctBanRows[c].tenKhach || "").trim();
        if (!maPhieuCT) continue;
        if (tenKhachCT && !customerByMaPhieu[maPhieuCT]) {
          customerByMaPhieu[maPhieuCT] = tenKhachCT;
        }
        if (!phoneByMaPhieu[maPhieuCT]) {
          phoneByMaPhieu[maPhieuCT] = String(ctBanRows[c].soDienThoai || "").trim();
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
            tienNo: 0,
            tongHoaDon: parseMoneyNumber_(tongHoaDonCell),
            ghiChu: ghiChu || "-",
            trangThai: "Đã thanh toán",
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
      ? '<div class="row"><span class="muted">Cần thu thêm</span><strong>' +
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
    if (!sheetDH) throw new Error("Không tìm thấy sheet DON_HANG");

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
    if (deletedDH === 0) {
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
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // === PHASE 1: READ ALL CẦN THIẾT ===
    var sheetDH = ss.getSheetByName("DON_HANG");
    if (!sheetDH) throw new Error("Không tìm thấy sheet DON_HANG");

    var allDHRows = getEffectiveOrderRows_(sheetDH, 3);
    var oldDHRows = allDHRows.filter(function (r) {
      return r.effectiveMaPhieu === maPhieuOriginal;
    });
    if (!oldDHRows.length)
      throw new Error("Không tìm thấy hóa đơn để cập nhật trong DON_HANG");


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
    var normalizedStatus = "Đã thanh toán";
    var statusCode = "PAID";

    var customerName = String((customer && customer.tenKhach) || "").trim();
    if (!customerName) customerName = "Khách ghé thăm";

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
      if (statusCode === "PARTIAL") paidAmount = 0;
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

    // 3.2 Write DON_HANG
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

    // 3.3 Write KHO
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
          trangThai: normalizedStatus || "",
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
  var now = getNowVnDateTime_();
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
    console.log("[Lock] Đã lấy được lock cho:", action);
  } catch (e) {
    console.log("[Lock] KHÔNG lấy được lock cho:", action, "- Đưa vào queue");
    var jobId = enqueueOperation_(action, payload);
    console.log("[Lock] Đã enqueue jobId:", jobId);
    return {
      success: true,
      queued: true,
      jobId: jobId,
      message: "Hệ thống đang bận, yêu cầu đã được đưa vào hàng đợi.",
    };
  }
  try {
    console.log("[Lock] Bắt đầu thực thi action:", action);
    return fn();
  } finally {
    if (locked) {
      console.log("[Lock] Giải phóng lock cho:", action);
      lock.releaseLock();
    }
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
      row[idxUpdated] = getNowVnDateTime_();
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
  else if (action === "UPDATE_PRODUCT")
    result = updateProductCatalogItemInternal_(payload.payload);
  else if (action === "CREATE_PRODUCT")
    result = createProductCatalogItemInternal_(payload.payload);
  else if (action === "DELETE_PRODUCT")
    result = deleteProductCatalogItemInternal_(payload.payload);
  else if (action === "CREATE_RECEIPT")
    result = createInventoryReceiptInternal_(payload.payload);
  else if (action === "UPDATE_STAY_SERVICE")
    result = updateStayServiceItemInternal_(payload.payload);
  else if (action === "DELETE_STAY_SERVICE")
    result = deleteStayServiceItemInternal_(payload.payload);
  else if (action === "UPDATE_STAY_TIME")
    result = updateStayTimeInternal_(payload.payload);
  else if (action === "UPDATE_COMBO_SCHEDULE")
    result = updateComboScheduleInternal_(payload);
  else if (action === "CREATE_SPA_STAFF")
    result = createSpaStaffInternal_(payload.payload);
  else if (action === "UPDATE_SPA_STAFF")
    result = updateSpaStaffInternal_(payload.payload);
  else if (action === "DELETE_SPA_STAFF")
    result = deleteSpaStaffInternal_(payload.payload);
  else if (action === "UPDATE_SPA_STAFF_SCHEDULES")
    result = updateSpaStaffSchedulesInternal_(payload.payload);
  else if (action === "RECORD_SPA_ATTENDANCE")
    result = recordSpaAttendanceInternal_(payload.payload);
  else if (action === "SAVE_SPA_SHIFT_CHECKLIST")
    result = saveSpaShiftChecklistInternal_(payload.payload);
  else if (action === "SAVE_SPA_STAFF_VIOLATION")
    result = saveSpaStaffViolationInternal_(payload.payload);
  else if (action === "CANCEL_SPA_STAFF_VIOLATION")
    result = cancelSpaStaffViolationInternal_(payload.payload);
  else if (action === "SAVE_SPA_STAFF_LEAVE")
    result = saveSpaStaffLeaveRequestInternal_(payload.payload);
  else if (action === "REVIEW_SPA_STAFF_LEAVE")
    result = reviewSpaStaffLeaveRequestInternal_(payload.payload);
  else if (action === "SAVE_SPA_STAFF_TRAINING")
    result = saveSpaStaffTrainingInternal_(payload.payload);
  else if (action === "LOCK_SPA_PAYROLL_PERIOD")
    result = lockSpaPayrollPeriodInternal_(payload.payload);
  else if (action === "SAVE_TREATMENT_CATALOGS")
    result = saveTreatmentCatalogsInternal_(payload.payload);
  else if (action === "CREATE_BOOKING")
    result = createBookingInternal_(payload.payload);
  else if (action === "CREATE_BOOKING_WITH_ITEMS")
    result = createBookingWithItemsInternal_(payload.payload);
  else if (action === "CHECKIN_ROOM")
    result = checkInRoomInternal_(payload.payload);
  else if (action === "CHECKIN_ROOM_WITH_ITEMS")
    result = checkInRoomWithItemsInternal_(payload.payload);
  else if (action === "CHECKOUT_ROOM")
    result = checkoutRoomInternal_(payload.payload);
  else if (action === "MARK_TREATMENT_NO_SHOW")
    result = markTreatmentNoShowInternal_(payload.payload);
  else if (action === "UPDATE_ROOM_STATUS")
    result = updateRoomStatusInternal_(payload.payload);
  else if (action === "CREATE_TREATMENT_BED")
    result = createTreatmentBedInternal_(payload.payload);
  else if (action === "UPDATE_TREATMENT_BED")
    result = updateTreatmentBedInternal_(payload.payload);
  else if (action === "DELETE_TREATMENT_BED")
    result = deleteTreatmentBedInternal_(payload.payload);
  else if (action === "REPAIR_SPA_OPERATIONAL_DATA")
    result = repairSpaOperationalDataInternal_(payload.options || {});
  else if (action === "REPAIR_SPA_TREATMENT_PROGRESS")
    result = repairSpaTreatmentProgressInternal_();
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
    if (!sheetDH) throw new Error("Không tìm thấy sheet DON_HANG");

    var products = orderData.products || [];
    var orderInfo = orderData.orderInfo || {};
    var customer = orderData.customer || null;
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
    var normalizedStatus = "Đã thanh toán";
    var statusCode = "PAID";
    var statusForDH = resolveStatusForRule_(normalizedStatus, statusRuleDH);

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

    var customerName = String((customer && customer.tenKhach) || "").trim();
    if (!customerName) customerName = "Khách ghé thăm";

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
      if (statusCode === "PARTIAL") paidAmount = 0;
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

    // 3.3 Ghi vào KHO
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
          trangThai: normalizedStatus || "",
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
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("NHAP_HANG");
    if (!sheet) throw new Error("Không tìm thấy sheet NHAP_HANG");

    var lastRow = sheet.getLastRow();
    if (lastRow < 3) return { success: true, data: [] };

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
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // === PHASE 1: READ ALL ===
    var sheetKho =
      ss.getSheetByName("QUAN_LY_KHO") || ss.getSheetByName("QUẢN LÝ KHO");
    var sheetNhap = ss.getSheetByName("NHAP_HANG");

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

    var trangThai = "Đã thanh toán";
    var soTienDaTra = tongTienPhieu;
    var tienNo = 0;

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
    // 3.2 Write NHAP_HANG
    copyLatestFormatForTopInsert_(
      sheetNhap,
      3,
      rowCount,
      Math.max(12, sheetNhap.getLastColumn()),
    );
    sheetNhap.getRange(3, 1, rowCount, 12).setValues(nRows);

    // 3.3 Write QUAN_LY_KHO
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


function getOrderCustomerFromCtBan_(ss, maPhieu) {
  var fallback = { customerName: "Khách vãng lai", customerPhone: "" };
  var code = String(maPhieu || "").trim();
  if (!ss || !code) return fallback;
  var sheet = ss.getSheetByName("CT_BAN");
  if (!sheet) return fallback;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return fallback;
  var rows = readSpaOpsRows_(sheet, SPA_SHEET_HEADERS.CT_BAN);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].maPhieu || "").trim() !== code) continue;
    return {
      customerName: String(rows[i].tenKhach || "").trim() || fallback.customerName,
      customerPhone: String(rows[i].soDienThoai || "").trim(),
    };
  }
  return fallback;
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

        var customerInfo = getOrderCustomerFromCtBan_(ss, maPhieu);
        var customerName = customerInfo.customerName;
        var customerPhone = customerInfo.customerPhone;

        var orderData = {
          id: maPhieu,
          ngayBan:
            orderNgayBan || getNowUsDate_(),
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

        var customerInfo = getOrderCustomerFromCtBan_(ss, maPhieu);
        var customerName = customerInfo.customerName;
        var customerPhone = customerInfo.customerPhone;

        var orderData = {
          id: maPhieu,
          ngayBan:
            orderNgayBan || getNowUsDate_(),
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

// ===== SPA MODULE =====
// Sheet danh mục dùng cho chọn phác đồ / dịch vụ / gói trên UI.
var SPA_CATALOG_UI_SHEET_NAMES = [
  "DM_PHAC_DO",
  "DM_DICH_VU",
  "DM_GOI_DIEU_TRI",
];

var SPA_SHEET_HEADERS = {
  DM_PHAC_DO: [
    "STT",
    "maPhacDo",
    "tenPhacDo",
    "nhomBenh",
    "capDoBenh",
    "moTa",
    "active",
    "updatedAt",
  ],
  DM_DICH_VU: [
    "STT",
    "maDv",
    "maPhacDo",
    "lop1NhomDv",
    "lop2DichVu",
    "vungTriLieu",
    "thoiLuongPhut",
    "active",
    "updatedAt",
  ],
  DM_GOI_DIEU_TRI: [
    "STT",
    "maGoi",
    "maDv",
    "tenGoi",
    "loaiGoi",
    "soBuoiMua",
    "soBuoiTang",
    "soBuoiQuyDoi",
    "giaBanGoi",
    "giaVonChuanGoi",
    "active",
    "updatedAt",
  ],
  DM_SAN_PHAM_DUOC_LIEU: [
    "STT",
    "maSanPham",
    "tenSanPham",
    "nhomSanPham",
    "donVi",
    "giaVon",
    "giaBan",
    "tonDauKy",
    "active",
    "updatedAt",
  ],
  CT_BAN: [
    "STT",
    "ngayThuTien",
    "maPhieu",
    "maTienTrinh",
    "tenKhach",
    "soDienThoai",
    "nguonThu",
    "maSanPham",
    "tenSanPham",
    "maPhacDo",
    "maDv",
    "maGoi",
    "tenGoi",
    "soLuong",
    "soBuoiMua",
    "soBuoiTang",
    "soBuoiQuyDoi",
    "buoiThu",
    "giaBan",
    "giaVon",
    "doanhThu",
    "loiNhuan",
    "ghiChu",
    "tienCoc",
    "lichTrinhChiTiet",
  ],
  THEO_DOI_SU_DUNG_GOI: [
    "STT",
    "maPhieu",
    "ngayMua",
    "maGoi",
    "tenGoi",
    "tenKhach",
    "soDienThoai",
    "tongBuoiQuyDoi",
    "buoiDaDung",
    "buoiConLai",
    "lanSuDungGanNhat",
    "trangThai",
    "ghiChu",
  ],
  TIEN_TRINH_KHACH: [
    "STT",
    "tenKhach",
    "ngay",
    "soDienThoai",
    "maPhien",
    "maTienTrinh",
    "goiCombo",
    "soBuoiCuaCombo",
    "soBuoiConLai",
    "buoiThu",
    "trangThai",
    "ghiChu",
    "lichTrinhChiTiet",
  ],
  BAO_CAO_NGAY_THANG_NAM: [
    "STT",
    "kyBaoCao",
    "tuNgay",
    "denNgay",
    "doanhThuSanPham",
    "doanhThuGoi",
    "tongDoanhThu",
    "loiNhuanSanPham",
    "loiNhuanGoi",
    "tongLoiNhuan",
    "tiTrongSanPham",
    "tiTrongGoi",
    "updatedAt",
  ],
};

var SPA_CORE_SHEET_HEADERS = {
  DON_HANG: [
    "STT",
    "ngayBan",
    "maPhieu",
    "tenSanPham",
    "donVi",
    "soLuong",
    "giaVon",
    "donGiaBan",
    "thanhTien",
    "tongHoaDon",
    "ghiChu",
    "trangThai",
    "invoiceNo",
    "lookupCode",
    "invoiceStatus",
    "taxAuthCode",
    "tienCoc",
    "lichTrinhChiTiet",
  ],
  NHAP_HANG: [
    "ngayNhap",
    "nhaCungCap",
    "maPhieu",
    "tenSanPham",
    "nhomHang",
    "soLuong",
    "donVi",
    "giaNhap",
    "thanhTien",
    "tongTienPhieu",
    "ghiChu",
    "trangThai",
  ],
  TIEN_TRINH_KHACH: [
    "STT",
    "tenKhach",
    "ngay",
    "soDienThoai",
    "maPhien",
    "maTienTrinh",
    "goiCombo",
    "soBuoiCuaCombo",
    "soBuoiConLai",
    "buoiThu",
    "trangThai",
    "ghiChu",
    "lichTrinhChiTiet",
    "maDonHangGoc",
  ],
  SAN_PHAM: [
    "STT",
    "tenSanPham",
    "anhSanPham",
    "nhomHang",
    "donVi",
    "donGiaBan",
    "giaVon",
    "active",
  ],
  QUAN_LY_KHO: [
    "STT",
    "tenSanPham",
    "nhomHang",
    "donViChan",
    "giaNhapChan",
    "quyDoi",
    "donViLe",
    "giaNhapLe",
    "tonKhoLe",
    "active",
  ],
};

var SPA_HEADER_ALIASES_BY_SHEET = {
  DM_PHAC_DO: {
    maPhacDo: ["maPhacDoSpa", "protocolCode"],
    tenPhacDo: ["tenLieuTrinh", "protocolName"],
    nhomBenh: ["nhomTriLieu", "nhomDieuTri"],
    capDoBenh: ["capDo", "mucDo"],
  },
  DM_DICH_VU: {
    maDv: ["maDichVu", "serviceCode"],
    maPhacDo: ["maLieuTrinh", "protocolCode"],
    lop1NhomDv: ["nhomDichVuCap1", "nhom1"],
    lop2DichVu: ["tenDichVu", "serviceName"],
    vungTriLieu: ["vungTacDong", "vungDieuTri"],
    thoiLuongPhut: ["thoiLuong", "soPhut"],
  },
  DM_GOI_DIEU_TRI: {
    maGoi: ["maCombo", "packageCode"],
    maDv: ["maDichVu", "serviceCode"],
    tenGoi: ["tenCombo", "packageName"],
    soBuoiMua: ["soLanMua"],
    soBuoiTang: ["soLanTang"],
    soBuoiQuyDoi: ["tongBuoi", "tongLan"],
    giaBanGoi: ["giaBan", "packagePrice"],
    giaVonChuanGoi: ["giaVon", "packageCost"],
  },
  DM_SAN_PHAM_DUOC_LIEU: {
    maSanPham: ["maSp", "productCode"],
    tenSanPham: ["tenSp", "productName"],
    nhomSanPham: ["nhomHang"],
    giaVon: ["giaNhap", "costPrice"],
    giaBan: ["donGiaBan", "salePrice"],
    tonDauKy: ["tonKhoDauKy", "openingStock"],
  },
  CT_BAN: {
    ngayThuTien: ["ngayThanhToan", "ngayThu"],
    maPhieu: ["soPhieu", "orderCode"],
    maTienTrinh: ["maTienTrinh", "progressCode"],
    nguonThu: ["kenhThu", "nguonDoanhThu"],
    maSanPham: ["maSp", "productCode"],
    tenSanPham: ["tenSp", "productName"],
    maDv: ["maDichVu", "serviceCode"],
    maGoi: ["maCombo", "packageCode"],
    soLuong: ["sl"],
    buoiThu: ["buoi", "sessionNumber"],
    doanhThu: ["thanhTien", "tongTien"],
    tienCoc: ["deposit", "tienDatCoc"],
    lichTrinhChiTiet: ["schedule", "lichTrinh"],
  },
  THEO_DOI_SU_DUNG_GOI: {
    maPhieu: ["soPhieu", "orderCode"],
    ngayMua: ["ngayBan"],
    maGoi: ["maCombo", "packageCode"],
    tongBuoiQuyDoi: ["tongLanQuyDoi"],
    buoiDaDung: ["lanDaDung"],
    buoiConLai: ["lanConLai"],
    lanSuDungGanNhat: ["suDungGanNhat"],
    trangThai: ["status"],
  },
  BAO_CAO_NGAY_THANG_NAM: {
    kyBaoCao: ["maKyBaoCao", "reportPeriod"],
    tuNgay: ["fromDate"],
    denNgay: ["toDate"],
    tongDoanhThu: ["tongTien"],
    tongLoiNhuan: ["tongLoi"],
  },
  DON_HANG: {
    maPhieu: ["soPhieu", "maDonHang", "orderCode"],
    tenSanPham: ["tenSp", "productName"],
    soLuong: ["sl"],
    donGiaBan: ["giaBan", "salePrice"],
    thanhTien: ["tongTienDong"],
    tongHoaDon: ["tongTien", "tongCong"],
    trangThai: ["trangThaiDon", "status"],
  },
  NHAP_HANG: {
    nhaCungCap: ["tenNCC", "ncc", "supplierName"],
    maPhieu: ["soPhieu", "receiptCode"],
    tenSanPham: ["tenSp", "productName"],
    soLuong: ["sl"],
    giaNhap: ["donGiaNhap", "purchasePrice"],
    tongTienPhieu: ["tongTien", "tongCong"],
    trangThai: ["status"],
  },
  SAN_PHAM: {
    tenSanPham: ["tenSp", "productName"],
    anhSanPham: ["hinhAnh", "imageUrl", "urlAnh"],
    donGiaBan: ["giaBan", "salePrice"],
    giaVon: ["giaNhap", "costPrice"],
  },
  QUAN_LY_KHO: {
    tenSanPham: ["tenSp", "productName"],
    donViChan: ["donViLon", "donViNhap"],
    giaNhapChan: ["giaVonChan", "giaNhapLon"],
    quyDoi: ["tiLeQuyDoi", "heSoQuyDoi"],
    donViLe: ["donViBanLe", "donViXuat"],
    giaNhapLe: ["giaVonLe", "giaNhapBanLe"],
    tonKhoLe: ["tonKho", "soLuongTon"],
  },
  BANK_TRANSFER: {
    thoiGian: ["time", "createdAt"],
    khachHang: ["tenKhach", "tenNguoiGui"],
    soTien: ["amount"],
    noiDung: ["moTa", "description"],
    maDonHang: ["maPhieu", "maGiaoDich"],
    trangThai: ["status", "state"],
  },
  GIUONG_TRI_LIEU: {
    maGiuong: [],
    tenGiuong: [],
    loaiGiuong: [],
    trangThaiGiuong: [],
    soKhachToiDa: [],
    updatedAt: [],
  },
  PHIEN_DICH_VU: {
    maPhien: [],
    maLichHen: [],
    maGiuong: [],
    tenKhach: [],
    soDienThoai: [],
    maNhanVien: [],
    tenNhanVien: [],
    maDv: [],
    tenDichVu: [],
    maGoi: [],
    tenGoi: [],
    batDauAt: [],
    ketThucDuKien: [],
    ketThucThucTe: [],
    thoiLuongPhut: [],
    giaGoi: [],
    tienGoi: [],
    tienDichVu: [],
    tongThanhToan: [],
    diemHaiLongKhach: [],
    trangThaiPhien: [],
  },
  CHI_TIET_DICH_VU: {
    maPhien: [],
    thoiGian: [],
    maSanPham: [],
    tenSanPham: [],
    nhomHang: [],
    donVi: [],
    soLuong: [],
    donGia: [],
    thanhTien: [],
    daTruTonKho: [],
  },
  NHAN_VIEN: {
    maNhanVien: ["maKtv", "maNv", "maKyThuatVien", "staffCode"],
    tenNhanVien: ["tenKtv", "tenNv", "hoTen", "staffName"],
    chucVu: ["vaiTro", "boPhan", "role", "position"],
    soDienThoai: ["sdt", "dienThoai", "phone"],
    ngayVaoLam: ["ngayBatDau", "startDate", "joinDate"],
    trangThai: ["trangThaiLamViec", "trangThaiNhanVien", "status"],
    caLamViec: ["lichLamViec", "caLam", "shifts", "workShifts"],
    luongCoBanThang: [
      "luongCoBan", "luongCoBan", "salary", "baseSalary",
      "luongCb", "luongCoban", "luongcb",
      "luongcoban", "luongcoban"
    ],
    tyLeThuongDichVu: [
      "tyLeThuong", "tyLeThuong", "bonusRate",
      "thuong", "phanTramThuong", "ptThuong",
      "thuong", "phantramthuong", "pthuong",
      "tylethuong", "tylethuong"
    ],
    updatedAt: ["updated_at", "capNhatLuc"],
  },
};

function normalizeHeaderLookupKey_(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "");
}

function getHeaderAliasMapForSheet_(sheetName) {
  var key = String(sheetName || "").trim();
  return SPA_HEADER_ALIASES_BY_SHEET[key] || {};
}

function buildHeaderColumnLookup_(headerRow) {
  var lookup = {};
  for (var i = 0; i < headerRow.length; i++) {
    var raw = String(headerRow[i] || "").trim();
    if (!raw) continue;
    var col = i + 1;
    var exact = raw;
    var lower = raw.toLowerCase();
    var folded = normalizeHeaderLookupKey_(raw);
    if (exact && !lookup[exact]) lookup[exact] = col;
    if (lower && !lookup[lower]) lookup[lower] = col;
    if (folded && !lookup[folded]) lookup[folded] = col;
  }
  return lookup;
}

function resolveHeaderColumnByAlias_(lookup, canonicalHeader, aliasMap) {
  var aliases = (aliasMap && aliasMap[canonicalHeader]) || [];
  var candidates = [canonicalHeader].concat(aliases);
  for (var i = 0; i < candidates.length; i++) {
    var raw = String(candidates[i] || "").trim();
    if (!raw) continue;
    if (lookup[raw]) return lookup[raw];
    var lower = raw.toLowerCase();
    if (lookup[lower]) return lookup[lower];
    var folded = normalizeHeaderLookupKey_(raw);
    if (lookup[folded]) return lookup[folded];
  }
  return 0;
}

function isSheetCellBlank_(value) {
  return String(value === null || value === undefined ? "" : value).trim() === "";
}

function dedupeNumericColumns_(cols) {
  var seen = {};
  var out = [];
  for (var i = 0; i < (cols || []).length; i++) {
    var col = Number(cols[i] || 0);
    if (!Number.isFinite(col) || col <= 0) continue;
    if (seen[col]) continue;
    seen[col] = true;
    out.push(col);
  }
  return out;
}

function findHeaderColumnsByCandidates_(headerRow, candidates) {
  var rawCandidates = candidates || [];
  var lookup = {};
  for (var i = 0; i < rawCandidates.length; i++) {
    var raw = String(rawCandidates[i] || "").trim();
    if (!raw) continue;
    lookup[raw] = true;
    lookup[raw.toLowerCase()] = true;
    lookup[normalizeHeaderLookupKey_(raw)] = true;
  }

  var matched = [];
  for (var j = 0; j < (headerRow || []).length; j++) {
    var header = String(headerRow[j] || "").trim();
    if (!header) continue;
    if (
      lookup[header] ||
      lookup[header.toLowerCase()] ||
      lookup[normalizeHeaderLookupKey_(header)]
    ) {
      matched.push(j + 1);
    }
  }
  return dedupeNumericColumns_(matched);
}

function buildPreferredHeaderColumnsMap_(sheet, canonicalHeaders, headerRowNo) {
  var map = {};
  var lastCol = sheet ? sheet.getLastColumn() : 0;
  if (!sheet || lastCol < 1) return map;
  var headerRowIndex = Math.max(1, Number(headerRowNo || 1));
  var headerRow = sheet.getRange(headerRowIndex, 1, 1, lastCol).getValues()[0];
  var aliasMap = getHeaderAliasMapForSheet_(sheet.getName());

  for (var i = 0; i < (canonicalHeaders || []).length; i++) {
    var canonical = String(canonicalHeaders[i] || "").trim();
    if (!canonical) continue;
    var candidates = [canonical].concat((aliasMap && aliasMap[canonical]) || []);
    var matchedCols = findHeaderColumnsByCandidates_(headerRow, candidates);
    var canonicalCols = findHeaderColumnsByCandidates_(headerRow, [canonical]);
    var preferred = canonicalCols.length
      ? [canonicalCols[0]].concat(
          matchedCols.filter(function (col) {
            return col !== canonicalCols[0];
          }),
        )
      : matchedCols;
    map[canonical] = dedupeNumericColumns_(preferred);
  }
  return map;
}

function getManagedHeaderRowForSheet_(sheetName) {
  var coreRow2Sheets = {
    DON_HANG: true,
    NHAP_HANG: true,
    SAN_PHAM: true,
    QUAN_LY_KHO: true,
    TIEN_TRINH_KHACH: true,
  };
  var key = String(sheetName || "").trim();
  if (key === "BANK_TRANSFER") return 7;
  if (coreRow2Sheets[key]) return 2;
  return 1;
}

function resolvePhysicalSheetNameForAliasAudit_(sheetName) {
  var key = String(sheetName || "").trim();
  if (key === "BANK_TRANSFER") return "BANK";
  return key;
}

function auditSpaHeaderAliases() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error("Không lấy được active spreadsheet.");

    var details = [];
    var totalConflicts = 0;
    var sheetNames = Object.keys(SPA_HEADER_ALIASES_BY_SHEET || {});
    for (var i = 0; i < sheetNames.length; i++) {
      var aliasSheetName = sheetNames[i];
      var physicalName = resolvePhysicalSheetNameForAliasAudit_(aliasSheetName);
      var headerRowNo = getManagedHeaderRowForSheet_(aliasSheetName);
      var sh = ss.getSheetByName(physicalName);
      if (!sh) {
        details.push({
          sheet: physicalName,
          aliasKey: aliasSheetName,
          exists: false,
          headerRow: headerRowNo,
          conflicts: [],
        });
        continue;
      }

      var lastCol = sh.getLastColumn();
      if (lastCol < 1) {
        details.push({
          sheet: physicalName,
          aliasKey: aliasSheetName,
          exists: true,
          headerRow: headerRowNo,
          conflicts: [],
        });
        continue;
      }

      var headerValues = sh.getRange(headerRowNo, 1, 1, lastCol).getDisplayValues()[0];
      var aliasMap = getHeaderAliasMapForSheet_(aliasSheetName);
      var conflicts = [];
      for (var canonical in aliasMap) {
        if (!Object.prototype.hasOwnProperty.call(aliasMap, canonical)) continue;
        var candidates = [canonical].concat(aliasMap[canonical] || []);
        var matchedCols = findHeaderColumnsByCandidates_(headerValues, candidates);
        if (matchedCols.length <= 1) continue;
        totalConflicts++;
        conflicts.push({
          canonical: canonical,
          columns: matchedCols.map(function (col) {
            return {
              col: col,
              header: String(headerValues[col - 1] || "").trim(),
            };
          }),
        });
      }

      details.push({
        sheet: physicalName,
        aliasKey: aliasSheetName,
        exists: true,
        headerRow: headerRowNo,
        conflicts: conflicts,
      });
    }

    return {
      success: true,
      message:
        totalConflicts > 0
          ? "Phát hiện " + totalConflicts + " nhóm cột trùng nghĩa cần dọn."
          : "Không phát hiện cột trùng nghĩa.",
      data: {
        totalConflicts: totalConflicts,
        details: details,
      },
    };
  } catch (e) {
    return { success: false, message: "Lỗi auditSpaHeaderAliases: " + e.message };
  }
}

function ensureSheetHeadersByAlias_(sheet, headerRowNumber, canonicalHeaders, aliasMap) {
  var headerRow = Math.max(1, Number(headerRowNumber) || 1);
  var headers = canonicalHeaders || [];
  if (!sheet || !headers.length) return {};

  ensureSheetMaxColumns_(sheet, headers.length);
  var lastCol = Math.max(sheet.getLastColumn(), headers.length);
  var rowValues = sheet.getRange(headerRow, 1, 1, lastCol).getDisplayValues()[0];
  var lookup = buildHeaderColumnLookup_(rowValues);
  var assigned = {};
  var renames = [];
  var missing = [];

  for (var i = 0; i < headers.length; i++) {
    var canonical = String(headers[i] || "").trim();
    if (!canonical) continue;
    var col = resolveHeaderColumnByAlias_(lookup, canonical, aliasMap);
    if (col > 0 && !assigned[col]) {
      assigned[col] = canonical;
      if (String(rowValues[col - 1] || "").trim() !== canonical) {
        renames.push({ col: col, value: canonical });
        rowValues[col - 1] = canonical;
      }
      continue;
    }
    missing.push(canonical);
  }

  if (renames.length) {
    for (var r = 0; r < renames.length; r++) {
      sheet.getRange(headerRow, renames[r].col).setValue(renames[r].value);
    }
  }

  if (missing.length) {
    var startCol = sheet.getLastColumn() + 1;
    ensureSheetMaxColumns_(sheet, startCol + missing.length - 1);
    sheet.getRange(headerRow, startCol, 1, missing.length).setValues([missing]);
  }

  sheet.getRange(headerRow, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).setFontWeight("bold");
  return {
    renamed: renames.length,
    appended: missing.length,
  };
}

function forceExactSheetHeaders_(sheet, headerRowNumber, canonicalHeaders) {
  var headerRow = Math.max(1, Number(headerRowNumber) || 1);
  var headers = canonicalHeaders || [];
  if (!sheet || !headers.length) return;
  ensureSheetMaxColumns_(sheet, headers.length);
  sheet.getRange(headerRow, 1, 1, headers.length).setValues([headers]);
  var lastCol = Math.max(sheet.getLastColumn(), headers.length);
  if (lastCol > headers.length) {
    sheet.getRange(headerRow, headers.length + 1, 1, lastCol - headers.length).clearContent();
  }
  sheet.getRange(headerRow, 1, 1, headers.length).setFontWeight("bold");
}

function shouldForceExactCoreBusinessHeaders_(name) {
  return String(name || "").trim() === "TIEN_TRINH_KHACH";
}

function normalizeDateOnly_(value) {
  var raw = String(value || "").trim();
  if (!raw) return "";
  var m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + "-" + m[2] + "-" + m[3];
  m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    var d = Number(m[1]);
    var mo = Number(m[2]);
    var y = Number(m[3]);
    if (!d || !mo || !y) return "";
    return (
      String(y) +
      "-" +
      (mo < 10 ? "0" + mo : String(mo)) +
      "-" +
      (d < 10 ? "0" + d : String(d))
    );
  }
  return "";
}

function parseMoneyCell_(value) {
  if (typeof value === "number") return value;
  var clean = String(value || "").replace(/[^\d.-]/g, "");
  return Number(clean || 0) || 0;
}

function ensureSheetMaxColumns_(sheet, requiredCols) {
  var cols = Math.max(1, Number(requiredCols) || 1);
  var maxCols = sheet.getMaxColumns();
  if (maxCols >= cols) return;
  if (maxCols < 1) {
    sheet.insertColumns(1, cols);
    return;
  }
  sheet.insertColumnsAfter(maxCols, cols - maxCols);
}

function sheetHasAnyDataRows_(sheet, startRow, colCount) {
  var fromRow = Math.max(1, Number(startRow) || 1);
  var cols = Math.max(1, Number(colCount) || 1);
  var lastRow = sheet.getLastRow();
  if (lastRow < fromRow) return false;
  var rowCount = lastRow - fromRow + 1;
  var values = sheet.getRange(fromRow, 1, rowCount, cols).getDisplayValues();
  for (var i = 0; i < values.length; i++) {
    for (var j = 0; j < values[i].length; j++) {
      if (String(values[i][j] || "").trim()) return true;
    }
  }
  return false;
}

function ensureSpaSheet_(name, headers, seedRows) {
  if (!headers || !headers.length) {
    throw new Error("Sheet " + name + " chưa có cấu hình headers.");
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  ensureSheetHeadersByAlias_(sh, 1, headers, getHeaderAliasMapForSheet_(name));
  sh.setFrozenRows(1);

  var hasData = sheetHasAnyDataRows_(sh, 2, headers.length);
  if (!hasData && seedRows && seedRows.length) {
    var maxRows = sh.getMaxRows();
    var minRowsNeeded = 1 + seedRows.length;
    if (maxRows < minRowsNeeded) {
      sh.insertRowsAfter(maxRows, minRowsNeeded - maxRows);
    }
    sh.getRange(2, 1, seedRows.length, headers.length).setValues(seedRows);
  }
  return sh;
}

function buildTlcCatalogRows_(nowIso) {
  return {
    phacDoRows: [
      ["1", "PD-TLC-COVAI", "Cổ vai gáy - vùng đầu - an thần mất ngủ", "Cổ vai gáy / vùng đầu", "Chuyên sâu", "Giảm đau cổ vai gáy, an thần, giảm stress, hỗ trợ ngủ sâu, thư giãn thần kinh, phục hồi năng lượng.", true, nowIso],
      ["2", "PD-TLC-DUONGSINH", "Dưỡng sinh chuyên sâu", "Dưỡng sinh phục hồi", "Toàn diện", "Phục hồi từ gốc, tái tạo toàn diện, khai thông khí huyết, giảm stress, phục hồi năng lượng.", true, nowIso],
      ["3", "PD-TLC-PHUCHOI", "Phục hồi chuyên sâu TLC", "Phục hồi chuyên sâu", "Cá nhân hóa", "Tê bì tay chân, viêm khớp vai, thoát vị đĩa đệm, ôn ấm tử cung, thanh lọc tiêu hóa.", true, nowIso],
      ["4", "PD-TLC-COVAI-NAM", "Cổ vai gáy chuyên sâu 1 năm", "Cổ vai gáy", "Liệu trình năm", "Giải phóng gốc căng cơ, phục hồi vận động, tái tạo năng lượng, theo dõi tiến triển suốt liệu trình.", true, nowIso],
      ["5", "PD-TLC-ANTHAN-NAM", "Vùng đầu cổ - an thần ngủ sâu 1 năm", "Đầu cổ / giấc ngủ", "Liệu trình năm", "Giải phóng căng thẳng, an thần dưỡng tâm, hỗ trợ ngủ sâu, duy trì sức khỏe lâu dài.", true, nowIso],
      ["6", "PD-TLC-GOIDAU", "Gội đầu dưỡng sinh an thần", "Da đầu / tóc / thư giãn", "Thư giãn", "Làm sạch sâu, thoáng da đầu, thư giãn vùng đầu, giảm stress, ngủ ngon, dưỡng tóc khỏe.", true, nowIso],
    ],
    dvRows: [
      ["1", "DV-TRAINGHIEM-0D", "PD-TLC-COVAI", "Trải nghiệm", "Trải nghiệm 0đ - test điểm đau", "Cổ vai gáy / vùng đầu", 30, true, nowIso],
      ["2", "DV-NANGOI-0D", "PD-TLC-COVAI", "Trải nghiệm", "Nằm gối nắn chỉnh vai gáy tự thân", "Vai gáy", 30, true, nowIso],
      ["3", "DV-GOI-ANTHAN-199", "PD-TLC-GOIDAU", "Gội đầu dưỡng sinh", "Gội đầu dưỡng sinh an thần", "Da đầu / tóc / vùng đầu", 75, true, nowIso],
      ["4", "DV-GIACHOI-99", "PD-TLC-DUONGSINH", "Dịch vụ nhanh", "Giác hơi dưỡng sinh", "Toàn thân", 30, true, nowIso],
      ["5", "DV-CAOGIO-99", "PD-TLC-DUONGSINH", "Dịch vụ nhanh", "Cạo gió thảo dược", "Toàn thân", 30, true, nowIso],
      ["6", "DV-MASSAGE-VG-149", "PD-TLC-COVAI", "Dịch vụ nhanh", "Đả thông cổ vai gáy nhanh", "Cổ vai gáy", 30, true, nowIso],
      ["7", "DV-NGAMCHAN-ION-150", "PD-TLC-DUONGSINH", "Dịch vụ nhanh", "Sục ngâm chân iOn", "Chân", 30, true, nowIso],
      ["8", "DV-COVAI-499", "PD-TLC-COVAI", "Dưỡng sinh chuyên sâu", "Dưỡng sinh cổ vai gáy", "Cổ vai gáy", 60, true, nowIso],
      ["9", "DV-DAU-ANTHAN-599", "PD-TLC-COVAI", "Dưỡng sinh chuyên sâu", "Dưỡng sinh vùng đầu an thần", "Vùng đầu / cổ", 70, true, nowIso],
      ["10", "DV-LUNGEO-599", "PD-TLC-DUONGSINH", "Dưỡng sinh chuyên sâu", "Dưỡng sinh lưng eo", "Lưng eo", 70, true, nowIso],
      ["11", "DV-CHAN-399", "PD-TLC-DUONGSINH", "Dưỡng sinh chuyên sâu", "Dưỡng sinh chân", "Chân", 60, true, nowIso],
      ["12", "DV-TOANTHAN-899", "PD-TLC-DUONGSINH", "Dưỡng sinh chuyên sâu", "Dưỡng sinh toàn thân", "Toàn thân", 90, true, nowIso],
      ["13", "DV-MAT-XOANG-399", "PD-TLC-DUONGSINH", "Dưỡng sinh chuyên sâu", "Chăm sóc vùng mặt (xoang)", "Vùng mặt / xoang", 60, true, nowIso],
      ["14", "DV-TEBI-699", "PD-TLC-PHUCHOI", "Phục hồi chuyên sâu TLC", "Tê bì tay chân", "Tay chân", 90, true, nowIso],
      ["15", "DV-VIEMKHOPVAI-899", "PD-TLC-PHUCHOI", "Phục hồi chuyên sâu TLC", "Viêm quanh bả vai", "Vai", 120, true, nowIso],
      ["16", "DV-DIADEM-999", "PD-TLC-PHUCHOI", "Phục hồi chuyên sâu TLC", "Chăm sóc đĩa đệm / thoát vị đĩa đệm", "Lưng / cột sống", 120, true, nowIso],
      ["17", "DV-TUCUNG-599", "PD-TLC-PHUCHOI", "Phục hồi chuyên sâu TLC", "Ôn ấm tử cung", "Bụng / nữ giới", 90, true, nowIso],
      ["18", "DV-TIEUHOA-699", "PD-TLC-PHUCHOI", "Phục hồi chuyên sâu TLC", "Thanh lọc tiêu hóa", "Bụng / tiêu hóa", 90, true, nowIso],
    ],
    goiRows: [
      ["1", "GOI-TRAINGHIEM-0D", "DV-TRAINGHIEM-0D", "Trải nghiệm 0đ 30 phút", "KHUYEN_MAI", 1, 0, 1, 0, 0, true, nowIso],
      ["2", "GOI-NANGOI-0D", "DV-NANGOI-0D", "Nằm gối nắn chỉnh vai gáy tự thân 0đ", "KHUYEN_MAI", 1, 0, 1, 0, 0, true, nowIso],
      ["3", "GOI-GOI-ANTHAN-199", "DV-GOI-ANTHAN-199", "Gội đầu dưỡng sinh an thần", "LE", 1, 0, 1, 199000, 0, true, nowIso],
      ["4", "GOI-GIACHOI-99", "DV-GIACHOI-99", "Giác hơi dưỡng sinh", "LE", 1, 0, 1, 99000, 0, true, nowIso],
      ["5", "GOI-CAOGIO-99", "DV-CAOGIO-99", "Cạo gió thảo dược", "LE", 1, 0, 1, 99000, 0, true, nowIso],
      ["6", "GOI-MASSAGE-VG-149", "DV-MASSAGE-VG-149", "Đả thông cổ vai gáy nhanh", "LE", 1, 0, 1, 149000, 0, true, nowIso],
      ["7", "GOI-NGAMCHAN-ION-150", "DV-NGAMCHAN-ION-150", "Sục ngâm chân iOn", "LE", 1, 0, 1, 150000, 0, true, nowIso],
      ["8", "GOI-COVAI-499", "DV-COVAI-499", "Dưỡng sinh cổ vai gáy", "LE", 1, 0, 1, 499000, 0, true, nowIso],
      ["9", "GOI-DAU-ANTHAN-599", "DV-DAU-ANTHAN-599", "Dưỡng sinh vùng đầu an thần", "LE", 1, 0, 1, 599000, 0, true, nowIso],
      ["10", "GOI-LUNGEO-599", "DV-LUNGEO-599", "Dưỡng sinh lưng eo", "LE", 1, 0, 1, 599000, 0, true, nowIso],
      ["11", "GOI-CHAN-399", "DV-CHAN-399", "Dưỡng sinh chân", "LE", 1, 0, 1, 399000, 0, true, nowIso],
      ["12", "GOI-TOANTHAN-899", "DV-TOANTHAN-899", "Dưỡng sinh toàn thân", "LE", 1, 0, 1, 899000, 0, true, nowIso],
      ["13", "GOI-MAT-XOANG-399", "DV-MAT-XOANG-399", "Chăm sóc vùng mặt (xoang)", "LE", 1, 0, 1, 399000, 0, true, nowIso],
      ["14", "GOI-TEBI-699", "DV-TEBI-699", "Tê bì tay chân", "LE", 1, 0, 1, 699000, 0, true, nowIso],
      ["15", "GOI-VIEMKHOPVAI-899", "DV-VIEMKHOPVAI-899", "Viêm quanh bả vai", "LE", 1, 0, 1, 899000, 0, true, nowIso],
      ["16", "GOI-DIADEM-999", "DV-DIADEM-999", "Chăm sóc đĩa đệm / thoát vị đĩa đệm", "LE", 1, 0, 1, 999000, 0, true, nowIso],
      ["17", "GOI-TUCUNG-599", "DV-TUCUNG-599", "Ôn ấm tử cung", "LE", 1, 0, 1, 599000, 0, true, nowIso],
      ["18", "GOI-TIEUHOA-699", "DV-TIEUHOA-699", "Thanh lọc tiêu hóa", "LE", 1, 0, 1, 699000, 0, true, nowIso],
      ["19", "GOI-THANG-COVAI-4B", "DV-COVAI-499", "Gói chăm sóc cổ vai gáy tháng", "THANG", 4, 0, 4, 1990000, 0, true, nowIso],
      ["20", "GOI-THANG-ANTHAN-6B", "DV-DAU-ANTHAN-599", "Gói an thần ngủ sâu tháng", "THANG", 6, 0, 6, 2990000, 0, true, nowIso],
      ["21", "GOI-THANG-VIP-12B", "DV-TOANTHAN-899", "Gói phục hồi chuyên sâu VIP tháng", "THANG", 12, 0, 12, 5990000, 0, true, nowIso],
      ["22", "GOI-NAM-COVAI-48B", "DV-COVAI-499", "Gói năm cổ vai gáy", "NAM", 48, 0, 48, 16800000, 0, true, nowIso],
      ["23", "GOI-NAM-ANTHAN-48B", "DV-DAU-ANTHAN-599", "Gói năm an thần ngủ sâu", "NAM", 48, 0, 48, 19200000, 0, true, nowIso],
    ],
  };
}

function buildTlcBedRows_(nowIso) {
  return [
    ["1", "P101", "Giường trị liệu 01", "Trị liệu", SPA_ROOM_STATUSES.AVAILABLE, 1, "Khu trị liệu TLC", nowIso],
    ["2", "P102", "Giường trị liệu 02", "Trị liệu", SPA_ROOM_STATUSES.AVAILABLE, 1, "Khu trị liệu TLC", nowIso],
    ["3", "P103", "Giường trị liệu 03", "Trị liệu", SPA_ROOM_STATUSES.AVAILABLE, 1, "Khu trị liệu TLC", nowIso],
    ["4", "P104", "Giường trị liệu 04", "Trị liệu", SPA_ROOM_STATUSES.AVAILABLE, 1, "Khu trị liệu TLC", nowIso],
    ["5", "P105", "Giường trị liệu 05", "Trị liệu", SPA_ROOM_STATUSES.AVAILABLE, 1, "Khu trị liệu TLC", nowIso],
    ["6", "P106", "Giường trị liệu 06", "Trị liệu", SPA_ROOM_STATUSES.AVAILABLE, 1, "Khu trị liệu TLC", nowIso],
    ["7", "P107", "Giường trị liệu 07", "Trị liệu", SPA_ROOM_STATUSES.AVAILABLE, 1, "Khu trị liệu TLC", nowIso],
    ["8", "P108", "Giường trị liệu 08", "Trị liệu", SPA_ROOM_STATUSES.AVAILABLE, 1, "Khu trị liệu TLC", nowIso],
    ["9", "P109", "Giường trị liệu 09", "Trị liệu", SPA_ROOM_STATUSES.AVAILABLE, 1, "Khu trị liệu TLC", nowIso],
    ["10", "G201", "Giường gội 01", "Gội đầu", SPA_ROOM_STATUSES.AVAILABLE, 1, "Khu gội đầu dưỡng sinh TLC", nowIso],
    ["11", "G202", "Giường gội 02", "Gội đầu", SPA_ROOM_STATUSES.AVAILABLE, 1, "Khu gội đầu dưỡng sinh TLC", nowIso],
  ];
}

function ensureSpaCatalogSheets_() {
  var dmPhacDo = ensureSpaSheet_("DM_PHAC_DO", SPA_SHEET_HEADERS.DM_PHAC_DO, []);
  var dmDv = ensureSpaSheet_("DM_DICH_VU", SPA_SHEET_HEADERS.DM_DICH_VU, []);
  var dmGoi = ensureSpaSheet_("DM_GOI_DIEU_TRI", SPA_SHEET_HEADERS.DM_GOI_DIEU_TRI, []);

  return {
    dmPhacDo: dmPhacDo,
    dmDv: dmDv,
    dmGoi: dmGoi,
  };
}

function ensureSpaReportingSheets_() {
  var dmSp = ensureSpaSheet_("DM_SAN_PHAM_DUOC_LIEU", SPA_SHEET_HEADERS.DM_SAN_PHAM_DUOC_LIEU, []);
  var ctBan = ensureSpaSheet_("CT_BAN", SPA_SHEET_HEADERS.CT_BAN, []);
  var tdSuDung = ensureSpaSheet_("THEO_DOI_SU_DUNG_GOI", SPA_SHEET_HEADERS.THEO_DOI_SU_DUNG_GOI, []);
  var bc = ensureSpaSheet_("BAO_CAO_NGAY_THANG_NAM", SPA_SHEET_HEADERS.BAO_CAO_NGAY_THANG_NAM, []);

  return {
    dmSp: dmSp,
    ctBan: ctBan,
    tdSuDung: tdSuDung,
    bc: bc,
  };
}

function ensureSpaFoundation_() {
  var catalog = ensureSpaCatalogSheets_();
  var reporting = ensureSpaReportingSheets_();
  return {
    dmPhacDo: catalog.dmPhacDo,
    dmDv: catalog.dmDv,
    dmGoi: catalog.dmGoi,
    dmSp: reporting.dmSp,
    ctBan: reporting.ctBan,
    tdSuDung: reporting.tdSuDung,
    bc: reporting.bc,
  };
}

function ensureCoreBusinessSheet_(name, headers, dataStartRow) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  var headerRow = Math.max(1, Number(dataStartRow || 3) - 1);
  ensureSheetHeadersByAlias_(sh, headerRow, headers, getHeaderAliasMapForSheet_(name));
  if (shouldForceExactCoreBusinessHeaders_(name)) {
    forceExactSheetHeaders_(sh, headerRow, headers);
  }
  sh.setFrozenRows(Math.max(1, headerRow));
  return sh;
}

function clearSheetBody_(sheet, dataStartRow) {
  var startRow = Math.max(Number(dataStartRow || 3), 1);
  var lastRow = sheet.getLastRow();
  if (lastRow < startRow) return;
  sheet
    .getRange(startRow, 1, lastRow - startRow + 1, Math.max(sheet.getLastColumn(), 1))
    .clearContent();
}

function ensureCoreBankSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("BANK");
  if (!sh) sh = ss.insertSheet("BANK");
  ensureSheetMaxColumns_(sh, 6);

  var keyValueRows = [
    ["bankCode", "mbbank"],
    ["accountNumber", "0000000000"],
    ["accountName", "SPA Manager"],
  ];
  for (var i = 0; i < keyValueRows.length; i++) {
    var rowNo = i + 1;
    var keyCell = String(sh.getRange(rowNo, 1).getDisplayValue() || "").trim();
    var valCell = String(sh.getRange(rowNo, 2).getDisplayValue() || "").trim();
    if (!keyCell) sh.getRange(rowNo, 1).setValue(keyValueRows[i][0]);
    if (!valCell) sh.getRange(rowNo, 2).setValue(keyValueRows[i][1]);
  }

  var transferHeader = [
    "thoiGian",
    "khachHang",
    "soTien",
    "noiDung",
    "maDonHang",
    "trangThai",
  ];
  ensureSheetHeadersByAlias_(sh, 7, transferHeader, getHeaderAliasMapForSheet_("BANK_TRANSFER"));
  sh.setFrozenRows(7);
  return sh;
}

function ensureSpaCoreBusinessSheets_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var stockSheetAlias = ss.getSheetByName("QUẢN LÝ KHO");
  var stockSheetPrimary = ss.getSheetByName("QUAN_LY_KHO");
  if (!stockSheetPrimary && stockSheetAlias) {
    stockSheetAlias.setName("QUAN_LY_KHO");
  }

  var result = {};
  result.orderSheet = ensureCoreBusinessSheet_(
    "DON_HANG",
    SPA_CORE_SHEET_HEADERS.DON_HANG,
    3,
  );
  result.receiptSheet = ensureCoreBusinessSheet_(
    "NHAP_HANG",
    SPA_CORE_SHEET_HEADERS.NHAP_HANG,
    3,
  );
  result.progressCustomerSheet = ensureCoreBusinessSheet_(
    "TIEN_TRINH_KHACH",
    SPA_CORE_SHEET_HEADERS.TIEN_TRINH_KHACH,
    3,
  );
  result.productSheet = ensureCoreBusinessSheet_(
    "SAN_PHAM",
    SPA_CORE_SHEET_HEADERS.SAN_PHAM,
    3,
  );
  result.stockSheet = ensureCoreBusinessSheet_(
    "QUAN_LY_KHO",
    SPA_CORE_SHEET_HEADERS.QUAN_LY_KHO,
    3,
  );
  result.bankSheet = ensureCoreBankSheet_();
  return result;
}

function ensureSpaRuntimeFlags_() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty("enable_inventory")) {
    props.setProperty("enable_inventory", "true");
  }
}

function deleteLegacySpaAccountingSheetsIfPresent_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return [];
  var names = ["CONG" + "_NO_KHACH", "CONG" + "_NO_NCC"];
  var removed = [];
  for (var i = 0; i < names.length; i++) {
    var sh = ss.getSheetByName(names[i]);
    if (!sh) continue;
    ss.deleteSheet(sh);
    removed.push(names[i]);
  }
  return removed;
}

function replaceSpaSheetData_(sheetName, headers, rows) {
  var sh = ensureSpaSheet_(sheetName, headers, []);
  var lastRow = sh.getLastRow();
  if (lastRow > 1) sh.getRange(2, 1, lastRow - 1, headers.length).clearContent();
  if (rows && rows.length) {
    sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
}

function loadSpaPresetTlcData() {
  try {
    ensureSpaCatalogSheets_();
    return {
      success: true,
      message:
        "Đã rà soát header sheet danh mục (DM_PHAC_DO, DM_DICH_VU, DM_GOI_DIEU_TRI). Không ghi đè dữ liệu hiện có.",
      data: {
        catalogSheets: SPA_CATALOG_UI_SHEET_NAMES.slice(),
      },
    };
  } catch (e) {
    var msg = "Lỗi loadSpaPresetTlcData: " + e.message;
    Logger.log(msg);
    return { success: false, message: msg };
  }
}

function initSpaSheets() {
  try {
    ensureSpaRuntimeFlags_();
    var foundation = ensureSpaFoundation_();
    var coreSheets = ensureSpaCoreBusinessSheets_();
    var opsSheets = ensureSpaOperationalFoundation_();
    var removedLegacyAccountingSheets = deleteLegacySpaAccountingSheetsIfPresent_();
    rebuildSpaOpsSheetToCanonical_("GIUONG_TRI_LIEU", SPA_BED_HEADERS);
    rebuildSpaOpsSheetToCanonical_("PHIEN_DICH_VU", SPA_SESSION_HEADERS);
    rebuildSpaOpsSheetToCanonical_("NHAN_VIEN", SPA_STAFF_HEADERS);
    rebuildSpaOpsSheetToCanonical_("CHI_TIET_DICH_VU", SPA_SESSION_SERVICE_HEADERS);
    rebuildSpaOpsSheetToCanonical_("CHAM_CONG", SPA_ATTENDANCE_HEADERS);
    rebuildSpaOpsSheetToCanonical_("CHECKLIST_CA", SPA_CHECKLIST_HEADERS);
    rebuildSpaOpsSheetToCanonical_("VI_PHAM_NV", SPA_VIOLATION_HEADERS);
    rebuildSpaOpsSheetToCanonical_("DON_NGHI_PHEP", SPA_LEAVE_HEADERS);
    rebuildSpaOpsSheetToCanonical_("DAO_TAO_NV", SPA_TRAINING_HEADERS);
    rebuildSpaOpsSheetToCanonical_("BANG_LUONG", SPA_PAYROLL_HEADERS);
    ensureQueueSheet_();
    return {
      success: true,
      message: "Đã rà soát cấu trúc sheet spa (header cột). Không chèn dữ liệu mẫu.",
      data: {
        sheets: Object.keys(foundation),
        coreSheets: [
          coreSheets.orderSheet && coreSheets.orderSheet.getName(),
          coreSheets.receiptSheet && coreSheets.receiptSheet.getName(),
          coreSheets.progressCustomerSheet &&
            coreSheets.progressCustomerSheet.getName(),
          coreSheets.productSheet && coreSheets.productSheet.getName(),
          coreSheets.stockSheet && coreSheets.stockSheet.getName(),
          coreSheets.bankSheet && coreSheets.bankSheet.getName(),
        ].filter(Boolean),
        removedLegacyAccountingSheets: removedLegacyAccountingSheets,
        opsSheets: [
          opsSheets.roomSheet && opsSheets.roomSheet.getName(),
          opsSheets.staySheet && opsSheets.staySheet.getName(),
          opsSheets.staffSheet && opsSheets.staffSheet.getName(),
          opsSheets.serviceSheet && opsSheets.serviceSheet.getName(),
        ].filter(Boolean),
      },
    };
  } catch (e) {
    var msg = "Lỗi initSpaSheets: " + e.message;
    Logger.log(msg);
    return { success: false, message: msg };
  }
}

function upgradeCtBanHeaders() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName("CT_BAN");
    if (!sh) {
      return { success: false, message: "Sheet CT_BAN không tồn tại." };
    }

    var headers = SPA_SHEET_HEADERS.CT_BAN;
    var aliasMap = getHeaderAliasMapForSheet_("CT_BAN");
    var headerRowNumber = 1;
    var headerRow = Math.max(1, headerRowNumber);

    ensureSheetMaxColumns_(sh, headers.length);
    var lastCol = Math.max(sh.getLastColumn(), headers.length);
    var rowValues = sh.getRange(headerRow, 1, 1, lastCol).getDisplayValues()[0];
    var lookup = buildHeaderColumnLookup_(rowValues);
    var missing = [];

    for (var i = 0; i < headers.length; i++) {
      var canonical = String(headers[i] || "").trim();
      if (!canonical) continue;
      if (!lookup[canonical]) {
        missing.push(canonical);
      }
    }

    if (missing.length > 0) {
      var startCol = sh.getLastColumn() + 1;
      ensureSheetMaxColumns_(sh, startCol + missing.length - 1);
      sh.getRange(headerRow, startCol, 1, missing.length).setValues([missing]);
    }

    sh.getRange(headerRow, 1, 1, Math.max(sh.getLastColumn(), headers.length)).setFontWeight("bold");

    return {
      success: true,
      message: "Đã cập nhật header CT_BAN. Các cột mới: " + missing.join(", "),
      data: {
        totalHeaders: headers.length,
        missingColumns: missing
      }
    };
  } catch (e) {
    return { success: false, message: "Lỗi upgradeCtBanHeaders: " + e.message };
  }
}

function simplifySpaSheets() {
  try {
    ensureSpaFoundation_();
    ensureSpaOperationalFoundation_();
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var redundant = [
      "DM_NHOM_DICH_VU",
      "GIAO_DICH_BAN",
      "CT_BAN_GOI",
      "CT_BAN_SAN_PHAM",
      "CONG" + "_NO_KHACH",
      "CONG" + "_NO_NCC",
    ];
    var removed = [];
    for (var i = 0; i < redundant.length; i++) {
      var sh = ss.getSheetByName(redundant[i]);
      if (sh) {
        ss.deleteSheet(sh);
        removed.push(redundant[i]);
      }
    }
    rebuildSpaOpsSheetToCanonical_("GIUONG_TRI_LIEU", SPA_BED_HEADERS);
    rebuildSpaOpsSheetToCanonical_("PHIEN_DICH_VU", SPA_SESSION_HEADERS);
    rebuildSpaOpsSheetToCanonical_("NHAN_VIEN", SPA_STAFF_HEADERS);
    rebuildSpaOpsSheetToCanonical_("CHI_TIET_DICH_VU", SPA_SESSION_SERVICE_HEADERS);
    return {
      success: true,
      message: "Đã giản lược sheet thừa cho mô hình spa.",
      data: { removedSheets: removed },
    };
  } catch (e) {
    var msg = "Lỗi simplifySpaSheets: " + e.message;
    Logger.log(msg);
    return { success: false, message: msg };
  }
}

function assertSetupStep_(stepName, result) {
  if (!result || result.success !== true) {
    var message = (result && result.message) || "Unknown error";
    throw new Error(stepName + " thất bại: " + message);
  }
}

function normalizeSheetDateTimeColumn_(sheet, columnName) {
  if (!sheet) return 0;
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return 0;

  var headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  var idx = headers.indexOf(columnName);
  if (idx < 0) return 0;

  var col = idx + 1;
  var range = sheet.getRange(2, col, lastRow - 1, 1);
  var values = range.getValues();
  var changed = 0;

  for (var i = 0; i < values.length; i++) {
    var v = values[i][0];
    if (v instanceof Date && !isNaN(v.getTime())) {
      values[i][0] = parseSheetDateTimeToVnString_(v);
      changed++;
      continue;
    }
    var raw = String(v || "").trim();
    if (!raw) continue;
    if (!/^\d{4}-\d{2}-\d{2}T/.test(raw)) continue;
    var d = new Date(raw);
    if (isNaN(d.getTime())) continue;
    values[i][0] = parseSheetDateTimeToVnString_(d);
    changed++;
  }

  if (changed > 0) range.setValues(values);
  return changed;
}

function normalizeSpaDateTimeFormat() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("Không lấy được active spreadsheet.");

  var targets = [
    { name: "DM_PHAC_DO", column: "updatedAt" },
    { name: "DM_DICH_VU", column: "updatedAt" },
    { name: "DM_GOI_DIEU_TRI", column: "updatedAt" },
    { name: "DM_SAN_PHAM_DUOC_LIEU", column: "updatedAt" },
    { name: "GIUONG_TRI_LIEU", column: "updatedAt" },
    { name: "CHI_TIET_DICH_VU", column: "thoiGian" },
    { name: "QUEUE", column: "updatedAt" },
  ];

  var totalChanged = 0;
  var details = [];
  for (var i = 0; i < targets.length; i++) {
    var t = targets[i];
    var sh = ss.getSheetByName(t.name);
    var changed = normalizeSheetDateTimeColumn_(sh, t.column);
    totalChanged += changed;
    details.push({ sheet: t.name, column: t.column, changed: changed, exists: !!sh });
  }
  SpreadsheetApp.flush();
  Logger.log(JSON.stringify(details));
  return {
    success: true,
    message: "Đã chuẩn hóa định dạng thời gian sang US format.",
    data: { totalChanged: totalChanged, details: details },
  };
}

function initSpaOperationalSheets() {
  try {
    var foundation = ensureSpaOperationalFoundation_();
    return {
      success: true,
      message: "Đã khởi tạo sheet vận hành spa (giường/phiên/nhân viên).",
      data: {
        sheets: [
          foundation.roomSheet && foundation.roomSheet.getName(),
          foundation.staySheet && foundation.staySheet.getName(),
          foundation.staffSheet && foundation.staffSheet.getName(),
          foundation.serviceSheet && foundation.serviceSheet.getName(),
        ].filter(Boolean),
      },
    };
  } catch (e) {
    return {
      success: false,
      message: "Lỗi initSpaOperationalSheets: " + e.message,
    };
  }
}

function hasAnyDataInCoreSheet_(sheetName, dataStartRow, colCount) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss && ss.getSheetByName(sheetName);
  if (!sh) return false;
  return sheetHasAnyDataRows_(sh, dataStartRow || 3, colCount || sh.getLastColumn() || 1);
}

function buildVnDateWithOffset_(offsetDays) {
  // Trả về US format "MM/DD/yyyy"
  var dayMs = 24 * 60 * 60 * 1000;
  var now = new Date();
  var target = new Date(now.getTime() + (Number(offsetDays) || 0) * dayMs);
  var m = String(target.getMonth() + 1).padStart(2, "0");
  var day = String(target.getDate()).padStart(2, "0");
  var y = target.getFullYear();
  return m + "/" + day + "/" + y;
}

function normalizeSeedRows_(rows, colCount) {
  var cols = Math.max(1, Number(colCount) || 1);
  var out = [];
  var src = rows || [];
  for (var i = 0; i < src.length; i++) {
    var row = src[i] || [];
    var normalized = [];
    for (var c = 0; c < cols; c++) {
      normalized.push(c < row.length ? row[c] : "");
    }
    out.push(normalized);
  }
  return out;
}

function seedRowsIfMissing_(sheetName, startRow, headers, rows, force) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(sheetName);
  if (!sh) return { sheet: sheetName, seeded: false, exists: false, reason: "missing-sheet" };

  var cols = Math.max(1, (headers && headers.length) || sh.getLastColumn() || 1);
  ensureSheetMaxColumns_(sh, cols);
  var normalizedRows = normalizeSeedRows_(rows, cols);
  if (!normalizedRows.length) {
    return { sheet: sheetName, seeded: false, exists: true, reason: "no-seed-rows" };
  }

  var dataStart = Math.max(1, Number(startRow) || 1);
  var hasData = sheetHasAnyDataRows_(sh, dataStart, cols);
  if (hasData && !force) {
    return { sheet: sheetName, seeded: false, exists: true, reason: "has-data" };
  }

  if (hasData && force) {
    var lastRow = sh.getLastRow();
    if (lastRow >= dataStart) {
      sh.getRange(dataStart, 1, lastRow - dataStart + 1, cols).clearContent();
    }
  }

  var minRows = dataStart - 1 + normalizedRows.length;
  if (sh.getMaxRows() < minRows) {
    sh.insertRowsAfter(sh.getMaxRows(), minRows - sh.getMaxRows());
  }
  sh.getRange(dataStart, 1, normalizedRows.length, cols).setValues(normalizedRows);
  return { sheet: sheetName, seeded: true, exists: true, rows: normalizedRows.length };
}

function seedSpaBootstrapDemoData_(options) {
  var opts = options || {};
  if (opts.seedDemoData === false) {
    return { success: true, skipped: true, reason: "seedDemoData=false" };
  }

  ensureSpaRuntimeFlags_();
  ensureSpaFoundation_();
  ensureSpaCoreBusinessSheets_();
  ensureSpaOperationalFoundation_();
  ensureQueueSheet_();

  return {
    success: true,
    skipped: true,
    message:
      "Đã rà soát cấu trúc sheet (header cột). Không tự chèn dữ liệu demo/preset vào sheet.",
    data: {
      seeded: false,
      note: "Dữ liệu hiện có trên spreadsheet được giữ nguyên.",
    },
  };
}

function inspectSpaSheetsState() {
  var required = [
    "DON_HANG",
    "NHAP_HANG",
    "SAN_PHAM",
    "QUAN_LY_KHO",
    "BANK",
    "DM_PHAC_DO",
    "DM_DICH_VU",
    "DM_GOI_DIEU_TRI",
    "DM_SAN_PHAM_DUOC_LIEU",
    "CT_BAN",
    "THEO_DOI_SU_DUNG_GOI",
    "BAO_CAO_NGAY_THANG_NAM",
    "QUEUE",
    "GIUONG_TRI_LIEU",
    "PHIEN_DICH_VU",
    "TIEN_TRINH_KHACH",
    "NHAN_VIEN",
    "CHI_TIET_DICH_VU",
    "LICH_LAM_VIEC",
    "CHAM_CONG",
    "CHECKLIST_CA",
    "VI_PHAM_NV",
    "DON_NGHI_PHEP",
    "DAO_TAO_NV",
    "BANG_LUONG",
  ];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("Không lấy được active spreadsheet. Hãy chạy từ project gắn với Google Sheet.");

  var report = [];
  for (var i = 0; i < required.length; i++) {
    var name = required[i];
    var sh = ss.getSheetByName(name);
    if (!sh) {
      report.push({ sheet: name, exists: false, lastRow: 0, lastColumn: 0, headerA1: "" });
      continue;
    }
    report.push({
      sheet: name,
      exists: true,
      lastRow: sh.getLastRow(),
      lastColumn: sh.getLastColumn(),
      headerA1: String(sh.getRange(1, 1).getDisplayValue() || ""),
    });
  }
  Logger.log(JSON.stringify(report));
  return { success: true, data: report };
}

function runSpaBootstrapForEditor(options) {
  options = options || {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("Không lấy được active spreadsheet. Hãy mở sheet > Extensions > Apps Script rồi chạy lại.");

  var initResult = initSpaSheets();
  assertSetupStep_("initSpaSheets", initResult);

  var queueResult = setupQueueInfrastructure();
  assertSetupStep_("setupQueueInfrastructure", queueResult);

  var operationalResult = initSpaOperationalSheets();
  assertSetupStep_("initSpaOperationalSheets", operationalResult);

  var normalizeResult = normalizeSpaDateTimeFormat();
  assertSetupStep_("normalizeSpaDateTimeFormat", normalizeResult);

  var seedResult = seedSpaBootstrapDemoData_(options);
  assertSetupStep_("seedSpaBootstrapDemoData_", seedResult);

  SpreadsheetApp.flush();
  var inspectResult = inspectSpaSheetsState();
  assertSetupStep_("inspectSpaSheetsState", inspectResult);

  return {
    success: true,
    message: "Bootstrap spa hoàn tất.",
    data: {
      spreadsheetId: ss.getId(),
      spreadsheetName: ss.getName(),
      initResult: initResult,
      queueResult: queueResult,
      operationalResult: operationalResult,
      normalizeResult: normalizeResult,
      inspectResult: inspectResult.data,
      seedResult: seedResult,
    },
  };
}

function runSpaBootstrapForEditorForceSeed() {
  return runSpaBootstrapForEditor({ seedDemoData: true });
}

function testCreateMockComboData() {
  try {
    ensureSpaFoundation_();
    var now = new Date();
    var offset = now.getTimezoneOffset() * 60000;
    var localDate = new Date(now.getTime() - offset);
    var todayStr = localDate.toISOString().split('T')[0];
    
    var tomorrowDate = new Date(now.getTime() - offset + 86400000);
    var tomorrowStr = tomorrowDate.toISOString().split('T')[0];

    // Mock 1: Khách có lịch hôm nay (Đỏ)
    var lich1 = [
      { id: "L1-1", date: todayStr, status: "PENDING", isTrial: false, isMakeUp: false },
      { id: "L1-2", date: tomorrowStr, status: "PENDING", isTrial: false, isMakeUp: false }
    ];
    createBookingWithItemsInternal_({
      maGiuong: "VIP 1",
      tenKhach: "Test Có Lịch Hôm Nay",
      soDienThoai: "0900111222",
      maNhanVien: "NV01",
      maGoi: "MOCK1",
      tenGoi: "Gói Trị Mụn 5 Buổi",
      tongBuoiCombo: 5,
      giaBanGoi: 5000000,
      tienCoc: 2000000,
      batDauAt: toVnDateTimeString_(now),
      ketThucDuKien: toVnDateTimeString_(new Date(now.getTime() + 3600000)),
      lichTrinhChiTiet: lich1,
      ghiChu: "Test Mock Combo Đỏ",
      serviceItems: [{ maSanPham: "SP1", tenSanPham: "Kem dưỡng mụn", soLuong: 1, donGia: 0 }]
    });

    // Mock 2: Khách đã xong (Xám)
    createBookingWithItemsInternal_({
      maGiuong: "VIP 2",
      tenKhach: "Test Đã Xong",
      soDienThoai: "0900111333",
      maNhanVien: "NV01",
      maGoi: "MOCK2",
      tenGoi: "Gói Nám 3 Buổi",
      tongBuoiCombo: 3,
      giaBanGoi: 3000000,
      tienCoc: 3000000,
      batDauAt: toVnDateTimeString_(new Date(now.getTime() - 86400000)),
      ketThucDuKien: toVnDateTimeString_(new Date(now.getTime() - 82800000)),
      lichTrinhChiTiet: [],
      ghiChu: "Test Mock Combo Xám",
      serviceItems: [{ maSanPham: "SP2", tenSanPham: "Tẩy trang", soLuong: 1, donGia: 0 }]
    });

    // Ép dòng VIP 2 thành CHECKED_OUT và soBuoiConLai = 0 để thành màu Xám
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName("TrangThaiCa");
    if (sh) {
       var lastRow = sh.getLastRow();
       sh.getRange(lastRow, 15).setValue(0); // SO BUOI CON LAI
       sh.getRange(lastRow, 11).setValue("CHECKED_OUT"); // TRANG THAI
    }

    // Mock 3: Khách Còn Buổi (Không phải hôm nay - Xanh)
    var lich3 = [
      { id: "L3-1", date: tomorrowStr, status: "PENDING", isTrial: false, isMakeUp: false }
    ];
    createBookingWithItemsInternal_({
      maGiuong: "VIP 3",
      tenKhach: "Test Ngày Mai",
      soDienThoai: "0900111444",
      maNhanVien: "NV01",
      maGoi: "MOCK3",
      tenGoi: "Gói Triệt Lông 10 Buổi",
      tongBuoiCombo: 10,
      giaBanGoi: 2000000,
      tienCoc: 500000,
      batDauAt: toVnDateTimeString_(now),
      ketThucDuKien: toVnDateTimeString_(new Date(now.getTime() + 3600000)),
      lichTrinhChiTiet: lich3,
      ghiChu: "Test Mock Combo Xanh",
      serviceItems: []
    });

    rebuildCustomerProgressSheet_();
    
    return "Tạo dữ liệu test (đồng bộ qua CT_CA) thành công. Hãy tải lại trang web.";
  } catch(e) {
    return "Lỗi tạo mock data: " + e.message;
  }
}

function seedSpaBootstrapDemoData() {
  return runSpaBootstrapForEditor({ seedDemoData: true });
}

function repairSpaOperationalData(options) {
  return runWithLockOrQueue_("REPAIR_SPA_OPERATIONAL_DATA", { options: options || {} }, function () {
    try {
      return repairSpaOperationalDataInternal_(options || {});
    } catch (e) {
      return { success: false, message: "Lỗi repairSpaOperationalData: " + e.message };
    }
  });
}

function getSpaKpiReport(filters) {
  try {
    ensureSpaFoundation_();
    var req = filters || {};
    var fromDate = normalizeDateOnly_(req.fromDate);
    var toDate = normalizeDateOnly_(req.toDate);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var shCt = ss.getSheetByName("CT_BAN");

    var totals = {
      doanhThuGoi: 0,
      loiNhuanGoi: 0,
      doanhThuSanPham: 0,
      loiNhuanSanPham: 0,
    };
    var goiByPhacDo = {};
    var goiByVung = {};

    if (shCt && shCt.getLastRow() > 1) {
      var rowsCt = shCt.getRange(2, 1, shCt.getLastRow() - 1, SPA_SHEET_HEADERS.CT_BAN.length).getValues();
      for (var i = 0; i < rowsCt.length; i++) {
        var r = rowsCt[i];
        var ngay = normalizeDateOnly_(r[1]);
        if (fromDate && ngay && ngay < fromDate) continue;
        if (toDate && ngay && ngay > toDate) continue;
        var nguonThu = String(r[6] || "").trim().toUpperCase();
        var doanhThu = parseMoneyCell_(r[20]);
        var loiNhuan = parseMoneyCell_(r[21]);
        if (nguonThu === "GOI_DIEU_TRI") {
          totals.doanhThuGoi += doanhThu;
          totals.loiNhuanGoi += loiNhuan;
        } else if (nguonThu === "SAN_PHAM_DUOC_LIEU") {
          totals.doanhThuSanPham += doanhThu;
          totals.loiNhuanSanPham += loiNhuan;
        }
        var maPhacDo = String(r[9] || "").trim() || "KHONG_XAC_DINH";
        var maDv = String(r[10] || "").trim() || "KHONG_XAC_DINH";
        goiByPhacDo[maPhacDo] = (goiByPhacDo[maPhacDo] || 0) + doanhThu;
        goiByVung[maDv] = (goiByVung[maDv] || 0) + doanhThu;
      }
    }

    var tongDoanhThu = totals.doanhThuGoi + totals.doanhThuSanPham;
    var tongLoiNhuan = totals.loiNhuanGoi + totals.loiNhuanSanPham;
    var tiTrongSanPham = tongDoanhThu ? totals.doanhThuSanPham / tongDoanhThu : 0;
    var tiTrongGoi = tongDoanhThu ? totals.doanhThuGoi / tongDoanhThu : 0;

    return {
      success: true,
      data: {
        range: { fromDate: fromDate || "", toDate: toDate || "" },
        kpi: {
          doanhThuSanPham: totals.doanhThuSanPham,
          doanhThuGoi: totals.doanhThuGoi,
          tongDoanhThu: tongDoanhThu,
          loiNhuanSanPham: totals.loiNhuanSanPham,
          loiNhuanGoi: totals.loiNhuanGoi,
          tongLoiNhuan: tongLoiNhuan,
          tiTrongSanPham: tiTrongSanPham,
          tiTrongGoi: tiTrongGoi,
        },
        byPhacDo: goiByPhacDo,
        byVungDv: goiByVung,
      },
    };
  } catch (e) {
    return { success: false, message: "Lỗi: " + e.message };
  }
}

// ===== SPA OPERATIONS MODULE =====
var SPA_ROOM_STATUSES = {
  AVAILABLE: "Sẵn sàng",
  IN_HOUSE: "Đang trị liệu",
  CLEANING: "Đang tạm dừng",
  MAINTENANCE: "Ngưng sử dụng",
};

var SPA_SESSION_STATUSES = {
  BOOKED: "BOOKED",
  IN_HOUSE: "IN_HOUSE",
  CHECKED_OUT: "CHECKED_OUT",
  CANCELLED: "CANCELLED",
  NO_SHOW: "NO_SHOW",
};

var SPA_BED_HEADERS = [
  "STT",
  "maGiuong",
  "tenGiuong",
  "loaiGiuong",
  "trangThaiGiuong",
  "soKhachToiDa",
  "ghiChu",
  "updatedAt",
];
var SPA_SESSION_HEADERS = [
  "STT",
  "maPhien",
  "maLichHen",
  "maTienTrinh",
  "maGiuong",
  "tenKhach",
  "soDienThoai",
  "maNhanVien",
  "tenNhanVien",
  "maDv",
  "tenDichVu",
  "maGoi",
  "tenGoi",
  "tongBuoiCombo",
  "buoiThu",
  "batDauAt",
  "ketThucDuKien",
  "ketThucThucTe",
  "thoiLuongPhut",
  "giaGoi",
  "tienGoi",
  "tienDichVu",
  "tongThanhToan",
  "diemHaiLongKhach",
  "phuongThucThanhToan",
  "trangThaiPhien",
  "ghiChu",
  "tienCoc",
  "lichTrinhChiTiet",
];
var SPA_STAFF_HEADERS = [
  "STT",
  "maNhanVien",
  "tenNhanVien",
  "chucVu",
  "soDienThoai",
  "ngayVaoLam",
  "trangThai",
  "caLamViec",
  "ghiChu",
  "luongCoBanThang",
  "tyLeThuongDichVu",
  "updatedAt",
];
var SPA_ATTENDANCE_HEADERS = [
  "STT",
  "maNhanVien",
  "ngay",
  "checkInAt",
  "checkOutAt",
  "caDuKien",
  "trangThai",
  "ghiChu",
  "updatedAt",
];
var SPA_CHECKLIST_HEADERS = [
  "STT",
  "maNhanVien",
  "ngay",
  "caDuKien",
  "loaiChecklist",
  "chucVu",
  "itemsJson",
  "ghiChu",
  "updatedAt",
];
var SPA_VIOLATION_HEADERS = [
  "STT",
  "maViPham",
  "maNhanVien",
  "ngay",
  "capDo",
  "noiDung",
  "mucTru",
  "trangThai",
  "ghiChu",
  "updatedAt",
];
var SPA_LEAVE_HEADERS = [
  "STT",
  "maDon",
  "maNhanVien",
  "tuNgay",
  "denNgay",
  "lyDo",
  "trangThai",
  "ghiChu",
  "updatedAt",
];
var SPA_TRAINING_HEADERS = [
  "STT",
  "maDaoTao",
  "maNhanVien",
  "loaiDaoTao",
  "tuNgay",
  "denNgay",
  "noiDung",
  "trangThai",
  "ghiChu",
  "updatedAt",
];
var SPA_PAYROLL_HEADERS = [
  "STT",
  "maBangLuong",
  "maKyLuong",
  "tuNgay",
  "denNgay",
  "maNhanVien",
  "tenNhanVien",
  "chucVu",
  "caHoanThanh",
  "caKeHoach",
  "luongCoBan",
  "doanhSoDichVu",
  "tyLeThuong",
  "thuong",
  "truViPham",
  "tongLuong",
  "trangThai",
  "ghiChu",
  "updatedAt",
];
var SPA_SESSION_SERVICE_HEADERS = [
  "STT",
  "maPhien",
  "thoiGian",
  "maSanPham",
  "tenSanPham",
  "nhomHang",
  "donVi",
  "soLuong",
  "donGia",
  "thanhTien",
  "ghiChu",
  "daTruTonKho",
];

function ensureSpaOpsSheet_(name, headers, seedRows) {
  if (!headers || !headers.length) {
    throw new Error("Sheet " + name + " chưa có cấu hình headers.");
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  ensureSheetHeadersByAlias_(sh, 1, headers, getHeaderAliasMapForSheet_(name));
  sh.setFrozenRows(1);
  if (!sheetHasAnyDataRows_(sh, 2, headers.length) && seedRows && seedRows.length) {
    sh.getRange(2, 1, seedRows.length, headers.length).setValues(seedRows);
  }
  return sh;
}

function rebuildSpaOpsSheetToCanonical_(sheetName, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(sheetName);
  if (!sh) {
    return ensureSpaOpsSheet_(sheetName, headers, []);
  }
  var rows = readSpaOpsRows_(sh, headers);
  var values = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (headers.indexOf("STT") >= 0) {
      row.STT = String(values.length + 1);
    }
    var outRow = [];
    for (var h = 0; h < headers.length; h++) {
      var key = headers[h];
      outRow.push(row[key] === undefined ? "" : row[key]);
    }
    values.push(outRow);
  }
  sh.clearContents();
  ensureSheetMaxColumns_(sh, headers.length);
  if (sh.getMaxColumns() > headers.length) {
    sh.deleteColumns(headers.length + 1, sh.getMaxColumns() - headers.length);
  }
  if (sh.getLastRow() > 1) {
    sh.deleteRows(2, sh.getLastRow() - 1);
  }
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (values.length) {
    if (sh.getMaxRows() < values.length + 1) {
      sh.insertRowsAfter(sh.getMaxRows(), values.length + 1 - sh.getMaxRows());
    }
    sh.getRange(2, 1, values.length, headers.length).setValues(values);
  }
  sh.setFrozenRows(1);
  return sh;
}

function readCoreBusinessRows_(sheet, headers, dataStartRow) {
  var startRow = Math.max(Number(dataStartRow || 3), 2);
  var headerRow = startRow - 1;
  var lastRow = sheet.getLastRow();
  if (lastRow < startRow) return [];
  var lastCol = Math.max(sheet.getLastColumn(), headers.length);
  var values = sheet.getRange(startRow, 1, lastRow - startRow + 1, lastCol).getValues();
  var headerColsMap = buildPreferredHeaderColumnsMap_(sheet, headers, headerRow);
  var aliasMap = getHeaderAliasMapForSheet_(sheet.getName());
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
    var obj = { __row: startRow + i };
    for (var h = 0; h < headers.length; h++) {
      var key = headers[h];
      var cols = headerColsMap[key] || [];
      var value = "";
      for (var c = 0; c < cols.length; c++) {
        var colIndex = cols[c];
        var cellValue = row[colIndex - 1];
        if (!isSheetCellBlank_(cellValue)) {
          value = cellValue;
          break;
        }
      }
      obj[key] = value;
      var aliases = (aliasMap && aliasMap[key]) || [];
      for (var a = 0; a < aliases.length; a++) {
        var aliasKey = String(aliases[a] || "").trim();
        if (!aliasKey || obj[aliasKey] !== undefined) continue;
        obj[aliasKey] = value;
      }
    }
    rows.push(obj);
  }
  return rows;
}

function readSpaOpsRows_(sheet, headers) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var lastCol = Math.max(sheet.getLastColumn(), headers.length);
  var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var headerColsMap = buildPreferredHeaderColumnsMap_(sheet, headers);
  var aliasMap = getHeaderAliasMapForSheet_(sheet.getName());
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
    for (var h = 0; h < headers.length; h++) {
      var key = headers[h];
      var cols = headerColsMap[key] || [];
      var value = "";
      for (var c = 0; c < cols.length; c++) {
        var colIndex = cols[c];
        var cellValue = row[colIndex - 1];
        if (!isSheetCellBlank_(cellValue)) {
          value = cellValue;
          break;
        }
      }
      obj[key] = value;
      var aliases = (aliasMap && aliasMap[key]) || [];
      for (var a = 0; a < aliases.length; a++) {
        var aliasKey = String(aliases[a] || "").trim();
        if (!aliasKey || obj[aliasKey] !== undefined) continue;
        obj[aliasKey] = value;
      }
    }
    rows.push(obj);
  }
  return rows;
}

function writeSpaOpsRow_(sheet, headers, rowNumber, payload) {
  ensureSpaOpsSheet_(sheet.getName(), headers, []);
  var headerColsMap = buildPreferredHeaderColumnsMap_(sheet, headers);
  var aliasMap = getHeaderAliasMapForSheet_(sheet.getName());
  var lastCol = sheet.getLastColumn();
  var row = sheet.getRange(rowNumber, 1, 1, lastCol).getValues()[0];
  for (var i = 0; i < headers.length; i++) {
    var key = headers[i];
    var cols = headerColsMap[key] || [];
    var colIndex = cols.length ? cols[0] : 0;
    if (!colIndex) continue;
    var value = payload[key];
    var aliases = (aliasMap && aliasMap[key]) || [];
    for (var a = 0; a < aliases.length; a++) {
      var aliasKey = String(aliases[a] || "").trim();
      if (!aliasKey || payload[aliasKey] === undefined) continue;
      if (value === undefined || payload[aliasKey] !== value) {
        value = payload[aliasKey];
      }
    }
    row[colIndex - 1] = value === undefined ? "" : value;
  }
  sheet.getRange(rowNumber, 1, 1, lastCol).setValues([row]);
  // Ensure date columns use ISO format
  ensureIsoDateColumnsFormatted_(sheet, headers);
}

function preparePhoneFieldsForSheet_(payload) {
  var result = {};
  for (var key in payload) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      var lowerKey = key.toLowerCase();
      if (lowerKey === "sodienthoai" || lowerKey === "sdt" || lowerKey === "phone" || lowerKey === "dienthoai") {
        result[key] = normalizePhoneForSheet_(payload[key]);
      } else {
        result[key] = payload[key];
      }
    }
  }
  return result;
}

function appendSpaOpsRow_(sheet, headers, payload) {
  var rowNo = Math.max(2, sheet.getLastRow() + 1);
  writeSpaOpsRow_(sheet, headers, rowNo, payload);
  // Ensure date columns use ISO format (yyyy-MM-dd) for attendance sheets
  ensureIsoDateColumnsFormatted_(sheet, headers);
  return rowNo;
}

// Set number format for date columns to yyyy-MM-dd to prevent auto-conversion
function ensureIsoDateColumnsFormatted_(sheet, headers) {
  if (!sheet) return;
  var dateKeys = ["ngay", "tuNgay", "denNgay", "ngaySinh", "ngayVaoLam", "ngayDatLich", "ngayTra", "ngayThanhToan", "thang"];
  for (var i = 0; i < headers.length; i++) {
    var key = String(headers[i] || "").toLowerCase();
    if (dateKeys.indexOf(key) !== -1) {
      var col = i + 1;
      var range = sheet.getRange(2, col, Math.max(1, sheet.getLastRow() - 1), 1);
      range.setNumberFormat("yyyy-MM-dd");
    }
  }
}

function prependSpaOpsRow_(sheet, headers, payload) {
  ensureSpaOpsSheet_(sheet.getName(), headers, []);
  var rowNo = 2;
  if (sheet.getLastRow() >= 2) {
    sheet.insertRowsBefore(rowNo, 1);
  }
  writeSpaOpsRow_(sheet, headers, rowNo, payload);
  return rowNo;
}

function normalizeRoomStatus_(status) {
  var s = normalizeCompareText_(status);
  if (s.indexOf("dang tri lieu") !== -1 || s.indexOf("dang o") !== -1)
    return SPA_ROOM_STATUSES.IN_HOUSE;
  if (s.indexOf("dang ve sinh") !== -1 || s.indexOf("dang don") !== -1)
    return SPA_ROOM_STATUSES.CLEANING;
  if (s.indexOf("tam dung") !== -1) return SPA_ROOM_STATUSES.CLEANING;
  if (s.indexOf("da hen truoc") !== -1 || s.indexOf("dat truoc") !== -1)
    return SPA_ROOM_STATUSES.AVAILABLE;
  if (
    s.indexOf("bao tri") !== -1 ||
    s.indexOf("ngung su dung") !== -1 ||
    s.indexOf("ngung hoat dong") !== -1
  )
    return SPA_ROOM_STATUSES.MAINTENANCE;
  if (s.indexOf("san sang") !== -1 || s.indexOf("trong") !== -1)
    return SPA_ROOM_STATUSES.AVAILABLE;
  return SPA_ROOM_STATUSES.AVAILABLE;
}

function parseRoomStatusInputStrict_(status) {
  var s = normalizeCompareText_(status);
  if (!s) return null;
  if (s.indexOf("dang tri lieu") !== -1 || s.indexOf("dang o") !== -1)
    return SPA_ROOM_STATUSES.IN_HOUSE;
  if (s.indexOf("dang ve sinh") !== -1 || s.indexOf("dang don") !== -1)
    return SPA_ROOM_STATUSES.CLEANING;
  if (s.indexOf("tam dung") !== -1) return SPA_ROOM_STATUSES.CLEANING;
  if (s.indexOf("da hen truoc") !== -1 || s.indexOf("dat truoc") !== -1)
    return SPA_ROOM_STATUSES.AVAILABLE;
  if (
    s.indexOf("bao tri") !== -1 ||
    s.indexOf("ngung su dung") !== -1 ||
    s.indexOf("ngung hoat dong") !== -1
  )
    return SPA_ROOM_STATUSES.MAINTENANCE;
  if (s.indexOf("san sang") !== -1 || s.indexOf("trong") !== -1)
    return SPA_ROOM_STATUSES.AVAILABLE;
  return null;
}

function normalizeStayStatus_(status) {
  var s = String(status || "").trim().toUpperCase();
  if (s === "IN_HOUSE") return "IN_HOUSE";
  if (s === "CHECKED_OUT") return "CHECKED_OUT";
  if (s === "CANCELLED") return "CANCELLED";
  if (s === "NO_SHOW") return "NO_SHOW";
  return "BOOKED";
}

function normalizeSpaRoom_(room) {
  room = room || {};
  room.maGiuong = String(room.maGiuong || "").trim();
  room.tenGiuong = String(room.tenGiuong || "").trim();
  room.loaiGiuong = String(room.loaiGiuong || "").trim();
  room.trangThaiGiuong = String(room.trangThaiGiuong || "").trim();
  room.soKhachToiDa = Math.max(parseMoneyNumber_(room.soKhachToiDa), 1);
  room.ghiChu = String(room.ghiChu || "").trim();
  room.updatedAt = String(room.updatedAt || "");
  return room;
}

function parseSessionTienGoi_(stay) {
  return Math.max(parseMoneyNumber_(stay ? stay.tienGoi : 0), 0);
}

function normalizeSpaSession_(stay) {
  stay = stay || {};
  stay.maPhien = String(stay.maPhien || "").trim();
  stay.maLichHen = String(stay.maLichHen || "").trim();
  stay.maGiuong = String(stay.maGiuong || "").trim();
  stay.batDauAt = String(stay.batDauAt || "").trim();
  stay.ketThucDuKien = String(stay.ketThucDuKien || "").trim();
  stay.ketThucThucTe = String(stay.ketThucThucTe || "").trim();
  stay.trangThaiPhien = String(stay.trangThaiPhien || "").trim();
  stay.giaGoi = Math.max(parseMoneyNumber_(stay.giaGoi || stay.giaBanGoi), 0);
  stay.tienGoi = parseSessionTienGoi_(stay);
  if (!parseMoneyNumber_(stay.thoiLuongPhut)) {
    var startMs = toMsOrNaN_(stay.batDauAt);
    var endMs = toMsOrNaN_(stay.ketThucDuKien || stay.ketThucThucTe || "");
    if (isFinite(startMs) && isFinite(endMs) && endMs > startMs) {
      stay.thoiLuongPhut = Math.max(15, Math.round((endMs - startMs) / 60000));
    } else {
      stay.thoiLuongPhut = Math.max(parseMoneyNumber_(stay.thoiLuongPhut), 0);
    }
  } else {
    stay.thoiLuongPhut = Math.max(parseMoneyNumber_(stay.thoiLuongPhut), 0);
  }
  stay.tienDichVu = Math.max(parseMoneyNumber_(stay.tienDichVu), 0);
  stay.tongThanhToan = Math.max(
    parseMoneyNumber_(stay.tongThanhToan) || stay.tienGoi + stay.tienDichVu,
    0,
  );
  stay.diemHaiLongKhach = normalizeSatisfactionScore_(stay.diemHaiLongKhach);
  stay.ghiChu = String(stay.ghiChu || "").trim();
  return stay;
}

function normalizeSatisfactionScore_(value) {
  if (value === "" || value === null || value === undefined) return "";
  var score = Math.round(Number(value));
  if (!isFinite(score) || score < 1 || score > 5) return "";
  return score;
}

function getTreatmentPackageCatalog_() {
  var foundation = ensureSpaFoundation_();
  var goiRows = readSpaOpsRows_(foundation.dmGoi, SPA_SHEET_HEADERS.DM_GOI_DIEU_TRI);
  var dvRows = readSpaOpsRows_(foundation.dmDv, SPA_SHEET_HEADERS.DM_DICH_VU);
  var dvMap = {};
  for (var i = 0; i < dvRows.length; i++) {
    dvMap[String(dvRows[i].maDv || "").trim()] = dvRows[i];
  }
  return goiRows
    .filter(function (row) {
      return String(row.active || "").toUpperCase() !== "FALSE";
    })
    .map(function (row) {
      var service = dvMap[String(row.maDv || "").trim()] || {};
      return {
        maGoi: String(row.maGoi || "").trim(),
        tenGoi: String(row.tenGoi || "").trim(),
        maDv: String(row.maDv || "").trim(),
        tenDichVu: String(service.lop2DichVu || service.tenDv || "").trim(),
        loaiGoi: String(row.loaiGoi || "").trim(),
        soBuoiQuyDoi: Math.max(parseMoneyNumber_(row.soBuoiQuyDoi), 0),
        giaBanGoi: Math.max(parseMoneyNumber_(row.giaBanGoi), 0),
        giaGoi: Math.max(parseMoneyNumber_(row.giaBanGoi), 0),
        giaVonChuanGoi: Math.max(parseMoneyNumber_(row.giaVonChuanGoi), 0),
        thoiLuongPhut: Math.max(parseMoneyNumber_(service.thoiLuongPhut), 0),
        active: String(row.active || "").toUpperCase() !== "FALSE",
      };
    });
}

function resolveTreatmentPackage_(payload, fallbackStay) {
  var list = getTreatmentPackageCatalog_();
  var maGoi = String((payload && payload.maGoi) || (fallbackStay && fallbackStay.maGoi) || "").trim();
  if (!maGoi) return list[0] || null;
  for (var i = 0; i < list.length; i++) {
    if (String(list[i].maGoi || "").trim() === maGoi) return list[i];
  }
  return list[0] || null;
}

function isActiveStaffStatus_(status) {
  var s = normalizeCompareText_(status || "dang lam viec");
  if (!s) return true;
  return (
    s === "dang lam viec" ||
    s === "dang hoat dong" ||
    s.indexOf("dang lam") !== -1 ||
    s.indexOf("hoat dong") !== -1 ||
    s.indexOf("san sang") !== -1
  );
}

function isBlockingStaffStatus_(status) {
  var s = normalizeCompareText_(status || "");
  if (!s) return false;
  return (
    s === "offline" ||
    s.indexOf("tam ngung") !== -1 ||
    s.indexOf("nghi") !== -1 ||
    s.indexOf("off") !== -1
  );
}

var SPA_STAFF_SHIFT_DEFINITIONS = [
  { code: "SANG", label: "Ca sáng", fromMinute: 10 * 60, toMinute: 14 * 60 },
  { code: "CHIEU", label: "Ca chiều", fromMinute: 14 * 60, toMinute: 18 * 60 },
  { code: "TOI", label: "Ca tối", fromMinute: 18 * 60, toMinute: 22 * 60 },
];

function getStaffShiftDefinition_(code) {
  var target = String(code || "").trim().toUpperCase();
  for (var i = 0; i < SPA_STAFF_SHIFT_DEFINITIONS.length; i++) {
    if (SPA_STAFF_SHIFT_DEFINITIONS[i].code === target) return SPA_STAFF_SHIFT_DEFINITIONS[i];
  }
  return null;
}

function normalizeStaffShiftCodes_(value) {
  var rawItems = Array.isArray(value)
    ? value
    : String(value || "").split(/[,\n;|]+/g);
  var out = [];
  var seen = {};
  for (var i = 0; i < rawItems.length; i++) {
    var rawValue = String(rawItems[i] || "").trim();
    var raw = normalizeCompareText_(rawValue);
    var code = rawValue.toUpperCase();
    if (raw.indexOf("sang") !== -1 || raw === "morning") code = "SANG";
    if (raw.indexOf("chieu") !== -1 || raw === "afternoon") code = "CHIEU";
    if (raw.indexOf("toi") !== -1 || raw.indexOf("dem") !== -1 || raw === "evening") code = "TOI";
    if (!getStaffShiftDefinition_(code) || seen[code]) continue;
    seen[code] = true;
    out.push(code);
  }
  return out;
}

function getStaffShiftCodes_(staff) {
  var codes = normalizeStaffShiftCodes_(staff && staff.caLamViec);
  if (codes.length) return codes;
  return ["SANG", "CHIEU", "TOI"];
}

function getMinuteOfDay_(value) {
  var d = parseVnDateTimeToMs_(value);
  if (!isFinite(d)) return null;
  var date = new Date(d);
  return date.getHours() * 60 + date.getMinutes();
}

function isSameLocalDate_(a, b) {
  var da = parseVnDateTimeToMs_(a);
  var db = parseVnDateTimeToMs_(b);
  if (!isFinite(da) || !isFinite(db)) return false;
  var dateA = new Date(da);
  var dateB = new Date(db);
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  );
}

function buildStaffShiftLabel_(codes) {
  var parts = [];
  for (var i = 0; i < codes.length; i++) {
    var shift = getStaffShiftDefinition_(codes[i]);
    if (!shift) continue;
    parts.push(
      shift.label +
        " " +
        ("0" + Math.floor(shift.fromMinute / 60)).slice(-2) +
        ":00-" +
        ("0" + Math.floor(shift.toMinute / 60)).slice(-2) +
        ":00",
    );
  }
  return parts.join(", ");
}

function getShiftCodeByMinuteOfDay_(minute) {
  if (!isFinite(minute) || minute < 0) return null;
  if (minute < 14 * 60) return "SANG";
  if (minute < 18 * 60) return "CHIEU";
  return "TOI";
}

function getStaffShiftViolation_(staff, startIso, endIso) {
  if (!staff || !String(staff.maNhanVien || "").trim()) return null;
  var startMinute = getMinuteOfDay_(startIso);
  var endMinute = getMinuteOfDay_(endIso);
  if (startMinute === null || endMinute === null || endMinute <= startMinute) return null;
  var codes = getStaffShiftCodes_(staff);
  if (!isSameLocalDate_(startIso, endIso)) {
    return {
      message: "Lịch làm việc nhân viên không hỗ trợ phiên qua ngày.",
      allowedLabel: buildStaffShiftLabel_(codes),
    };
  }
  var activeShiftCode = getShiftCodeByMinuteOfDay_(startMinute);
  if (activeShiftCode && codes.indexOf(activeShiftCode) !== -1) return null;
  var activeShift = getStaffShiftDefinition_(activeShiftCode);
  return {
    message:
      "Nhân viên không có ca làm trong buổi " +
      (activeShift ? String(activeShift.label || "").toLowerCase() : "đã chọn") +
      ".",
    allowedLabel: buildStaffShiftLabel_(codes),
  };
}

function getPackageSessionTotal_(pkg) {
  return Math.max(
    parseMoneyNumber_(pkg && pkg.soBuoiQuyDoi) ||
      parseMoneyNumber_(pkg && pkg.soBuoiMua) + parseMoneyNumber_(pkg && pkg.soBuoiTang) ||
      1,
    1,
  );
}

function buildTreatmentProgressKey_(tenKhach, soDienThoai, maGoi) {
  var phone = String(soDienThoai || "").replace(/[^\d]/g, "");
  var customerKey = phone || normalizeCompareText_(tenKhach || "");
  return customerKey + "||" + String(maGoi || "").trim();
}

function isProgressTrackedStayStatus_(status) {
  var normalized = normalizeStayStatus_(status);
  return (
    normalized === SPA_SESSION_STATUSES.BOOKED ||
    normalized === SPA_SESSION_STATUSES.IN_HOUSE ||
    normalized === SPA_SESSION_STATUSES.CHECKED_OUT
  );
}

function nextTreatmentProgressCodeFromRows_(stays) {
  var maxNum = 0;
  for (var i = 0; i < stays.length; i++) {
    var matched = /^TTK(\d+)$/.exec(String(stays[i].maTienTrinh || "").trim());
    if (!matched) continue;
    maxNum = Math.max(maxNum, parseMoneyNumber_(matched[1]));
  }
  return "TTK" + ("00000" + String(maxNum + 1)).slice(-5);
}

function resolveTreatmentProgressMeta_(stays, req, selectedPackage, existingStay) {
  var totalSessions = getPackageSessionTotal_(selectedPackage);
  var forceNewProgress = Boolean(req && req.forceNewProgress === true);
  if (forceNewProgress) {
    return {
      maTienTrinh: nextTreatmentProgressCodeFromRows_(stays),
      tongBuoiCombo: Math.max(totalSessions, 1),
      buoiThu: 1,
      isFirstCharge: true,
    };
  }
  var explicitProgressCode = String(
    (req && req.maTienTrinh) || (existingStay && existingStay.maTienTrinh) || "",
  ).trim();
  if (explicitProgressCode) {
    var relatedExplicit = stays.filter(function (stay) {
      return String(stay.maTienTrinh || "").trim() === explicitProgressCode;
    });
    var countedExplicit = relatedExplicit.filter(function (stay) {
      return isProgressTrackedStayStatus_(stay.trangThaiPhien);
    });
    return {
      maTienTrinh: explicitProgressCode,
      tongBuoiCombo: Math.max(parseMoneyNumber_(existingStay && existingStay.tongBuoiCombo), totalSessions, 1),
      buoiThu: existingStay && parseMoneyNumber_(existingStay.buoiThu)
        ? Math.max(parseMoneyNumber_(existingStay.buoiThu), 1)
        : countedExplicit.length + 1,
      isFirstCharge: countedExplicit.length === 0,
    };
  }

  if (totalSessions <= 1) {
    return {
      maTienTrinh: nextTreatmentProgressCodeFromRows_(stays),
      tongBuoiCombo: 1,
      buoiThu: 1,
      isFirstCharge: true,
    };
  }

  var progressKey = buildTreatmentProgressKey_(
    req && req.tenKhach,
    req && req.soDienThoai,
    selectedPackage && selectedPackage.maGoi,
  );
  var candidates = stays
    .filter(function (stay) {
      if (String(stay.maGoi || "").trim() !== String(selectedPackage && selectedPackage.maGoi || "").trim()) return false;
      if (!String(stay.maTienTrinh || "").trim()) return false;
      return (
        buildTreatmentProgressKey_(stay.tenKhach, stay.soDienThoai, stay.maGoi) === progressKey
      );
    })
    .sort(function (a, b) {
      return toMsOrNaN_(b.batDauAt) - toMsOrNaN_(a.batDauAt);
    });
  for (var i = 0; i < candidates.length; i++) {
    var progressCode = String(candidates[i].maTienTrinh || "").trim();
    var related = stays.filter(function (stay) {
      return String(stay.maTienTrinh || "").trim() === progressCode;
    });
    var counted = related.filter(function (stay) {
      return isProgressTrackedStayStatus_(stay.trangThaiPhien);
    });
    var targetTotal = Math.max(parseMoneyNumber_(candidates[i].tongBuoiCombo), totalSessions, 1);
    if (counted.length < targetTotal) {
      return {
        maTienTrinh: progressCode,
        tongBuoiCombo: targetTotal,
        buoiThu: counted.length + 1,
        isFirstCharge: counted.length === 0,
      };
    }
  }

  return {
    maTienTrinh: nextTreatmentProgressCodeFromRows_(stays),
    tongBuoiCombo: totalSessions,
    buoiThu: 1,
    isFirstCharge: true,
  };
}

function looksLikeSpaShiftedSessionRow_(row, roomCodeSet) {
  var maybeRoomCode = String(row.maTienTrinh || "").trim();
  var shiftedStatus = normalizeStayStatus_(row.tienGoi || "");
  return Boolean(
    maybeRoomCode &&
      roomCodeSet[maybeRoomCode] &&
      String(row.maGiuong || "").trim() &&
      String(row.tenKhach || "").replace(/[^\d]/g, "").length >= 8 &&
      isProgressTrackedStayStatus_(shiftedStatus),
  );
}

function repairShiftedSpaSessionRow_(row, packagesByCode, nextProgressCode) {
  var oldMaGiuong = String(row.maTienTrinh || "").trim();
  var oldTenKhach = String(row.maGiuong || "").trim();
  var oldSoDienThoai = String(row.tenKhach || "").trim();
  var oldMaNhanVien = String(row.soDienThoai || "").trim();
  var oldTenNhanVien = String(row.maNhanVien || "").trim();
  var oldMaDv = String(row.tenNhanVien || "").trim();
  var oldTenDichVu = String(row.maDv || "").trim();
  var oldMaGoi = String(row.tenDichVu || "").trim();
  var oldTenGoi = String(row.maGoi || "").trim();
  var oldBatDauAt = String(row.tenGoi || "").trim();
  var oldKetThucDuKien = String(row.tongBuoiCombo || "").trim();
  var oldKetThucThucTe = String(row.buoiThu || "").trim();
  var oldThoiLuongPhut = parseMoneyNumber_(row.batDauAt);
  var oldGiaGoi = parseMoneyNumber_(row.ketThucDuKien);
  var oldTienGoi = parseMoneyNumber_(row.ketThucThucTe);
  var oldTienDichVu = parseMoneyNumber_(row.thoiLuongPhut);
  var oldTongThanhToan = parseMoneyNumber_(row.giaGoi);
  var oldTrangThai = normalizeStayStatus_(row.tienGoi || "");
  var oldGhiChu = String(row.tienDichVu || "").trim();
  var pkg = packagesByCode[oldMaGoi] || null;
  var totalSessions = getPackageSessionTotal_(pkg);
  return {
    STT: row.STT || "",
    maPhien: String(row.maPhien || "").trim(),
    maLichHen: String(row.maLichHen || "").trim(),
    maTienTrinh: nextProgressCode(),
    maGiuong: oldMaGiuong,
    tenKhach: oldTenKhach,
    soDienThoai: oldSoDienThoai,
    maNhanVien: oldMaNhanVien,
    tenNhanVien: oldTenNhanVien,
    maDv: oldMaDv,
    tenDichVu: oldTenDichVu,
    maGoi: oldMaGoi,
    tenGoi: oldTenGoi,
    tongBuoiCombo: totalSessions,
    buoiThu: 1,
    batDauAt: oldBatDauAt,
    ketThucDuKien: oldKetThucDuKien,
    ketThucThucTe: oldKetThucThucTe,
    thoiLuongPhut: oldThoiLuongPhut,
    giaGoi: oldGiaGoi,
    tienGoi: oldTienGoi,
    tienDichVu: oldTienDichVu,
    tongThanhToan: oldTongThanhToan,
    trangThaiPhien: oldTrangThai,
    ghiChu: oldGhiChu,
  };
}

function repairSpaTreatmentProgressInternal_() {
  var opsFoundation = ensureSpaOperationalFoundation_();
  var catalog = ensureSpaCatalogSheets_();
  var rooms = readSpaOpsRows_(opsFoundation.roomSheet, SPA_BED_HEADERS);
  var packages = readSpaOpsRows_(catalog.dmGoi, SPA_SHEET_HEADERS.DM_GOI_DIEU_TRI);
  var stays = readSpaOpsRows_(opsFoundation.staySheet, SPA_SESSION_HEADERS);
  var roomCodeSet = {};
  for (var r = 0; r < rooms.length; r++) {
    roomCodeSet[String(rooms[r].maGiuong || "").trim()] = true;
  }
  var packagesByCode = {};
  for (var p = 0; p < packages.length; p++) {
    packagesByCode[String(packages[p].maGoi || "").trim()] = packages[p];
  }
  var nextCounter = 0;
  for (var n = 0; n < stays.length; n++) {
    var matched = /^TTK(\d+)$/.exec(String(stays[n].maTienTrinh || "").trim());
    if (matched) nextCounter = Math.max(nextCounter, parseMoneyNumber_(matched[1]));
  }
  var nextCode = function () {
    nextCounter += 1;
    return "TTK" + ("00000" + String(nextCounter)).slice(-5);
  };
  var fixed = 0;
  var normalizedSingle = 0;
  var seenSingleProgress = {};
  for (var i = 0; i < stays.length; i++) {
    var row = stays[i];
    var nextRow = row;
    if (looksLikeSpaShiftedSessionRow_(row, roomCodeSet)) {
      nextRow = repairShiftedSpaSessionRow_(row, packagesByCode, nextCode);
      fixed += 1;
    } else {
      var pkg = packagesByCode[String(row.maGoi || "").trim()] || null;
      var totalSessions = Math.max(parseMoneyNumber_(row.tongBuoiCombo), getPackageSessionTotal_(pkg), 1);
      nextRow.tongBuoiCombo = totalSessions;
      nextRow.buoiThu = Math.max(parseMoneyNumber_(row.buoiThu), 1);
      if (!String(nextRow.maTienTrinh || "").trim()) nextRow.maTienTrinh = nextCode();
      if (totalSessions <= 1) {
        var progressCode = String(nextRow.maTienTrinh || "").trim();
        if (seenSingleProgress[progressCode]) {
          nextRow.maTienTrinh = nextCode();
          nextRow.buoiThu = 1;
          normalizedSingle += 1;
        }
        seenSingleProgress[String(nextRow.maTienTrinh || "").trim()] = true;
      }
    }
    writeSpaOpsRow_(opsFoundation.staySheet, SPA_SESSION_HEADERS, row.__row, nextRow);
  }
  rebuildCustomerProgressSheet_();
  return {
    success: true,
    message:
      "Đã sửa dữ liệu tiến trình: " +
      fixed +
      " dòng lệch cột, " +
      normalizedSingle +
      " tiến trình gói lẻ bị trùng.",
    data: { fixed: fixed, normalizedSingle: normalizedSingle },
  };
}

function repairSpaTreatmentProgressData() {
  return runWithLockOrQueue_("REPAIR_SPA_TREATMENT_PROGRESS", {}, function () {
    try {
      var result = repairSpaTreatmentProgressInternal_();
      if (result && result.success) bumpAppCacheVersion_();
      return result;
    } catch (e) {
      return { success: false, message: "Lỗi repairSpaTreatmentProgressData: " + e.message };
    }
  });
}

function repairSpaCustomerProgressSheet() {
  var repairResult = repairSpaTreatmentProgressData();
  if (!repairResult || repairResult.success !== true) return repairResult;
  try {
    rebuildCustomerProgressSheet_();
    bumpAppCacheVersion_();
    return {
      success: true,
      message: "Đã sửa schema và rebuild TIEN_TRINH_KHACH từ PHIEN_DICH_VU.",
      data: repairResult.data || {},
    };
  } catch (e) {
    return { success: false, message: "Lỗi repairSpaCustomerProgressSheet: " + e.message };
  }
}

function isImmutableSession_(status) {
  var s = String(status || "").trim().toUpperCase();
  return s === "CHECKED_OUT" || s === "CANCELLED";
}

function toLocalDateTimeString_(date) {
  if (!date) return "";
  var d = new Date(date);
  if (isNaN(d.getTime())) return "";

  function pad(num) { return String(num).length < 2 ? '0' + num : num; }
  var YYYY = d.getFullYear();
  var MM = pad(d.getMonth() + 1);
  var DD = pad(d.getDate());
  var HH = pad(d.getHours());
  var mm = pad(d.getMinutes());
  var ss = pad(d.getSeconds());

  return YYYY + "-" + MM + "-" + DD + " " + HH + ":" + mm + ":" + ss;
}

// Format VN "HH:mm DD/MM/yyyy" cho các trường datetime của Sheet
function toVnDateTimeString_(date) {
  if (!date) return "";
  var d = new Date(date);
  if (isNaN(d.getTime())) return "";

  function pad(num) { return String(num).length < 2 ? '0' + num : num; }
  var HH = pad(d.getHours());
  var mm = pad(d.getMinutes());
  var DD = pad(d.getDate());
  var MM = pad(d.getMonth() + 1);
  var yyyy = d.getFullYear();

  return HH + ":" + mm + " " + DD + "/" + MM + "/" + yyyy;
}

function toVnTimeString_(date) {
  if (!date) return "";
  var d = new Date(date);
  if (isNaN(d.getTime())) return "";
  function pad(num) { return String(num).length < 2 ? '0' + num : num; }
  return pad(d.getHours()) + ":" + pad(d.getMinutes());
}

// Parse VN datetime "HH:mm DD/MM/YYYY" to milliseconds
function parseVnDateTimeToMs_(value) {
  var raw = String(value || "").trim();
  if (!raw) return 0;
  
  // Format: "HH:mm DD/MM/YYYY"
  var m = raw.match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    var h = parseInt(m[1], 10);
    var mi = parseInt(m[2], 10);
    var d = parseInt(m[3], 10);
    var mo = parseInt(m[4], 10) - 1;
    var y = parseInt(m[5], 10);
    return new Date(y, mo, d, h, mi).getTime();
  }
  
  // Fallback: try standard Date parsing
  var d = new Date(raw);
  return isFinite(d.getTime()) ? d.getTime() : 0;
}

function parseIsoStringOrNull_(value) {
  var raw = String(value || "").trim();
  if (!raw) return null;

  if (raw.indexOf("T") > -1 || raw.indexOf("Z") > -1) {
    var d = new Date(raw);
    return isNaN(d.getTime()) ? null : toVnDateTimeString_(d);
  }

  // VN datetime format: "HH:mm DD/MM/YYYY"
  var vnMatch = raw.match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (vnMatch) {
    var h = parseInt(vnMatch[1], 10);
    var mi = parseInt(vnMatch[2], 10);
    var d = parseInt(vnMatch[3], 10);
    var mo = parseInt(vnMatch[4], 10) - 1;
    var y = parseInt(vnMatch[5], 10);
    var dateObj = new Date(y, mo, d, h, mi);
    return isNaN(dateObj.getTime()) ? null : toVnDateTimeString_(dateObj);
  }

  var safariSafeStr = raw.replace(/-/g, '/');
  var d2 = new Date(safariSafeStr);
  if (isNaN(d2.getTime())) {
    d2 = new Date(raw);
  }

  return isNaN(d2.getTime()) ? null : toVnDateTimeString_(d2);
}

function diffHoursRoundedUp_(startIso, endIso) {
  var s = parseVnDateTimeToMs_(startIso);
  var e = parseVnDateTimeToMs_(endIso);
  if (!isFinite(s) || !isFinite(e) || e <= s) return 1;
  return Math.max(1, Math.ceil((e - s) / 3600000));
}

function diffNightsRoundedUp_(startIso, endIso) {
  var s = parseVnDateTimeToMs_(startIso);
  var e = parseVnDateTimeToMs_(endIso);
  if (!isFinite(s) || !isFinite(e) || e <= s) return 1;
  return Math.max(1, Math.ceil((e - s) / 86400000));
}

function toMsOrNaN_(value) {
  var ms = parseVnDateTimeToMs_(value);
  return isFinite(ms) ? ms : Number.NaN;
}

function isActiveSpaStayForSchedule_(stay) {
  var status = normalizeStayStatus_(stay ? stay.trangThaiPhien : "");
  return status === SPA_SESSION_STATUSES.BOOKED || status === SPA_SESSION_STATUSES.IN_HOUSE;
}

function resolveStayTimeRange_(stay) {
  stay = normalizeSpaSession_(stay || {});
  var startMs = toMsOrNaN_(stay ? stay.batDauAt : "");
  if (!isFinite(startMs)) return null;
  var rawEndMs = toMsOrNaN_(stay ? stay.ketThucDuKien || stay.ketThucThucTe : "");
  var endMs = isFinite(rawEndMs) && rawEndMs > startMs ? rawEndMs : startMs + 30 * 60 * 1000;
  return { startMs: startMs, endMs: endMs };
}

function compareStayPriorityDesc_(a, b) {
  var aRange = resolveStayTimeRange_(a) || { startMs: Number.NEGATIVE_INFINITY, endMs: Number.NEGATIVE_INFINITY };
  var bRange = resolveStayTimeRange_(b) || { startMs: Number.NEGATIVE_INFINITY, endMs: Number.NEGATIVE_INFINITY };
  if (bRange.startMs !== aRange.startMs) return bRange.startMs - aRange.startMs;
  if (bRange.endMs !== aRange.endMs) return bRange.endMs - aRange.endMs;
  return String(b.maPhien || "").localeCompare(String(a.maPhien || ""), "vi");
}

function buildFallbackActualEndAt_(stay, nowMs) {
  var expectedEndMs = toMsOrNaN_(stay.ketThucDuKien || "");
  if (isFinite(expectedEndMs)) return toVnDateTimeString_(new Date(expectedEndMs));
  var startMs = toMsOrNaN_(stay.batDauAt || "");
  if (isFinite(startMs)) {
    var durationMinutes = Math.max(parseMoneyNumber_(stay.thoiLuongPhut), 15);
    return toVnDateTimeString_(new Date(startMs + durationMinutes * 60000));
  }
  return toVnDateTimeString_(new Date(nowMs || Date.now()));
}

function repairSpaOperationalDataInternal_(options) {
  options = options || {};
  var foundation = ensureSpaOperationalFoundation_();
  var rooms = readSpaOpsRows_(foundation.roomSheet, SPA_BED_HEADERS).map(function (room) {
    return normalizeSpaRoom_(room);
  });
  var stays = readSpaOpsRows_(foundation.staySheet, SPA_SESSION_HEADERS).map(function (stay) {
    return normalizeSpaSession_(stay);
  });
  var nowMs = Date.now();
  var selectedActiveByRoom = {};
  var selectedActiveByStaff = {};
  var selectedActiveStayKeys = {};
  var openInHouseCandidates = [];
  var changedStayCount = 0;
  var changedRoomCount = 0;

  for (var i = 0; i < stays.length; i++) {
    var stay = stays[i];
    var originalStatus = normalizeStayStatus_(stay.trangThaiPhien);
    var startMs = toMsOrNaN_(stay.batDauAt || "");
    var hasActualEnd = Boolean(String(stay.ketThucThucTe || "").trim());

    if (originalStatus === SPA_SESSION_STATUSES.NO_SHOW) {
      if (!hasActualEnd) {
        stay.ketThucThucTe = buildFallbackActualEndAt_(stay, nowMs);
        changedStayCount += 1;
      }
      continue;
    }
    if (originalStatus === SPA_SESSION_STATUSES.CANCELLED) {
      continue;
    }
    if (hasActualEnd) {
      if (originalStatus !== SPA_SESSION_STATUSES.CHECKED_OUT) {
        stay.trangThaiPhien = SPA_SESSION_STATUSES.CHECKED_OUT;
        changedStayCount += 1;
      }
      continue;
    }
    if (originalStatus === SPA_SESSION_STATUSES.CHECKED_OUT) {
      stay.ketThucThucTe = buildFallbackActualEndAt_(stay, nowMs);
      changedStayCount += 1;
      continue;
    }
    if (isFinite(startMs) && startMs > nowMs) {
      if (originalStatus !== SPA_SESSION_STATUSES.BOOKED) {
        stay.trangThaiPhien = SPA_SESSION_STATUSES.BOOKED;
        changedStayCount += 1;
      }
      continue;
    }
    if (originalStatus === SPA_SESSION_STATUSES.IN_HOUSE) {
      openInHouseCandidates.push(stay);
    } else if (originalStatus !== SPA_SESSION_STATUSES.BOOKED) {
      stay.trangThaiPhien = SPA_SESSION_STATUSES.BOOKED;
      changedStayCount += 1;
    }
  }

  openInHouseCandidates.sort(compareStayPriorityDesc_);
  for (var c = 0; c < openInHouseCandidates.length; c++) {
    var candidate = openInHouseCandidates[c];
    var roomCode = String(candidate.maGiuong || "").trim();
    var staffCode = String(candidate.maNhanVien || "").trim();
    if (!roomCode) continue;
    if (selectedActiveByRoom[roomCode]) continue;
    if (staffCode && selectedActiveByStaff[staffCode]) continue;
    selectedActiveByRoom[roomCode] = candidate;
    if (staffCode) selectedActiveByStaff[staffCode] = candidate;
    selectedActiveStayKeys[String(candidate.maPhien || "").trim()] = true;
  }

  for (var s = 0; s < stays.length; s++) {
    var current = stays[s];
    var currentStatus = normalizeStayStatus_(current.trangThaiPhien);
    if (
      currentStatus === SPA_SESSION_STATUSES.IN_HOUSE &&
      !String(current.ketThucThucTe || "").trim() &&
      !selectedActiveStayKeys[String(current.maPhien || "").trim()]
    ) {
      current.trangThaiPhien = SPA_SESSION_STATUSES.BOOKED;
      changedStayCount += 1;
    }
    if (
      currentStatus === SPA_SESSION_STATUSES.BOOKED &&
      String(current.ketThucThucTe || "").trim()
    ) {
      current.trangThaiPhien = SPA_SESSION_STATUSES.CHECKED_OUT;
      changedStayCount += 1;
    }
  }

  for (var r = 0; r < rooms.length; r++) {
    var room = rooms[r];
    var roomCode = String(room.maGiuong || "").trim();
    var currentRoomStatus = normalizeRoomStatus_(room.trangThaiGiuong);
    var nextRoomStatus = currentRoomStatus;
    if (selectedActiveByRoom[roomCode]) {
      nextRoomStatus = SPA_ROOM_STATUSES.IN_HOUSE;
    } else if (currentRoomStatus === SPA_ROOM_STATUSES.MAINTENANCE) {
      nextRoomStatus = SPA_ROOM_STATUSES.MAINTENANCE;
    } else if (currentRoomStatus === SPA_ROOM_STATUSES.CLEANING) {
      nextRoomStatus = SPA_ROOM_STATUSES.CLEANING;
    } else {
      nextRoomStatus = SPA_ROOM_STATUSES.AVAILABLE;
    }
    if (nextRoomStatus !== room.trangThaiGiuong) {
      room.trangThaiGiuong = nextRoomStatus;
      room.updatedAt = getNowVnDateTime_();
      changedRoomCount += 1;
    }
  }

  for (var ws = 0; ws < stays.length; ws++) {
    writeSpaOpsRow_(foundation.staySheet, SPA_SESSION_HEADERS, stays[ws].__row, stays[ws]);
  }
  for (var wr = 0; wr < rooms.length; wr++) {
    writeSpaOpsRow_(foundation.roomSheet, SPA_BED_HEADERS, rooms[wr].__row, rooms[wr]);
  }
  rebuildCustomerProgressSheet_();
  bumpAppCacheVersion_();
  return {
    success: true,
    message: "Đã chuẩn hóa dữ liệu vận hành spa trên sheet.",
    data: {
      changedStayCount: changedStayCount,
      changedRoomCount: changedRoomCount,
      activeRoomCount: Object.keys(selectedActiveByRoom).length,
      processedStayCount: stays.length,
      processedRoomCount: rooms.length,
    },
  };
}

function hasTimeOverlap_(startA, endA, startB, endB) {
  return (
    isFinite(startA) &&
    isFinite(endA) &&
    isFinite(startB) &&
    isFinite(endB) &&
    startA < endB &&
    endA > startB
  );
}

function findScheduleConflict_(opts) {
  opts = opts || {};
  var stays = Array.isArray(opts.stays) ? opts.stays : [];
  var roomCode = String(opts.maGiuong || "").trim();
  var staffCode = String(opts.maNhanVien || "").trim();
  var ignoreCode = String(opts.ignoreMaPhien || "").trim();
  var startMs = Number(opts.startMs);
  var endMs = Number(opts.endMs);
  if (!isFinite(startMs) || !isFinite(endMs) || endMs <= startMs) return null;

  for (var i = 0; i < stays.length; i++) {
    var stay = stays[i];
    if (!isActiveSpaStayForSchedule_(stay)) continue;
    var stayCode = String(stay.maPhien || "").trim();
    if (ignoreCode && stayCode === ignoreCode) continue;
    var range = resolveStayTimeRange_(stay);
    if (!range) continue;
    if (!hasTimeOverlap_(startMs, endMs, range.startMs, range.endMs)) continue;

    var stayRoom = String(stay.maGiuong || "").trim();
    var stayStaff = String(stay.maNhanVien || "").trim();
    if (roomCode && stayRoom && stayRoom === roomCode) {
      return { type: "ROOM", stay: stay };
    }
    if (staffCode && stayStaff && stayStaff === staffCode) {
      return { type: "STAFF", stay: stay };
    }
  }
  return null;
}

function consumeNonceOnce_(nonce, ts) {
  var normalizedNonce = String(nonce || "").trim();
  if (!normalizedNonce) return false;

  var normalizedTs = Number(ts || 0);
  if (!isFinite(normalizedTs)) return false;
  if (Math.abs(Date.now() - normalizedTs) > AUTH_NONCE_TTL_MS) return false;

  var key = AUTH_NONCE_CACHE_PREFIX + sha256Hex_(normalizedNonce);
  var ttlSeconds = Math.max(1, Math.ceil(AUTH_NONCE_TTL_MS / 1000));

  try {
    var cache = CacheService.getScriptCache();
    if (cache.get(key)) return false;
    cache.put(key, String(Date.now()), ttlSeconds);
    return true;
  } catch (e) {
    var props = PropertiesService.getScriptProperties();
    if (props.getProperty(key)) return false;
    props.setProperty(key, String(Date.now()));
    return true;
  }
}

function verifyHostAssertion_(assertion, appScope, nonce, ts) {
  var raw = String(assertion || "").trim();
  if (!raw) return { success: false, message: "Thiếu assertion" };

  var parts = raw.split(".");
  if (parts.length !== 3) {
    return { success: false, message: "Assertion sai định dạng JWT" };
  }

  var header = parseJsonSafe_(decodeBase64WebSafeString_(parts[0]));
  var payload = parseJsonSafe_(decodeBase64WebSafeString_(parts[1]));
  if (!header || !payload) {
    return { success: false, message: "Assertion không parse được JSON" };
  }
  if (String(header.alg || "").toUpperCase() !== "HS256") {
    return { success: false, message: "Assertion chỉ hỗ trợ HS256" };
  }

  var secret = String(
    PropertiesService.getScriptProperties().getProperty(AUTH_HOST_SECRET_PROP) ||
      "",
  ).trim();
  if (!secret) {
    return { success: false, message: "Thiếu HOST_ASSERTION_SECRET" };
  }

  var signingInput = parts[0] + "." + parts[1];
  var expectedSignature = encodeBase64WebSafeNoPadding_(
    Utilities.computeHmacSha256Signature(
      signingInput,
      secret,
      Utilities.Charset.UTF_8,
    ),
  );
  if (expectedSignature !== String(parts[2] || "").trim()) {
    return { success: false, message: "Chữ ký assertion không hợp lệ" };
  }

  var expectedScope = normalizeAppScope_(appScope);
  var payloadScope = normalizeAppScope_(payload.scope || expectedScope);
  if (payloadScope !== expectedScope) {
    return { success: false, message: "Scope assertion không khớp" };
  }

  var expectedNonce = String(nonce || "").trim();
  if (expectedNonce && String(payload.nonce || "").trim() !== expectedNonce) {
    return { success: false, message: "Nonce assertion không khớp" };
  }

  var payloadTs = Number(payload.ts || payload.iat || 0);
  var incomingTs = Number(ts || 0);
  if (!isFinite(payloadTs) || !isFinite(incomingTs)) {
    return { success: false, message: "Timestamp assertion không hợp lệ" };
  }
  if (Math.abs(payloadTs - incomingTs) > AUTH_HOST_ASSERTION_MAX_SKEW_MS) {
    return { success: false, message: "Timestamp assertion lệch quá mức cho phép" };
  }
  if (Math.abs(Date.now() - incomingTs) > AUTH_HOST_ASSERTION_MAX_SKEW_MS) {
    return { success: false, message: "Assertion đã hết hạn" };
  }
  if (!consumeNonceOnce_(expectedNonce || String(payload.nonce || ""), incomingTs)) {
    return { success: false, message: "Nonce assertion đã được sử dụng hoặc hết hạn" };
  }

  var email = String(payload.email || "")
    .trim()
    .toLowerCase();
  if (!email) return { success: false, message: "Assertion thiếu email" };

  return { success: true, data: { email: email, scope: expectedScope } };
}

function buildScheduleConflictMessage_(conflict) {
  if (!conflict || !conflict.stay) return "Khung giờ đang bị trùng lịch.";
  var stayCode = String(conflict.stay.maPhien || "").trim() || "(không mã)";
  var customer = String(conflict.stay.tenKhach || "").trim() || "khách khác";
  if (conflict.type === "STAFF") {
    return (
      "Nhân viên đã có lịch trùng khung giờ với phiên " +
      stayCode +
      " (" +
      customer +
      ")."
    );
  }
  return "Giường đã có lịch trùng khung giờ với phiên " + stayCode + " (" + customer + ").";
}

function nextCodeFromRows_(rows, key, prefix, defaultCode) {
  var latest = "";
  var latestNum = -1;
  for (var i = 0; i < rows.length; i++) {
    var code = String(rows[i][key] || "").trim();
    if (code.indexOf(prefix) !== 0) continue;
    var m = code.match(/^(.*?)(\d+)$/);
    if (!m) continue;
    var num = parseInt(m[2], 10);
    if (!isFinite(num) || num <= latestNum) continue;
    latestNum = num;
    latest = code;
  }
  if (!latest) return defaultCode;
  return incrementOrderCode_(latest, defaultCode);
}

function buildStaySummary_(stay, serviceRows) {
  var rawTienGoi = parseSessionTienGoi_(stay);
  stay = normalizeSpaSession_(stay || {});
  stay.tienGoi = rawTienGoi;
  var items = serviceRows.filter(function (x) {
    return String(x.maPhien || "").trim() === String(stay.maPhien || "").trim();
  });
  var tienDichVu = items.reduce(function (sum, x) {
    return sum + Number(x.thanhTien || 0);
  }, 0);
  var tienGoi = rawTienGoi;
  return {
    maPhien: String(stay.maPhien || "").trim(),
    maLichHen: String(stay.maLichHen || "").trim(),
    maTienTrinh: String(stay.maTienTrinh || "").trim(),
    maGiuong: String(stay.maGiuong || "").trim(),
    tenKhach: String(stay.tenKhach || "").trim(),
    soDienThoai: String(stay.soDienThoai || "").trim(),
    maNhanVien: String(stay.maNhanVien || "").trim(),
    tenNhanVien: String(stay.tenNhanVien || "").trim(),
    maDv: String(stay.maDv || "").trim(),
    tenDichVu: String(stay.tenDichVu || "").trim(),
    maGoi: String(stay.maGoi || "").trim(),
    tenGoi: String(stay.tenGoi || "").trim(),
    tongBuoiCombo: Math.max(parseMoneyNumber_(stay.tongBuoiCombo), 1),
    buoiThu: Math.max(parseMoneyNumber_(stay.buoiThu), 1),
    buoiConLai: Math.max(
      Math.max(parseMoneyNumber_(stay.tongBuoiCombo), 1) - Math.max(parseMoneyNumber_(stay.buoiThu), 1),
      0,
    ),
    batDauAt: parseSheetDateTimeToVnString_(stay.batDauAt),
    ketThucDuKien: parseSheetDateTimeToVnString_(stay.ketThucDuKien),
    ketThucThucTe: parseSheetDateTimeToVnString_(stay.ketThucThucTe),
    thoiLuongPhut: Math.max(parseMoneyNumber_(stay.thoiLuongPhut), 0),
    giaGoi: Number(stay.giaGoi || 0),
    tienGoi: tienGoi,
    tienDichVu: tienDichVu,
    tongThanhToan: tienGoi + tienDichVu,
    diemHaiLongKhach: normalizeSatisfactionScore_(stay.diemHaiLongKhach),
    trangThaiPhien: normalizeStayStatus_(stay.trangThaiPhien),
    ghiChu: String(stay.ghiChu || "").trim(),
    serviceItems: items.map(function (x) {
      return {
        serviceItemId: buildServiceItemIdentity_(x),
        maPhien: String(x.maPhien || "").trim(),
        thoiGian: String(x.thoiGian || ""),
        maSanPham: String(x.maSanPham || "").trim(),
        tenSanPham: String(x.tenSanPham || "").trim(),
        nhomHang: String(x.nhomHang || "").trim(),
        donVi: String(x.donVi || "").trim(),
        soLuong: Number(x.soLuong || 0),
        donGia: Number(x.donGia || 0),
        thanhTien: Number(x.thanhTien || 0),
        ghiChu: String(x.ghiChu || "").trim(),
        daTruTonKho: String(x.daTruTonKho || "").trim(),
      };
    }),
  };
}

function deleteSpaRowsMatching_(sheet, rows, predicate) {
  var matched = (rows || [])
    .filter(function (row) {
      return predicate(row);
    })
    .sort(function (a, b) {
      return Number(b.__row || 0) - Number(a.__row || 0);
    });
  for (var i = 0; i < matched.length; i++) {
    if (Number(matched[i].__row || 0) > 0) {
      sheet.deleteRow(matched[i].__row);
    }
  }
}

function ensureSpaOperationalFoundation_() {
  var roomSheet = ensureSpaOpsSheet_("GIUONG_TRI_LIEU", SPA_BED_HEADERS, []);
  var staySheet = ensureSpaOpsSheet_("PHIEN_DICH_VU", SPA_SESSION_HEADERS, []);
  var staffSheet = ensureSpaOpsSheet_("NHAN_VIEN", SPA_STAFF_HEADERS, []);
  var serviceSheet = ensureSpaOpsSheet_(
    "CHI_TIET_DICH_VU",
    SPA_SESSION_SERVICE_HEADERS,
    [],
  );
  var scheduleSheet = ensureSpaOpsSheet_(
    "LICH_LAM_VIEC",
    ["ngay", "caSang", "caChieu", "caToi", "updatedAt"],
    [],
  );
  var attendanceSheet = ensureSpaOpsSheet_("CHAM_CONG", SPA_ATTENDANCE_HEADERS, []);
  var checklistSheet = ensureSpaOpsSheet_("CHECKLIST_CA", SPA_CHECKLIST_HEADERS, []);
  var violationSheet = ensureSpaOpsSheet_("VI_PHAM_NV", SPA_VIOLATION_HEADERS, []);
  var leaveSheet = ensureSpaOpsSheet_("DON_NGHI_PHEP", SPA_LEAVE_HEADERS, []);
  var trainingSheet = ensureSpaOpsSheet_("DAO_TAO_NV", SPA_TRAINING_HEADERS, []);
  var payrollSheet = ensureSpaOpsSheet_("BANG_LUONG", SPA_PAYROLL_HEADERS, []);
  return {
    roomSheet: roomSheet,
    staySheet: staySheet,
    staffSheet: staffSheet,
    serviceSheet: serviceSheet,
    scheduleSheet: scheduleSheet,
    attendanceSheet: attendanceSheet,
    checklistSheet: checklistSheet,
    violationSheet: violationSheet,
    leaveSheet: leaveSheet,
    trainingSheet: trainingSheet,
    payrollSheet: payrollSheet,
  };
}

function getRooms() {
  return withSuccessCache_("read:spa_rooms", 15, function () {
    try {
      var foundation = ensureSpaOperationalFoundation_();
      var rows = readSpaOpsRows_(foundation.roomSheet, SPA_BED_HEADERS);
      return {
        success: true,
        data: rows.map(function (r) {
          return normalizeSpaRoom_({
            maGiuong: String(r.maGiuong || "").trim(),
            tenGiuong: String(r.tenGiuong || "").trim(),
            loaiGiuong: String(r.loaiGiuong || "").trim(),
            trangThaiGiuong: normalizeRoomStatus_(r.trangThaiGiuong),
            soKhachToiDa: Number(r.soKhachToiDa || 0),
            ghiChu: String(r.ghiChu || "").trim(),
            updatedAt: String(r.updatedAt || ""),
          });
        }),
      };
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message, data: [] };
    }
  });
}

function getSpaStaff() {
  return withSuccessCache_("read:spa_staff", 15, function () {
    try {
      var foundation = ensureSpaOperationalFoundation_();
      var rows = readSpaOpsRows_(foundation.staffSheet, SPA_STAFF_HEADERS);
      return {
        success: true,
        data: rows.map(function (row) {
          return mapSpaStaffResponse_(row);
        }),
      };
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message, data: [] };
    }
  });
}

function formatStaffDateDisplay_(value) {
  // Trả về US format "MM/DD/yyyy"
  if (value instanceof Date && !isNaN(value.getTime())) {
    var m = String(value.getMonth() + 1).padStart(2, "0");
    var d = String(value.getDate()).padStart(2, "0");
    var y = value.getFullYear();
    return m + "/" + d + "/" + y;
  }
  // Đã là US format rồi
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(String(value || ""))) {
    return String(value).trim();
  }
  var key = normalizeScheduleDateKey_(value);
  if (!key) key = normalizeDateOnly_(value);
  if (!key) return String(value || "").trim();
  var parts = key.split("-");
  // "yyyy-MM-dd" → "MM/dd/yyyy"
  return parts[1] + "/" + parts[2] + "/" + parts[0];
}

function normalizeSpaStaffRow_(payload) {
  var req = payload || {};
  return {
    STT: "",
    maNhanVien: String(req.maNhanVien || "").trim(),
    tenNhanVien: String(req.tenNhanVien || "").trim(),
    chucVu: String(req.chucVu || "").trim(),
    soDienThoai: String(req.soDienThoai || "").trim(),
    ngayVaoLam: formatStaffDateDisplay_(req.ngayVaoLam),
    trangThai: String(req.trangThai || "").trim() || "Đang làm việc",
    caLamViec: String(req.caLamViec || "").trim(),
    ghiChu: String(req.ghiChu || "").trim(),
    luongCoBanThang: Math.max(Number(req.luongCoBanThang || 0), 0),
    tyLeThuongDichVu:
      req.tyLeThuongDichVu === "" || req.tyLeThuongDichVu === undefined
        ? ""
        : Math.min(Math.max(Number(req.tyLeThuongDichVu || 0), 0), 100),
    updatedAt: getNowVnDateTime_(),
  };
}

function mapSpaStaffResponse_(row) {
  return {
    maNhanVien: String(row.maNhanVien || "").trim(),
    tenNhanVien: String(row.tenNhanVien || "").trim(),
    chucVu: String(row.chucVu || "").trim(),
    soDienThoai: String(row.soDienThoai || "").trim(),
    ngayVaoLam: formatStaffDateDisplay_(row.ngayVaoLam),
    trangThai: String(row.trangThai || "").trim() || "Đang làm việc",
    caLamViec: String(row.caLamViec || "").trim(),
    ghiChu: String(row.ghiChu || "").trim(),
    luongCoBanThang: Math.max(Number(row.luongCoBanThang || 0), 0),
    tyLeThuongDichVu:
      row.tyLeThuongDichVu === "" || row.tyLeThuongDichVu === undefined
        ? ""
        : Math.min(Math.max(Number(row.tyLeThuongDichVu || 0), 0), 100),
    updatedAt: String(row.updatedAt || "").trim(),
  };
}

function suggestNextStaffCode_(staffs) {
  var max = 0;
  for (var i = 0; i < staffs.length; i++) {
    var match = String(staffs[i].maNhanVien || "").match(/NV(\d+)/i);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return "NV" + String(max + 1).padStart(6, "0");
}

function removeStaffCodeFromScheduleList_(csv, staffCode) {
  if (!staffCode) return String(csv || "").trim();
  return String(csv || "")
    .split(",")
    .map(function (x) {
      return String(x || "").trim();
    })
    .filter(function (x) {
      return x && x !== staffCode;
    })
    .join(",");
}

function purgeStaffFromSchedules_(foundation, staffCode) {
  var headers = ["ngay", "caSang", "caChieu", "caToi", "updatedAt"];
  var rows = readSpaOpsRows_(foundation.scheduleSheet, headers);
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var nextSang = removeStaffCodeFromScheduleList_(row.caSang, staffCode);
    var nextChieu = removeStaffCodeFromScheduleList_(row.caChieu, staffCode);
    var nextToi = removeStaffCodeFromScheduleList_(row.caToi, staffCode);
    if (
      nextSang !== String(row.caSang || "").trim() ||
      nextChieu !== String(row.caChieu || "").trim() ||
      nextToi !== String(row.caToi || "").trim()
    ) {
      row.caSang = nextSang;
      row.caChieu = nextChieu;
      row.caToi = nextToi;
      row.updatedAt = getNowVnDateTime_();
      writeSpaOpsRow_(foundation.scheduleSheet, headers, row.__row, row);
    }
  }
}

function purgeStaffFromAttendance_(foundation, staffCode) {
  var rows = readSpaOpsRows_(foundation.attendanceSheet, SPA_ATTENDANCE_HEADERS);
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i].maNhanVien || "").trim() === staffCode) {
      foundation.attendanceSheet.deleteRow(rows[i].__row);
    }
  }
}

function purgeStaffFromChecklists_(foundation, staffCode) {
  var rows = readSpaOpsRows_(foundation.checklistSheet, SPA_CHECKLIST_HEADERS);
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i].maNhanVien || "").trim() === staffCode) {
      foundation.checklistSheet.deleteRow(rows[i].__row);
    }
  }
}

function purgeStaffFromViolations_(foundation, staffCode) {
  var rows = readSpaOpsRows_(foundation.violationSheet, SPA_VIOLATION_HEADERS);
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i].maNhanVien || "").trim() === staffCode) {
      foundation.violationSheet.deleteRow(rows[i].__row);
    }
  }
}

function purgeStaffFromLeaves_(foundation, staffCode) {
  var rows = readSpaOpsRows_(foundation.leaveSheet, SPA_LEAVE_HEADERS);
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i].maNhanVien || "").trim() === staffCode) {
      foundation.leaveSheet.deleteRow(rows[i].__row);
    }
  }
}

function purgeStaffFromTrainings_(foundation, staffCode) {
  var rows = readSpaOpsRows_(foundation.trainingSheet, SPA_TRAINING_HEADERS);
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i].maNhanVien || "").trim() === staffCode) {
      foundation.trainingSheet.deleteRow(rows[i].__row);
    }
  }
}

function purgeStaffFromPayroll_(foundation, staffCode) {
  var rows = readSpaOpsRows_(foundation.payrollSheet, SPA_PAYROLL_HEADERS);
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i].maNhanVien || "").trim() === staffCode) {
      foundation.payrollSheet.deleteRow(rows[i].__row);
    }
  }
}

function countActiveSpaStaysForStaff_(stays, staffCode) {
  var count = 0;
  for (var i = 0; i < stays.length; i++) {
    var stay = stays[i];
    if (String(stay.maNhanVien || "").trim() !== staffCode) continue;
    if (isActiveSpaStayForSchedule_(stay)) count += 1;
  }
  return count;
}

function createSpaStaffInternal_(payload) {
  var req = payload || {};
  var foundation = ensureSpaOperationalFoundation_();
  var staffs = readSpaOpsRows_(foundation.staffSheet, SPA_STAFF_HEADERS);
  var maNhanVien = String(req.maNhanVien || "").trim() || suggestNextStaffCode_(staffs);
  for (var dup = 0; dup < staffs.length; dup++) {
    if (String(staffs[dup].maNhanVien || "").trim() === maNhanVien) {
      return { success: false, message: "Mã nhân viên " + maNhanVien + " đã tồn tại." };
    }
  }
  var staff = normalizeSpaStaffRow_({
    maNhanVien: maNhanVien,
    tenNhanVien: String(req.tenNhanVien || "").trim(),
    chucVu: req.chucVu,
    soDienThoai: req.soDienThoai,
    ngayVaoLam: req.ngayVaoLam,
    trangThai: req.trangThai,
    caLamViec: req.caLamViec,
    ghiChu: req.ghiChu,
    luongCoBanThang: req.luongCoBanThang,
    tyLeThuongDichVu: req.tyLeThuongDichVu,
  });
  appendSpaOpsRow_(foundation.staffSheet, SPA_STAFF_HEADERS, staff);
  bumpAppCacheVersion_();
  return { success: true, message: "Đã thêm nhân viên.", data: mapSpaStaffResponse_(staff) };
}

function createSpaStaff(payload) {
  return runWithLockOrQueue_("CREATE_SPA_STAFF", { payload: payload }, function () {
    try {
      return createSpaStaffInternal_(payload);
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message };
    }
  });
}

function updateSpaStaffInternal_(payload) {
  var req = payload || {};
  var maNhanVien = String(req.maNhanVien || "").trim();
  if (!maNhanVien) return { success: false, message: "Không tìm thấy nhân viên." };
  var foundation = ensureSpaOperationalFoundation_();
  var staffs = readSpaOpsRows_(foundation.staffSheet, SPA_STAFF_HEADERS);
  var staff = null;
  for (var i = 0; i < staffs.length; i++) {
    if (String(staffs[i].maNhanVien || "").trim() === maNhanVien) staff = staffs[i];
  }
  if (!staff) return { success: false, message: "Không tìm thấy nhân viên." };
  if (req.tenNhanVien !== undefined) {
    staff.tenNhanVien = String(req.tenNhanVien || "").trim();
  }
  if (req.chucVu !== undefined) staff.chucVu = String(req.chucVu || "").trim();
  if (req.soDienThoai !== undefined) staff.soDienThoai = String(req.soDienThoai || "").trim();
  if (req.ngayVaoLam !== undefined) staff.ngayVaoLam = String(req.ngayVaoLam || "").trim();
  staff.trangThai = String(req.trangThai || staff.trangThai || "").trim() || "Đang làm việc";
  staff.caLamViec = String(req.caLamViec !== undefined ? req.caLamViec : staff.caLamViec || "").trim();
  if (req.ghiChu !== undefined) staff.ghiChu = String(req.ghiChu || "").trim();
  if (req.luongCoBanThang !== undefined) {
    staff.luongCoBanThang = Math.max(Number(req.luongCoBanThang || 0), 0);
  }
  if (req.tyLeThuongDichVu !== undefined) {
    staff.tyLeThuongDichVu =
      req.tyLeThuongDichVu === "" || req.tyLeThuongDichVu === undefined
        ? ""
        : Math.min(Math.max(Number(req.tyLeThuongDichVu || 0), 0), 100);
  }
  staff.updatedAt = getNowVnDateTime_();
  writeSpaOpsRow_(foundation.staffSheet, SPA_STAFF_HEADERS, staff.__row, staff);
  bumpAppCacheVersion_();
  return { success: true, message: "Đã cập nhật nhân viên.", data: mapSpaStaffResponse_(staff) };
}

function updateSpaStaff(payload) {
  return runWithLockOrQueue_("UPDATE_SPA_STAFF", { payload: payload }, function () {
    try {
      return updateSpaStaffInternal_(payload);
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message };
    }
  });
}

function deleteSpaStaffInternal_(payload) {
  var req = payload || {};
  var maNhanVien = String(req.maNhanVien || "").trim();
  if (!maNhanVien) return { success: false, message: "Không tìm thấy nhân viên." };
  var foundation = ensureSpaOperationalFoundation_();
  var staffs = readSpaOpsRows_(foundation.staffSheet, SPA_STAFF_HEADERS);
  var staff = null;
  for (var i = 0; i < staffs.length; i++) {
    if (String(staffs[i].maNhanVien || "").trim() === maNhanVien) staff = staffs[i];
  }
  if (!staff) return { success: false, message: "Không tìm thấy nhân viên." };
  var stays = readSpaOpsRows_(foundation.staySheet, SPA_SESSION_HEADERS);
  if (countActiveSpaStaysForStaff_(stays, maNhanVien) > 0) {
    return {
      success: false,
      message: "Nhân viên đang có lịch hẹn hoặc phiên mở, không thể xóa.",
    };
  }
  // Xóa mềm: Chuyển trạng thái nhân viên thành "Nghỉ việc"
  // TUYỆT ĐỐI KHÔNG purge (xóa) dữ liệu lịch sử chấm công, lương, v.v.
  staff.trangThai = "Nghỉ việc";
  writeSpaOpsRow_(foundation.staffSheet, SPA_STAFF_HEADERS, staff.__row, staff);
  bumpAppCacheVersion_();
  return { success: true, message: "Đã xóa nhân viên." };
}

function deleteSpaStaff(payload) {
  return runWithLockOrQueue_("DELETE_SPA_STAFF", { payload: payload }, function () {
    try {
      return deleteSpaStaffInternal_(payload);
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message };
    }
  });
}

function normalizeScheduleDateKey_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  var normalized = normalizeDateOnly_(value);
  if (normalized) return normalized;
  var raw = String(value || "").trim();
  if (!raw) return "";
  var parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return "";
}

function mapStaffScheduleRows_(rows) {
  var output = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i] || {};
    var ngay = normalizeScheduleDateKey_(row.ngay);
    if (!ngay) continue;
    output.push({
      ngay: ngay,
      caSang: String(row.caSang || "").trim(),
      caChieu: String(row.caChieu || "").trim(),
      caToi: String(row.caToi || "").trim(),
    });
  }
  return output;
}

function getSpaStaffSchedules() {
  return withSuccessCache_("read:spa_staff_schedules", 5, function () {
    try {
      var foundation = ensureSpaOperationalFoundation_();
      var rows = readSpaOpsRows_(foundation.scheduleSheet, ["ngay", "caSang", "caChieu", "caToi", "updatedAt"]);
      return {
        success: true,
        data: mapStaffScheduleRows_(rows),
      };
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message, data: [] };
    }
  });
}

function updateSpaStaffSchedulesInternal_(payload) {
  var updates = payload.updates || [];
  if (!updates.length) return { success: true, message: "Không có gì thay đổi." };
  
  var foundation = ensureSpaOperationalFoundation_();
  var headers = ["ngay", "caSang", "caChieu", "caToi", "updatedAt"];
  var rows = readSpaOpsRows_(foundation.scheduleSheet, headers);
  
  var rowMap = {};
  for (var i = 0; i < rows.length; i++) {
    var normalizedNgay = normalizeScheduleDateKey_(rows[i].ngay);
    if (!normalizedNgay) continue;
    rowMap[normalizedNgay] = rows[i];
  }
  
  for (var j = 0; j < updates.length; j++) {
    var up = updates[j];
    var ngayKey = normalizeScheduleDateKey_(up.ngay);
    if (!ngayKey) continue;
    
    var existing = rowMap[ngayKey];
    if (existing) {
      existing.caSang = up.caSang || "";
      existing.caChieu = up.caChieu || "";
      existing.caToi = up.caToi || "";
      existing.updatedAt = getNowVnDateTime_();
      writeSpaOpsRow_(foundation.scheduleSheet, headers, existing.__row, existing);
    } else {
      var newRowData = {
        ngay: ngayKey,
        caSang: up.caSang || "",
        caChieu: up.caChieu || "",
        caToi: up.caToi || "",
        updatedAt: getNowVnDateTime_()
      };
      appendSpaOpsRow_(foundation.scheduleSheet, headers, newRowData);
    }
  }
  bumpAppCacheVersion_();
  var savedRows = readSpaOpsRows_(foundation.scheduleSheet, headers);
  return {
    success: true,
    message: "Đã lưu lịch làm việc.",
    data: mapStaffScheduleRows_(savedRows),
  };
}

function updateSpaStaffSchedules(payload) {
  return runWithLockOrQueue_("UPDATE_SPA_STAFF_SCHEDULES", { payload: payload }, function () {
    try {
      return updateSpaStaffSchedulesInternal_(payload);
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message };
    }
  });
}

function normalizeSpaAttendanceRow_(payload) {
  var req = payload || {};
  return {
    STT: "",
    maNhanVien: String(req.maNhanVien || "").trim(),
    ngay: normalizeScheduleDateKey_(req.ngay || ""),
    checkInAt: normalizeTimeString_(req.checkInAt),
    checkOutAt: normalizeTimeString_(req.checkOutAt),
    caDuKien: String(req.caDuKien || "").trim(),
    trangThai: String(req.trangThai || "").trim(),
    ghiChu: String(req.ghiChu || "").trim(),
    updatedAt: getNowVnDateTime_(),
  };
}

// Normalize time string → HH:mm format
function normalizeTimeString_(value) {
  if (!value) return "";
  var raw = String(value).trim();
  if (!raw) return "";
  
  // Already HH:mm format
  var match1 = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (match1) {
    var h = parseInt(match1[1], 10);
    var m = parseInt(match1[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
    }
  }
  
  // HH:mm DD/MM/YYYY format - extract time only
  var match2 = raw.match(/^(\d{1,2}):(\d{2})\s+\d{1,2}\/\d{1,2}\/\d{4}$/);
  if (match2) {
    var h2 = parseInt(match2[1], 10);
    var m2 = parseInt(match2[2], 10);
    if (h2 >= 0 && h2 <= 23 && m2 >= 0 && m2 <= 59) {
      return (h2 < 10 ? "0" : "") + h2 + ":" + (m2 < 10 ? "0" : "") + m2;
    }
  }
  
  // Invalid or Date object string - try to parse
  var parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    var hours = parsed.getHours();
    var minutes = parsed.getMinutes();
    return (hours < 10 ? "0" : "") + hours + ":" + (minutes < 10 ? "0" : "") + minutes;
  }
  
  // Return as-is if can't parse, after basic validation
  return raw;
}

function mapSpaAttendanceResponse_(row) {
  return {
    maNhanVien: String(row.maNhanVien || "").trim(),
    ngay: normalizeScheduleDateKey_(row.ngay),
    checkInAt: normalizeTimeString_(row.checkInAt),
    checkOutAt: normalizeTimeString_(row.checkOutAt),
    caDuKien: String(row.caDuKien || "").trim(),
    trangThai: String(row.trangThai || "").trim(),
    ghiChu: String(row.ghiChu || "").trim(),
    updatedAt: String(row.updatedAt || "").trim(),
  };
}

function normalizeAttendanceShiftCode_(value) {
  var raw = String(value || "")
    .trim()
    .toUpperCase();
  if (!raw) return "";
  if (raw === "SANG" || raw.indexOf("SANG") !== -1) return "SANG";
  if (raw === "CHIEU" || raw.indexOf("CHIEU") !== -1) return "CHIEU";
  if (raw === "TOI" || raw.indexOf("TOI") !== -1) return "TOI";
  return "";
}

function findSpaAttendanceRecord_(rows, maNhanVien, ngay, caDuKien) {
  var staffCode = String(maNhanVien || "").trim();
  var dateKey = normalizeScheduleDateKey_(ngay);
  var shift = normalizeAttendanceShiftCode_(caDuKien);
  if (!staffCode || !dateKey) return null;
  for (var i = 0; i < rows.length; i++) {
    if (
      String(rows[i].maNhanVien || "").trim() === staffCode &&
      normalizeScheduleDateKey_(rows[i].ngay) === dateKey &&
      normalizeAttendanceShiftCode_(rows[i].caDuKien) === shift
    ) {
      return rows[i];
    }
  }
  return null;
}

function getSpaAttendanceInternal_(filters) {
  var req = filters || {};
  var foundation = ensureSpaOperationalFoundation_();
  var rows = readSpaOpsRows_(foundation.attendanceSheet, SPA_ATTENDANCE_HEADERS);
  var fromKey = normalizeScheduleDateKey_(req.tuNgay || req.fromDate || "");
  var toKey = normalizeScheduleDateKey_(req.denNgay || req.toDate || "");
  var ngayKey = normalizeScheduleDateKey_(req.ngay || "");
  var staffCode = String(req.maNhanVien || "").trim();
  var output = [];
  for (var i = 0; i < rows.length; i++) {
    var mapped = mapSpaAttendanceResponse_(rows[i]);
    if (!mapped.ngay || !mapped.maNhanVien) continue;
    if (ngayKey && mapped.ngay !== ngayKey) continue;
    if (fromKey && mapped.ngay < fromKey) continue;
    if (toKey && mapped.ngay > toKey) continue;
    if (staffCode && mapped.maNhanVien !== staffCode) continue;
    output.push(mapped);
  }
  output.sort(function (a, b) {
    if (a.ngay !== b.ngay) return String(a.ngay).localeCompare(String(b.ngay));
    if (a.maNhanVien !== b.maNhanVien) {
      return String(a.maNhanVien).localeCompare(String(b.maNhanVien), "vi");
    }
    var shiftOrder = { SANG: 1, CHIEU: 2, TOI: 3 };
    var aShift = shiftOrder[normalizeAttendanceShiftCode_(a.caDuKien)] || 99;
    var bShift = shiftOrder[normalizeAttendanceShiftCode_(b.caDuKien)] || 99;
    return aShift - bShift;
  });
  return { success: true, data: output };
}

function getSpaAttendance(filters) {
  var req = filters || {};
  var cacheKey =
    "read:spa_attendance:" +
    [
      normalizeScheduleDateKey_(req.ngay || ""),
      normalizeScheduleDateKey_(req.tuNgay || req.fromDate || ""),
      normalizeScheduleDateKey_(req.denNgay || req.toDate || ""),
      String(req.maNhanVien || "").trim(),
    ].join("|");
  return withSuccessCache_(cacheKey, 5, function () {
    try {
      return getSpaAttendanceInternal_(req);
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message, data: [] };
    }
  });
}

function recordSpaAttendanceInternal_(payload) {
  var req = payload || {};
  var action = String(req.action || "").trim().toUpperCase();
  var maNhanVien = String(req.maNhanVien || "").trim();
  var ngay = normalizeScheduleDateKey_(req.ngay || new Date());
  if (!maNhanVien) return { success: false, message: "Thiếu mã nhân viên." };
  if (!ngay) return { success: false, message: "Ngày chấm công không hợp lệ." };

  var foundation = ensureSpaOperationalFoundation_();
  var rows = readSpaOpsRows_(foundation.attendanceSheet, SPA_ATTENDANCE_HEADERS);
  var caDuKien = normalizeAttendanceShiftCode_(req.caDuKien);
  var record = findSpaAttendanceRecord_(rows, maNhanVien, ngay, caDuKien);
  var nowVn = toVnDateTimeString_(new Date());
  var nowTimeVn = toVnTimeString_(new Date());

  if (action === "CHECK_IN") {
    if (!record) {
      record = normalizeSpaAttendanceRow_({
        maNhanVien: maNhanVien,
        ngay: ngay,
        checkInAt: req.checkInAt || nowTimeVn,
        caDuKien: caDuKien,
        trangThai: req.trangThai || "Đang làm",
        ghiChu: req.ghiChu,
      });
      appendSpaOpsRow_(foundation.attendanceSheet, SPA_ATTENDANCE_HEADERS, record);
    } else {
      record.checkInAt = req.checkInAt !== undefined ? normalizeTimeString_(req.checkInAt) : normalizeTimeString_(record.checkInAt || nowTimeVn);
      record.checkOutAt = "";
      record.caDuKien = caDuKien || normalizeAttendanceShiftCode_(record.caDuKien);
      record.trangThai = String(req.trangThai || "Đang làm").trim();
      record.ghiChu = String(req.ghiChu || record.ghiChu || "").trim();
      record.updatedAt = getNowVnDateTime_();
      writeSpaOpsRow_(foundation.attendanceSheet, SPA_ATTENDANCE_HEADERS, record.__row, record);
    }
  } else if (action === "CHECK_OUT") {
    if (!record) {
      record = normalizeSpaAttendanceRow_({
        maNhanVien: maNhanVien,
        ngay: ngay,
        checkInAt: req.checkInAt || "",
        checkOutAt: req.checkOutAt || nowTimeVn,
        caDuKien: caDuKien,
        trangThai: req.trangThai || "Đã ra ca",
        ghiChu: req.ghiChu,
      });
      appendSpaOpsRow_(foundation.attendanceSheet, SPA_ATTENDANCE_HEADERS, record);
    } else {
      record.checkOutAt = req.checkOutAt !== undefined ? normalizeTimeString_(req.checkOutAt) : normalizeTimeString_(nowTimeVn);
      record.trangThai = String(req.trangThai || "Đã ra ca").trim();
      if (req.checkInAt !== undefined) record.checkInAt = normalizeTimeString_(req.checkInAt);
      record.ghiChu = String(req.ghiChu || record.ghiChu || "").trim();
      record.updatedAt = getNowVnDateTime_();
      writeSpaOpsRow_(foundation.attendanceSheet, SPA_ATTENDANCE_HEADERS, record.__row, record);
    }
  } else if (action === "MARK_ABSENT") {
    if (!record) {
      record = normalizeSpaAttendanceRow_({
        maNhanVien: maNhanVien,
        ngay: ngay,
        caDuKien: caDuKien,
        trangThai: req.trangThai || "Vắng",
        ghiChu: req.ghiChu,
      });
      appendSpaOpsRow_(foundation.attendanceSheet, SPA_ATTENDANCE_HEADERS, record);
    } else {
      record.checkInAt = "";
      record.checkOutAt = "";
      record.caDuKien = caDuKien || normalizeAttendanceShiftCode_(record.caDuKien);
      record.trangThai = String(req.trangThai || "Vắng").trim();
      record.ghiChu = String(req.ghiChu || record.ghiChu || "").trim();
      record.updatedAt = getNowVnDateTime_();
      writeSpaOpsRow_(foundation.attendanceSheet, SPA_ATTENDANCE_HEADERS, record.__row, record);
    }
  } else if (action === "UPDATE_NOTE") {
    if (!record) {
      record = normalizeSpaAttendanceRow_({
        maNhanVien: maNhanVien,
        ngay: ngay,
        caDuKien: caDuKien,
        ghiChu: req.ghiChu,
        trangThai: "",
      });
      appendSpaOpsRow_(foundation.attendanceSheet, SPA_ATTENDANCE_HEADERS, record);
    } else {
      record.ghiChu = String(req.ghiChu || "").trim();
      record.updatedAt = getNowVnDateTime_();
      writeSpaOpsRow_(foundation.attendanceSheet, SPA_ATTENDANCE_HEADERS, record.__row, record);
    }
  } else if (action === "UPDATE_TIMES") {
    if (!record) {
      record = normalizeSpaAttendanceRow_({
        maNhanVien: maNhanVien,
        ngay: ngay,
        caDuKien: caDuKien,
        checkInAt: req.checkInAt || "",
        checkOutAt: req.checkOutAt || "",
        trangThai: req.trangThai || "",
        ghiChu: req.ghiChu || "",
      });
      appendSpaOpsRow_(foundation.attendanceSheet, SPA_ATTENDANCE_HEADERS, record);
    } else {
      if (req.checkInAt !== undefined) record.checkInAt = normalizeTimeString_(req.checkInAt);
      if (req.checkOutAt !== undefined) record.checkOutAt = normalizeTimeString_(req.checkOutAt);
      if (req.trangThai !== undefined) record.trangThai = String(req.trangThai).trim();
      if (req.ghiChu !== undefined) record.ghiChu = String(req.ghiChu).trim();
      record.updatedAt = getNowVnDateTime_();
      writeSpaOpsRow_(foundation.attendanceSheet, SPA_ATTENDANCE_HEADERS, record.__row, record);
    }
  } else if (action === "CLEAR_ABSENT") {
    if (!record) return { success: false, message: "Không tìm thấy bản ghi chấm công." };
    foundation.attendanceSheet.deleteRow(record.__row);
    bumpAppCacheVersion_();
    return { success: true, message: "Đã hủy đánh dấu vắng.", data: null };
  } else {
    return { success: false, message: "Thao tác chấm công không hợp lệ." };
  }

  bumpAppCacheVersion_();
  return {
    success: true,
    message: action === "UPDATE_NOTE" ? "Đã lưu ghi chú." : "Đã lưu chấm công.",
    data: mapSpaAttendanceResponse_(record),
  };
}

function recordSpaAttendance(payload) {
  return runWithLockOrQueue_("RECORD_SPA_ATTENDANCE", { payload: payload }, function () {
    try {
      return recordSpaAttendanceInternal_(payload);
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message };
    }
  });
}

function normalizeChecklistType_(value) {
  var raw = String(value || "")
    .trim()
    .toUpperCase();
  if (!raw) return "";
  if (raw === "DAU_CA" || raw.indexOf("DAU") !== -1) return "DAU_CA";
  if (raw === "CUOI_CA" || raw.indexOf("CUOI") !== -1) return "CUOI_CA";
  return "";
}

function normalizeSpaChecklistRow_(payload) {
  var req = payload || {};
  return {
    STT: "",
    maNhanVien: String(req.maNhanVien || "").trim(),
    ngay: normalizeScheduleDateKey_(req.ngay || ""),
    caDuKien: normalizeAttendanceShiftCode_(req.caDuKien),
    loaiChecklist: normalizeChecklistType_(req.loaiChecklist),
    chucVu: String(req.chucVu || "").trim(),
    itemsJson: String(req.itemsJson || "").trim(),
    ghiChu: String(req.ghiChu || "").trim(),
    updatedAt: getNowVnDateTime_(),
  };
}

function mapSpaChecklistResponse_(row) {
  return {
    maNhanVien: String(row.maNhanVien || "").trim(),
    ngay: normalizeScheduleDateKey_(row.ngay),
    caDuKien: normalizeAttendanceShiftCode_(row.caDuKien),
    loaiChecklist: normalizeChecklistType_(row.loaiChecklist),
    chucVu: String(row.chucVu || "").trim(),
    itemsJson: String(row.itemsJson || "").trim(),
    ghiChu: String(row.ghiChu || "").trim(),
    updatedAt: String(row.updatedAt || "").trim(),
  };
}

function findSpaChecklistRecord_(rows, maNhanVien, ngay, caDuKien, loaiChecklist) {
  var staffCode = String(maNhanVien || "").trim();
  var dateKey = normalizeScheduleDateKey_(ngay);
  var shift = normalizeAttendanceShiftCode_(caDuKien);
  var type = normalizeChecklistType_(loaiChecklist);
  if (!staffCode || !dateKey || !type) return null;
  for (var i = 0; i < rows.length; i++) {
    if (
      String(rows[i].maNhanVien || "").trim() === staffCode &&
      normalizeScheduleDateKey_(rows[i].ngay) === dateKey &&
      normalizeAttendanceShiftCode_(rows[i].caDuKien) === shift &&
      normalizeChecklistType_(rows[i].loaiChecklist) === type
    ) {
      return rows[i];
    }
  }
  return null;
}

function getSpaShiftChecklistsInternal_(filters) {
  var req = filters || {};
  var foundation = ensureSpaOperationalFoundation_();
  var rows = readSpaOpsRows_(foundation.checklistSheet, SPA_CHECKLIST_HEADERS);
  var fromKey = normalizeScheduleDateKey_(req.tuNgay || req.fromDate || "");
  var toKey = normalizeScheduleDateKey_(req.denNgay || req.toDate || "");
  var ngayKey = normalizeScheduleDateKey_(req.ngay || "");
  var staffCode = String(req.maNhanVien || "").trim();
  var output = [];
  for (var i = 0; i < rows.length; i++) {
    var mapped = mapSpaChecklistResponse_(rows[i]);
    if (!mapped.ngay || !mapped.maNhanVien) continue;
    if (ngayKey && mapped.ngay !== ngayKey) continue;
    if (fromKey && mapped.ngay < fromKey) continue;
    if (toKey && mapped.ngay > toKey) continue;
    if (staffCode && mapped.maNhanVien !== staffCode) continue;
    output.push(mapped);
  }
  output.sort(function (a, b) {
    if (a.ngay !== b.ngay) return String(a.ngay).localeCompare(String(b.ngay));
    if (a.maNhanVien !== b.maNhanVien) {
      return String(a.maNhanVien).localeCompare(String(b.maNhanVien), "vi");
    }
    var shiftOrder = { SANG: 1, CHIEU: 2, TOI: 3 };
    var aShift = shiftOrder[normalizeAttendanceShiftCode_(a.caDuKien)] || 99;
    var bShift = shiftOrder[normalizeAttendanceShiftCode_(b.caDuKien)] || 99;
    if (aShift !== bShift) return aShift - bShift;
    return String(a.loaiChecklist || "").localeCompare(String(b.loaiChecklist || ""));
  });
  return { success: true, data: output };
}

function getSpaShiftChecklists(filters) {
  var req = filters || {};
  var cacheKey =
    "read:spa_checklists:" +
    [
      normalizeScheduleDateKey_(req.ngay || ""),
      normalizeScheduleDateKey_(req.tuNgay || req.fromDate || ""),
      normalizeScheduleDateKey_(req.denNgay || req.toDate || ""),
      String(req.maNhanVien || "").trim(),
    ].join("|");
  return withSuccessCache_(cacheKey, 5, function () {
    try {
      return getSpaShiftChecklistsInternal_(req);
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message, data: [] };
    }
  });
}

function saveSpaShiftChecklistInternal_(payload) {
  var req = payload || {};
  var maNhanVien = String(req.maNhanVien || "").trim();
  var ngay = normalizeScheduleDateKey_(req.ngay || new Date());
  var caDuKien = normalizeAttendanceShiftCode_(req.caDuKien);
  var loaiChecklist = normalizeChecklistType_(req.loaiChecklist);
  if (!maNhanVien) return { success: false, message: "Thiếu mã nhân viên." };
  if (!ngay) return { success: false, message: "Ngày checklist không hợp lệ." };
  if (!caDuKien) return { success: false, message: "Thiếu ca làm việc." };
  if (!loaiChecklist) return { success: false, message: "Thiếu loại checklist." };

  var foundation = ensureSpaOperationalFoundation_();
  var rows = readSpaOpsRows_(foundation.checklistSheet, SPA_CHECKLIST_HEADERS);
  var record = findSpaChecklistRecord_(rows, maNhanVien, ngay, caDuKien, loaiChecklist);
  var itemsJson = String(req.itemsJson || "").trim();
  if (!itemsJson && Array.isArray(req.items)) {
    itemsJson = JSON.stringify(req.items);
  }
  var next = normalizeSpaChecklistRow_({
    maNhanVien: maNhanVien,
    ngay: ngay,
    caDuKien: caDuKien,
    loaiChecklist: loaiChecklist,
    chucVu: req.chucVu,
    itemsJson: itemsJson,
    ghiChu: req.ghiChu,
  });
  if (!record) {
    appendSpaOpsRow_(foundation.checklistSheet, SPA_CHECKLIST_HEADERS, next);
    record = next;
  } else {
    record.maNhanVien = next.maNhanVien;
    record.ngay = next.ngay;
    record.caDuKien = next.caDuKien;
    record.loaiChecklist = next.loaiChecklist;
    record.chucVu = next.chucVu;
    record.itemsJson = next.itemsJson;
    record.ghiChu = next.ghiChu;
    record.updatedAt = next.updatedAt;
    writeSpaOpsRow_(foundation.checklistSheet, SPA_CHECKLIST_HEADERS, record.__row, record);
  }
  bumpAppCacheVersion_();
  return {
    success: true,
    message: "Đã lưu checklist ca.",
    data: mapSpaChecklistResponse_(record),
  };
}

function saveSpaShiftChecklist(payload) {
  return runWithLockOrQueue_("SAVE_SPA_SHIFT_CHECKLIST", { payload: payload }, function () {
    try {
      return saveSpaShiftChecklistInternal_(payload);
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message };
    }
  });
}

function normalizeViolationLevel_(value) {
  var raw = String(value || "")
    .trim()
    .toUpperCase();
  if (!raw) return "";
  if (raw === "NHAC_NHO" || raw.indexOf("NHAC") !== -1) return "NHAC_NHO";
  if (raw === "KHIEN_TRACH" || raw.indexOf("KHIEN") !== -1) return "KHIEN_TRACH";
  if (raw === "TRU_THUONG" || raw.indexOf("TRU") !== -1) return "TRU_THUONG";
  if (raw === "DINH_CHI" || raw.indexOf("DINH") !== -1) return "DINH_CHI";
  return "";
}

function normalizeViolationStatus_(value) {
  var raw = String(value || "")
    .trim()
    .toUpperCase();
  if (!raw || raw === "AP_DUNG" || raw.indexOf("AP_DUNG") !== -1) return "AP_DUNG";
  if (raw === "DA_HUY" || raw.indexOf("HUY") !== -1) return "DA_HUY";
  return "AP_DUNG";
}

function normalizeSpaViolationRow_(payload) {
  var req = payload || {};
  return {
    STT: "",
    maViPham: String(req.maViPham || "").trim(),
    maNhanVien: String(req.maNhanVien || "").trim(),
    ngay: normalizeScheduleDateKey_(req.ngay || ""),
    capDo: normalizeViolationLevel_(req.capDo),
    noiDung: String(req.noiDung || "").trim(),
    mucTru: Math.max(Number(req.mucTru || 0), 0),
    trangThai: normalizeViolationStatus_(req.trangThai || "AP_DUNG"),
    ghiChu: String(req.ghiChu || "").trim(),
    updatedAt: getNowVnDateTime_(),
  };
}

function mapSpaViolationResponse_(row) {
  return {
    maViPham: String(row.maViPham || "").trim(),
    maNhanVien: String(row.maNhanVien || "").trim(),
    ngay: normalizeScheduleDateKey_(row.ngay),
    capDo: normalizeViolationLevel_(row.capDo),
    noiDung: String(row.noiDung || "").trim(),
    mucTru: Math.max(Number(row.mucTru || 0), 0),
    trangThai: normalizeViolationStatus_(row.trangThai),
    ghiChu: String(row.ghiChu || "").trim(),
    updatedAt: String(row.updatedAt || "").trim(),
  };
}

function suggestNextViolationCode_(rows) {
  var max = 0;
  for (var i = 0; i < rows.length; i++) {
    var match = String(rows[i].maViPham || "").match(/VP(\d+)/i);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return "VP" + String(max + 1).padStart(6, "0");
}

function findSpaViolationRecord_(rows, maViPham) {
  var code = String(maViPham || "").trim();
  if (!code) return null;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].maViPham || "").trim() === code) return rows[i];
  }
  return null;
}

function getSpaStaffViolationsInternal_(filters) {
  var req = filters || {};
  var foundation = ensureSpaOperationalFoundation_();
  var rows = readSpaOpsRows_(foundation.violationSheet, SPA_VIOLATION_HEADERS);
  var fromKey = normalizeScheduleDateKey_(req.tuNgay || req.fromDate || "");
  var toKey = normalizeScheduleDateKey_(req.denNgay || req.toDate || "");
  var ngayKey = normalizeScheduleDateKey_(req.ngay || "");
  var staffCode = String(req.maNhanVien || "").trim();
  var output = [];
  for (var i = 0; i < rows.length; i++) {
    var mapped = mapSpaViolationResponse_(rows[i]);
    if (!mapped.maViPham || !mapped.maNhanVien || !mapped.ngay) continue;
    if (ngayKey && mapped.ngay !== ngayKey) continue;
    if (fromKey && mapped.ngay < fromKey) continue;
    if (toKey && mapped.ngay > toKey) continue;
    if (staffCode && mapped.maNhanVien !== staffCode) continue;
    output.push(mapped);
  }
  output.sort(function (a, b) {
    if (a.ngay !== b.ngay) return String(b.ngay).localeCompare(String(a.ngay));
    return String(b.maViPham).localeCompare(String(a.maViPham));
  });
  return { success: true, data: output };
}

function getSpaStaffViolations(filters) {
  var req = filters || {};
  var cacheKey =
    "read:spa_violations:" +
    [
      normalizeScheduleDateKey_(req.ngay || ""),
      normalizeScheduleDateKey_(req.tuNgay || req.fromDate || ""),
      normalizeScheduleDateKey_(req.denNgay || req.toDate || ""),
      String(req.maNhanVien || "").trim(),
    ].join("|");
  return withSuccessCache_(cacheKey, 5, function () {
    try {
      return getSpaStaffViolationsInternal_(req);
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message, data: [] };
    }
  });
}

function saveSpaStaffViolationInternal_(payload) {
  var req = payload || {};
  var foundation = ensureSpaOperationalFoundation_();
  var rows = readSpaOpsRows_(foundation.violationSheet, SPA_VIOLATION_HEADERS);
  var maViPham = String(req.maViPham || "").trim() || suggestNextViolationCode_(rows);
  var record = findSpaViolationRecord_(rows, maViPham);
  var next = normalizeSpaViolationRow_({
    maViPham: maViPham,
    maNhanVien: req.maNhanVien,
    ngay: req.ngay,
    capDo: req.capDo,
    noiDung: req.noiDung,
    mucTru: req.mucTru,
    trangThai: req.trangThai || "AP_DUNG",
    ghiChu: req.ghiChu,
  });
  if (!next.maNhanVien) return { success: false, message: "Thiếu mã nhân viên." };
  if (!next.ngay) return { success: false, message: "Ngày vi phạm không hợp lệ." };
  if (!next.capDo) return { success: false, message: "Thiếu mức xử lý vi phạm." };
  if (!record) {
    appendSpaOpsRow_(foundation.violationSheet, SPA_VIOLATION_HEADERS, next);
    record = next;
  } else {
    record.maNhanVien = next.maNhanVien;
    record.ngay = next.ngay;
    record.capDo = next.capDo;
    record.noiDung = next.noiDung;
    record.mucTru = next.mucTru;
    record.trangThai = next.trangThai;
    record.ghiChu = next.ghiChu;
    record.updatedAt = next.updatedAt;
    writeSpaOpsRow_(foundation.violationSheet, SPA_VIOLATION_HEADERS, record.__row, record);
  }
  bumpAppCacheVersion_();
  return {
    success: true,
    message: "Đã lưu biên bản vi phạm.",
    data: mapSpaViolationResponse_(record),
  };
}

function saveSpaStaffViolation(payload) {
  return runWithLockOrQueue_("SAVE_SPA_STAFF_VIOLATION", { payload: payload }, function () {
    try {
      return saveSpaStaffViolationInternal_(payload);
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message };
    }
  });
}

function cancelSpaStaffViolationInternal_(payload) {
  var maViPham = String((payload && payload.maViPham) || "").trim();
  if (!maViPham) return { success: false, message: "Không tìm thấy biên bản vi phạm." };
  var foundation = ensureSpaOperationalFoundation_();
  var rows = readSpaOpsRows_(foundation.violationSheet, SPA_VIOLATION_HEADERS);
  var record = findSpaViolationRecord_(rows, maViPham);
  if (!record) return { success: false, message: "Không tìm thấy biên bản vi phạm." };
  record.trangThai = "DA_HUY";
  record.updatedAt = getNowVnDateTime_();
  writeSpaOpsRow_(foundation.violationSheet, SPA_VIOLATION_HEADERS, record.__row, record);
  bumpAppCacheVersion_();
  return {
    success: true,
    message: "Đã hủy biên bản vi phạm.",
    data: mapSpaViolationResponse_(record),
  };
}

function cancelSpaStaffViolation(payload) {
  return runWithLockOrQueue_("CANCEL_SPA_STAFF_VIOLATION", { payload: payload }, function () {
    try {
      return cancelSpaStaffViolationInternal_(payload);
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message };
    }
  });
}

function normalizeLeaveStatus_(value) {
  var raw = String(value || "")
    .trim()
    .toUpperCase();
  if (!raw || raw.indexOf("CHO") !== -1) return "CHO_DUYET";
  if (raw.indexOf("DUYET") !== -1 || raw.indexOf("APPROV") !== -1) return "DA_DUYET";
  if (raw.indexOf("TU_CHOI") !== -1 || raw.indexOf("REJECT") !== -1) return "TU_CHOI";
  if (raw.indexOf("HUY") !== -1 || raw.indexOf("CANCEL") !== -1) return "DA_HUY";
  return "CHO_DUYET";
}

function normalizeTrainingType_(value) {
  var raw = String(value || "")
    .trim()
    .toUpperCase();
  if (!raw) return "";
  if (raw.indexOf("HOI") !== -1 || raw.indexOf("NHAP") !== -1) return "HOI_NHAP";
  if (raw.indexOf("CHUYEN") !== -1 || raw.indexOf("MON") !== -1) return "CHUYEN_MON";
  return "";
}

function normalizeTrainingStatus_(value) {
  var raw = String(value || "")
    .trim()
    .toUpperCase();
  if (!raw) return "DA_LEN_LICH";
  if (raw.indexOf("HOAN") !== -1 || raw.indexOf("COMPLETE") !== -1) return "HOAN_THANH";
  if (raw.indexOf("HUY") !== -1 || raw.indexOf("CANCEL") !== -1) return "HUY";
  return "DA_LEN_LICH";
}

function normalizePayrollLockStatus_(value) {
  var raw = String(value || "")
    .trim()
    .toUpperCase();
  if (!raw || raw.indexOf("CHOT") !== -1 || raw.indexOf("LOCK") !== -1) return "DA_CHOT";
  return "DA_CHOT";
}

function normalizeSpaLeaveRow_(payload) {
  var req = payload || {};
  return {
    STT: "",
    maDon: String(req.maDon || "").trim(),
    maNhanVien: String(req.maNhanVien || "").trim(),
    tuNgay: normalizeScheduleDateKey_(req.tuNgay || ""),
    denNgay: normalizeScheduleDateKey_(req.denNgay || ""),
    lyDo: String(req.lyDo || "").trim(),
    trangThai: normalizeLeaveStatus_(req.trangThai || "CHO_DUYET"),
    ghiChu: String(req.ghiChu || "").trim(),
    updatedAt: getNowVnDateTime_(),
  };
}

function mapSpaLeaveResponse_(row) {
  return {
    maDon: String(row.maDon || "").trim(),
    maNhanVien: String(row.maNhanVien || "").trim(),
    tuNgay: normalizeScheduleDateKey_(row.tuNgay),
    denNgay: normalizeScheduleDateKey_(row.denNgay),
    lyDo: String(row.lyDo || "").trim(),
    trangThai: normalizeLeaveStatus_(row.trangThai),
    ghiChu: String(row.ghiChu || "").trim(),
    updatedAt: String(row.updatedAt || "").trim(),
  };
}

function suggestNextLeaveCode_(rows) {
  var max = 0;
  for (var i = 0; i < rows.length; i++) {
    var match = String(rows[i].maDon || "").match(/NP(\d+)/i);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return "NP" + String(max + 1).padStart(6, "0");
}

function findSpaLeaveRecord_(rows, maDon) {
  var code = String(maDon || "").trim();
  if (!code) return null;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].maDon || "").trim() === code) return rows[i];
  }
  return null;
}

function leaveOverlapsDateRange_(row, fromKey, toKey) {
  var start = normalizeScheduleDateKey_(row.tuNgay);
  var end = normalizeScheduleDateKey_(row.denNgay);
  if (!start || !end) return false;
  if (fromKey && end < fromKey) return false;
  if (toKey && start > toKey) return false;
  return true;
}

function getSpaStaffLeaveRequestsInternal_(filters) {
  var req = filters || {};
  var foundation = ensureSpaOperationalFoundation_();
  var rows = readSpaOpsRows_(foundation.leaveSheet, SPA_LEAVE_HEADERS);
  var fromKey = normalizeScheduleDateKey_(req.tuNgay || req.fromDate || "");
  var toKey = normalizeScheduleDateKey_(req.denNgay || req.toDate || "");
  var staffCode = String(req.maNhanVien || "").trim();
  var output = [];
  for (var i = 0; i < rows.length; i++) {
    var mapped = mapSpaLeaveResponse_(rows[i]);
    if (!mapped.maDon || !mapped.maNhanVien) continue;
    if (!leaveOverlapsDateRange_(mapped, fromKey, toKey)) continue;
    if (staffCode && mapped.maNhanVien !== staffCode) continue;
    output.push(mapped);
  }
  output.sort(function (a, b) {
    if (a.tuNgay !== b.tuNgay) return String(b.tuNgay).localeCompare(String(a.tuNgay));
    return String(b.maDon).localeCompare(String(a.maDon));
  });
  return { success: true, data: output };
}

function getSpaStaffLeaveRequests(filters) {
  var req = filters || {};
  var cacheKey =
    "read:spa_leaves:" +
    [
      normalizeScheduleDateKey_(req.tuNgay || req.fromDate || ""),
      normalizeScheduleDateKey_(req.denNgay || req.toDate || ""),
      String(req.maNhanVien || "").trim(),
    ].join("|");
  return withSuccessCache_(cacheKey, 5, function () {
    try {
      return getSpaStaffLeaveRequestsInternal_(req);
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message, data: [] };
    }
  });
}

function saveSpaStaffLeaveRequestInternal_(payload) {
  var req = payload || {};
  var foundation = ensureSpaOperationalFoundation_();
  var rows = readSpaOpsRows_(foundation.leaveSheet, SPA_LEAVE_HEADERS);
  var maDon = String(req.maDon || "").trim() || suggestNextLeaveCode_(rows);
  var record = findSpaLeaveRecord_(rows, maDon);
  var next = normalizeSpaLeaveRow_({
    maDon: maDon,
    maNhanVien: req.maNhanVien,
    tuNgay: req.tuNgay,
    denNgay: req.denNgay,
    lyDo: req.lyDo,
    trangThai: req.trangThai || (record ? record.trangThai : "CHO_DUYET"),
    ghiChu: req.ghiChu,
  });
  if (!next.maNhanVien) return { success: false, message: "Thiếu mã nhân viên." };
  if (!next.tuNgay || !next.denNgay) return { success: false, message: "Ngày nghỉ không hợp lệ." };
  if (!record) {
    appendSpaOpsRow_(foundation.leaveSheet, SPA_LEAVE_HEADERS, next);
    record = next;
  } else {
    record.maNhanVien = next.maNhanVien;
    record.tuNgay = next.tuNgay;
    record.denNgay = next.denNgay;
    record.lyDo = next.lyDo;
    record.trangThai = next.trangThai;
    record.ghiChu = next.ghiChu;
    record.updatedAt = next.updatedAt;
    writeSpaOpsRow_(foundation.leaveSheet, SPA_LEAVE_HEADERS, record.__row, record);
  }
  bumpAppCacheVersion_();
  return {
    success: true,
    message: "Đã lưu đơn nghỉ phép.",
    data: mapSpaLeaveResponse_(record),
  };
}

function saveSpaStaffLeaveRequest(payload) {
  return runWithLockOrQueue_("SAVE_SPA_STAFF_LEAVE", { payload: payload }, function () {
    try {
      return saveSpaStaffLeaveRequestInternal_(payload);
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message };
    }
  });
}

function reviewSpaStaffLeaveRequestInternal_(payload) {
  var req = payload || {};
  var maDon = String(req.maDon || "").trim();
  var trangThai = normalizeLeaveStatus_(req.trangThai || "");
  if (!maDon) return { success: false, message: "Không tìm thấy đơn nghỉ phép." };
  if (!trangThai) return { success: false, message: "Trạng thái không hợp lệ." };
  var foundation = ensureSpaOperationalFoundation_();
  var rows = readSpaOpsRows_(foundation.leaveSheet, SPA_LEAVE_HEADERS);
  var record = findSpaLeaveRecord_(rows, maDon);
  if (!record) return { success: false, message: "Không tìm thấy đơn nghỉ phép." };
  record.trangThai = trangThai;
  record.updatedAt = getNowVnDateTime_();
  writeSpaOpsRow_(foundation.leaveSheet, SPA_LEAVE_HEADERS, record.__row, record);
  bumpAppCacheVersion_();
  return {
    success: true,
    message: "Đã cập nhật đơn nghỉ phép.",
    data: mapSpaLeaveResponse_(record),
  };
}

function reviewSpaStaffLeaveRequest(payload) {
  return runWithLockOrQueue_("REVIEW_SPA_STAFF_LEAVE", { payload: payload }, function () {
    try {
      return reviewSpaStaffLeaveRequestInternal_(payload);
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message };
    }
  });
}

function normalizeSpaTrainingRow_(payload) {
  var req = payload || {};
  return {
    STT: "",
    maDaoTao: String(req.maDaoTao || "").trim(),
    maNhanVien: String(req.maNhanVien || "").trim(),
    loaiDaoTao: normalizeTrainingType_(req.loaiDaoTao),
    tuNgay: normalizeScheduleDateKey_(req.tuNgay || ""),
    denNgay: normalizeScheduleDateKey_(req.denNgay || ""),
    noiDung: String(req.noiDung || "").trim(),
    trangThai: normalizeTrainingStatus_(req.trangThai || "DA_LEN_LICH"),
    ghiChu: String(req.ghiChu || "").trim(),
    updatedAt: getNowVnDateTime_(),
  };
}

function mapSpaTrainingResponse_(row) {
  return {
    maDaoTao: String(row.maDaoTao || "").trim(),
    maNhanVien: String(row.maNhanVien || "").trim(),
    loaiDaoTao: normalizeTrainingType_(row.loaiDaoTao),
    tuNgay: normalizeScheduleDateKey_(row.tuNgay),
    denNgay: normalizeScheduleDateKey_(row.denNgay),
    noiDung: String(row.noiDung || "").trim(),
    trangThai: normalizeTrainingStatus_(row.trangThai),
    ghiChu: String(row.ghiChu || "").trim(),
    updatedAt: String(row.updatedAt || "").trim(),
  };
}

function suggestNextTrainingCode_(rows) {
  var max = 0;
  for (var i = 0; i < rows.length; i++) {
    var match = String(rows[i].maDaoTao || "").match(/DT(\d+)/i);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return "DT" + String(max + 1).padStart(6, "0");
}

function findSpaTrainingRecord_(rows, maDaoTao) {
  var code = String(maDaoTao || "").trim();
  if (!code) return null;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].maDaoTao || "").trim() === code) return rows[i];
  }
  return null;
}

function getSpaStaffTrainingsInternal_(filters) {
  var req = filters || {};
  var foundation = ensureSpaOperationalFoundation_();
  var rows = readSpaOpsRows_(foundation.trainingSheet, SPA_TRAINING_HEADERS);
  var fromKey = normalizeScheduleDateKey_(req.tuNgay || req.fromDate || "");
  var toKey = normalizeScheduleDateKey_(req.denNgay || req.toDate || "");
  var staffCode = String(req.maNhanVien || "").trim();
  var output = [];
  for (var i = 0; i < rows.length; i++) {
    var mapped = mapSpaTrainingResponse_(rows[i]);
    if (!mapped.maDaoTao || !mapped.maNhanVien) continue;
    if (!leaveOverlapsDateRange_(mapped, fromKey, toKey)) continue;
    if (staffCode && mapped.maNhanVien !== staffCode) continue;
    output.push(mapped);
  }
  output.sort(function (a, b) {
    if (a.tuNgay !== b.tuNgay) return String(b.tuNgay).localeCompare(String(a.tuNgay));
    return String(b.maDaoTao).localeCompare(String(a.maDaoTao));
  });
  return { success: true, data: output };
}

function getSpaStaffTrainings(filters) {
  var req = filters || {};
  var cacheKey =
    "read:spa_trainings:" +
    [
      normalizeScheduleDateKey_(req.tuNgay || req.fromDate || ""),
      normalizeScheduleDateKey_(req.denNgay || req.toDate || ""),
      String(req.maNhanVien || "").trim(),
    ].join("|");
  return withSuccessCache_(cacheKey, 5, function () {
    try {
      return getSpaStaffTrainingsInternal_(req);
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message, data: [] };
    }
  });
}

function saveSpaStaffTrainingInternal_(payload) {
  var req = payload || {};
  var foundation = ensureSpaOperationalFoundation_();
  var rows = readSpaOpsRows_(foundation.trainingSheet, SPA_TRAINING_HEADERS);
  var maDaoTao = String(req.maDaoTao || "").trim() || suggestNextTrainingCode_(rows);
  var record = findSpaTrainingRecord_(rows, maDaoTao);
  var next = normalizeSpaTrainingRow_({
    maDaoTao: maDaoTao,
    maNhanVien: req.maNhanVien,
    loaiDaoTao: req.loaiDaoTao,
    tuNgay: req.tuNgay,
    denNgay: req.denNgay,
    noiDung: req.noiDung,
    trangThai: req.trangThai,
    ghiChu: req.ghiChu,
  });
  if (!next.maNhanVien) return { success: false, message: "Thiếu mã nhân viên." };
  if (!next.loaiDaoTao) return { success: false, message: "Thiếu loại đào tạo." };
  if (!next.tuNgay || !next.denNgay) return { success: false, message: "Ngày đào tạo không hợp lệ." };
  if (!record) {
    appendSpaOpsRow_(foundation.trainingSheet, SPA_TRAINING_HEADERS, next);
    record = next;
  } else {
    record.maNhanVien = next.maNhanVien;
    record.loaiDaoTao = next.loaiDaoTao;
    record.tuNgay = next.tuNgay;
    record.denNgay = next.denNgay;
    record.noiDung = next.noiDung;
    record.trangThai = next.trangThai;
    record.ghiChu = next.ghiChu;
    record.updatedAt = next.updatedAt;
    writeSpaOpsRow_(foundation.trainingSheet, SPA_TRAINING_HEADERS, record.__row, record);
  }
  bumpAppCacheVersion_();
  return {
    success: true,
    message: "Đã lưu lịch đào tạo.",
    data: mapSpaTrainingResponse_(record),
  };
}

function saveSpaStaffTraining(payload) {
  return runWithLockOrQueue_("SAVE_SPA_STAFF_TRAINING", { payload: payload }, function () {
    try {
      return saveSpaStaffTrainingInternal_(payload);
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message };
    }
  });
}

function normalizeSpaPayrollRow_(payload) {
  var req = payload || {};
  return {
    STT: "",
    maBangLuong: String(req.maBangLuong || "").trim(),
    maKyLuong: String(req.maKyLuong || "").trim(),
    tuNgay: normalizeScheduleDateKey_(req.tuNgay || ""),
    denNgay: normalizeScheduleDateKey_(req.denNgay || ""),
    maNhanVien: String(req.maNhanVien || "").trim(),
    tenNhanVien: String(req.tenNhanVien || "").trim(),
    chucVu: String(req.chucVu || "").trim(),
    caHoanThanh: Math.max(Number(req.caHoanThanh || 0), 0),
    caKeHoach: Math.max(Number(req.caKeHoach || 0), 0),
    luongCoBan: Math.max(Number(req.luongCoBan || 0), 0),
    doanhSoDichVu: Math.max(Number(req.doanhSoDichVu || 0), 0),
    tyLeThuong: Math.max(Number(req.tyLeThuong || 0), 0),
    thuong: Math.max(Number(req.thuong || 0), 0),
    truViPham: Math.max(Number(req.truViPham || 0), 0),
    tongLuong: Math.max(Number(req.tongLuong || 0), 0),
    trangThai: normalizePayrollLockStatus_(req.trangThai || "DA_CHOT"),
    ghiChu: String(req.ghiChu || "").trim(),
    updatedAt: getNowVnDateTime_(),
  };
}

function mapSpaPayrollResponse_(row) {
  return {
    maBangLuong: String(row.maBangLuong || "").trim(),
    maKyLuong: String(row.maKyLuong || "").trim(),
    tuNgay: normalizeScheduleDateKey_(row.tuNgay),
    denNgay: normalizeScheduleDateKey_(row.denNgay),
    maNhanVien: String(row.maNhanVien || "").trim(),
    tenNhanVien: String(row.tenNhanVien || "").trim(),
    chucVu: String(row.chucVu || "").trim(),
    caHoanThanh: Math.max(Number(row.caHoanThanh || 0), 0),
    caKeHoach: Math.max(Number(row.caKeHoach || 0), 0),
    luongCoBan: Math.max(Number(row.luongCoBan || 0), 0),
    doanhSoDichVu: Math.max(Number(row.doanhSoDichVu || 0), 0),
    tyLeThuong: Math.max(Number(row.tyLeThuong || 0), 0),
    thuong: Math.max(Number(row.thuong || 0), 0),
    truViPham: Math.max(Number(row.truViPham || 0), 0),
    tongLuong: Math.max(Number(row.tongLuong || 0), 0),
    trangThai: normalizePayrollLockStatus_(row.trangThai),
    ghiChu: String(row.ghiChu || "").trim(),
    updatedAt: String(row.updatedAt || "").trim(),
  };
}

function payrollMatchesPeriod_(row, fromKey, toKey) {
  var start = normalizeScheduleDateKey_(row.tuNgay);
  var end = normalizeScheduleDateKey_(row.denNgay);
  if (!start || !end) return false;
  if (fromKey && start !== fromKey) return false;
  if (toKey && end !== toKey) return false;
  return true;
}

function getSpaPayrollRecordsInternal_(filters) {
  var req = filters || {};
  var foundation = ensureSpaOperationalFoundation_();
  var rows = readSpaOpsRows_(foundation.payrollSheet, SPA_PAYROLL_HEADERS);
  Logger.log("[getSpaPayrollRecords] BANG_LUONG rows=" + rows.length + ", filters=" + JSON.stringify(req));
  var fromKey = normalizeScheduleDateKey_(req.tuNgay || req.fromDate || "");
  var toKey = normalizeScheduleDateKey_(req.denNgay || req.toDate || "");
  var maKyLuong = String(req.maKyLuong || "").trim();
  var staffCode = String(req.maNhanVien || "").trim();
  var output = [];
  for (var i = 0; i < rows.length; i++) {
    var mapped = mapSpaPayrollResponse_(rows[i]);
    if (!mapped.maBangLuong || !mapped.maNhanVien) continue;
    if (maKyLuong && mapped.maKyLuong !== maKyLuong) continue;
    if ((fromKey || toKey) && !payrollMatchesPeriod_(mapped, fromKey, toKey)) continue;
    if (staffCode && mapped.maNhanVien !== staffCode) continue;
    output.push(mapped);
  }
  output.sort(function (a, b) {
    return String(a.tenNhanVien || a.maNhanVien).localeCompare(
      String(b.tenNhanVien || b.maNhanVien),
      "vi",
    );
  });
  Logger.log("[getSpaPayrollRecords] Trả về " + output.length + " dòng lương");
  return { success: true, data: output };
}

function getSpaPayrollRecords(filters) {
  var req = filters || {};
  try {
    return getSpaPayrollRecordsInternal_(req);
  } catch (e) {
    return { success: false, message: "Lỗi: " + e.message, data: [] };
  }
}

function lockSpaPayrollPeriodInternal_(payload) {
  var req = payload || {};
  var fromKey = normalizeScheduleDateKey_(req.tuNgay || "");
  var toKey = normalizeScheduleDateKey_(req.denNgay || "");
  var rowsPayload = Array.isArray(req.rows) ? req.rows : [];
  if (!fromKey || !toKey) return { success: false, message: "Kỳ lương không hợp lệ." };
  if (!rowsPayload.length) return { success: false, message: "Không có dữ liệu lương để chốt." };
  var foundation = ensureSpaOperationalFoundation_();
  var existing = readSpaOpsRows_(foundation.payrollSheet, SPA_PAYROLL_HEADERS);
  for (var i = 0; i < existing.length; i++) {
    if (payrollMatchesPeriod_(existing[i], fromKey, toKey)) {
      return { success: false, message: "Kỳ lương này đã được chốt." };
    }
  }
  var saved = [];
  for (var j = 0; j < rowsPayload.length; j++) {
    var next = normalizeSpaPayrollRow_(rowsPayload[j]);
    next.tuNgay = fromKey;
    next.denNgay = toKey;
    if (!next.maBangLuong) next.maBangLuong = "BL" + String(j + 1).padStart(6, "0");
    if (!next.maKyLuong) {
      next.maKyLuong = "KL" + fromKey.replace(/-/g, "") + toKey.replace(/-/g, "");
    }
    appendSpaOpsRow_(foundation.payrollSheet, SPA_PAYROLL_HEADERS, next);
    saved.push(mapSpaPayrollResponse_(next));
  }
  bumpAppCacheVersion_();
  return {
    success: true,
    message: "Đã chốt kỳ lương.",
    data: saved,
  };
}

function lockSpaPayrollPeriod(payload) {
  return runWithLockOrQueue_("LOCK_SPA_PAYROLL_PERIOD", { payload: payload }, function () {
    try {
      return lockSpaPayrollPeriodInternal_(payload);
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message };
    }
  });
}

function getTreatmentPackages() {
  return withSuccessCache_("read:spa_packages", 15, function () {
    try {
      return {
        success: true,
        data: getTreatmentPackageCatalog_(),
      };
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message, data: [] };
    }
  });
}

function getTreatmentCatalogs() {
  return withSuccessCache_("read:spa_catalogs", 15, function () {
    try {
      var foundation = ensureSpaFoundation_();
      var phacDoRows = readSpaOpsRows_(foundation.dmPhacDo, SPA_SHEET_HEADERS.DM_PHAC_DO);
      var dichVuRows = readSpaOpsRows_(foundation.dmDv, SPA_SHEET_HEADERS.DM_DICH_VU);
      var goiRows = readSpaOpsRows_(foundation.dmGoi, SPA_SHEET_HEADERS.DM_GOI_DIEU_TRI);
      return {
        success: true,
        data: {
          phacDo: phacDoRows.map(function (row) {
            return {
              maPhacDo: String(row.maPhacDo || "").trim(),
              tenPhacDo: String(row.tenPhacDo || "").trim(),
              nhomBenh: String(row.nhomBenh || "").trim(),
              capDoBenh: String(row.capDoBenh || "").trim(),
              moTa: String(row.moTa || "").trim(),
              active: String(row.active || "").toUpperCase() !== "FALSE",
              updatedAt: String(row.updatedAt || "").trim(),
            };
          }),
          dichVu: dichVuRows.map(function (row) {
            return {
              maDv: String(row.maDv || "").trim(),
              maPhacDo: String(row.maPhacDo || "").trim(),
              lop1NhomDv: String(row.lop1NhomDv || "").trim(),
              lop2DichVu: String(row.lop2DichVu || "").trim(),
              vungTriLieu: String(row.vungTriLieu || "").trim(),
              thoiLuongPhut: Math.max(parseMoneyNumber_(row.thoiLuongPhut), 0),
              active: String(row.active || "").toUpperCase() !== "FALSE",
              updatedAt: String(row.updatedAt || "").trim(),
            };
          }),
          goiDieuTri: goiRows.map(function (row) {
            return {
              maGoi: String(row.maGoi || "").trim(),
              maDv: String(row.maDv || "").trim(),
              tenGoi: String(row.tenGoi || "").trim(),
              loaiGoi: String(row.loaiGoi || "").trim(),
              soBuoiMua: Math.max(parseMoneyNumber_(row.soBuoiMua), 0),
              soBuoiTang: Math.max(parseMoneyNumber_(row.soBuoiTang), 0),
              soBuoiQuyDoi: Math.max(parseMoneyNumber_(row.soBuoiQuyDoi), 0),
              giaBanGoi: Math.max(parseMoneyNumber_(row.giaBanGoi), 0),
              giaVonChuanGoi: Math.max(parseMoneyNumber_(row.giaVonChuanGoi), 0),
              active: String(row.active || "").toUpperCase() !== "FALSE",
              updatedAt: String(row.updatedAt || "").trim(),
            };
          }),
        },
      };
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message, data: { phacDo: [], dichVu: [], goiDieuTri: [] } };
    }
  });
}

function saveTreatmentCatalogsInternal_(payload) {
  payload = payload || {};
  var phacDo = Array.isArray(payload.phacDo) ? payload.phacDo : [];
  var dichVu = Array.isArray(payload.dichVu) ? payload.dichVu : [];
  var goiDieuTri = Array.isArray(payload.goiDieuTri) ? payload.goiDieuTri : [];
  ensureSpaFoundation_();
  replaceSpaSheetData_(
    "DM_PHAC_DO",
    SPA_SHEET_HEADERS.DM_PHAC_DO,
    phacDo.map(function (item) {
      return [
        "",
        String(item.maPhacDo || "").trim(),
        String(item.tenPhacDo || "").trim(),
        String(item.nhomBenh || "").trim(),
        String(item.capDoBenh || "").trim(),
        String(item.moTa || "").trim(),
        item.active === false ? "FALSE" : "TRUE",
        getNowVnDateTime_(),
      ];
    }),
  );
  replaceSpaSheetData_(
    "DM_DICH_VU",
    SPA_SHEET_HEADERS.DM_DICH_VU,
    dichVu.map(function (item) {
      return [
        "",
        String(item.maDv || "").trim(),
        String(item.maPhacDo || "").trim(),
        String(item.lop1NhomDv || "").trim(),
        String(item.lop2DichVu || "").trim(),
        String(item.vungTriLieu || "").trim(),
        Math.max(parseMoneyNumber_(item.thoiLuongPhut), 0),
        item.active === false ? "FALSE" : "TRUE",
        getNowVnDateTime_(),
      ];
    }),
  );
  replaceSpaSheetData_(
    "DM_GOI_DIEU_TRI",
    SPA_SHEET_HEADERS.DM_GOI_DIEU_TRI,
    goiDieuTri.map(function (item) {
      return [
        "",
        String(item.maGoi || "").trim(),
        String(item.maDv || "").trim(),
        String(item.tenGoi || "").trim(),
        String(item.loaiGoi || "LE").trim(),
        Math.max(parseMoneyNumber_(item.soBuoiMua), 0),
        Math.max(parseMoneyNumber_(item.soBuoiTang), 0),
        Math.max(parseMoneyNumber_(item.soBuoiQuyDoi), 0),
        Math.max(parseMoneyNumber_(item.giaBanGoi), 0),
        Math.max(parseMoneyNumber_(item.giaVonChuanGoi), 0),
        item.active === false ? "FALSE" : "TRUE",
        getNowVnDateTime_(),
      ];
    }),
  );
  updateSTT_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName("DM_PHAC_DO"), 2);
  updateSTT_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName("DM_DICH_VU"), 2);
  updateSTT_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName("DM_GOI_DIEU_TRI"), 2);
  bumpAppCacheVersion_();
  return { success: true, message: "Đã lưu danh mục điều trị.", data: true };
}

function saveTreatmentCatalogs(payload) {
  return runWithLockOrQueue_("SAVE_TREATMENT_CATALOGS", { payload: payload }, function () {
    try {
      return saveTreatmentCatalogsInternal_(payload);
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message };
    }
  });
}

function getStayHistory(filters) {
  try {
    var req = filters || {};
    var foundation = ensureSpaOperationalFoundation_();
    var stays = readSpaOpsRows_(foundation.staySheet, SPA_SESSION_HEADERS);
    var services = readSpaOpsRows_(
      foundation.serviceSheet,
      SPA_SESSION_SERVICE_HEADERS,
    );
    var items = stays.map(function (x) {
      return buildStaySummary_(x, services);
    });
    var keyword = normalizeCompareText_(req.keyword || "");
    var st = String(req.trangThai || "").trim().toUpperCase();
    var room = String(req.maGiuong || "").trim();
    var maNhanVien = String(req.maNhanVien || "").trim();
    var fromDate = String(req.fromDate || "").trim();
    var toDate = String(req.toDate || "").trim();
    if (st) {
      items = items.filter(function (x) {
        return String(x.trangThaiPhien || "").toUpperCase() === st;
      });
    }
    if (room) {
      items = items.filter(function (x) {
        return String(x.maGiuong || "").trim() === room;
      });
    }
    if (maNhanVien) {
      items = items.filter(function (x) {
        return String(x.maNhanVien || "").trim() === maNhanVien;
      });
    }
    if (keyword) {
      items = items.filter(function (x) {
        var source = normalizeCompareText_(
          [
            x.maPhien,
            x.maGiuong,
            x.tenKhach,
            x.soDienThoai,
            x.tenNhanVien,
          ].join(" "),
        );
        return source.indexOf(keyword) !== -1;
      });
    }
    if (fromDate) {
      var fromKey = normalizeScheduleDateKey_(fromDate);
      if (fromKey) {
        var fromMs = new Date(fromKey + "T00:00:00").getTime();
        if (isFinite(fromMs)) {
          items = items.filter(function (x) {
            return parseVnDateTimeToMs_(x.batDauAt) >= fromMs;
          });
        }
      }
    }
    if (toDate) {
      var toKey = normalizeScheduleDateKey_(toDate);
      if (toKey) {
        var toMs = new Date(toKey + "T00:00:00").getTime();
        if (isFinite(toMs)) {
          items = items.filter(function (x) {
            return parseVnDateTimeToMs_(x.batDauAt) <= toMs + 86400000;
          });
        }
      }
    }
    items.sort(function (a, b) {
      return parseVnDateTimeToMs_(b.batDauAt) - parseVnDateTimeToMs_(a.batDauAt);
    });
    return { success: true, data: items };
  } catch (e) {
    return { success: false, message: "Lỗi: " + e.message, data: [] };
  }
}

function buildTreatmentPackageFromPayload_(req, existingStay) {
  return (
    resolveTreatmentPackage_(req, existingStay || null) || {
      maDv: String(req.maDv || "").trim(),
      tenDichVu: String(req.tenDichVu || "").trim(),
      maGoi: String(req.maGoi || "").trim(),
      tenGoi: String(req.tenGoi || "").trim(),
      thoiLuongPhut: Math.max(parseMoneyNumber_(req.thoiLuongPhut || 60), 15),
      giaGoi: parseMoneyNumber_(req.giaGoi || 0),
      giaBanGoi: parseMoneyNumber_(req.giaBanGoi || req.giaGoi || 0),
    }
  );
}

function resolveStayTimeRangeFromPayload_(req, selectedPackage, existingStay) {
  var batDauInput = req.batDauAt;
  var ketThucInput = req.ketThucDuKien;
  var durationMinutes = Math.max(parseMoneyNumber_(selectedPackage.thoiLuongPhut || 60), 15);
  var batDauAt = batDauInput ? parseIsoStringOrNull_(batDauInput) : toVnDateTimeString_(new Date());
  if (batDauInput && !batDauAt) batDauAt = toVnDateTimeString_(new Date());
  var ketThucDuKien = ketThucInput
    ? parseIsoStringOrNull_(ketThucInput)
    : toVnDateTimeString_(new Date(toMsOrNaN_(batDauAt) + durationMinutes * 60000));
  if (ketThucInput && !ketThucDuKien) {
    ketThucDuKien = toVnDateTimeString_(new Date(toMsOrNaN_(batDauAt) + durationMinutes * 60000));
  }
  var batDauMs = toMsOrNaN_(batDauAt);
  var ketThucMs = toMsOrNaN_(ketThucDuKien);
  if (!isFinite(batDauMs) || !isFinite(ketThucMs) || ketThucMs <= batDauMs) {
    ketThucDuKien = toVnDateTimeString_(new Date(batDauMs + durationMinutes * 60000));
    ketThucMs = toMsOrNaN_(ketThucDuKien);
  }
  return {
    batDauAt: batDauAt,
    ketThucDuKien: ketThucDuKien,
    batDauMs: batDauMs,
    ketThucMs: ketThucMs,
    durationMinutes: Math.max(15, Math.round((ketThucMs - batDauMs) / 60000)),
  };
}

function createBookingInternal_(payload) {
  try {
    var req = payload || {};
    var maGiuong = String(req.maGiuong || "").trim();
    var tenKhach = String(req.tenKhach || "").trim();
    var foundation = ensureSpaOperationalFoundation_();
    var stays = readSpaOpsRows_(foundation.staySheet, SPA_SESSION_HEADERS);
    var staffs = readSpaOpsRows_(foundation.staffSheet, SPA_STAFF_HEADERS);
    var selectedPackage = buildTreatmentPackageFromPayload_(req, null);
    var timeRange = resolveStayTimeRangeFromPayload_(req, selectedPackage, null);
    var batDauAt = timeRange.batDauAt;
    var ketThucDuKien = timeRange.ketThucDuKien;
    var batDauMs = timeRange.batDauMs;
    var ketThucMs = timeRange.ketThucMs;
    var staff = null;
    var reqMaNv = String(req.maNhanVien || "").trim();
    var reqTenNv = normalizeCompareText_(req.tenNhanVien || "");
    for (var stf = 0; stf < staffs.length; stf++) {
      var rowMaNv = String(staffs[stf].maNhanVien || "").trim();
      var rowTenNv = normalizeCompareText_(staffs[stf].tenNhanVien || "");
      if ((reqMaNv && rowMaNv === reqMaNv) || (reqTenNv && rowTenNv === reqTenNv)) {
        staff = staffs[stf];
        break;
      }
    }
    var maNhanVien = String((staff ? staff.maNhanVien || "" : "") || req.maNhanVien || "").trim();
    var maLichHen = nextCodeFromRows_(stays, "maLichHen", "BK", "BK00001");
    var maPhien = nextCodeFromRows_(stays, "maPhien", "LT", "LT00001");
    var progress = resolveTreatmentProgressMeta_(stays, req, selectedPackage, null);
    var existingLichTrinh = "";
    if (progress.maTienTrinh) {
      for (var s = 0; s < stays.length; s++) {
        if (String(stays[s].maTienTrinh || "").trim() === progress.maTienTrinh) {
          if (stays[s].lichTrinhChiTiet) {
            existingLichTrinh = String(stays[s].lichTrinhChiTiet);
            break;
          }
        }
      }
    }
    var packageCharge = progress.isFirstCharge
      ? Number(selectedPackage.giaGoi || selectedPackage.giaBanGoi || 0)
      : 0;
    prependSpaOpsRow_(foundation.staySheet, SPA_SESSION_HEADERS, preparePhoneFieldsForSheet_({
      STT: "",
      maPhien: maPhien,
      maLichHen: maLichHen,
      maTienTrinh: progress.maTienTrinh,
      maGiuong: maGiuong,
      tenKhach: tenKhach,
      soDienThoai: String(req.soDienThoai || "").trim(),
      maNhanVien: maNhanVien,
      tenNhanVien: String(staff ? staff.tenNhanVien || "" : "").trim(),
      maDv: selectedPackage.maDv,
      tenDichVu: selectedPackage.tenDichVu,
      maGoi: selectedPackage.maGoi,
      tenGoi: selectedPackage.tenGoi,
      tongBuoiCombo: progress.tongBuoiCombo,
      buoiThu: progress.buoiThu,
      batDauAt: batDauAt,
      ketThucDuKien: ketThucDuKien,
      ketThucThucTe: "",
      thoiLuongPhut: timeRange.durationMinutes,
      giaGoi: Number(selectedPackage.giaGoi || selectedPackage.giaBanGoi || 0),
      tienGoi: packageCharge,
      tienDichVu: 0,
      tongThanhToan: packageCharge,
      trangThaiPhien: SPA_SESSION_STATUSES.BOOKED,
      ghiChu: String(req.ghiChu || "").trim(),
      tienCoc: Number(req.tienCoc || 0),
      lichTrinhChiTiet: Array.isArray(req.lichTrinhChiTiet) ? JSON.stringify(req.lichTrinhChiTiet) : existingLichTrinh,
    }));

    rebuildCustomerProgressSheet_();
    bumpAppCacheVersion_();
    return { success: true, message: "Đã tạo lịch hẹn trị liệu.", data: { maLichHen: maLichHen, maPhien: maPhien } };
  } catch (e) {
    return { success: false, message: "Lỗi: " + e.message };
  }
}

function createBooking(payload) {
  return runWithLockOrQueue_("CREATE_BOOKING", { payload: payload }, function () {
    try {
      return createBookingInternal_(payload);
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message };
    }
  });
}

function createBookingWithItemsInternal_(payload) {
  var req = payload || {};
  var items = Array.isArray(req.serviceItems) ? req.serviceItems : [];
  var bookingPayload = {};
  for (var key in req) {
    if (key !== "serviceItems" && Object.prototype.hasOwnProperty.call(req, key)) {
      bookingPayload[key] = req[key];
    }
  }
  var foundation = ensureSpaOperationalFoundation_();
  var baseTime = Date.now();
  var createdMaPhien = "";
  try {
    var bookingResult = createBookingInternal_(bookingPayload);
    if (!bookingResult || bookingResult.success !== true) return bookingResult;
    createdMaPhien = String(
      (bookingResult.data && bookingResult.data.maPhien) || bookingResult.maPhien || "",
    ).trim();
    for (var i = 0; i < items.length; i++) {
      var item = items[i] || {};
      var addResult = addStayServiceItem({
        maPhien: createdMaPhien,
        maSanPham: item.maSanPham,
        tenSanPham: item.tenSanPham,
        soLuong: item.soLuong,
        donGia: item.donGia,
        ghiChu: item.ghiChu,
        thoiGian: toVnDateTimeString_(new Date(baseTime + i)),
      });
      if (!addResult || addResult.success !== true) {
        throw new Error((addResult && addResult.message) || "Không thêm được dòng phát sinh.");
      }
    }
    var stays = readSpaOpsRows_(foundation.staySheet, SPA_SESSION_HEADERS);
    var services = readSpaOpsRows_(foundation.serviceSheet, SPA_SESSION_SERVICE_HEADERS);
    for (var s = 0; s < stays.length; s++) {
      if (String(stays[s].maPhien || "").trim() === createdMaPhien) {
        return {
          success: true,
          message: bookingResult.message || "Đã tạo lịch hẹn trị liệu.",
          data: buildStaySummary_(stays[s], services),
        };
      }
    }
    return bookingResult;
  } catch (e) {
    if (createdMaPhien) {
      var rollbackServices = readSpaOpsRows_(foundation.serviceSheet, SPA_SESSION_SERVICE_HEADERS);
      deleteSpaRowsMatching_(foundation.serviceSheet, rollbackServices, function (row) {
        return String(row.maPhien || "").trim() === createdMaPhien;
      });
      var rollbackStays = readSpaOpsRows_(foundation.staySheet, SPA_SESSION_HEADERS);
      deleteSpaRowsMatching_(foundation.staySheet, rollbackStays, function (row) {
        return String(row.maPhien || "").trim() === createdMaPhien;
      });
    }
    return { success: false, message: "Lỗi: " + e.message };
  }
}

function createBookingWithItems(payload) {
  return runWithLockOrQueue_("CREATE_BOOKING_WITH_ITEMS", { payload: payload }, function () {
    try {
      return createBookingWithItemsInternal_(payload);
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message };
    }
  });
}

function checkInRoomInternal_(payload) {
  try {
    var req = payload || {};
    var maGiuong = String(req.maGiuong || "").trim();
    var tenKhach = String(req.tenKhach || "").trim();
    var requestedMaPhien = String(req.maPhien || "").trim();
    var requestedMaLichHen = String(req.maLichHen || "").trim();
    var foundation = ensureSpaOperationalFoundation_();
    var rooms = readSpaOpsRows_(foundation.roomSheet, SPA_BED_HEADERS);
    var stays = readSpaOpsRows_(foundation.staySheet, SPA_SESSION_HEADERS);
    var staffs = readSpaOpsRows_(foundation.staffSheet, SPA_STAFF_HEADERS);
    var room = null;
    for (var i = 0; i < rooms.length; i++) {
      if (String(rooms[i].maGiuong || "").trim() === maGiuong) room = rooms[i];
    }
    var initialPackage = buildTreatmentPackageFromPayload_(req, null);
    var timeRange = resolveStayTimeRangeFromPayload_(req, initialPackage, null);
    var batDauAt = timeRange.batDauAt;
    var ketThucDuKien = timeRange.ketThucDuKien;
    var batDauMs = timeRange.batDauMs;
    var ketThucMs = timeRange.ketThucMs;
    var bookedCandidates = stays
      .filter(function (x) {
        return (
          String(x.maGiuong || "").trim() === maGiuong &&
          normalizeStayStatus_(x.trangThaiPhien) === SPA_SESSION_STATUSES.BOOKED
        );
      })
      .sort(function (a, b) {
        return toMsOrNaN_(b.batDauAt) - toMsOrNaN_(a.batDauAt);
      });
    var requestedPhone = String(req.soDienThoai || "").trim();
    var requestedCustomerKey = normalizeCompareText_(req.tenKhach || "");
    var bookedStay = null;
    if (requestedMaPhien) {
      for (var b1 = 0; b1 < bookedCandidates.length; b1++) {
        if (String(bookedCandidates[b1].maPhien || "").trim() === requestedMaPhien) {
          bookedStay = bookedCandidates[b1];
          break;
        }
      }
      if (!bookedStay) {
        for (var bx = 0; bx < stays.length; bx++) {
          if (String(stays[bx].maPhien || "").trim() === requestedMaPhien) {
            bookedStay = stays[bx];
            break;
          }
        }
      }
    } else if (requestedMaLichHen) {
      for (var b2 = 0; b2 < bookedCandidates.length; b2++) {
        if (String(bookedCandidates[b2].maLichHen || "").trim() === requestedMaLichHen) {
          bookedStay = bookedCandidates[b2];
          break;
        }
      }
      if (!bookedStay) {
        for (var by = 0; by < stays.length; by++) {
          if (String(stays[by].maLichHen || "").trim() === requestedMaLichHen) {
            bookedStay = stays[by];
            break;
          }
        }
      }
    } else if (requestedPhone || requestedCustomerKey) {
      var matched = [];
      for (var b3 = 0; b3 < bookedCandidates.length; b3++) {
        var stayPhone = String(bookedCandidates[b3].soDienThoai || "").trim();
        var stayCustomerKey = normalizeCompareText_(bookedCandidates[b3].tenKhach || "");
        var byPhone = requestedPhone && stayPhone && stayPhone === requestedPhone;
        var byName =
          requestedCustomerKey && stayCustomerKey && stayCustomerKey === requestedCustomerKey;
        if (byPhone || byName) matched.push(bookedCandidates[b3]);
      }
      if (matched.length === 1) bookedStay = matched[0];
    }
    if (!bookedStay && bookedCandidates.length > 1) {
      var matchedByWindow = [];
      for (var b4 = 0; b4 < bookedCandidates.length; b4++) {
        var range = resolveStayTimeRange_(bookedCandidates[b4]);
        if (!range) continue;
        if (hasTimeOverlap_(batDauMs, ketThucMs, range.startMs, range.endMs)) {
          matchedByWindow.push(bookedCandidates[b4]);
        }
      }
      if (matchedByWindow.length === 1) bookedStay = matchedByWindow[0];
    }
    if (!tenKhach && bookedStay) {
      tenKhach = String(bookedStay.tenKhach || "").trim();
    }
    var selectedPackage = buildTreatmentPackageFromPayload_(req, bookedStay);
    var staff = null;
    var reqMaNv = String(req.maNhanVien || "").trim();
    var reqTenNv = normalizeCompareText_(req.tenNhanVien || "");
    for (var stf = 0; stf < staffs.length; stf++) {
      var rowMaNv = String(staffs[stf].maNhanVien || "").trim();
      var rowTenNv = normalizeCompareText_(staffs[stf].tenNhanVien || "");
      if ((reqMaNv && rowMaNv === reqMaNv) || (reqTenNv && rowTenNv === reqTenNv)) {
        staff = staffs[stf];
        break;
      }
    }
    var maNhanVien = String(
      req.maNhanVien ||
        (bookedStay ? bookedStay.maNhanVien || "" : "") ||
        (staff ? staff.maNhanVien || "" : ""),
    ).trim();
    var progress = resolveTreatmentProgressMeta_(
      stays,
      {
        maTienTrinh: req.maTienTrinh,
        tenKhach: tenKhach,
        soDienThoai: String(
          req.soDienThoai || (bookedStay ? bookedStay.soDienThoai || "" : ""),
        ).trim(),
        maGoi: selectedPackage.maGoi,
      },
      selectedPackage,
      bookedStay,
    );
    var packageCharge = bookedStay
      ? Number(bookedStay.tienGoi || 0)
      : progress.isFirstCharge
        ? Number(selectedPackage.giaGoi || selectedPackage.giaBanGoi || 0)
        : 0;
    var maPhien = bookedStay
      ? String(bookedStay.maPhien || "").trim()
      : nextCodeFromRows_(stays, "maPhien", "LT", "LT00001");
    var maLichHen = bookedStay ? String(bookedStay.maLichHen || "").trim() : "";
    var saveStay = {
      STT: "",
      maPhien: maPhien,
      maLichHen: maLichHen,
      maTienTrinh: bookedStay ? String(bookedStay.maTienTrinh || "").trim() : progress.maTienTrinh,
      maGiuong: maGiuong,
      tenKhach: tenKhach,
      soDienThoai: String(
        req.soDienThoai || (bookedStay ? bookedStay.soDienThoai || "" : ""),
      ).trim(),
      maNhanVien: maNhanVien,
      tenNhanVien: String(
        req.tenNhanVien ||
          (bookedStay ? bookedStay.tenNhanVien || "" : "") ||
          (staff ? staff.tenNhanVien || "" : ""),
      ).trim(),
      maDv: selectedPackage.maDv,
      tenDichVu: selectedPackage.tenDichVu,
      maGoi: selectedPackage.maGoi,
      tenGoi: selectedPackage.tenGoi,
      tongBuoiCombo: Math.max(parseMoneyNumber_(bookedStay ? bookedStay.tongBuoiCombo : 0), progress.tongBuoiCombo, 1),
      buoiThu: Math.max(parseMoneyNumber_(bookedStay ? bookedStay.buoiThu : 0), progress.buoiThu, 1),
      batDauAt: batDauAt,
      ketThucDuKien: ketThucDuKien,
      ketThucThucTe: "",
      thoiLuongPhut: timeRange.durationMinutes,
      giaGoi: Number(selectedPackage.giaGoi || selectedPackage.giaBanGoi || 0),
      tienGoi: packageCharge,
      tienDichVu: Number(bookedStay ? bookedStay.tienDichVu || 0 : 0),
      tongThanhToan:
        packageCharge +
        Number(bookedStay ? bookedStay.tienDichVu || 0 : 0),
      trangThaiPhien: SPA_SESSION_STATUSES.IN_HOUSE,
      ghiChu: String(req.ghiChu || (bookedStay ? bookedStay.ghiChu || "" : "")).trim(),
      tienCoc: Number(req.tienCoc || 0),
      lichTrinhChiTiet: Array.isArray(req.lichTrinhChiTiet) ? JSON.stringify(req.lichTrinhChiTiet) : (bookedStay ? String(bookedStay.lichTrinhChiTiet || "") : ""),
    };

    if (bookedStay) {
      writeSpaOpsRow_(foundation.staySheet, SPA_SESSION_HEADERS, bookedStay.__row, preparePhoneFieldsForSheet_(saveStay));
    } else {
      prependSpaOpsRow_(foundation.staySheet, SPA_SESSION_HEADERS, preparePhoneFieldsForSheet_(saveStay));
    }

    if (room) {
      room.trangThaiGiuong = SPA_ROOM_STATUSES.IN_HOUSE;
      room.updatedAt = getNowVnDateTime_();
      writeSpaOpsRow_(foundation.roomSheet, SPA_BED_HEADERS, room.__row, room);
    }
    rebuildCustomerProgressSheet_();
    bumpAppCacheVersion_();
    return { success: true, message: "Mở phiên trị liệu thành công.", data: { maPhien: maPhien } };
  } catch (e) {
    return { success: false, message: "Lỗi: " + e.message };
  }
}

function checkInRoom(payload) {
  return runWithLockOrQueue_("CHECKIN_ROOM", { payload: payload }, function () {
    try {
      return checkInRoomInternal_(payload);
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message };
    }
  });
}

function checkInRoomWithItemsInternal_(payload) {
  var req = payload || {};
  var items = Array.isArray(req.serviceItems) ? req.serviceItems : [];
  var sessionPayload = {};
  for (var key in req) {
    if (key !== "serviceItems" && Object.prototype.hasOwnProperty.call(req, key)) {
      sessionPayload[key] = req[key];
    }
  }
  var foundation = ensureSpaOperationalFoundation_();
  var originalStays = readSpaOpsRows_(foundation.staySheet, SPA_SESSION_HEADERS);
  var originalRooms = readSpaOpsRows_(foundation.roomSheet, SPA_BED_HEADERS);
  var roomCode = String(sessionPayload.maGiuong || "").trim();
  var originalRoom = null;
  for (var r = 0; r < originalRooms.length; r++) {
    if (String(originalRooms[r].maGiuong || "").trim() === roomCode) {
      originalRoom = originalRooms[r];
      break;
    }
  }
  var baseTime = Date.now();
  var createdMaPhien = "";
  var originalStay = null;
  var addedServiceIds = [];
  try {
    var checkinResult = checkInRoomInternal_(sessionPayload);
    if (!checkinResult || checkinResult.success !== true) return checkinResult;
    createdMaPhien = String(
      (checkinResult.data && checkinResult.data.maPhien) || sessionPayload.maPhien || "",
    ).trim();
    for (var s = 0; s < originalStays.length; s++) {
      if (String(originalStays[s].maPhien || "").trim() === createdMaPhien) {
        originalStay = originalStays[s];
        break;
      }
    }
    for (var i = 0; i < items.length; i++) {
      var item = items[i] || {};
      var thoiGian = toVnDateTimeString_(new Date(baseTime + i));
      var addResult = addStayServiceItem({
        maPhien: createdMaPhien,
        maSanPham: item.maSanPham,
        tenSanPham: item.tenSanPham,
        soLuong: item.soLuong,
        donGia: item.donGia,
        ghiChu: item.ghiChu,
        thoiGian: thoiGian,
      });
      if (!addResult || addResult.success !== true) {
        throw new Error((addResult && addResult.message) || "Không thêm được dòng phát sinh.");
      }
      addedServiceIds.push(
        buildServiceItemIdentity_({
          maPhien: createdMaPhien,
          thoiGian: thoiGian,
          maSanPham: item.maSanPham,
          tenSanPham: item.tenSanPham,
        }),
      );
    }
    var stays = readSpaOpsRows_(foundation.staySheet, SPA_SESSION_HEADERS);
    var services = readSpaOpsRows_(foundation.serviceSheet, SPA_SESSION_SERVICE_HEADERS);
    for (var j = 0; j < stays.length; j++) {
      if (String(stays[j].maPhien || "").trim() === createdMaPhien) {
        return {
          success: true,
          message: checkinResult.message || "Mở phiên trị liệu thành công.",
          data: buildStaySummary_(stays[j], services),
        };
      }
    }
    return checkinResult;
  } catch (e) {
    var rollbackServices = readSpaOpsRows_(foundation.serviceSheet, SPA_SESSION_SERVICE_HEADERS);
    deleteSpaRowsMatching_(foundation.serviceSheet, rollbackServices, function (row) {
      return addedServiceIds.indexOf(buildServiceItemIdentity_(row)) >= 0;
    });
    var rollbackStays = readSpaOpsRows_(foundation.staySheet, SPA_SESSION_HEADERS);
    var currentStay = null;
    for (var k = 0; k < rollbackStays.length; k++) {
      if (String(rollbackStays[k].maPhien || "").trim() === createdMaPhien) {
        currentStay = rollbackStays[k];
        break;
      }
    }
    if (originalStay && currentStay) {
      writeSpaOpsRow_(foundation.staySheet, SPA_SESSION_HEADERS, currentStay.__row, originalStay);
    } else if (!originalStay) {
      deleteSpaRowsMatching_(foundation.staySheet, rollbackStays, function (row) {
        return String(row.maPhien || "").trim() === createdMaPhien;
      });
    }
    if (originalRoom) {
      var rollbackRooms = readSpaOpsRows_(foundation.roomSheet, SPA_BED_HEADERS);
      for (var rr = 0; rr < rollbackRooms.length; rr++) {
        if (String(rollbackRooms[rr].maGiuong || "").trim() === roomCode) {
          writeSpaOpsRow_(foundation.roomSheet, SPA_BED_HEADERS, rollbackRooms[rr].__row, originalRoom);
          break;
        }
      }
    }
    return { success: false, message: "Lỗi: " + e.message };
  }
}

function checkInRoomWithItems(payload) {
  return runWithLockOrQueue_("CHECKIN_ROOM_WITH_ITEMS", { payload: payload }, function () {
    try {
      return checkInRoomWithItemsInternal_(payload);
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message };
    }
  });
}

function addStayServiceItem(payload) {
  try {
    var req = payload || {};
    var maPhien = String(req.maPhien || "").trim();
    if (!maPhien) return { success: false, message: "Thiếu mã phiên trị liệu." };
    var foundation = ensureSpaOperationalFoundation_();
    var stays = readSpaOpsRows_(foundation.staySheet, SPA_SESSION_HEADERS);
    var services = readSpaOpsRows_(foundation.serviceSheet, SPA_SESSION_SERVICE_HEADERS);
    var stay = null;
    for (var i = 0; i < stays.length; i++) {
      if (String(stays[i].maPhien || "").trim() === maPhien) stay = stays[i];
    }
    if (!stay) return { success: false, message: "Không tìm thấy phiên trị liệu." };
    if (isImmutableSession_(stay.trangThaiPhien)) return { success: false, message: "Không thể thay đổi dữ liệu. Đơn hàng này đã hoàn tất hoặc bị hủy." };

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
    if (!sp) {
      sp = {
        maSanPham: maSanPham,
        tenSanPham: tenSanPham,
        nhomHang: String(req.nhomHang || "").trim(),
        donVi: String(req.donVi || "").trim(),
        donGiaBan: Math.max(0, Number(req.donGia || 0)),
      };
    }
    var soLuong = Math.max(1, Number(req.soLuong || 1));
    var donGia = Math.max(0, Number(req.donGia || sp.donGiaBan || 0));
    var thanhTien = soLuong * donGia;
    var thoiGian =
      parseIsoStringOrNull_(req.thoiGian) || getNowVnDateTime_();
    appendSpaOpsRow_(foundation.serviceSheet, SPA_SESSION_SERVICE_HEADERS, {
      STT: "",
      maPhien: maPhien,
      thoiGian: thoiGian,
      maSanPham: String(sp.maSanPham || "").trim(),
      tenSanPham: String(sp.tenSanPham || "").trim(),
      nhomHang: String(sp.nhomHang || "").trim(),
      donVi: String(sp.donVi || "").trim(),
      soLuong: soLuong,
      donGia: donGia,
      thanhTien: thanhTien,
      ghiChu: String(req.ghiChu || "").trim(),
      daTruTonKho: "",
    });

    services = readSpaOpsRows_(foundation.serviceSheet, SPA_SESSION_SERVICE_HEADERS);
    var summary = buildStaySummary_(stay, services);
    stay.tienDichVu = summary.tienDichVu;
    stay.tongThanhToan = summary.tongThanhToan;
    writeSpaOpsRow_(foundation.staySheet, SPA_SESSION_HEADERS, stay.__row, stay);

    bumpAppCacheVersion_();
    return { success: true, message: "Đã thêm dịch vụ phát sinh.", data: summary };
  } catch (e) {
    return { success: false, message: "Lỗi: " + e.message };
  }
}

/**
 * Cập nhật dịch vụ phát sinh của phiên trị liệu
 */
function updateStayServiceItemInternal_(req) {
  try {
    var authCheck = requireAuth_(req);
    if (!authCheck.success) return authCheck;

    req = req || {};
  var maPhien = String(req.maPhien || "").trim();
  if (!maPhien) {
    return { success: false, message: "Thiếu mã phiên trị liệu." };
  }
  var foundation = ensureSpaOperationalFoundation_();
  var stays = readSpaOpsRows_(foundation.staySheet, SPA_SESSION_HEADERS);
  var services = readSpaOpsRows_(foundation.serviceSheet, SPA_SESSION_SERVICE_HEADERS);
  var stay = null;
  for (var i = 0; i < stays.length; i++) {
    if (String(stays[i].maPhien || "").trim() === maPhien) stay = stays[i];
  }
  if (!stay) return { success: false, message: "Không tìm thấy phiên trị liệu." };
  if (isImmutableSession_(stay.trangThaiPhien)) return { success: false, message: "Không thể thay đổi dữ liệu. Đơn hàng này đã hoàn tất hoặc bị hủy." };
  var serviceItems = services.filter(function(s) {
    return String(s.maPhien || "").trim() === maPhien;
  });
  var targetService = resolveServiceItemRow_(serviceItems, req);
  if (!targetService) {
    return { success: false, message: "Không tìm thấy dòng dịch vụ cần cập nhật." };
  }
  var soLuong = Math.max(1, Number(req.soLuong || targetService.soLuong || 1));
  var donGia = Math.max(0, Number(req.donGia || targetService.donGia || 0));
  var thanhTien = soLuong * donGia;
  targetService.soLuong = soLuong;
  targetService.donGia = donGia;
  targetService.thanhTien = thanhTien;
  targetService.ghiChu = String(req.ghiChu || targetService.ghiChu || "").trim();
  writeSpaOpsRow_(foundation.serviceSheet, SPA_SESSION_SERVICE_HEADERS, targetService.__row, targetService);
  services = readSpaOpsRows_(foundation.serviceSheet, SPA_SESSION_SERVICE_HEADERS);
  var summary = buildStaySummary_(stay, services);
  stay.tienDichVu = summary.tienDichVu;
  stay.tongThanhToan = summary.tongThanhToan;
  writeSpaOpsRow_(foundation.staySheet, SPA_SESSION_HEADERS, stay.__row, stay);
  bumpAppCacheVersion_();
  return { success: true, message: "Đã cập nhật dịch vụ.", data: summary };
  } catch (e) {
    return { success: false, message: "Lỗi: " + e.message };
  }
}

function updateStayServiceItem(payload) {
  return runWithLockOrQueue_("UPDATE_STAY_SERVICE", { payload: payload }, function () {
    try {
      return updateStayServiceItemInternal_(payload);
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message };
    }
  });
}

/**
 * Xóa dịch vụ phát sinh của phiên trị liệu
 */
function deleteStayServiceItemInternal_(req) {
  req = req || {};
  var maPhien = String(req.maPhien || "").trim();
  if (!maPhien) {
    return { success: false, message: "Thiếu mã phiên trị liệu." };
  }
  var foundation = ensureSpaOperationalFoundation_();
  var stays = readSpaOpsRows_(foundation.staySheet, SPA_SESSION_HEADERS);
  var services = readSpaOpsRows_(foundation.serviceSheet, SPA_SESSION_SERVICE_HEADERS);
  var stay = null;
  for (var i = 0; i < stays.length; i++) {
    if (String(stays[i].maPhien || "").trim() === maPhien) stay = stays[i];
  }
  if (!stay) return { success: false, message: "Không tìm thấy phiên trị liệu." };
  if (isImmutableSession_(stay.trangThaiPhien)) return { success: false, message: "Không thể thay đổi dữ liệu. Đơn hàng này đã hoàn tất hoặc bị hủy." };
  var serviceItems = services.filter(function(s) {
    return String(s.maPhien || "").trim() === maPhien;
  });
  var targetService = resolveServiceItemRow_(serviceItems, req);
  if (!targetService) {
    return { success: false, message: "Không tìm thấy dòng dịch vụ cần xóa." };
  }
  // Xóa row thực sự khỏi sheet
  foundation.serviceSheet.deleteRow(targetService.__row);
  // Tính lại tổng (đọc lại sau khi xóa)
  services = readSpaOpsRows_(foundation.serviceSheet, SPA_SESSION_SERVICE_HEADERS);
  var summary = buildStaySummary_(stay, services);
  stay.tienDichVu = summary.tienDichVu;
  stay.tongThanhToan = summary.tongThanhToan;
  writeSpaOpsRow_(foundation.staySheet, SPA_SESSION_HEADERS, stay.__row, stay);
  bumpAppCacheVersion_();
  return { success: true, message: "Đã xóa dịch vụ.", data: summary };
}

function deleteStayServiceItem(payload) {
  return runWithLockOrQueue_("DELETE_STAY_SERVICE", { payload: payload }, function () {
    try {
      return deleteStayServiceItemInternal_(payload);
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message };
    }
  });
}

/**
 * Cập nhật thời gian bắt đầu/kết thúc dự kiến của phiên trị liệu
 */
function updateStayTimeInternal_(req) {
  try {
    var authCheck = requireAuth_(req);
    if (!authCheck.success) return authCheck;

    req = req || {};
  var maPhien = String(req.maPhien || "").trim();
  if (!maPhien) return { success: false, message: "Thiếu mã phiên trị liệu." };
  var foundation = ensureSpaOperationalFoundation_();
  var stays = readSpaOpsRows_(foundation.staySheet, SPA_SESSION_HEADERS);
  var services = readSpaOpsRows_(foundation.serviceSheet, SPA_SESSION_SERVICE_HEADERS);
  var stay = null;
  for (var i = 0; i < stays.length; i++) {
    if (String(stays[i].maPhien || "").trim() === maPhien) stay = stays[i];
  }
  if (!stay) return { success: false, message: "Không tìm thấy phiên trị liệu." };
  if (isImmutableSession_(stay.trangThaiPhien)) return { success: false, message: "Không thể thay đổi dữ liệu. Đơn hàng này đã hoàn tất hoặc bị hủy." };
  stay = normalizeSpaSession_(stay);
  var timeRange = resolveStayTimeRangeFromPayload_(
    {
      batDauAt: req.batDauAt || stay.batDauAt,
      ketThucDuKien: req.ketThucDuKien || stay.ketThucDuKien,
      thoiLuongPhut: stay.thoiLuongPhut,
    },
    { thoiLuongPhut: stay.thoiLuongPhut || 60 },
    stay,
  );
  stay.batDauAt = timeRange.batDauAt;
  stay.ketThucDuKien = timeRange.ketThucDuKien;
  stay.thoiLuongPhut = timeRange.durationMinutes;
  
  if (req.maNhanVien !== undefined) {
    stay.maNhanVien = String(req.maNhanVien || "").trim();
    if (stay.maNhanVien) {
      var staffs = readSpaOpsRows_(foundation.staffSheet, SPA_STAFF_HEADERS);
      var staffInfo = staffs.find(function(s) { return String(s.maNhanVien || "").trim() === stay.maNhanVien; });
      stay.tenNhanVien = staffInfo ? String(staffInfo.tenNhanVien || "").trim() : stay.maNhanVien;
    } else {
      stay.tenNhanVien = "";
    }
  }

  var summary = buildStaySummary_(stay, services);
  stay.tienDichVu = summary.tienDichVu;
  stay.tongThanhToan = Number(stay.tienGoi || 0) + summary.tienDichVu;
  writeSpaOpsRow_(foundation.staySheet, SPA_SESSION_HEADERS, stay.__row, stay);
  rebuildCustomerProgressSheet_();
  bumpAppCacheVersion_();
  return { success: true, message: "Đã cập nhật thời gian.", data: summary };
  } catch (e) {
    return { success: false, message: "Lỗi: " + e.message };
  }
}

function updateStayTime(payload) {
  return runWithLockOrQueue_("UPDATE_STAY_TIME", { payload: payload }, function () {
    try {
      return updateStayTimeInternal_(payload);
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message };
    }
  });
}

/**
 * Cập nhật nhân viên KTV cho phiên trị liệu
 */
function updateStayStaffInternal_(req) {
  try {
    var authCheck = requireAuth_(req);
    if (!authCheck.success) return authCheck;

    req = req || {};
    var maPhien = String(req.maPhien || "").trim();
    if (!maPhien) return { success: false, message: "Thiếu mã phiên trị liệu." };
    
    var foundation = ensureSpaOperationalFoundation_();
    var staffCatalog = readSpaOpsRows_(foundation.staffSheet, SPA_STAFF_HEADERS);
    var stays = readSpaOpsRows_(foundation.staySheet, SPA_SESSION_HEADERS);
    
    var stay = null;
    var stayIdx = -1;
    for (var i = 0; i < stays.length; i++) {
      if (String(stays[i].maPhien || "").trim() === maPhien) {
        stay = stays[i];
        stayIdx = i;
        break;
      }
    }
    if (!stay) return { success: false, message: "Không tìm thấy phiên trị liệu." };
    if (isImmutableSession_(stay.trangThaiPhien)) return { success: false, message: "Không thể thay đổi dữ liệu. Đơn hàng này đã hoàn tất hoặc bị hủy." };
    
    var newMaNhanVien = String(req.maNhanVien || "").trim();
    var newTenNhanVien = "";
    
    if (newMaNhanVien) {
      var staff = null;
      for (var j = 0; j < staffCatalog.length; j++) {
        if (String(staffCatalog[j].maNhanVien || "").trim() === newMaNhanVien) {
          staff = staffCatalog[j];
          break;
        }
      }
      if (!staff) return { success: false, message: "Không tìm thấy nhân viên với mã: " + newMaNhanVien };
      newTenNhanVien = String(staff.tenNhanVien || "").trim() || newMaNhanVien;
    }
    
    // Update stay record
    stays[stayIdx].maNhanVien = newMaNhanVien;
    stays[stayIdx].tenNhanVien = newTenNhanVien;
    stays[stayIdx].updatedAt = new Date().toISOString();
    
    writeSpaOpsRow_(foundation.staySheet, SPA_SESSION_HEADERS, stay.__row, stays[stayIdx]);
    
    bumpAppCacheVersion_();
    
    return {
      success: true,
      message: "Đã cập nhật nhân viên cho phiên " + maPhien,
      data: {
        maPhien: maPhien,
        maNhanVien: newMaNhanVien,
        tenNhanVien: newTenNhanVien,
      }
    };
  } catch (e) {
    Logger.log("[updateStayStaff] Lỗi: " + e.message);
    return { success: false, message: "Lỗi: " + e.message };
  }
}

function updateStayStaff(payload) {
  return runWithLockOrQueue_("UPDATE_STAY_STAFF", { payload: payload }, function () {
    try {
      return updateStayStaffInternal_(payload);
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message };
    }
  });
}

function formatCheckoutDateVn_(isoOrDate) {
  // Trả về VN date format "DD/MM/yyyy"
  var d = isoOrDate ? new Date(isoOrDate) : new Date();
  if (!isFinite(d.getTime())) d = new Date();
  var m = String(d.getMonth() + 1).padStart(2, "0");
  var day = String(d.getDate()).padStart(2, "0");
  var y = d.getFullYear();
  return day + "/" + m + "/" + y;
}

function lookupDvMaPhacDo_(foundation, maDv) {
  var code = String(maDv || "").trim();
  if (!code) return "";
  var dvRows = readSpaOpsRows_(foundation.dmDv, SPA_SHEET_HEADERS.DM_DICH_VU);
  for (var i = 0; i < dvRows.length; i++) {
    if (String(dvRows[i].maDv || "").trim() === code) {
      return String(dvRows[i].maPhacDo || "").trim();
    }
  }
  return "";
}

function buildSpaProductCostMap_(foundation) {
  var map = {};
  var spRows = readSpaOpsRows_(foundation.dmSp, SPA_SHEET_HEADERS.DM_SAN_PHAM_DUOC_LIEU);
  for (var i = 0; i < spRows.length; i++) {
    var code = String(spRows[i].maSanPham || "").trim();
    var name = normalizeProductKeyPart_(String(spRows[i].tenSanPham || ""));
    var cost = Math.max(parseMoneyNumber_(spRows[i].giaVon), 0);
    if (code) map["code:" + code] = cost;
    if (name) map["name:" + name] = cost;
  }
  return map;
}

function buildSpaProductCodeToNameKeyMap_(foundation) {
  var map = {};
  var spRows = readSpaOpsRows_(foundation.dmSp, SPA_SHEET_HEADERS.DM_SAN_PHAM_DUOC_LIEU);
  for (var i = 0; i < spRows.length; i++) {
    var code = String(spRows[i].maSanPham || "").trim();
    var nameKey = normalizeProductKeyPart_(String(spRows[i].tenSanPham || ""));
    if (code && nameKey) map[code] = nameKey;
  }
  var catalog = getProductCatalog();
  if (catalog && catalog.success && Array.isArray(catalog.data)) {
    for (var c = 0; c < catalog.data.length; c++) {
      var catCode = String(catalog.data[c].maSanPham || "").trim();
      var catNameKey = normalizeProductKeyPart_(String(catalog.data[c].tenSanPham || ""));
      if (catCode && catNameKey && !map[catCode]) map[catCode] = catNameKey;
    }
  }
  return map;
}

function resolveStockProductKey_(item, codeToNameKeyMap) {
  var maSanPham = String(item && item.maSanPham ? item.maSanPham : "").trim();
  if (maSanPham && codeToNameKeyMap && codeToNameKeyMap[maSanPham]) {
    return codeToNameKeyMap[maSanPham];
  }
  return normalizeProductKeyPart_(String(item && item.tenSanPham ? item.tenSanPham : ""));
}

function buildSpaPackageCostMap_(foundation) {
  var map = {};
  var goiRows = readSpaOpsRows_(foundation.dmGoi, SPA_SHEET_HEADERS.DM_GOI_DIEU_TRI);
  for (var i = 0; i < goiRows.length; i++) {
    var maGoi = String(goiRows[i].maGoi || "").trim();
    if (!maGoi) continue;
    var totalCost = Math.max(parseMoneyNumber_(goiRows[i].giaVonChuanGoi), 0);
    var soBuoi = Math.max(parseMoneyNumber_(goiRows[i].soBuoiQuyDoi), 1);
    map[maGoi] = {
      perSessionCost: totalCost / soBuoi,
      soBuoiQuyDoi: soBuoi,
    };
  }
  return map;
}

function appendCtBanFromCheckout_(stay, services) {
  var rawTienGoi = parseSessionTienGoi_(stay);
  stay = normalizeSpaSession_(stay || {});
  stay.tienGoi = rawTienGoi;
  var maPhien = String(stay.maPhien || "").trim();
  if (!maPhien) return;

  var spaFoundation = ensureSpaFoundation_();
  var existing = readSpaOpsRows_(spaFoundation.ctBan, SPA_SHEET_HEADERS.CT_BAN);
  for (var e = 0; e < existing.length; e++) {
    if (String(existing[e].maPhieu || "").trim() === maPhien) return;
  }

  var ngayThuTien = formatCheckoutDateVn_(stay.ketThucThucTe);
  var tenKhach = String(stay.tenKhach || "").trim() || "Khách vãng lai";
  var soDienThoai = String(stay.soDienThoai || "").trim();
  var maDv = String(stay.maDv || "").trim();
  var maGoi = String(stay.maGoi || "").trim();
  var tenGoi = String(stay.tenGoi || "").trim();
  var tenDichVu = String(stay.tenDichVu || "").trim();
  var tongBuoiCombo = Math.max(parseMoneyNumber_(stay.tongBuoiCombo), 1);
  var buoiThu = Math.max(parseMoneyNumber_(stay.buoiThu), 1);
  var maTienTrinh = String(stay.maTienTrinh || "").trim();
  var isLastSession = (buoiThu >= tongBuoiCombo);
  var maPhacDo = lookupDvMaPhacDo_(spaFoundation, maDv);
  var pkgCostMap = buildSpaPackageCostMap_(spaFoundation);
  var prodCostMap = buildSpaProductCostMap_(spaFoundation);

  var sessionItems = (services || []).filter(function (x) {
    return String(x.maPhien || "").trim() === maPhien;
  });
  var tienGoi = rawTienGoi;
  var tienDichVu = sessionItems.reduce(function (sum, x) {
    return sum + Math.max(parseMoneyNumber_(x.thanhTien), 0);
  }, 0);
  var expectedSessionRevenue = tienGoi + tienDichVu;
  var rowsToAppend = [];

  if (maGoi || tenGoi || tenDichVu) {
    var pkgInfo = pkgCostMap[maGoi] || null;
    var giaBanGoi = Math.max(parseMoneyNumber_(stay.giaGoi), 0);
    var giaVonGoi = pkgInfo ? Math.max(pkgInfo.perSessionCost, 0) : 0;
    var doanhThuGoi = tienGoi;
    if (isLastSession && tienDichVu > 0) {
      doanhThuGoi = tienGoi + tienDichVu;
    }
    if (doanhThuGoi > 0 || isLastSession) {
      rowsToAppend.push({
        ngayThuTien: ngayThuTien,
        maPhieu: maPhien,
        maTienTrinh: maTienTrinh,
        tenKhach: tenKhach,
        soDienThoai: soDienThoai,
        nguonThu: "GOI_DIEU_TRI",
        maSanPham: "",
        tenSanPham: tenGoi || tenDichVu,
        maPhacDo: maPhacDo,
        maDv: maDv,
        maGoi: maGoi,
        tenGoi: tenGoi || tenDichVu,
        soLuong: 1,
        soBuoiMua: tongBuoiCombo,
        soBuoiTang: 0,
        soBuoiQuyDoi: pkgInfo ? pkgInfo.soBuoiQuyDoi : tongBuoiCombo,
        buoiThu: buoiThu,
        giaBan: giaBanGoi,
        giaVon: giaVonGoi,
        doanhThu: doanhThuGoi,
        loiNhuan: doanhThuGoi - giaVonGoi,
        ghiChu: "Checkout phiên " + maPhien + " - buổi " + buoiThu + "/" + tongBuoiCombo,
        tienCoc: Number(stay.tienCoc || 0),
        lichTrinhChiTiet: String(stay.lichTrinhChiTiet || "").trim(),
      });
    }
  }

  if (!isLastSession) {
    for (var s = 0; s < sessionItems.length; s++) {
      var item = sessionItems[s];
      var qty = Math.max(parseMoneyNumber_(item.soLuong), 1);
      var giaBan = Math.max(parseMoneyNumber_(item.donGia), 0);
      var doanhThu = Math.max(parseMoneyNumber_(item.thanhTien), giaBan * qty);
      if (doanhThu <= 0) continue;
      var maSanPham = String(item.maSanPham || "").trim();
      var tenSanPham = String(item.tenSanPham || "").trim();
      var giaVon = 0;
      if (maSanPham && prodCostMap["code:" + maSanPham] != null) {
        giaVon = prodCostMap["code:" + maSanPham];
      } else {
        var nameKey = normalizeProductKeyPart_(tenSanPham);
        if (nameKey && prodCostMap["name:" + nameKey] != null) {
          giaVon = prodCostMap["name:" + nameKey];
        }
      }
      var totalCost = giaVon * qty;
      rowsToAppend.push({
        ngayThuTien: ngayThuTien,
        maPhieu: maPhien,
        maTienTrinh: maTienTrinh,
        tenKhach: tenKhach,
        soDienThoai: soDienThoai,
        nguonThu: "SAN_PHAM_DUOC_LIEU",
        maSanPham: maSanPham,
        tenSanPham: tenSanPham,
        maPhacDo: maPhacDo,
        maDv: maDv,
        maGoi: "",
        tenGoi: "",
        soLuong: qty,
        soBuoiMua: 0,
        soBuoiTang: 0,
        soBuoiQuyDoi: 0,
        buoiThu: buoiThu,
        giaBan: giaBan,
        giaVon: giaVon,
        doanhThu: doanhThu,
        loiNhuan: doanhThu - totalCost,
        ghiChu: String(item.ghiChu || "").trim() || "Sản phẩm trong phiên",
        tienCoc: 0,
        lichTrinhChiTiet: "",
      });
    }
  }

  if (!rowsToAppend.length) {
    rowsToAppend.push({
      ngayThuTien: ngayThuTien,
      maPhieu: maPhien,
      maTienTrinh: maTienTrinh,
      tenKhach: tenKhach,
      soDienThoai: soDienThoai,
      nguonThu: "GOI_DIEU_TRI",
      maSanPham: "",
      tenSanPham: tenGoi || tenDichVu || "Phiên trị liệu",
      maPhacDo: maPhacDo,
      maDv: maDv,
      maGoi: maGoi,
      tenGoi: tenGoi || tenDichVu || "Phiên trị liệu",
      soLuong: 1,
      soBuoiMua: tongBuoiCombo,
      soBuoiTang: 0,
      soBuoiQuyDoi: tongBuoiCombo,
      buoiThu: buoiThu,
      giaBan: 0,
      giaVon: 0,
      doanhThu: 0,
      loiNhuan: 0,
      ghiChu: "Checkout phiên " + maPhien + " - buổi " + buoiThu + "/" + tongBuoiCombo,
      tienCoc: Number(stay.tienCoc || 0),
      lichTrinhChiTiet: String(stay.lichTrinhChiTiet || "").trim(),
    });
  }

  var actualRevenue = rowsToAppend.reduce(function (sum, row) {
    return sum + Math.max(parseMoneyNumber_(row.doanhThu), 0);
  }, 0);
  if (actualRevenue > expectedSessionRevenue + 1) {
    for (var fix = 0; fix < rowsToAppend.length; fix++) {
      if (String(rowsToAppend[fix].nguonThu || "").trim().toUpperCase() !== "GOI_DIEU_TRI") continue;
      var productRevenue = rowsToAppend.reduce(function (sum, row) {
        if (String(row.nguonThu || "").trim().toUpperCase() === "GOI_DIEU_TRI") return sum;
        return sum + Math.max(parseMoneyNumber_(row.doanhThu), 0);
      }, 0);
      var cappedGoiRevenue = Math.max(expectedSessionRevenue - productRevenue, 0);
      rowsToAppend[fix].doanhThu = cappedGoiRevenue;
      rowsToAppend[fix].loiNhuan =
        cappedGoiRevenue - Math.max(parseMoneyNumber_(rowsToAppend[fix].giaVon), 0);
      break;
    }
  }

  for (var r = 0; r < rowsToAppend.length; r++) {
    appendSpaOpsRow_(spaFoundation.ctBan, SPA_SHEET_HEADERS.CT_BAN, rowsToAppend[r]);
  }
}

function updateComboScheduleInternal_(payload) {
  var maTienTrinh = String(payload.maTienTrinh || "").trim();
  var lichTrinhChiTiet = String(payload.lichTrinhChiTiet || "").trim();
  if (!maTienTrinh) {
    return { success: true, message: "Đã cập nhật lịch trình." };
  }

  var opsFoundation = ensureSpaOperationalFoundation_();
  var spaFoundation = ensureSpaFoundation_();
  var stays = readSpaOpsRows_(opsFoundation.staySheet, SPA_SESSION_HEADERS);
  var stayCodes = {};
  var stayUpdatedCount = 0;

  for (var i = 0; i < stays.length; i++) {
    if (String(stays[i].maTienTrinh || "").trim() === maTienTrinh) {
      var row = stays[i];
      row.lichTrinhChiTiet = lichTrinhChiTiet;
      writeSpaOpsRow_(opsFoundation.staySheet, SPA_SESSION_HEADERS, row.__row, row);
      stayCodes[String(row.maPhien || "").trim()] = true;
      stayUpdatedCount++;
    }
  }

  if (stayUpdatedCount > 0) {
    var orders = readSpaOpsRows_(spaFoundation.ctBan, SPA_SHEET_HEADERS.CT_BAN);
    for (var j = 0; j < orders.length; j++) {
      var maPhieu = String(orders[j].maPhieu || "").trim();
      if (maPhieu && stayCodes[maPhieu]) {
        var oRow = orders[j];
        oRow.lichTrinhChiTiet = lichTrinhChiTiet;
        writeSpaOpsRow_(spaFoundation.ctBan, SPA_SHEET_HEADERS.CT_BAN, oRow.__row, oRow);
      }
    }
    rebuildCustomerProgressSheet_();
  }

  return { success: true, message: "Đã cập nhật lịch trình." };
}

function updateComboSchedule(payload) {
  return runWithLockOrQueue_("UPDATE_COMBO_SCHEDULE", payload, function () {
    try {
      var result = updateComboScheduleInternal_(payload);
      if (result && result.success) bumpAppCacheVersion_();
      return result;
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message };
    }
  });
}

function isStockTrackedSpaServiceItem_(serviceRow) {
  var group = normalizeCompareText_(serviceRow ? serviceRow.nhomHang || "" : "");
  if (group.indexOf("dich vu") !== -1) return false;
  if (group.indexOf("goi") !== -1 || group.indexOf("the tai khoan") !== -1) return false;
  return true;
}

function deductSpaServiceStock_(foundation, maPhien, services) {
  var stayCode = String(maPhien || "").trim();
  if (!stayCode) return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var stockSheet = ss.getSheetByName("QUAN_LY_KHO") || ss.getSheetByName("QUẢN LÝ KHO");
  if (!stockSheet) return;
  var lastStockRow = stockSheet.getLastRow();
  if (lastStockRow < 3) return;
  var stockValues = stockSheet.getRange(3, 2, lastStockRow - 2, 8).getDisplayValues();
  var stockMap = {};
  for (var i = 0; i < stockValues.length; i++) {
    var key = normalizeProductKeyPart_(String(stockValues[i][0] || ""));
    if (!key) continue;
    stockMap[key] = {
      row: i + 3,
      donViChan: normalizeProductKeyPart_(String(stockValues[i][2] || "")),
      quyDoi: Math.max(parseMoneyNumber_(stockValues[i][4]), 1),
      donViLe: normalizeProductKeyPart_(String(stockValues[i][5] || "")),
      tonKhoLe: parseMoneyNumber_(stockValues[i][7]) || 0,
    };
  }
  var codeToNameKey = buildSpaProductCodeToNameKeyMap_(foundation);

  // Pass 1: Validation (Kiểm tra xem có bị âm kho không trước khi trừ thực sự)
  for (var s = 0; s < services.length; s++) {
    var item = services[s];
    if (String(item.maPhien || "").trim() !== stayCode) continue;
    if (String(item.daTruTonKho || "").toUpperCase() === "TRUE") continue;
    if (!isStockTrackedSpaServiceItem_(item)) continue;
    
    var productKey = resolveStockProductKey_(item, codeToNameKey);
    var stock = productKey ? stockMap[productKey] : null;
    if (!stock) continue;
    
    var itemUnit = normalizeProductKeyPart_(String(item.donVi || ""));
    var qty = Math.max(parseMoneyNumber_(item.soLuong), 0);
    var qtyLe = itemUnit && itemUnit === stock.donViChan ? qty * stock.quyDoi : qty;
    
    // Tích lũy số lượng cần trừ (phòng khi 1 đơn có nhiều dòng cùng 1 sản phẩm)
    stock._pendingDeduct = (stock._pendingDeduct || 0) + qtyLe;
    if (stock.tonKhoLe < stock._pendingDeduct) {
      throw new Error("Số lượng tồn kho của [" + String(item.tenSanPham || "Sản phẩm") + "] không đủ để thanh toán (Còn: " + stock.tonKhoLe + ", Cần: " + stock._pendingDeduct + "). Vui lòng nhập thêm hàng vào kho.");
    }
  }

  // Pass 2: Execution (Tiến hành trừ thật sự)
  for (var s = 0; s < services.length; s++) {
    var item = services[s];
    if (String(item.maPhien || "").trim() !== stayCode) continue;
    if (String(item.daTruTonKho || "").toUpperCase() === "TRUE") continue;
    if (!isStockTrackedSpaServiceItem_(item)) {
      item.daTruTonKho = "TRUE";
      writeSpaOpsRow_(foundation.serviceSheet, SPA_SESSION_SERVICE_HEADERS, item.__row, item);
      continue;
    }
    
    var productKey = resolveStockProductKey_(item, codeToNameKey);
    var stock = productKey ? stockMap[productKey] : null;
    if (!stock) {
      Logger.log(
        "deductSpaServiceStock_: không tìm thấy tồn kho cho maSanPham=" +
          String(item.maSanPham || "") +
          " tenSanPham=" +
          String(item.tenSanPham || ""),
      );
      continue;
    }
    
    var itemUnit = normalizeProductKeyPart_(String(item.donVi || ""));
    var qty = Math.max(parseMoneyNumber_(item.soLuong), 0);
    var qtyLe = itemUnit && itemUnit === stock.donViChan ? qty * stock.quyDoi : qty;
    
    stock.tonKhoLe -= qtyLe;
    stockSheet.getRange(stock.row, 9).setValue(stock.tonKhoLe);
    item.daTruTonKho = "TRUE";
    writeSpaOpsRow_(foundation.serviceSheet, SPA_SESSION_SERVICE_HEADERS, item.__row, item);
  }
}

function requireAuth_(payload) {
  var token = payload ? payload.__deviceToken : null;
  if (!token) return { success: false, code: "UNAUTHORIZED", message: "Không có quyền truy cập. Vui lòng đăng nhập lại." };
  var verified = verifyDeviceToken_(token, "");
  if (!verified.success) return { success: false, code: "UNAUTHORIZED", message: verified.message };
  return { success: true };
}

function checkoutRoomInternal_(payload) {
  try {
    console.log("[BE Checkout] Bắt đầu với payload:", JSON.stringify(payload));
    // requireAuth_ đã bị bỏ
    // var authCheck = requireAuth_(payload);
    // if (!authCheck.success) return authCheck;

    var req = payload || {};
    var maPhien = String(req.maPhien || "").trim();
    console.log("[BE Checkout] Mã phiên:", maPhien);
    if (!maPhien) return { success: false, message: "Thiếu mã phiên trị liệu." };
    var foundation = ensureSpaOperationalFoundation_();
    var stays = readSpaOpsRows_(foundation.staySheet, SPA_SESSION_HEADERS);
    var services = readSpaOpsRows_(foundation.serviceSheet, SPA_SESSION_SERVICE_HEADERS);
    var rooms = readSpaOpsRows_(foundation.roomSheet, SPA_BED_HEADERS);
    var stay = null;
    for (var i = 0; i < stays.length; i++) {
      if (String(stays[i].maPhien || "").trim() === maPhien) stay = stays[i];
    }
    console.log("[BE Checkout] Tìm thấy stay:", stay ? "Có" : "Không", "trạng thái:", stay?.trangThaiPhien);
    if (!stay) return { success: false, message: "Không tìm thấy phiên trị liệu." };
    var currentStatus = normalizeStayStatus_(stay.trangThaiPhien);
    console.log("[BE Checkout] Trạng thái hiện tại:", currentStatus);
    if (currentStatus === SPA_SESSION_STATUSES.CANCELLED) {
      console.log("[BE Checkout] Lỗi: Đã bị hủy");
      return { success: false, message: "Không thể thay đổi dữ liệu. Đơn hàng này đã hoàn tất hoặc bị hủy." };
    }
    if (currentStatus === SPA_SESSION_STATUSES.CHECKED_OUT) {
      console.log("[BE Checkout] Phiên đã checkout trước đó");
      appendCtBanFromCheckout_(stay, services);
      return {
        success: true,
        message: "Phiên đã được kết thúc trước đó.",
        data: buildStaySummary_(stay, services),
      };
    }
    var rawTienGoi = parseSessionTienGoi_(stay);
    stay = normalizeSpaSession_(stay);
    stay.tienGoi = rawTienGoi;
    if (req.ketThucThucTe) {
      stay.ketThucThucTe = parseIsoStringOrNull_(req.ketThucThucTe) || getNowVnDateTime_();
    } else {
      stay.ketThucThucTe = getNowVnDateTime_();
    }
    deductSpaServiceStock_(foundation, maPhien, services);
    stay.trangThaiPhien = SPA_SESSION_STATUSES.CHECKED_OUT;
    var summary = buildStaySummary_(stay, services);
    stay.tienDichVu = summary.tienDichVu;
    stay.tongThanhToan = rawTienGoi + summary.tienDichVu;
    stay.ghiChu = String(req.ghiChu || stay.ghiChu || "").trim();
    if (req.diemHaiLongKhach !== undefined && req.diemHaiLongKhach !== null && req.diemHaiLongKhach !== "") {
      stay.diemHaiLongKhach = normalizeSatisfactionScore_(req.diemHaiLongKhach);
    }
    if (req.phuongThucThanhToan !== undefined && req.phuongThucThanhToan !== null && req.phuongThucThanhToan !== "") {
      var validPttt = ["TIEN_MAT", "CHUYEN_KHOAN", "QR"];
      var pttt = String(req.phuongThucThanhToan || "").trim().toUpperCase();
      stay.phuongThucThanhToan = validPttt.indexOf(pttt) !== -1 ? pttt : "TIEN_MAT";
    } else if (!stay.phuongThucThanhToan) {
      stay.phuongThucThanhToan = "TIEN_MAT";
    }
    writeSpaOpsRow_(foundation.staySheet, SPA_SESSION_HEADERS, stay.__row, stay);

    for (var r = 0; r < rooms.length; r++) {
      if (String(rooms[r].maGiuong || "").trim() === String(stay.maGiuong || "").trim()) {
        rooms[r].trangThaiGiuong = SPA_ROOM_STATUSES.AVAILABLE;
        // Do not generate time in Backend (Rule 17), use passed updatedAt or leave empty
        rooms[r].updatedAt = req.updatedAt ? (parseIsoStringOrNull_(req.updatedAt) || "") : "";
        writeSpaOpsRow_(foundation.roomSheet, SPA_BED_HEADERS, rooms[r].__row, rooms[r]);
      }
    }
    appendCtBanFromCheckout_(stay, services);
    rebuildCustomerProgressSheet_();
    bumpAppCacheVersion_();
    console.log("[BE Checkout] HOÀN TẤT - Trả về success");
    return {
      success: true,
      message: "Kết thúc phiên thành công. Giường chuyển sang Sẵn sàng.",
      data: buildStaySummary_(stay, services),
    };
  } catch (e) {
    console.log("[BE Checkout] CATCH ERROR:", e.message);
    return { success: false, message: "Lỗi: " + e.message };
  }
}

function checkoutRoom(payload) {
  console.log("[BE Checkout] checkoutRoom được gọi");
  return runWithLockOrQueue_("CHECKOUT_ROOM", { payload: payload }, function () {
    console.log("[BE Checkout] Bắt đầu xử lý internal");
    try {
      return checkoutRoomInternal_(payload);
    } catch (e) {
      console.log("[BE Checkout] Wrapper catch:", e.message);
      return { success: false, message: "Lỗi: " + e.message };
    }
  });
}

function markTreatmentNoShowInternal_(payload) {
  var req = payload || {};
  var code = String(req.maPhien || req.maLichHen || "").trim();
  if (!code) return { success: false, message: "Thiếu mã lịch hẹn." };
  var foundation = ensureSpaOperationalFoundation_();
  var stays = readSpaOpsRows_(foundation.staySheet, SPA_SESSION_HEADERS);
  var stay = null;
  for (var i = 0; i < stays.length; i++) {
    if (
      String(stays[i].maPhien || "").trim() === code ||
      String(stays[i].maLichHen || "").trim() === code
    ) {
      stay = stays[i];
      break;
    }
  }
  if (!stay) return { success: false, message: "Không tìm thấy lịch hẹn." };
  if (isImmutableSession_(stay.trangThaiPhien)) return { success: false, message: "Không thể thay đổi dữ liệu. Đơn hàng này đã hoàn tất hoặc bị hủy." };
  stay = normalizeSpaSession_(stay);
  stay.trangThaiPhien = SPA_SESSION_STATUSES.NO_SHOW;
  stay.ketThucThucTe = getNowVnDateTime_();
  var oldNote = String(stay.ghiChu || "").trim();
  var newNote = String(req.ghiChu || "").trim();
  stay.ghiChu = [oldNote, newNote].filter(Boolean).join(" • ");
  writeSpaOpsRow_(foundation.staySheet, SPA_SESSION_HEADERS, stay.__row, stay);
  rebuildCustomerProgressSheet_();
  bumpAppCacheVersion_();
  return { success: true, message: "Đã đánh dấu khách không đến.", data: stay };
}

function markTreatmentNoShow(payload) {
  return runWithLockOrQueue_("MARK_TREATMENT_NO_SHOW", { payload: payload }, function () {
    try {
      return markTreatmentNoShowInternal_(payload);
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message };
    }
  });
}

function updateRoomStatusInternal_(payload) {
  try {
    var req = payload || {};
    var maGiuong = String(req.maGiuong || "").trim();
    var trangThaiGiuong = String(req.trangThaiGiuong || "").trim();
    if (!maGiuong) return { success: false, message: "Không tìm thấy giường trị liệu." };
    var foundation = ensureSpaOperationalFoundation_();
    var rooms = readSpaOpsRows_(foundation.roomSheet, SPA_BED_HEADERS);
    for (var i = 0; i < rooms.length; i++) {
      if (String(rooms[i].maGiuong || "").trim() === maGiuong) {
        var nextStatus = parseRoomStatusInputStrict_(trangThaiGiuong) || String(trangThaiGiuong || "").trim();
        rooms[i].trangThaiGiuong = nextStatus;
        rooms[i].updatedAt = getNowVnDateTime_();
        rooms[i].ghiChu = String(req.ghiChu || rooms[i].ghiChu || "").trim();
        writeSpaOpsRow_(foundation.roomSheet, SPA_BED_HEADERS, rooms[i].__row, rooms[i]);
        bumpAppCacheVersion_();
        return { success: true, message: "Đã cập nhật trạng thái giường.", data: rooms[i] };
      }
    }
    return { success: false, message: "Không tìm thấy giường trị liệu." };
  } catch (e) {
    return { success: false, message: "Lỗi: " + e.message };
  }
}

function updateRoomStatus(payload) {
  return runWithLockOrQueue_("UPDATE_ROOM_STATUS", { payload: payload }, function () {
    try {
      return updateRoomStatusInternal_(payload);
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message };
    }
  });
}

function createTreatmentBedInternal_(payload) {
  var req = payload || {};
  var maGiuong = String(req.maGiuong || "").trim();
  var tenGiuong = String(req.tenGiuong || "").trim();
  var loaiGiuong = String(req.loaiGiuong || "").trim();
  var trangThaiGiuong = parseRoomStatusInputStrict_(req.trangThaiGiuong || "") || SPA_ROOM_STATUSES.AVAILABLE;
  var soKhachToiDa = Math.max(parseMoneyNumber_(req.soKhachToiDa), 1);
  var ghiChu = String(req.ghiChu || "").trim();
  var foundation = ensureSpaOperationalFoundation_();
  var room = normalizeSpaRoom_({
    STT: "",
    maGiuong: maGiuong,
    tenGiuong: tenGiuong,
    loaiGiuong: loaiGiuong,
    trangThaiGiuong: trangThaiGiuong === SPA_ROOM_STATUSES.IN_HOUSE ? SPA_ROOM_STATUSES.AVAILABLE : trangThaiGiuong,
    soKhachToiDa: soKhachToiDa,
    ghiChu: ghiChu,
    updatedAt: getNowVnDateTime_(),
  });
  appendSpaOpsRow_(foundation.roomSheet, SPA_BED_HEADERS, room);
  bumpAppCacheVersion_();
  return { success: true, message: "Đã thêm giường trị liệu.", data: room };
}

function createTreatmentBed(payload) {
  return runWithLockOrQueue_("CREATE_TREATMENT_BED", { payload: payload }, function () {
    try {
      return createTreatmentBedInternal_(payload);
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message };
    }
  });
}

function updateTreatmentBedInternal_(payload) {
  var req = payload || {};
  var maGiuong = String(req.maGiuong || "").trim();
  if (!maGiuong) return { success: false, message: "Không tìm thấy giường trị liệu." };
  var foundation = ensureSpaOperationalFoundation_();
  var rooms = readSpaOpsRows_(foundation.roomSheet, SPA_BED_HEADERS);
  var room = null;
  for (var i = 0; i < rooms.length; i++) {
    if (String(rooms[i].maGiuong || "").trim() === maGiuong) room = rooms[i];
  }
  if (!room) return { success: false, message: "Không tìm thấy giường trị liệu." };
  var nextStatus = String(req.trangThaiGiuong || "").trim()
    ? parseRoomStatusInputStrict_(req.trangThaiGiuong || "") || String(req.trangThaiGiuong || "").trim()
    : normalizeRoomStatus_(room.trangThaiGiuong);
  if (req.tenGiuong !== undefined) {
    room.tenGiuong = String(req.tenGiuong || "").trim();
  }
  room.loaiGiuong = String(req.loaiGiuong || room.loaiGiuong || "").trim();
  room.soKhachToiDa = Math.max(parseMoneyNumber_(req.soKhachToiDa || room.soKhachToiDa), 1);
  room.ghiChu = String(req.ghiChu || room.ghiChu || "").trim();
  room.trangThaiGiuong = nextStatus || room.trangThaiGiuong;
  room.updatedAt = getNowVnDateTime_();
  writeSpaOpsRow_(foundation.roomSheet, SPA_BED_HEADERS, room.__row, room);
  bumpAppCacheVersion_();
  return { success: true, message: "Đã cập nhật giường trị liệu.", data: room };
}

function updateTreatmentBed(payload) {
  return runWithLockOrQueue_("UPDATE_TREATMENT_BED", { payload: payload }, function () {
    try {
      return updateTreatmentBedInternal_(payload);
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message };
    }
  });
}

function deleteTreatmentBedInternal_(payload) {
  var req = payload || {};
  var maGiuong = String(req.maGiuong || "").trim();
  if (!maGiuong) return { success: false, message: "Không tìm thấy giường trị liệu." };
  var foundation = ensureSpaOperationalFoundation_();
  var rooms = readSpaOpsRows_(foundation.roomSheet, SPA_BED_HEADERS);
  var room = null;
  for (var i = 0; i < rooms.length; i++) {
    if (String(rooms[i].maGiuong || "").trim() === maGiuong) room = rooms[i];
  }
  if (!room) return { success: false, message: "Không tìm thấy giường trị liệu." };
  room.trangThaiGiuong = "Bảo trì";
  writeSpaOpsRow_(foundation.roomSheet, SPA_BED_HEADERS, room.__row, room);
  bumpAppCacheVersion_();
  return { success: true, message: "Đã xóa giường trị liệu." };
}

function deleteTreatmentBed(payload) {
  return runWithLockOrQueue_("DELETE_TREATMENT_BED", { payload: payload }, function () {
    try {
      return deleteTreatmentBedInternal_(payload);
    } catch (e) {
      return { success: false, message: "Lỗi: " + e.message };
    }
  });
}

// ===== SPA semantic aliases (giu engine local-date/queue/realtime hien tai) =====
function getTreatmentBeds() {
  return getRooms();
}

function getTreatmentPackagesAlias() {
  return getTreatmentPackages();
}

function getTreatmentHistory(filters) {
  return getStayHistory(filters || {});
}

function createSpaBooking(payload) {
  return createBooking(payload || {});
}

function createSpaBookingWithItems(payload) {
  return createBookingWithItems(payload || {});
}

function startTreatmentSession(payload) {
  return checkInRoom(payload || {});
}

function startTreatmentSessionWithItems(payload) {
  return checkInRoomWithItems(payload || {});
}

function addTreatmentServiceItem(payload) {
  return addStayServiceItem(payload || {});
}

function completeTreatmentSession(payload) {
  return checkoutRoom(payload || {});
}

function markSpaAppointmentNoShow(payload) {
  return markTreatmentNoShow(payload || {});
}

function updateTreatmentServiceItem(payload) {
  return updateStayServiceItem(payload || {});
}

function deleteTreatmentServiceItem(payload) {
  return deleteStayServiceItem(payload || {});
}

function updateTreatmentSessionTime(payload) {
  return updateStayTime(payload || {});
}

/* CLIENT_API_WRAPPERS */
const loginClient = (email, password, appScope) =>
  call("login", email, password, appScope);
const loginWithDeviceTokenClient = (deviceToken, appScope) =>
  call("loginWithDeviceToken", deviceToken, appScope);
const loginWithSessionKeyClient = (appScope = "") =>
  call("loginWithSessionKey", appScope);
const loginWithHostAssertionClient = (
  assertion,
  appScope = "",
  nonce = "",
  ts = 0,
) => call("loginWithHostAssertion", assertion, appScope, nonce, ts);
const revokeDeviceTokenClient = (deviceToken, appScope) =>
  call("revokeDeviceToken", deviceToken, appScope);
const revokeSessionLoginClient = (appScope = "") =>
  call("revokeSessionLogin", appScope);
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
const auditSpaHeaderAliasesClient = () => call("auditSpaHeaderAliases");
const upgradeCtBanHeadersClient = () => call("upgradeCtBanHeaders");
const initSpaSheetsClient = () => call("initSpaSheets");
const simplifySpaSheetsClient = () => call("simplifySpaSheets");
const getSpaKpiReportClient = (req) => call("getSpaKpiReport", req);
const loadSpaPresetTlcDataClient = () => call("loadSpaPresetTlcData");
const getRoomsClient = () => call("getRooms");
const getSpaStaffClient = () => call("getSpaStaff");
const getSpaStaffSchedulesClient = () => call("getSpaStaffSchedules");
const updateSpaStaffSchedulesClient = (payload) =>
  call("updateSpaStaffSchedules", payload);
const getSpaAttendanceClient = (filters) => call("getSpaAttendance", filters || {});
const recordSpaAttendanceClient = (payload) => call("recordSpaAttendance", payload);
const getSpaShiftChecklistsClient = (filters) => call("getSpaShiftChecklists", filters || {});
const saveSpaShiftChecklistClient = (payload) => call("saveSpaShiftChecklist", payload);
const getSpaStaffViolationsClient = (filters) => call("getSpaStaffViolations", filters || {});
const saveSpaStaffViolationClient = (payload) => call("saveSpaStaffViolation", payload);
const cancelSpaStaffViolationClient = (payload) => call("cancelSpaStaffViolation", payload);
const getSpaStaffLeaveRequestsClient = (filters) =>
  call("getSpaStaffLeaveRequests", filters || {});
const saveSpaStaffLeaveRequestClient = (payload) => call("saveSpaStaffLeaveRequest", payload);
const reviewSpaStaffLeaveRequestClient = (payload) =>
  call("reviewSpaStaffLeaveRequest", payload);
const getSpaStaffTrainingsClient = (filters) => call("getSpaStaffTrainings", filters || {});
const saveSpaStaffTrainingClient = (payload) => call("saveSpaStaffTraining", payload);
const getSpaPayrollRecordsClient = (filters) => call("getSpaPayrollRecords", filters || {});
const lockSpaPayrollPeriodClient = (payload) => call("lockSpaPayrollPeriod", payload);
const createSpaStaffClient = (payload) => call("createSpaStaff", payload);
const updateSpaStaffClient = (payload) => call("updateSpaStaff", payload);
const deleteSpaStaffClient = (payload) => call("deleteSpaStaff", payload);
const getTreatmentPackagesClient = () => call("getTreatmentPackages");
const getTreatmentBedsClient = () => call("getTreatmentBeds");
const getStayHistoryClient = (filters) =>
  call("getStayHistory", filters || {});
const getTreatmentHistoryClient = (filters) =>
  call("getTreatmentHistory", filters || {});
const createBookingClient = (payload) => call("createBooking", payload);
const createBookingWithItemsClient = (payload) =>
  call("createBookingWithItems", payload);
const createSpaBookingClient = (payload) => call("createSpaBooking", payload);
const createSpaBookingWithItemsClient = (payload) =>
  call("createSpaBookingWithItems", payload);
const checkInRoomClient = (payload) => call("checkInRoom", payload);
const checkInRoomWithItemsClient = (payload) =>
  call("checkInRoomWithItems", payload);
const startTreatmentSessionClient = (payload) =>
  call("startTreatmentSession", payload);
const startTreatmentSessionWithItemsClient = (payload) =>
  call("startTreatmentSessionWithItems", payload);
const addStayServiceItemClient = (payload) => call("addStayServiceItem", payload);
const addTreatmentServiceItemClient = (payload) =>
  call("addTreatmentServiceItem", payload);
const checkoutRoomClient = (payload) => call("checkoutRoom", payload);
const completeTreatmentSessionClient = (payload) =>
  call("completeTreatmentSession", payload);
const markTreatmentNoShowClient = (payload) =>
  call("markTreatmentNoShow", payload);
const markSpaAppointmentNoShowClient = (payload) =>
  call("markSpaAppointmentNoShow", payload);
const updateRoomStatusClient = (payload) => call("updateRoomStatus", payload);
const createTreatmentBedClient = (payload) => call("createTreatmentBed", payload);
const updateTreatmentBedClient = (payload) => call("updateTreatmentBed", payload);
const deleteTreatmentBedClient = (payload) => call("deleteTreatmentBed", payload);
const updateStayServiceItemClient = (payload) => call("updateStayServiceItem", payload);
const updateTreatmentServiceItemClient = (payload) =>
  call("updateTreatmentServiceItem", payload);
const deleteStayServiceItemClient = (payload) => call("deleteStayServiceItem", payload);
const deleteTreatmentServiceItemClient = (payload) =>
  call("deleteTreatmentServiceItem", payload);
const updateStayTimeClient = (payload) => call("updateStayTime", payload);
const updateStayStaffClient = (payload) => call("updateStayStaff", payload);
const updateTreatmentSessionTimeClient = (payload) =>
  call("updateTreatmentSessionTime", payload);
const updateProductCatalogItemClient = (payload) =>
  call("updateProductCatalogItem", payload);
const createProductCatalogItemClient = (payload) =>
  call("createProductCatalogItem", payload);
const deleteProductCatalogItemClient = (payload) =>
  call("deleteProductCatalogItem", payload);
const getInventorySuggestionsClient = () => call("getInventorySuggestions");
const getCustomerCatalogClient = () => call("getCustomerCatalog");
const getCustomerProgressClient = () => call("getCustomerProgress");
const getCtBanHistoryClient = () => call("getCtBanHistory");
const getCtBanKpiDataClient = (filters) => call("getCtBanKpiData", filters || {});
const getTreatmentCatalogsClient = () => call("getTreatmentCatalogs");
const saveTreatmentCatalogsClient = (payload) => call("saveTreatmentCatalogs", payload);
const getSupplierCatalogClient = () => call("getSupplierCatalog");
const getOrderHistoryClient = () => call("getOrderHistory");
const createReceiptPdfClient = (maPhieu) => call("createReceiptPdf", maPhieu);
const updateOrderClient = (payload) => call("updateOrder", payload);
const deleteOrderClient = (maPhieu) => call("deleteOrder", maPhieu);
const uploadImageToImgBBClient = (base64Data) =>
  call("uploadImageToImgBB", base64Data);
const updateComboScheduleClient = (payload) =>
  call("updateComboSchedule", payload);

export const gasAdapter = {
  call,
  helloServer: () => call("helloServer"),
  login: loginClient,
  loginWithDeviceToken: loginWithDeviceTokenClient,
  loginWithSessionKey: loginWithSessionKeyClient,
  loginWithHostAssertion: loginWithHostAssertionClient,
  revokeDeviceToken: revokeDeviceTokenClient,
  revokeSessionLogin: revokeSessionLoginClient,
  getUserInfo: getUserInfoClient,
  getDemoAccounts: getDemoAccountsClient,
  getGlobalNotice: getGlobalNoticeClient,
  getSyncVersion: getSyncVersionClient,
  getNextOrderFormDefaults: getNextOrderFormDefaultsClient,
  getNextInventoryReceiptDefaults: getNextInventoryReceiptDefaultsClient,
  getProductCatalog: getProductCatalogClient,
  getBankConfig: getBankConfigClient,
  auditSpaHeaderAliases: auditSpaHeaderAliasesClient,
  upgradeCtBanHeaders: upgradeCtBanHeadersClient,
  initSpaSheets: initSpaSheetsClient,
  simplifySpaSheets: simplifySpaSheetsClient,
  getSpaKpiReport: getSpaKpiReportClient,
  loadSpaPresetTlcData: loadSpaPresetTlcDataClient,
  getRooms: getRoomsClient,
  getSpaStaff: getSpaStaffClient,
  getSpaStaffSchedules: getSpaStaffSchedulesClient,
  updateSpaStaffSchedules: updateSpaStaffSchedulesClient,
  getSpaAttendance: getSpaAttendanceClient,
  recordSpaAttendance: recordSpaAttendanceClient,
  getSpaShiftChecklists: getSpaShiftChecklistsClient,
  saveSpaShiftChecklist: saveSpaShiftChecklistClient,
  getSpaStaffViolations: getSpaStaffViolationsClient,
  saveSpaStaffViolation: saveSpaStaffViolationClient,
  cancelSpaStaffViolation: cancelSpaStaffViolationClient,
  getSpaStaffLeaveRequests: getSpaStaffLeaveRequestsClient,
  saveSpaStaffLeaveRequest: saveSpaStaffLeaveRequestClient,
  reviewSpaStaffLeaveRequest: reviewSpaStaffLeaveRequestClient,
  getSpaStaffTrainings: getSpaStaffTrainingsClient,
  saveSpaStaffTraining: saveSpaStaffTrainingClient,
  getSpaPayrollRecords: getSpaPayrollRecordsClient,
  lockSpaPayrollPeriod: lockSpaPayrollPeriodClient,
  createSpaStaff: createSpaStaffClient,
  updateSpaStaff: updateSpaStaffClient,
  deleteSpaStaff: deleteSpaStaffClient,
  getTreatmentPackages: getTreatmentPackagesClient,
  getTreatmentCatalogs: getTreatmentCatalogsClient,
  saveTreatmentCatalogs: saveTreatmentCatalogsClient,
  getTreatmentBeds: getTreatmentBedsClient,
  getStayHistory: getStayHistoryClient,
  getTreatmentHistory: getTreatmentHistoryClient,
  createBooking: createBookingClient,
  createBookingWithItems: createBookingWithItemsClient,
  createSpaBooking: createSpaBookingClient,
  createSpaBookingWithItems: createSpaBookingWithItemsClient,
  checkInRoom: checkInRoomClient,
  checkInRoomWithItems: checkInRoomWithItemsClient,
  startTreatmentSession: startTreatmentSessionClient,
  startTreatmentSessionWithItems: startTreatmentSessionWithItemsClient,
  addStayServiceItem: addStayServiceItemClient,
  addTreatmentServiceItem: addTreatmentServiceItemClient,
  checkoutRoom: checkoutRoomClient,
  completeTreatmentSession: completeTreatmentSessionClient,
  markTreatmentNoShow: markTreatmentNoShowClient,
  markSpaAppointmentNoShow: markSpaAppointmentNoShowClient,
  updateRoomStatus: updateRoomStatusClient,
  createTreatmentBed: createTreatmentBedClient,
  updateTreatmentBed: updateTreatmentBedClient,
  deleteTreatmentBed: deleteTreatmentBedClient,
  updateStayServiceItem: updateStayServiceItemClient,
  updateTreatmentServiceItem: updateTreatmentServiceItemClient,
  deleteStayServiceItem: deleteStayServiceItemClient,
  deleteTreatmentServiceItem: deleteTreatmentServiceItemClient,
  updateStayTime: updateStayTimeClient,
  updateStayStaff: updateStayStaffClient,
  logClientError: (payload) => call("logClientError", payload),
  updateTreatmentSessionTime: updateTreatmentSessionTimeClient,
  updateProductCatalogItem: updateProductCatalogItemClient,
  createProductCatalogItem: createProductCatalogItemClient,
  deleteProductCatalogItem: deleteProductCatalogItemClient,
  getCustomerCatalog: getCustomerCatalogClient,
  getCustomerProgress: getCustomerProgressClient,
  getCtBanHistory: getCtBanHistoryClient,
  getCtBanKpiData: getCtBanKpiDataClient,
  getSupplierCatalog: getSupplierCatalogClient,
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
  uploadImageToImgBB: uploadImageToImgBBClient,
  issueEasyInvoice: issueEasyInvoiceClient,
  cancelEasyInvoice: cancelEasyInvoiceClient,
  replaceEasyInvoice: replaceEasyInvoiceClient,
  downloadInvoicePDF: downloadInvoicePDFClient,
  logAction: (payload) => call("logAction", payload),
  formatAllSheets: () => call("formatAllSheets"),
  updateComboSchedule: updateComboScheduleClient,
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


  var sheetNhap = ss.getSheetByName("NHAP_HANG");
  if (sheetNhap) {
    clearReceiptMerges_(sheetNhap);
    rebuildReceiptMerges_(sheetNhap);
  }


  var sheetBank = ss.getSheetByName("BANK");
  if (sheetBank) updateSTT_(sheetBank, 8);

  var sheetKho =
    ss.getSheetByName("QUAN_LY_KHO") || ss.getSheetByName("QUẢN LÝ KHO");
  if (sheetKho) updateSTT_(sheetKho, 3);

  var sheetSP = ss.getSheetByName("SAN_PHAM");
  if (sheetSP) updateSTT_(sheetSP, 3);

  var spaSheets = [
    "DM_PHAC_DO",
    "DM_DICH_VU",
    "DM_GOI_DIEU_TRI",
    "DM_SAN_PHAM_DUOC_LIEU",
    "CT_BAN",
    "THEO_DOI_SU_DUNG_GOI",
    "BAO_CAO_NGAY_THANG_NAM",
  ];
  for (var i = 0; i < spaSheets.length; i++) {
    var shSpa = ss.getSheetByName(spaSheets[i]);
    if (shSpa) updateSTT_(shSpa, 2);
  }

  return { success: true, message: "Đã format lại các sheet" };
}

// ===== Action Log =====

function logClientError(payload) {
  try {
    var p = payload || {};
    var errorName = String(p.name || "UnknownError").trim();
    var errorMessage = String(p.message || "").trim();
    var stack = String(p.stack || "").trim();
    var contextInfo = String(p.context || "").trim();
    var userName = "Client";
    
    var desc = "Frontend Error: " + errorName + (contextInfo ? " (" + contextInfo + ")" : "");
    var fullError = errorMessage + "\n" + stack;
    
    return logAction({
      userName: userName,
      changeDescription: desc,
      status: "ERROR",
      errorMessage: fullError
    });
  } catch (e) {
    return { success: false, message: e.message };
  }
}

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

function shouldSkipLogAction_(changeDescription, errorMessage) {
  var desc = String(changeDescription || "").trim().toLowerCase();
  var err = String(errorMessage || "").trim().toLowerCase();
  if (desc.indexOf("bridge_autosetup") !== -1) return true;
  if (desc.indexOf("bridge request fail path=/health") !== -1) return true;
  if (err.indexOf("bridge request fail path=/health") !== -1) return true;
  return false;
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

    if (shouldSkipLogAction_(changeDescription, errorMessage)) {
      return { success: true, skipped: true };
    }

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

// ============================================================
// MIGRATION SCRIPT: Chuyển đổi tất cả date fields sang US format
// Run: migrateAllDatesToUsFormat()
// ============================================================

// Các sheets và fields cần migrate
var MIGRATION_DATE_FIELDS = {
  "CT_BAN": {
    dateFields: ["ngayThuTien"],
    headerRow: 2,
    dataStartRow: 3,
    fieldIndices: { ngayThuTien: 1 } // index 1 = cột B
  },
  "PHIEN_DICH_VU": {
    dateFields: ["batDauAt", "ketThucDuKien", "ketThucThucTe"],
    headerRow: 2,
    dataStartRow: 3,
    fieldIndices: { batDauAt: 15, ketThucDuKien: 16, ketThucThucTe: 17 }
  },
  "NHAN_VIEN": {
    dateFields: ["ngayVaoLam"],
    headerRow: 2,
    dataStartRow: 3,
    fieldIndices: { ngayVaoLam: 5 } // index 5 = cột F
  },
  "DON_HANG": {
    dateFields: ["ngayBan"],
    headerRow: 2,
    dataStartRow: 3,
    fieldIndices: { ngayBan: 1 } // index 1 = cột B
  },
  "THEO_DOI_SU_DUNG_GOI": {
    dateFields: ["ngayMua", "lanSuDungGanNhat"],
    headerRow: 2,
    dataStartRow: 3,
    fieldIndices: { ngayMua: 2, lanSuDungGanNhat: 10 } // cột C, K
  },
  "TIEN_TRINH_KHACH": {
    dateFields: ["ngay"],
    headerRow: 2,
    dataStartRow: 3,
    fieldIndices: { ngay: 1 } // cột B
  },
  "CHAM_CONG": {
    dateFields: ["ngay", "checkInAt", "checkOutAt"],
    headerRow: 2,
    dataStartRow: 3,
    fieldIndices: { ngay: 2, checkInAt: 3, checkOutAt: 4 } // cột C, D, E
  },
  "LICH_LAM_VIEC": {
    dateFields: ["ngay"],
    headerRow: 2,
    dataStartRow: 3,
    fieldIndices: { ngay: 0 } // cột A
  },
  "VI_PHAM_NV": {
    dateFields: ["ngay"],
    headerRow: 2,
    dataStartRow: 3,
    fieldIndices: { ngay: 3 } // cột D
  }
};

// Parse VN date format (DD/MM/YYYY hoặc DD/MM/YYYY HH:mm:ss)
function parseVnDateToUs_(vnDateStr) {
  if (!vnDateStr || vnDateStr === "") return "";
  var s = String(vnDateStr).trim();
  
  // Đã là US format rồi
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) return s;
  
  // Parse VN format "DD/MM/YYYY" hoặc "DD/MM/YYYY HH:mm:ss"
  var match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (match) {
    var day = match[1].padStart(2, "0");
    var month = match[2].padStart(2, "0");
    var year = match[3];
    var time = "";
    if (match[4]) {
      var hour = match[4].padStart(2, "0");
      var min = (match[5] || "00").padStart(2, "0");
      time = hour + ":" + min;
      if (match[6]) time += ":" + match[6].padStart(2, "0");
    }
    return time ? (time + " " + month + "/" + day + "/" + year) : (month + "/" + day + "/" + year);
  }
  
  // Thử parse bằng Date object
  try {
    var d = new Date(s);
    if (!isNaN(d.getTime())) {
      var m = String(d.getMonth() + 1).padStart(2, "0");
      var day = String(d.getDate()).padStart(2, "0");
      var y = d.getFullYear();
      return m + "/" + day + "/" + y;
    }
  } catch (e) {}
  
  return s; // Giữ nguyên nếu không parse được
}

// Migrate một sheet cụ thể
function migrateSheetDates_(sheetName) {
  var config = MIGRATION_DATE_FIELDS[sheetName];
  if (!config) {
    return { success: false, message: "Sheet " + sheetName + " không có trong danh sách migration" };
  }
  
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      return { success: false, message: "Không tìm thấy sheet " + sheetName };
    }
    
    var lastRow = sheet.getLastRow();
    if (lastRow < config.dataStartRow) {
      return { success: true, migrated: 0, message: "Không có dữ liệu" };
    }
    
    var dataRows = lastRow - config.dataStartRow + 1;
    var range = sheet.getRange(config.dataStartRow, 1, dataRows, sheet.getLastColumn());
    var values = range.getValues();
    var changedCount = 0;
    var changes = [];
    
    for (var i = 0; i < values.length; i++) {
      for (var fieldName in config.fieldIndices) {
        var colIndex = config.fieldIndices[fieldName];
        if (colIndex >= 0 && colIndex < values[i].length) {
          var oldValue = values[i][colIndex];
          var newValue = parseVnDateToUs_(oldValue);
          if (oldValue !== newValue && newValue !== "") {
            values[i][colIndex] = newValue;
            changedCount++;
            if (changedCount <= 10) { // Lưu 10 ví dụ đầu
              changes.push("Row " + (config.dataStartRow + i) + ": " + fieldName + " = '" + oldValue + "' → '" + newValue + "'");
            }
          }
        }
      }
    }
    
    if (changedCount > 0) {
      range.setValues(values);
    }
    
    return { 
      success: true, 
      migrated: changedCount, 
      examples: changes,
      message: "Đã migrate " + changedCount + " giá trị trong sheet " + sheetName
    };
  } catch (e) {
    return { success: false, message: "Lỗi: " + e.message };
  }
}

// Migrate tất cả các sheets
function migrateAllDatesToUsFormat_() {
  var results = {};
  var totalMigrated = 0;
  
  for (var sheetName in MIGRATION_DATE_FIELDS) {
    var result = migrateSheetDates_(sheetName);
    results[sheetName] = result;
    if (result.success) {
      totalMigrated += result.migrated || 0;
    }
  }
  
  return {
    success: true,
    totalMigrated: totalMigrated,
    details: results,
    message: "Migration hoàn tất. Tổng cộng " + totalMigrated + " giá trị đã được chuyển đổi."
  };
}

// Client-callable function để chạy migration
function migrateAllDatesToUsFormat() {
  return migrateAllDatesToUsFormat_();
}

// Kiểm tra trước khi migrate - xem có bao nhiêu dữ liệu cần migrate
function previewMigration_() {
  var results = {};
  var totalNeedMigrate = 0;
  
  for (var sheetName in MIGRATION_DATE_FIELDS) {
    var config = MIGRATION_DATE_FIELDS[sheetName];
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) {
        results[sheetName] = { found: false };
        continue;
      }
      
      var lastRow = sheet.getLastRow();
      if (lastRow < config.dataStartRow) {
        results[sheetName] = { found: true, needMigrate: 0, samples: [] };
        continue;
      }
      
      var dataRows = lastRow - config.dataStartRow + 1;
      var range = sheet.getRange(config.dataStartRow, 1, dataRows, sheet.getLastColumn());
      var values = range.getValues();
      var needMigrate = 0;
      var samples = [];
      
      for (var i = 0; i < values.length; i++) {
        for (var fieldName in config.fieldIndices) {
          var colIndex = config.fieldIndices[fieldName];
          if (colIndex >= 0 && colIndex < values[i].length) {
            var value = values[i][colIndex];
            var newValue = parseVnDateToUs_(value);
            if (value !== newValue && newValue !== "") {
              needMigrate++;
              if (samples.length < 3) {
                samples.push("Row " + (config.dataStartRow + i) + ": " + fieldName + " = '" + value + "'");
              }
            }
          }
        }
      }
      
      results[sheetName] = { found: true, needMigrate: needMigrate, samples: samples };
      totalNeedMigrate += needMigrate;
    } catch (e) {
      results[sheetName] = { found: true, error: e.message };
    }
  }
  
  return {
    success: true,
    totalNeedMigrate: totalNeedMigrate,
    details: results,
    message: "Cần migrate " + totalNeedMigrate + " giá trị trong " + Object.keys(MIGRATION_DATE_FIELDS).length + " sheets."
  };
}

// Client-callable preview function
function previewMigration() {
  return previewMigration_();
}









