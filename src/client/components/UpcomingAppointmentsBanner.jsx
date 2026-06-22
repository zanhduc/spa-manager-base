import React, { useMemo, useState, useCallback } from "react";
import { parseLocalString } from "../utils/dateFormatter.js";
import { useCachedQuery } from "../hooks/useCachedQuery.js";
import { getTreatmentHistory, getCustomerProgress, CACHE_KEYS } from "../api/index.js";

const SESSION_STATUS = {
  BOOKED: "BOOKED",
  IN_HOUSE: "IN_HOUSE",
  CHECKED_OUT: "CHECKED_OUT",
  CANCELLED: "CANCELLED",
  NO_SHOW: "NO_SHOW",
};

const selectCachedList = (res) => (Array.isArray(res?.data) ? res.data : []);

// Parse VN datetime "HH:mm DD/MM/YYYY" to get date part "YYYY-MM-DD"
const getDatePartFromVnDateTime = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const m = raw.match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const d = m[3].padStart(2, "0");
    const mo = m[4].padStart(2, "0");
    const y = m[5];
    return `${y}-${mo}-${d}`;
  }
  return raw.slice(0, 10); // fallback for other formats
};

// Parse VN datetime to milliseconds for sorting
const parseVnDateTimeMs = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const m = raw.match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    return new Date(parseInt(m[5]), parseInt(m[4]) - 1, parseInt(m[3]), parseInt(m[1]), parseInt(m[2])).getTime();
  }
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d.getTime() : 0;
};

