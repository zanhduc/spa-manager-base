const pad2 = (n) => String(n).padStart(2, "0");

// Parse VN datetime "HH:mm DD/MM/YYYY" to Date object
const parseVnDateTime = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;

  // Format: "HH:mm DD/MM/YYYY"
  const m = raw.match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const h = parseInt(m[1], 10);
    const mi = parseInt(m[2], 10);
    const d = parseInt(m[3], 10);
    const mo = parseInt(m[4], 10) - 1;
    const y = parseInt(m[5], 10);
    return new Date(y, mo, d, h, mi);
  }

  // Try standard Date parsing as fallback
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

// Parse VN datetime string to milliseconds (safer than new Date())
const toMs = (value) => {
  const d = parseVnDateTime(value);
  return d ? d.getTime() : 0;
};

const getStayStartAt = (stay) => stay?.batDauAt || "";
const getStayExpectedEndAt = (stay) => stay?.ketThucDuKien || "";
const getStayActualEndAt = (stay) => stay?.ketThucThucTe || "";
const getStayStatus = (stay) => String(stay?.trangThaiPhien || "").trim().toUpperCase();
const getStayIdentityKey = (stay = {}) =>
  String(stay?.maPhien || stay?.maLichHen || "").trim();
const getTimelineIdentityKey = (stay = {}, index = 0) => {
  const maPhien = String(stay?.maPhien || "").trim();
  const maLichHen = String(stay?.maLichHen || "").trim();
  if (maPhien && !/^TEMP[-_]/i.test(maPhien)) return maPhien;
  if (maLichHen && maPhien) return `${maLichHen}|${maPhien}`;
  if (maLichHen) return maLichHen;
  if (maPhien) return maPhien;
  return [
    "__row",
    index,
    String(stay?.maGiuong || "").trim(),
    String(stay?.maNhanVien || "").trim(),
    String(getStayStartAt(stay) || "").trim(),
  ].join("|");
};
const isLiveTimelineStay = (stay) => {
  if (typeof stay?._timelineLive === "boolean") return stay._timelineLive;
  const status = getStayStatus(stay);
  return status === "IN_HOUSE" && !String(getStayActualEndAt(stay) || "").trim();
};

