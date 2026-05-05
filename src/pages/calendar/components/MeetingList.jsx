import React from "react";
import Icon from "../../../components/AppIcon";

const TYPE_CONFIG = {
  meeting:  { color: "bg-blue-100 text-blue-700",   dot: "bg-blue-500",   icon: "Users"     },
  call:     { color: "bg-green-100 text-green-700",  dot: "bg-green-500",  icon: "Phone"     },
  demo:     { color: "bg-purple-100 text-purple-700",dot: "bg-purple-500", icon: "Monitor"   },
  followup: { color: "bg-orange-100 text-orange-700",dot: "bg-orange-500", icon: "RefreshCw" },
  other:    { color: "bg-gray-100 text-gray-600",    dot: "bg-gray-400",   icon: "Calendar"  },
};

const STATUS_CONFIG = {
  scheduled: { label: "Scheduled", color: "text-blue-600 bg-blue-50"    },
  completed: { label: "Done",      color: "text-green-600 bg-green-50"  },
  cancelled: { label: "Cancelled", color: "text-gray-500 bg-gray-50"    },
};

const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

const fmtDuration = (start, end) => {
  const mins = Math.round((new Date(end) - new Date(start)) / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};

const groupByDate = (meetings) => {
  const groups = {};
  meetings.forEach((m) => {
    const d  = new Date(m.start_time);
    const key= d.toDateString();
    if (!groups[key]) groups[key] = { label: fmtDate(m.start_time), items: [] };
    groups[key].items.push(m);
  });
  return Object.values(groups);
};

const MeetingList = ({ meetings, onMeetingClick, emptyMessage = "No meetings" }) => {
  if (!meetings.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Icon name="CalendarX" size={36} className="text-gray-200 mb-3" />
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  const groups = groupByDate(meetings);

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.label}>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
            {group.label}
          </div>
          <div className="space-y-1.5">
            {group.items.map((m) => {
              const tc = TYPE_CONFIG[m.type] || TYPE_CONFIG.other;
              const sc = STATUS_CONFIG[m.status] || STATUS_CONFIG.scheduled;
              return (
                <div
                  key={m.id}
                  onClick={() => onMeetingClick && onMeetingClick(m)}
                  className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
                >
                  {/* Type dot */}
                  <div className={`mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0 ${tc.dot}`} />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm font-medium text-foreground ${m.status === "cancelled" ? "line-through text-muted-foreground" : ""}`}>
                        {m.title}
                      </p>
                      <span className={`flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${sc.color}`}>
                        {sc.label}
                      </span>
                    </div>

                    <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-1">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Icon name="Clock" size={10} />
                        {fmtTime(m.start_time)} · {fmtDuration(m.start_time, m.end_time)}
                      </span>
                      {(m.location || m.meeting_url) && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Icon name={m.meeting_url ? "Video" : "MapPin"} size={10} />
                          {m.location || "Video call"}
                        </span>
                      )}
                      {m.deal && (
                        <span className="text-xs text-blue-600 flex items-center gap-1">
                          <Icon name="Briefcase" size={10} />{m.deal.title}
                        </span>
                      )}
                      {m.contact && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Icon name="User" size={10} />
                          {m.contact.first_name} {m.contact.last_name}
                        </span>
                      )}
                    </div>

                    {/* Attendees */}
                    {(m.attendees || []).length > 0 && (
                      <div className="flex items-center gap-1 mt-1.5">
                        {m.attendees.slice(0, 4).map((a) => (
                          <div key={a.id}
                            className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[9px] font-bold text-primary"
                            title={a.user?.full_name || a.name || a.email}
                          >
                            {(a.user?.full_name || a.name || "?")[0]?.toUpperCase()}
                          </div>
                        ))}
                        {m.attendees.length > 4 && (
                          <span className="text-[10px] text-muted-foreground">+{m.attendees.length - 4}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Type badge */}
                  <span className={`flex-shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${tc.color}`}>
                    {m.type}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default MeetingList;
