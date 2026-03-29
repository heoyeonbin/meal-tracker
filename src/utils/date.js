export const LIMIT = 200_000;

export const mKey = (offset = 0) => {
  const d = new Date();
  d.setMonth(d.getMonth() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export const monthLabel = (offset = 0) => {
  const d = new Date();
  d.setMonth(d.getMonth() - offset);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
};

export const pad2 = (v) => String(v).padStart(2, "0");
export const todayYMD = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

export const pctColor = (p) => (p >= 90 ? "#EF4444" : p >= 70 ? "#F59E0B" : "#10B981");

export const isYMD = (dateStr = "") => /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
export const isMD = (dateStr = "") => /^\d{2}\/\d{2}$/.test(dateStr);

export const parseTxnDate = (dateStr, referenceDate = new Date()) => {
  if (!dateStr) return null;
  if (isYMD(dateStr)) {
    const [yyyy, mm, dd] = dateStr.split("-").map(Number);
    return new Date(yyyy, mm - 1, dd);
  }
  if (isMD(dateStr)) {
    const [mm, dd] = dateStr.split("/").map(Number);
    let year = referenceDate.getFullYear();
    if (mm > referenceDate.getMonth() + 1) year -= 1;
    return new Date(year, mm - 1, dd);
  }
  return null;
};

export const normalizeTxnDate = (dateStr, referenceDate = new Date()) => {
  const parsed = parseTxnDate(dateStr, referenceDate);
  if (!parsed) return "";
  return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;
};

export const formatStoredDate = (dateStr, referenceDate = new Date()) => {
  const normalized = normalizeTxnDate(dateStr, referenceDate);
  return normalized || dateStr;
};

export const getTxnSortTime = (dateStr, referenceDate = new Date()) =>
  parseTxnDate(dateStr, referenceDate)?.getTime() || 0;

export const sameTxnDate = (left, right, referenceDate = new Date()) =>
  normalizeTxnDate(left, referenceDate) === normalizeTxnDate(right, referenceDate);

export const formatDateHeader = (dateStr) => {
  const d = parseTxnDate(dateStr);
  if (!d) return dateStr;
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
};

export const toYMD = (dateStr) => normalizeTxnDate(dateStr);
export const fromYMD = (ymd) => normalizeTxnDate(ymd);
