import React, { useMemo } from "react";
import Icon from "../../../components/AppIcon";

const TYPE_COLORS = {
  meeting:  "bg-blue-500",
  call:     "bg-green-500",
  demo:     "bg-purple-500",
  followup: "bg-orange-500",
  other:    "bg-gray-400",
};

const STATUS_OPACITY = {
  scheduled: "opacity-100",
  completed: "opacity-50",
  cancelled: "opacity-30 line-through",
};

const DAYS  = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTHS = ["January","February","March","April","May","June",
                "July","August","September","October","November","December"];

const CalendarGrid = ({ meetings, currentDate, onDateSelect, onMeetingClick, selectedDate }) => {
  const year  = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const { cells } = useMemo(() => {
    const firstDay   = new Date(year, month, 1).getDay();
    const daysInMonth= new Date(year, month + 1, 0).getDate();
    const daysInPrev = new Date(year, month, 0).getDate();
    const today      = new Date();

    // Group meetings by date string YYYY-MM-DD
    const byDate = {};
    meetings.forEach((m) => {
      const d = new Date(m.start_time);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      if (!byDate[key]) byDate[key] = [];
      byDate[key].push(m);
    });

    const cells = [];

    // Prev month trailing days
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = daysInPrev - i;
      cells.push({ day: d, currentMonth: false, dateStr: null, meetings: [] });
    }

    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      const isToday =
        today.getFullYear() === year &&
        today.getMonth()    === month &&
        today.getDate()     === d;
      cells.push({
        day: d,
        currentMonth: true,
        dateStr: key,
        meetings: byDate[key] || [],
        isToday,
        isSelected: selectedDate === key,
      });
    }

    // Next month leading days
    const remaining = 42 - cells.length;
    for (let d = 1; d <= remaining; d++) {
      cells.push({ day: d, currentMonth: false, dateStr: null, meetings: [] });
    }

    return { cells };
  }, [meetings, year, month, selectedDate]);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-border bg-muted/30">
        {DAYS.map((d) => (
          <div key={d} className="py-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {cells.map((cell, idx) => (
          <div
            key={idx}
            onClick={() => cell.currentMonth && onDateSelect && onDateSelect(cell.dateStr)}
            className={`min-h-[90px] border-b border-r border-border p-1.5 transition-colors ${
              cell.currentMonth
                ? "cursor-pointer hover:bg-accent/40"
                : "bg-muted/20 cursor-default"
            } ${cell.isSelected ? "bg-primary/5 ring-1 ring-inset ring-primary/30" : ""}`}
          >
            {/* Day number */}
            <div className="flex justify-end mb-1">
              <span className={`w-6 h-6 flex items-center justify-center text-xs font-medium rounded-full ${
                cell.isToday
                  ? "bg-primary text-white font-bold"
                  : cell.currentMonth
                    ? "text-foreground"
                    : "text-muted-foreground/40"
              }`}>
                {cell.day}
              </span>
            </div>

            {/* Meeting pills */}
            <div className="space-y-0.5">
              {cell.meetings.slice(0, 3).map((m) => (
                <div
                  key={m.id}
                  onClick={(e) => { e.stopPropagation(); onMeetingClick && onMeetingClick(m); }}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-white truncate cursor-pointer hover:opacity-80 transition-opacity ${
                    TYPE_COLORS[m.type] || TYPE_COLORS.other
                  } ${STATUS_OPACITY[m.status] || ""}`}
                  title={m.title}
                >
                  <span className="truncate">{m.title}</span>
                </div>
              ))}
              {cell.meetings.length > 3 && (
                <div className="text-[10px] text-muted-foreground pl-1">
                  +{cell.meetings.length - 3} more
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CalendarGrid;
