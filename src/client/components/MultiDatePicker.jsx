import React, { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Plus, Trash2, RotateCcw } from "lucide-react";

const DAYS_IN_WEEK = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

export default function MultiDatePicker({
  selectedDates = [], // Now array of objects: { id, date, isTrial, status, isMakeUp }
  onChange,
  maxSessions = 12,
  startDate = new Date(),
}) {
  const [currentMonth, setCurrentMonth] = useState(
    new Date(startDate.getFullYear(), startDate.getMonth(), 1)
  );

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(year, month, i);
      const pad = (n) => String(n).padStart(2, "0");
      days.push({
        date: d,
        dateStr: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      });
    }
    return days;
  }, [currentMonth]);

  // Sort by date string safely
  const sortedSessions = useMemo(() => {
    return [...selectedDates].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [selectedDates]);

  // Count normal sessions (excluding trials and makeups that are replacing no-shows? Actually makeups just count towards the total normal sessions if they replace a no-show)
  const normalSessionsCount = sortedSessions.filter(s => !s.isTrial).length;

  const toggleDate = (dateStr) => {
    let newSessions = [...selectedDates];
    const existingIndex = newSessions.findIndex(s => s.date === dateStr);
    
    if (existingIndex >= 0) {
      newSessions.splice(existingIndex, 1);
    } else {
      newSessions.push({
        id: Math.random().toString(36).substring(7),
        date: dateStr,
        isTrial: false,
        status: "PENDING",
        isMakeUp: false,
      });
    }
    onChange(newSessions);
  };

  const updateSession = (id, updates) => {
    const newSessions = selectedDates.map(s => s.id === id ? { ...s, ...updates } : s);
    onChange(newSessions);
  };

  const removeSession = (id) => {
    onChange(selectedDates.filter(s => s.id !== id));
  };

  const setAutoSchedule = (gapDays) => {
    const pad = (n) => String(n).padStart(2, "0");
    const d = new Date(startDate);
    const newSessions = [];
    for (let i = 0; i < maxSessions; i++) {
      newSessions.push({
        id: Math.random().toString(36).substring(7),
        date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        isTrial: false,
        status: "PENDING",
        isMakeUp: false,
      });
      d.setDate(d.getDate() + gapDays + 1);
    }
    onChange(newSessions);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm w-full overflow-hidden flex flex-col md:flex-row">
      {/* Calendar Section */}
      <div className="p-4 border-b md:border-b-0 md:border-r border-gray-200 flex-1">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-indigo-600" />
            Lịch Trình
          </h3>
        </div>
        
        <div className="flex items-center justify-between mb-4 bg-gray-50 p-1.5 rounded-lg">
          <button onClick={prevMonth} type="button" className="p-1 hover:bg-gray-200 rounded-md transition-colors">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <span className="font-medium text-sm text-gray-700">
            Tháng {currentMonth.getMonth() + 1}, {currentMonth.getFullYear()}
          </span>
          <button onClick={nextMonth} type="button" className="p-1 hover:bg-gray-200 rounded-md transition-colors">
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center mb-2">
          {DAYS_IN_WEEK.map(d => (
            <div key={d} className="text-[11px] font-bold text-gray-400 py-1 uppercase tracking-wider">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {calendarDays.map((item, idx) => {
            if (!item) return <div key={`empty-${idx}`} className="p-2" />;
            
            const session = selectedDates.find(s => s.date === item.dateStr);
            const isSelected = !!session;
            
            // Calculate session index only for normal/makeup sessions
            let badgeText = "";
            let badgeColor = "";
            if (isSelected) {
              if (session.isTrial) {
                badgeText = "T";
                badgeColor = "bg-emerald-500";
              } else {
                const normalIdx = sortedSessions.filter(s => !s.isTrial).findIndex(s => s.id === session.id);
                badgeText = String(normalIdx + 1);
                badgeColor = session.isMakeUp ? "bg-amber-500" : "bg-pink-500";
                
                if (session.status === "NO_SHOW") {
                  badgeColor = "bg-gray-400 line-through";
                } else if (session.status === "ATTENDED") {
                  badgeColor = "bg-blue-500";
                }
              }
            }
            
            return (
              <button
                key={item.dateStr}
                type="button"
                onClick={() => toggleDate(item.dateStr)}
                className={`
                  relative h-9 rounded-md flex items-center justify-center text-sm font-medium transition-all
                  ${isSelected 
                    ? "bg-indigo-50 border border-indigo-200 text-indigo-900 shadow-sm" 
                    : "text-gray-600 hover:bg-gray-100 border border-transparent"
                  }
                `}
              >
                {item.date.getDate()}
                {isSelected && (
                  <span className={`absolute -top-2 -right-2 text-white text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full shadow-sm ${badgeColor}`}>
                    {badgeText}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-5 space-y-2">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Tiện ích tạo lịch nhanh</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setAutoSchedule(1)}
              className="px-3 py-2 text-[12px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-md hover:bg-indigo-100 transition-colors"
            >
              Rải lịch cách 1 ngày
            </button>
            <button
              type="button"
              onClick={() => setAutoSchedule(2)}
              className="px-3 py-2 text-[12px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-md hover:bg-indigo-100 transition-colors"
            >
              Rải lịch cách 2 ngày
            </button>
          </div>
        </div>
      </div>

      {/* Details Section */}
      <div className="flex-1 bg-gray-50 flex flex-col h-[400px]">
        <div className="p-3 border-b border-gray-200 bg-white flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-800">
            Chi tiết lịch trình ({normalSessionsCount}/{maxSessions})
          </span>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {sortedSessions.length === 0 ? (
            <div className="text-center text-sm text-gray-500 py-8">
              Chưa có lịch trình nào được chọn.
            </div>
          ) : (
            sortedSessions.map((session, idx) => {
              const normalIdx = !session.isTrial ? sortedSessions.filter(s => !s.isTrial).findIndex(s => s.id === session.id) + 1 : "-";
              
              return (
                <div key={session.id} className="bg-white border border-gray-200 rounded-lg p-2 shadow-sm flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold text-white ${session.isTrial ? 'bg-emerald-500' : 'bg-pink-500'}`}>
                        {session.isTrial ? 'Trải nghiệm' : `Buổi ${normalIdx}`}
                      </span>
                      <span className="text-xs font-semibold text-gray-800">
                        {session.date}
                      </span>
                    </div>
                    <button onClick={() => removeSession(session.id)} className="text-gray-400 hover:text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-md">
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={session.isTrial}
                        onChange={(e) => updateSession(session.id, { isTrial: e.target.checked, isMakeUp: false })}
                        className="rounded text-emerald-500 focus:ring-emerald-500"
                      />
                      Buổi trải nghiệm (Free)
                    </label>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