export const formatTimeOnly = (value) => {
  const d = parseVnDateTime(value);
  if (!d) return "--:--";
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

export const toDateKey = (value) => {
  const d = parseVnDateTime(value);
  if (!d) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

export const TIMELINE_PHASE = {
  PAST: "PAST",
  CURRENT: "CURRENT",
  FUTURE: "FUTURE",
};

export const TIMELINE_PHASE_TONE = {
  [TIMELINE_PHASE.PAST]: "border-slate-200 bg-slate-100 text-slate-700",
  [TIMELINE_PHASE.CURRENT]: "border-sky-400 bg-sky-100 text-sky-950 shadow-sky-200/80",
  [TIMELINE_PHASE.FUTURE]: "border-pink-200 bg-pink-50 text-pink-800",
};

export const prepareCanonicalTimelineStays = (
  rawStays = [],
  nowMs = Date.now(),
  { futureGraceMs = 5 * 60 * 1000 } = {},
) => {
  const canonicalLiveStayByRoom = new Map();
  const canonicalLiveStayByStaff = new Map();
  const updateCanonicalMap = (map, key, candidate) => {
    if (!key) return;
    const current = map.get(key);
    if (
      !current ||
      candidate.startMs > current.startMs ||
      (candidate.startMs === current.startMs && candidate.expectedEndMs > current.expectedEndMs) ||
      (candidate.startMs === current.startMs &&
        candidate.expectedEndMs === current.expectedEndMs &&
        candidate.identityKey > current.identityKey)
    ) {
      map.set(key, candidate);
    }
  };

  rawStays.forEach((stay, index) => {
    if (getStayStatus(stay) !== "IN_HOUSE") return;
    if (String(getStayActualEndAt(stay) || "").trim()) return;
    const startMs = new Date(getStayStartAt(stay) || "").getTime();
    if (Number.isFinite(startMs) && startMs > nowMs + futureGraceMs) return;
    const candidate = {
      identityKey: getTimelineIdentityKey(stay, index),
      startMs: Number.isFinite(startMs) ? startMs : Number.NEGATIVE_INFINITY,
      expectedEndMs: (() => {
        const expectedEndMs = toMs(getStayExpectedEndAt(stay));
        return Number.isFinite(expectedEndMs) ? expectedEndMs : Number.NEGATIVE_INFINITY;
      })(),
    };
    updateCanonicalMap(canonicalLiveStayByRoom, String(stay?.maGiuong || "").trim(), candidate);
    updateCanonicalMap(canonicalLiveStayByStaff, String(stay?.maNhanVien || "").trim(), candidate);
  });

  return rawStays.map((stay, index) => {
    const roomCode = String(stay?.maGiuong || "").trim();
    const staffCode = String(stay?.maNhanVien || "").trim();
    const identityKey = getTimelineIdentityKey(stay, index);
    const roomLiveCandidate = canonicalLiveStayByRoom.get(roomCode);
    const staffLiveCandidate = canonicalLiveStayByStaff.get(staffCode);
    const startMs = new Date(getStayStartAt(stay) || "").getTime();
    const isEligibleInHouse =
      getStayStatus(stay) === "IN_HOUSE" &&
      !String(getStayActualEndAt(stay) || "").trim() &&
      (!Number.isFinite(startMs) || startMs <= nowMs + futureGraceMs);
    const matchesRoomLive = Boolean(roomLiveCandidate) && roomLiveCandidate.identityKey === identityKey;
    const matchesStaffLive =
      !staffCode ||
      (Boolean(staffLiveCandidate) && staffLiveCandidate.identityKey === identityKey);
    const shouldKeepLive = isEligibleInHouse && matchesRoomLive && matchesStaffLive;
    return {
      ...stay,
      _timelineLive: shouldKeepLive,
      _timelineGhostConflict:
        isEligibleInHouse &&
        ((!matchesRoomLive && Boolean(roomLiveCandidate)) ||
          (staffCode && !matchesStaffLive && Boolean(staffLiveCandidate))),
    };
  });
};

const parseSlotLabel = (label) => {
  const [hourRaw, minuteRaw] = String(label || "00:00").split(":");
  return {
    hour: Number(hourRaw || 0),
    minute: Number(minuteRaw || 0),
  };
};

export const getStayDisplayEndMs = (stay, fallbackMinutes = 30, nowMs = Date.now()) => {
  const startMs = toMs(getStayStartAt(stay));
  if (!Number.isFinite(startMs)) return Number.NaN;
  const liveTimelineStay = isLiveTimelineStay(stay);
  const explicitEndMs = toMs(getStayActualEndAt(stay) || getStayExpectedEndAt(stay));
  if (Number.isFinite(explicitEndMs) && explicitEndMs > startMs) {
    if (liveTimelineStay) {
      return Math.max(explicitEndMs, nowMs);
    }
    return explicitEndMs;
  }

  const durationMinutes = Math.max(0, Number(stay?.thoiLuongPhut || 0));
  if (durationMinutes > 0) {
    const derivedEndMs = startMs + durationMinutes * 60 * 1000;
    if (liveTimelineStay) {
      return Math.max(derivedEndMs, nowMs);
    }
    return derivedEndMs;
  }
  const fallbackEndMs = startMs + Math.max(15, Number(fallbackMinutes) || 30) * 60 * 1000;
  if (liveTimelineStay) {
    return Math.max(fallbackEndMs, nowMs);
  }
  return fallbackEndMs;
};

export const doesStayOverlapWindow = ({
  stay,
  rangeStartMs,
  rangeEndMs,
  fallbackMinutes = 30,
  nowMs = Date.now(),
}) => {
  const stayStartMs = toMs(getStayStartAt(stay));
  const stayEndMs = getStayDisplayEndMs(stay, fallbackMinutes, nowMs);
  if (!Number.isFinite(stayStartMs) || !Number.isFinite(stayEndMs)) return false;
  return stayStartMs < rangeEndMs && stayEndMs > rangeStartMs;
};

export const getTimelinePhase = (stay, nowMs = Date.now(), fallbackMinutes = 30) => {
  const stayStartMs = toMs(getStayStartAt(stay));
  const stayEndMs = getStayDisplayEndMs(stay, fallbackMinutes, nowMs);
  const liveTimelineStay = isLiveTimelineStay(stay);
  if (!Number.isFinite(stayStartMs) || !Number.isFinite(stayEndMs)) {
    return TIMELINE_PHASE.PAST;
  }
  if (liveTimelineStay) {
    // Grace period of 5 minutes to avoid flashing FUTURE due to timeline ticker lag
    return stayStartMs <= nowMs + 300000 ? TIMELINE_PHASE.CURRENT : TIMELINE_PHASE.FUTURE;
  }
  if (stayEndMs <= nowMs) return TIMELINE_PHASE.PAST;
  if (stayStartMs <= nowMs && stayEndMs > nowMs) return TIMELINE_PHASE.CURRENT;
  return TIMELINE_PHASE.FUTURE;
};

export const getTimelineTone = (stay, nowMs = Date.now(), fallbackMinutes = 30) =>
  TIMELINE_PHASE_TONE[getTimelinePhase(stay, nowMs, fallbackMinutes)] ||
  TIMELINE_PHASE_TONE[TIMELINE_PHASE.PAST];

export const getTimelineBlockMetrics = ({
  stay,
  rangeStartMs,
  rangeEndMs,
  fallbackMinutes = 30,
  nowMs = Date.now(),
}) => {
  if (
    !doesStayOverlapWindow({
      stay,
      rangeStartMs,
      rangeEndMs,
      fallbackMinutes,
      nowMs,
    })
  ) {
    return null;
  }

  const stayStartMs = toMs(getStayStartAt(stay));
  const stayEndMs = getStayDisplayEndMs(stay, fallbackMinutes, nowMs);
  const visibleStartMs = Math.max(stayStartMs, rangeStartMs);
  const visibleEndMs = Math.min(stayEndMs, rangeEndMs);
  const totalRangeMs = Math.max(1, rangeEndMs - rangeStartMs);
  const topPct = ((visibleStartMs - rangeStartMs) / totalRangeMs) * 100;
  const heightPct = Math.max(
    1,
    ((Math.max(visibleEndMs, visibleStartMs) - visibleStartMs) / totalRangeMs) * 100,
  );

  return {
    stayStartMs,
    stayEndMs,
    visibleStartMs,
    visibleEndMs,
    topPct,
    heightPct,
  };
};

export const getTimelineNowMarker = ({ nowMs = Date.now(), rangeStartMs, rangeEndMs }) => {
  if (!Number.isFinite(nowMs) || nowMs < rangeStartMs || nowMs >= rangeEndMs) return null;
  const totalRangeMs = Math.max(1, rangeEndMs - rangeStartMs);
  return {
    topPct: ((nowMs - rangeStartMs) / totalRangeMs) * 100,
  };
};

export const buildTimelineDays = (from, to) => {
  const days = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (cursor.getTime() <= end.getTime()) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
};

export const buildTimelineRows = ({
  days = [],
  labels = [],
  stays = [],
  gridMinutes = 30,
  nowMs = Date.now(),
}) =>
  labels.map((label) => {
    const { hour, minute } = parseSlotLabel(label);
    const dayBuckets = days.map((day) => {
      const slotStart = new Date(day);
      slotStart.setHours(hour, minute, 0, 0);
      const slotStartMs = slotStart.getTime();
      const slotEndMs = slotStartMs + gridMinutes * 60 * 1000;
      const items = stays
        .filter((stay) =>
          doesStayOverlapWindow({
            stay,
            rangeStartMs: slotStartMs,
            rangeEndMs: slotEndMs,
            fallbackMinutes: gridMinutes,
            nowMs,
          }),
        )
        .map((stay) => ({
          stay,
          slotStartMs,
          stayStartMs: toMs(getStayStartAt(stay)),
          stayEndMs: getStayDisplayEndMs(stay, gridMinutes, nowMs),
        }))
        .sort((a, b) => {
          if (a.stayStartMs !== b.stayStartMs) return a.stayStartMs - b.stayStartMs;
          const roomDiff = String(a.stay?.maGiuong || "").localeCompare(
            String(b.stay?.maGiuong || ""),
            "vi",
          );
          if (roomDiff !== 0) return roomDiff;
          return String(a.stay?.maPhien || "").localeCompare(String(b.stay?.maPhien || ""), "vi");
        });

      return {
        day,
        dayKey: toDateKey(day),
        slotStartMs,
        slotEndMs,
        containsNow: slotStartMs <= nowMs && nowMs < slotEndMs,
        items,
      };
    });

    return {
      label,
      containsNow: dayBuckets.some((bucket) => bucket.containsNow),
      dayBuckets,
      items: dayBuckets.flatMap((bucket) => bucket.items),
    };
  });

