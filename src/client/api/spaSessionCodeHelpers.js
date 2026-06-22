const parsePrefixedCodeNumber = (code = "", prefix = "") => {
  const normalized = String(code || "").trim();
  if (!normalized || !normalized.startsWith(prefix)) return null;
  const matched = normalized.match(/^(.*?)(\d+)$/);
  if (!matched) return null;
  const num = Number.parseInt(matched[2], 10);
  return Number.isFinite(num) ? num : null;
};

export const incrementPrefixedCode = (value = "", defaultCode = "") => {
  const raw = String(value ?? "").trim();
  if (!raw) return defaultCode || "01";

  const matched = raw.match(/^(.*?)(\d+)$/);
  if (!matched) return `${raw}1`;

  const prefix = matched[1];
  const digits = matched[2];
  const next = String(Number.parseInt(digits, 10) + 1).padStart(digits.length, "0");
  return `${prefix}${next}`;
};

export const nextSessionCodeFromRows = (
  rows = [],
  key,
  prefix,
  defaultCode,
) => {
  let latestCode = "";
  let latestNum = -1;

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const code = String(row?.[key] || "").trim();
    const num = parsePrefixedCodeNumber(code, prefix);
    if (num == null || num <= latestNum) return;
    latestNum = num;
    latestCode = code;
  });

  if (!latestCode) return defaultCode;
  return incrementPrefixedCode(latestCode, defaultCode);
};

export const nextTreatmentProgressCodeFromRows = (rows = []) => {
  let maxNum = 0;
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const matched = /^TTK(\d+)$/i.exec(String(row?.maTienTrinh || "").trim());
    if (!matched) return;
    maxNum = Math.max(maxNum, Number.parseInt(matched[1], 10) || 0);
  });
  return `TTK${String(maxNum + 1).padStart(5, "0")}`;
};
