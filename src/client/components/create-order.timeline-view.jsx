import { formatTimeOnly, getTimelineTone } from "../pages/create-order.timeline";

const GRID_MINUTE_OPTIONS = [
  { value: 60, label: "60 phút" },
  { value: 30, label: "30 phút" },
  { value: 15, label: "15 phút" },
];

const getTimelineLinePx = (index, slotHeight) => index * slotHeight;

const getTimelineBlockDensity = (durationMinutes, gridMinutes) => {
  const slotCount = Math.max(
    Number(durationMinutes || 0) / Math.max(Number(gridMinutes || 15), 1),
    0,
  );
  if (slotCount < 1.5) return "tiny";
  if (slotCount < 3) return "compact";
  return "full";
};

function TimelineToolbar({
  title,
  showLegend = false,
  gridMinutes,
  onGridMinutesChange,
  onOpenEntryAction,
  DropdownComponent,
  children,
}) {
  return (
    <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
      <div className="space-y-2">
        <p className="text-sm font-semibold text-slate-600">{title}</p>
        {showLegend ? (
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-600">
            <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-1">
              Quá khứ
            </span>
            <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-sky-800">
              Hiện tại
            </span>
            <span className="rounded-full border border-pink-200 bg-pink-50 px-2 py-1 text-pink-800">
              Tương lai
            </span>
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={onOpenEntryAction}
          className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-br from-rose-600 to-rose-700 px-4 py-2.5 text-sm font-bold text-white shadow-[0_12px_24px_rgba(225,29,72,0.22)] transition hover:from-rose-500 hover:to-rose-600"
        >
          <span className="text-lg leading-none">+</span>
          <span>Tạo lịch / Mở phiên</span>
        </button>
        {children}
        <DropdownComponent
          value={gridMinutes}
          onChange={(next) => onGridMinutesChange(Number(next))}
          className="w-32"
          buttonClassName="py-1.5"
          options={GRID_MINUTE_OPTIONS}
        />
      </div>
    </div>
  );
}

function TimelineAxis({
  scheduleHours,
  timelineHeightPx,
  timelineSlotHeight,
  nowMarker,
  prefix = "",
}) {
  return (
    <div
      className="relative border-r border-slate-200 bg-slate-50"
      style={{ height: `${timelineHeightPx}px` }}
    >
      {scheduleHours.map((label, index) => (
        <div
          key={`${prefix}time-axis-${label}`}
          className="absolute right-2 -translate-y-1/2 px-1 text-right text-xs font-semibold text-slate-600"
          style={{ top: `${getTimelineLinePx(index, timelineSlotHeight)}px` }}
        >
          {label}
        </div>
      ))}
      {nowMarker ? (
        <div
          className="pointer-events-none absolute inset-x-0 z-10"
          style={{ top: `calc(${nowMarker.topPct}% - 11px)` }}
        >
          <div className="flex items-center justify-end pr-2">
            <span className="rounded-full bg-sky-600 px-2 py-1 text-[10px] font-bold text-white shadow-sm">
              Hiện tại
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TimelineGridLines({
  scheduleHours,
  timelineHeightPx,
  timelineSlotHeight,
  nowMarker,
  testId,
  prefix = "",
  children,
}) {
  return (
    <div className="relative" style={{ height: `${timelineHeightPx}px` }}>
      {scheduleHours.map((label, index) => (
        <div
          key={`${prefix}timeline-line-${label}`}
          className="absolute inset-x-0 border-t border-slate-200/80"
          style={{ top: `${getTimelineLinePx(index, timelineSlotHeight)}px` }}
        />
      ))}
      {children}
      {nowMarker ? (
        <div
          data-testid={testId}
          className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-sky-500"
          style={{ top: `${nowMarker.topPct}%` }}
        >
          <div className="absolute -left-2 -top-1.5 h-3 w-3 rounded-full bg-sky-600 shadow-sm" />
        </div>
      ) : null}
    </div>
  );
}

function TimelineBlock({
  stay,
  entry,
  room,
  gridMinutes,
  timelineNow,
  timelineSlotHeight,
  getStayStartAt,
  getStayStatus,
  getStayTimelineMetaLabel,
  onClick,
  mode = "room",
}) {
  const durationMinutes = Math.max(
    15,
    Math.round((entry.stayEndMs - entry.stayStartMs) / 60000),
  );
  const density = getTimelineBlockDensity(durationMinutes, gridMinutes);
  const minHeight =
    density === "tiny"
      ? Math.max(34, timelineSlotHeight * 0.9)
      : density === "compact"
        ? Math.max(44, timelineSlotHeight * 1.2)
        : Math.max(52, timelineSlotHeight - 4);

  return (
    <button
      type="button"
      data-testid={
        mode === "room"
          ? `timeline-room-block-${stay.maPhien || stay.maLichHen || room?.maGiuong || "none"}`
          : undefined
      }
      data-session-status={mode === "room" ? getStayStatus(stay) : undefined}
      onClick={onClick}
      className={`absolute left-3 right-3 z-20 overflow-hidden rounded-2xl border text-xs shadow-sm transition hover:shadow-md ${
        density === "tiny" ? "px-2 py-1.5" : density === "compact" ? "px-2.5 py-2" : "px-3 py-3"
      } ${getTimelineTone(stay, timelineNow, gridMinutes)}`}
      style={{
        top: `${entry.topPct}%`,
        height: `${entry.heightPct}%`,
        minHeight: `${minHeight}px`,
      }}
    >
      <div
        className={`flex h-full ${
          density === "full"
            ? "flex-col justify-center text-center leading-tight"
            : "flex-col justify-start text-left leading-tight"
        }`}
      >
        <p
          className={`truncate font-bold ${
            density === "tiny" ? "text-[10px]" : density === "compact" ? "text-[11px]" : "text-sm"
          }`}
        >
          {density === "tiny"
            ? stay.tenKhach || "-"
            : mode === "staff"
              ? room?.tenGiuong || stay.maGiuong || "Chưa gán giường"
              : stay.tenNhanVien || "Chưa gán NV"}
        </p>
        <p
          className={`truncate font-semibold ${
            density === "tiny" ? "text-[9px]" : density === "compact" ? "text-[10px]" : "text-[12px]"
          }`}
        >
          {density === "tiny" ? formatTimeOnly(getStayStartAt(stay)) : `Khách: ${stay.tenKhach || "-"}`}
        </p>
        {density !== "tiny" ? (
          <p className="mt-0.5 truncate text-[10px] opacity-80">
            {getStayTimelineMetaLabel(stay, durationMinutes, timelineNow)}
          </p>
        ) : null}
      </div>
    </button>
  );
}

function RoomTimelineView(props) {
  const {
    dateMode,
    displayDateRange,
    selectedDateObj,
    toDateKey,
    toWeekdayDateLabel,
    gridMinutes,
    onGridMinutesChange,
    DropdownComponent,
    onOpenEntryAction,
    roomTimelinePage,
    roomTimelinePageSize,
    dayTimelinePageCount,
    dayTimelineEntries,
    onPrevRoomPage,
    onNextRoomPage,
    timeGridScrollRef,
    timelineDays,
    timelineRows,
    roomMap,
    openStay,
    timelineNow,
    getStayStartAt,
    getStayEndAt,
    getStayStatus,
    scheduleHours,
    timelineHeightPx,
    timelineSlotHeight,
    dayTimelineNowMarker,
    pagedDayTimelineEntries,
    activeStayByRoom,
    roomBookingAlertByRoom,
    getRoomTimelineHeaderState,
    handleTimelineRoomHeaderSelect,
    getStayTimelineMetaLabel,
  } = props;

  return (
    <section className="relative rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <TimelineToolbar
        title={`${dateMode === "WEEK" ? `Tuần ${displayDateRange}` : `Ngày ${toDateKey(selectedDateObj)}`} • Bước lưới ${gridMinutes} phút`}
        showLegend
        gridMinutes={gridMinutes}
        onGridMinutesChange={onGridMinutesChange}
        onOpenEntryAction={onOpenEntryAction}
        DropdownComponent={DropdownComponent}
      >
        {dateMode === "DAY" && dayTimelinePageCount > 1 ? (
          <>
            <button
              type="button"
              onClick={onPrevRoomPage}
              disabled={roomTimelinePage <= 0}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:opacity-40"
            >
              ←
            </button>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
              Giường {roomTimelinePage * roomTimelinePageSize + 1}-
              {Math.min((roomTimelinePage + 1) * roomTimelinePageSize, dayTimelineEntries.length)} /{" "}
              {dayTimelineEntries.length}
            </div>
            <button
              type="button"
              onClick={onNextRoomPage}
              disabled={roomTimelinePage >= dayTimelinePageCount - 1}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:opacity-40"
            >
              →
            </button>
          </>
        ) : null}
      </TimelineToolbar>

      <div
        data-testid="room-timeline-scroll"
        ref={dateMode === "DAY" ? timeGridScrollRef : null}
        className="max-h-[72vh] overflow-auto rounded-xl border border-slate-200"
      >
        {dateMode === "WEEK" ? (
          <table className="min-w-[1080px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="bg-slate-50 text-slate-600">
                <th className="w-24 border-b border-r border-slate-200 px-3 py-3 text-left font-semibold">
                  Giờ
                </th>
                {timelineDays.map((day) => (
                  <th
                    key={`timeline-week-head-${toDateKey(day)}`}
                    className="min-w-[170px] border-b border-r border-slate-200 px-3 py-3 text-left font-semibold last:border-r-0"
                  >
                    {toWeekdayDateLabel(day)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {timelineRows.map((row) => (
                <tr key={`time-week-row-${row.label}`}>
                  <td
                    className={`border-b border-r border-slate-200 px-3 py-3 align-top text-sm font-semibold text-slate-600 ${
                      row.containsNow ? "bg-sky-50/60" : "bg-slate-50"
                    }`}
                  >
                    {row.label}
                  </td>
                  {row.dayBuckets.map((bucket) => (
                    <td
                      key={`time-week-cell-${row.label}-${bucket.dayKey}`}
                      className={`border-b border-r border-slate-100 px-2 py-2 align-top last:border-r-0 ${
                        bucket.containsNow ? "bg-sky-50/30" : "bg-white"
                      }`}
                    >
                      {bucket.items.length === 0 ? (
                        <div className="h-10 rounded-lg border border-dashed border-slate-200 bg-white" />
                      ) : (
                        <div className="space-y-2">
                          {bucket.items.map((entry) => {
                            const stay = entry.stay;
                            const room = roomMap.get(String(stay.maGiuong || ""));
                            const startMs = Number(entry.stayStartMs || 0);
                            const endMs = Number(entry.stayEndMs || 0);
                            const durationMinutes =
                              Number.isFinite(startMs) && Number.isFinite(endMs)
                                ? Math.max(15, Math.round((endMs - startMs) / 60000))
                                : gridMinutes;
                            return (
                              <button
                                key={`slot-week-stay-${stay.maPhien}-${entry.slotStartMs}`}
                                type="button"
                                onClick={() => openStay(room, stay)}
                                className={`w-full rounded-lg border px-2 py-2 text-left text-xs transition hover:shadow-sm ${getTimelineTone(
                                  stay,
                                  timelineNow,
                                  gridMinutes,
                                )}`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="truncate font-bold">{stay.tenKhach || "-"}</p>
                                    <p className="truncate text-[11px] opacity-80">
                                      {formatTimeOnly(getStayStartAt(stay))} - {formatTimeOnly(getStayEndAt(stay))}
                                    </p>
                                    <p className="truncate text-[11px] opacity-80">
                                      {room?.tenGiuong || stay.maGiuong}
                                    </p>
                                    <p className="truncate text-[11px] opacity-80">
                                      {stay.tenNhanVien || "Chưa gán nhân viên"}
                                    </p>
                                  </div>
                                  <div className="shrink-0 text-right">
                                    <p className="text-[10px] font-semibold uppercase opacity-70">
                                      {stay.trangThaiPhien}
                                    </p>
                                    <p className="text-[10px] opacity-70">{durationMinutes} phút</p>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : dayTimelineEntries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
            Không có giường hoặc phiên phù hợp để hiển thị trên timeline.
          </div>
        ) : (
          <div
            className="min-w-[980px]"
            style={{ minWidth: `${88 + Math.max(1, pagedDayTimelineEntries.length) * 180}px` }}
          >
            <div
              className="sticky top-0 z-40 grid border-b border-slate-200 bg-slate-50 shadow-sm"
              style={{
                gridTemplateColumns: `88px repeat(${Math.max(
                  1,
                  pagedDayTimelineEntries.length,
                )}, minmax(180px, 1fr))`,
              }}
            >
              <div className="border-r border-slate-200 px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Giờ
              </div>
              {pagedDayTimelineEntries.map(({ room }) => {
                const roomCode = String(room.maGiuong || "");
                const activeStay = activeStayByRoom.get(roomCode) || null;
                const bookingAlert = roomBookingAlertByRoom.get(roomCode) || null;
                const roomState = getRoomTimelineHeaderState({
                  room,
                  activeStay,
                  bookingAlert,
                  nowMs: timelineNow,
                });
                return (
                  <button
                    type="button"
                    key={`timeline-room-head-${room.maGiuong}`}
                    data-testid={`timeline-room-head-${room.maGiuong}`}
                    onClick={() => handleTimelineRoomHeaderSelect(room)}
                    className="border-r border-slate-200 px-3 py-3 text-left transition hover:bg-rose-50/60 last:border-r-0"
                  >
                    <span className={`mb-2 inline-flex rounded-full border px-2 py-1 text-[10px] font-bold ${roomState.tone}`}>
                      {roomState.label}
                    </span>
                    <p className="truncate text-sm font-bold text-slate-800">
                      {room.tenGiuong || room.maGiuong}
                    </p>
                    <p className="truncate text-[11px] text-slate-500">
                      {room.maGiuong} • {room.loaiGiuong || "Giường trị liệu"}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="grid" style={{ gridTemplateColumns: "88px minmax(0, 1fr)" }}>
              <TimelineAxis
                scheduleHours={scheduleHours}
                timelineHeightPx={timelineHeightPx}
                timelineSlotHeight={timelineSlotHeight}
                nowMarker={dayTimelineNowMarker}
              />
              <TimelineGridLines
                scheduleHours={scheduleHours}
                timelineHeightPx={timelineHeightPx}
                timelineSlotHeight={timelineSlotHeight}
                nowMarker={dayTimelineNowMarker}
                testId="timeline-now-line"
              >
                <div
                  className="absolute inset-0 grid"
                  style={{
                    gridTemplateColumns: `repeat(${Math.max(
                      1,
                      pagedDayTimelineEntries.length,
                    )}, minmax(180px, 1fr))`,
                  }}
                >
                  {pagedDayTimelineEntries.map(({ room, entries }) => (
                    <div
                      key={`timeline-room-column-${room.maGiuong}`}
                      className="relative border-r border-slate-200 last:border-r-0"
                      onDoubleClick={() => handleTimelineRoomHeaderSelect(room)}
                    >
                      {entries.map((entry, index) => (
                        <TimelineBlock
                          key={`timeline-block-${entry.stay.maPhien || entry.stay.maLichHen || `${room.maGiuong}-${index}`}`}
                          stay={entry.stay}
                          entry={entry}
                          room={room}
                          gridMinutes={gridMinutes}
                          timelineNow={timelineNow}
                          timelineSlotHeight={timelineSlotHeight}
                          getStayStartAt={getStayStartAt}
                          getStayStatus={getStayStatus}
                          getStayTimelineMetaLabel={getStayTimelineMetaLabel}
                          onClick={() => openStay(room, entry.stay)}
                          mode="room"
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </TimelineGridLines>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function StaffTimelineView(props) {
  const {
    dateMode,
    displayDateRange,
    selectedDateObj,
    toDateKey,
    toWeekdayDateLabel,
    gridMinutes,
    onGridMinutesChange,
    DropdownComponent,
    onOpenEntryAction,
    staffGridScrollRef,
    dayStaffTimelineEntries,
    scheduleHours,
    timelineHeightPx,
    timelineSlotHeight,
    dayTimelineNowMarker,
    roomMap,
    openStay,
    timelineNow,
    getStayStartAt,
    getStayStatus,
    getStayTimelineMetaLabel,
    timelineDays,
    visibleStaffRows,
    staffWeekGridMap,
  } = props;

  return (
    <section className="relative rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <TimelineToolbar
        title={`Lưới nhân viên • ${dateMode === "WEEK" ? `Tuần ${displayDateRange}` : `Ngày ${toDateKey(selectedDateObj)}`}`}
        gridMinutes={gridMinutes}
        onGridMinutesChange={onGridMinutesChange}
        onOpenEntryAction={onOpenEntryAction}
        DropdownComponent={DropdownComponent}
      />
      {dateMode === "DAY" ? (
        <div ref={staffGridScrollRef} className="max-h-[72vh] overflow-auto rounded-xl border border-slate-200">
          {dayStaffTimelineEntries.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
              Không có nhân viên hoặc phiên phù hợp để hiển thị trên timeline.
            </div>
          ) : (
            <div className="min-w-[980px]">
              <div
                className="sticky top-0 z-40 grid border-b border-slate-200 bg-slate-50 shadow-sm"
                style={{
                  gridTemplateColumns: `88px repeat(${Math.max(
                    1,
                    dayStaffTimelineEntries.length,
                  )}, minmax(180px, 1fr))`,
                }}
              >
                <div className="border-r border-slate-200 px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Giờ
                </div>
                {dayStaffTimelineEntries.map(({ staff }) => (
                  <div
                    key={`timeline-staff-head-${staff.maNhanVien || "none"}`}
                    className="border-r border-slate-200 px-3 py-3 text-left last:border-r-0"
                  >
                    <p className="truncate text-sm font-bold text-slate-800">{staff.tenNhanVien}</p>
                    <p className="truncate text-[11px] text-slate-500">
                      {staff.maNhanVien || "Chưa gán nhân viên"}
                    </p>
                  </div>
                ))}
              </div>

              <div className="grid" style={{ gridTemplateColumns: "88px minmax(0, 1fr)" }}>
                <TimelineAxis
                  scheduleHours={scheduleHours}
                  timelineHeightPx={timelineHeightPx}
                  timelineSlotHeight={timelineSlotHeight}
                  nowMarker={dayTimelineNowMarker}
                  prefix="staff-"
                />
                <TimelineGridLines
                  scheduleHours={scheduleHours}
                  timelineHeightPx={timelineHeightPx}
                  timelineSlotHeight={timelineSlotHeight}
                  nowMarker={dayTimelineNowMarker}
                  prefix="staff-"
                >
                  <div
                    className="absolute inset-0 grid"
                    style={{
                      gridTemplateColumns: `repeat(${Math.max(
                        1,
                        dayStaffTimelineEntries.length,
                      )}, minmax(180px, 1fr))`,
                    }}
                  >
                    {dayStaffTimelineEntries.map(({ staff, entries }) => (
                      <div
                        key={`timeline-staff-column-${staff.maNhanVien || "none"}`}
                        className="relative border-r border-slate-200 last:border-r-0"
                      >
                        {entries.map((entry) => {
                          const stay = entry.stay;
                          const room = roomMap.get(String(stay.maGiuong || ""));
                          return (
                            <TimelineBlock
                              key={`staff-timeline-block-${staff.maNhanVien || "none"}-${stay.maPhien}`}
                              stay={stay}
                              entry={entry}
                              room={room}
                              gridMinutes={gridMinutes}
                              timelineNow={timelineNow}
                              timelineSlotHeight={timelineSlotHeight}
                              getStayStartAt={getStayStartAt}
                              getStayStatus={getStayStatus}
                              getStayTimelineMetaLabel={getStayTimelineMetaLabel}
                              onClick={() => openStay(room, stay)}
                              mode="staff"
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </TimelineGridLines>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-[1800px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="bg-slate-50 text-slate-600">
                <th
                  rowSpan={2}
                  className="w-56 min-w-[220px] border-b border-r border-slate-200 px-4 py-3 text-left text-base"
                >
                  Nhân viên
                </th>
                {timelineDays.map((day) => (
                  <th
                    key={`staff-grid-day-${toDateKey(day)}`}
                    colSpan={scheduleHours.length}
                    className="border-b border-l border-slate-200 px-2 py-3 text-center font-semibold"
                  >
                    {toWeekdayDateLabel(day)}
                  </th>
                ))}
              </tr>
              <tr className="bg-slate-50/80 text-slate-500">
                {timelineDays.flatMap((day) =>
                  scheduleHours.map((label) => (
                    <th
                      key={`staff-grid-head-${toDateKey(day)}-${label}`}
                      className="min-w-[92px] border-b border-l border-slate-200 px-2 py-2 text-center text-xs font-semibold"
                    >
                      {label}
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody>
              {visibleStaffRows.map((staff) => (
                <tr key={`staff-row-${staff.maNhanVien || "none"}`}>
                  <td className="w-56 min-w-[220px] border-b border-slate-100 px-4 py-4 font-semibold text-slate-700">
                    <div className="text-lg leading-snug">{staff.tenNhanVien}</div>
                  </td>
                  {timelineDays.flatMap((day) =>
                    scheduleHours.map((label) => {
                      const stayItems =
                        staffWeekGridMap.get(`${String(staff.maNhanVien || "")}|${toDateKey(day)}|${label}`) ||
                        [];
                      return (
                        <td
                          key={`staff-cell-${staff.maNhanVien || "none"}-${toDateKey(day)}-${label}`}
                          className="border-b border-l border-slate-100 px-1.5 py-1.5 align-top"
                        >
                          {stayItems.length > 0 ? (
                            <div className="space-y-1">
                              {stayItems.slice(0, 2).map((stay) => {
                                const room = roomMap.get(String(stay.maGiuong || ""));
                                return (
                                  <button
                                    key={`staff-grid-stay-${staff.maNhanVien || "none"}-${toDateKey(day)}-${label}-${stay.maPhien}`}
                                    type="button"
                                    onClick={() => openStay(room, stay)}
                                    className={`w-full rounded-md border px-2 py-2 text-left text-xs ${getTimelineTone(
                                      stay,
                                      timelineNow,
                                      gridMinutes,
                                    )}`}
                                  >
                                    {formatTimeOnly(getStayStartAt(stay))} • {stay.tenKhach || "-"}
                                  </button>
                                );
                              })}
                              {stayItems.length > 2 ? (
                                <p className="px-1 text-[11px] text-slate-500">
                                  +{stayItems.length - 2} lịch khác
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <div className="h-10 rounded-md border border-dashed border-slate-200 bg-white" />
                          )}
                        </td>
                      );
                    }),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function TimelineWorkspace({ activeTab, onClearCache, ...props }) {
  const enhancedProps = { ...props, onClearCache };
  if (activeTab === "TIME_GRID") {
    return <RoomTimelineView {...enhancedProps} />;
  }
  return <StaffTimelineView {...enhancedProps} />;
}