export default function UpcomingAppointmentsBanner() {
  const apiFn = useCallback(() => getTreatmentHistory({}), []);
  const { data: stays = [] } = useCachedQuery(apiFn, CACHE_KEYS.stayHistory, {
    select: selectCachedList,
  });

  const getProgressFn = useCallback(() => getCustomerProgress(), []);
  const { data: progressRows = [] } = useCachedQuery(getProgressFn, CACHE_KEYS.customerProgress, {
    select: selectCachedList,
  });

  const [isModalOpen, setIsModalOpen] = useState(false);

  const appointmentData = useMemo(() => {
    const todayCombos = [];
    const todayStandalones = [];
    const tomorrowCombos = [];
    const tomorrowStandalones = [];

    const now = new Date();
    const todayY = now.getFullYear();
    const todayM = String(now.getMonth() + 1).padStart(2, '0');
    const todayD = String(now.getDate()).padStart(2, '0');
    const todayDateStr = `${todayY}-${todayM}-${todayD}`;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const y = tomorrow.getFullYear();
    const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const d = String(tomorrow.getDate()).padStart(2, '0');
    const tomorrowDateStr = `${y}-${m}-${d}`;

    stays.forEach(stay => {
        if (stay.trangThaiPhien !== SESSION_STATUS.BOOKED) return;
        const batDauAt = String(stay.batDauAt || "").trim();
        if (!batDauAt) return;

        const batDauDate = getDatePartFromVnDateTime(batDauAt);
        const isToday = batDauDate.startsWith(todayDateStr);
        const isTomorrow = batDauDate.startsWith(tomorrowDateStr);
        if (!isToday && !isTomorrow) return;

        const isCombo = Boolean(stay.maTienTrinh || stay.maGoi || Number(stay.tongBuoiCombo) > 1 || Number(stay.soBuoiQuyDoi) > 1);
        if (isCombo) return; // We get combos from customerProgress
        
        if (isToday) todayStandalones.push(stay);
        else if (isTomorrow) tomorrowStandalones.push(stay);
    });

    const processedTienTrinh = new Set();
    const safeTimeMs = (dateStr) => {
      if (!dateStr) return 0;
      const d = parseLocalString(dateStr);
      return d ? d.getTime() : 0;
    };
    const sortedRows = [...progressRows].sort((a, b) => safeTimeMs(b.ngay) - safeTimeMs(a.ngay));

    sortedRows.forEach(row => {
        const maTienTrinh = String(row?.maTienTrinh || "").trim();
        if (!maTienTrinh || processedTienTrinh.has(maTienTrinh)) return;
        const scheduleRaw = row?.lichTrinhChiTiet;
        if (!scheduleRaw) return;
        
        try {
          const schedule = JSON.parse(scheduleRaw);
          if (!Array.isArray(schedule)) return;
          processedTienTrinh.add(maTienTrinh);
          
          schedule.forEach((s, index) => {
            if (s.status !== "PENDING") return;
            
            const stayObj = {
              ...row,
              batDauAt: `${s.date}T00:00:00`,
              tenGoi: row.goiCombo || row.tenGoi || "",
              buoiThuLabel: `(Buổi ${index + 1})`
            };

            if (s.date === todayDateStr) {
              todayCombos.push(stayObj);
            } else if (s.date === tomorrowDateStr) {
              tomorrowCombos.push(stayObj);
            }
          });
        } catch (e) {}
    });

    const sortByTime = (a, b) => parseVnDateTimeMs(a.batDauAt) - parseVnDateTimeMs(b.batDauAt);
    
    const todayTotal = todayCombos.length + todayStandalones.length;
    const tomorrowTotal = tomorrowCombos.length + tomorrowStandalones.length;
    return {
      today: { combos: todayCombos.sort(sortByTime), standalones: todayStandalones.sort(sortByTime), total: todayTotal },
      tomorrow: { combos: tomorrowCombos.sort(sortByTime), standalones: tomorrowStandalones.sort(sortByTime), total: tomorrowTotal },
      total: todayTotal + tomorrowTotal
    };
  }, [stays, progressRows]);

  if (appointmentData.total === 0) return null;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const displayDate = `${String(tomorrow.getDate()).padStart(2, '0')}/${String(tomorrow.getMonth() + 1).padStart(2, '0')}/${tomorrow.getFullYear()}`;

  const formatText = (prefix, data) => {
    const parts = [];
    if (data.combos.length > 0) parts.push(`${data.combos.length} khách hẹn Combo`);
    if (data.standalones.length > 0) parts.push(`${data.standalones.length} hẹn lẻ`);
    if (parts.length === 0) return null;
    return `${prefix} ${parts.join(" và ")}`;
  };

  const bannerTexts = [];
  if (appointmentData.today.total > 0) {
    const txt = formatText("Hôm nay còn", appointmentData.today);
    if (txt) bannerTexts.push(txt);
  }
  if (appointmentData.tomorrow.total > 0) {
    const txt = formatText(`Ngày mai (${displayDate}) có`, appointmentData.tomorrow);
    if (txt) bannerTexts.push(txt);
  }

  const renderSection = (title, count, colorClass, borderClass, bgClass, items, isCombo = false) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-4 last:mb-0">
        <h4 className={`text-sm font-bold ${colorClass} uppercase tracking-wider mb-2 flex items-center gap-2`}>
          <span className={`w-1.5 h-1.5 rounded-full ${bgClass}`}></span>
          {title} ({count})
        </h4>
        <div className="flex flex-col gap-2.5">
          {items.map((stay, idx) => {
            let timeStr = "-";
            if (!isCombo) {
              const m = String(stay.batDauAt || "").match(/^(\d{1,2}):(\d{2})\s+\d{1,2}\/\d{1,2}\/\d{4}$/);
              if (m) {
                timeStr = m[1].padStart(2, '0') + ":" + m[2];
              }
            }
            return (
              <div key={stay.maPhien || idx} className={`flex items-center justify-between rounded-lg border ${borderClass} bg-white/95 px-3 py-2 shadow-sm relative overflow-hidden`}>
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${bgClass}`}></div>
                <div className="pl-1.5 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800 text-sm">{stay.tenKhach || "Khách vãng lai"}</span>
                    <span className="text-xs text-slate-500 font-medium">SĐT: {stay.sdtKhach || stay.soDienThoai || "-"}</span>
                  </div>
                  <div className="text-xs text-slate-600 mt-0.5">
                    {stay.tenGoi ? (
                      <span className={`font-medium ${colorClass}`}>{stay.tenGoi} {stay.buoiThuLabel || ""}</span>
                    ) : (
                      <span className="text-slate-400 italic">Không có thông tin dịch vụ</span>
                    )}
                  </div>
                </div>
                {!isCombo && (
                  <div className={`flex flex-col items-end justify-center ml-3`}>
                    <div className="text-[10px] text-slate-400 font-medium uppercase mb-0.5">Giờ hẹn</div>
                    <div className={`rounded px-1.5 py-0.5 font-bold text-sm border ${borderClass} ${colorClass} bg-slate-50/80`}>
                      {timeStr}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col items-center relative z-[60]">
      <div 
        className="bg-gradient-to-r from-rose-500 via-rose-500 to-pink-600 px-6 py-2.5 text-sm text-white text-center font-bold cursor-pointer hover:from-rose-600 hover:via-rose-600 hover:to-pink-700 transition-all shadow-md flex items-center justify-center gap-2 tracking-wide rounded-b-2xl z-20"
        onClick={() => setIsModalOpen(!isModalOpen)}
      >
        <span className="animate-pulse drop-shadow-md text-base">🔔</span>
        <span className="drop-shadow-sm">{bannerTexts.join(" • ")} {isModalOpen ? "▲" : "▼"}</span>
      </div>
      
      <div 
        className={`absolute top-0 left-1/2 -translate-x-1/2 w-[95vw] max-w-3xl bg-white/95 backdrop-blur-md shadow-[0_20px_50px_-12px_rgba(225,29,72,0.25)] rounded-b-3xl border border-rose-100 transition-all duration-300 ease-in-out origin-top z-10 pt-12 ${
          isModalOpen ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-4 pointer-events-none scale-y-0"
        }`}
      >
        <div className="max-h-[80vh] overflow-y-auto p-6 bg-rose-50/30 rounded-b-3xl">
          <div className="flex flex-col gap-6">
            {appointmentData.today.total > 0 && (
              <div className="rounded-xl border border-rose-100/60 bg-white/80 backdrop-blur-sm p-5 shadow-sm shadow-rose-100/50">
                <h3 className="text-lg font-extrabold text-rose-900 mb-4 border-b border-rose-100/60 pb-2">📅 Hôm nay</h3>
                {renderSection("Lịch hẹn Combo", appointmentData.today.combos.length, "text-pink-700", "border-pink-200", "bg-pink-400", appointmentData.today.combos, true)}
                {renderSection("Lịch hẹn trước (Lẻ)", appointmentData.today.standalones.length, "text-amber-700", "border-amber-200", "bg-amber-400", appointmentData.today.standalones, false)}
              </div>
            )}

            {appointmentData.tomorrow.total > 0 && (
              <div className="rounded-xl border border-rose-100/60 bg-white/80 backdrop-blur-sm p-4 shadow-sm shadow-rose-100/50 opacity-95">
                <h3 className="text-base font-extrabold text-rose-900 mb-3 border-b border-rose-100/60 pb-2">📅 Ngày mai ({displayDate})</h3>
                {renderSection("Lịch hẹn Combo", appointmentData.tomorrow.combos.length, "text-pink-700", "border-pink-200", "bg-pink-400", appointmentData.tomorrow.combos, true)}
                {renderSection("Lịch hẹn trước (Lẻ)", appointmentData.tomorrow.standalones.length, "text-amber-700", "border-amber-200", "bg-amber-400", appointmentData.tomorrow.standalones, false)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
