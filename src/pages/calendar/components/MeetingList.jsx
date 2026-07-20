import React from "react";
import Icon from "../../../components/AppIcon";

// Icon + colour per event type (meetings and logged deal activities)
const TYPE_CONFIG = {
  meeting:  { color: "bg-blue-100 text-blue-700",     dot: "bg-blue-500",    icon: "Users"         },
  call:     { color: "bg-green-100 text-green-700",   dot: "bg-green-500",   icon: "Phone"         },
  visit:    { color: "bg-amber-100 text-amber-700",   dot: "bg-amber-500",   icon: "MapPin"        },
  whatsapp: { color: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500", icon: "MessageCircle" },
  email:    { color: "bg-indigo-100 text-indigo-700", dot: "bg-indigo-500",  icon: "Mail"          },
  demo:     { color: "bg-purple-100 text-purple-700", dot: "bg-purple-500",  icon: "Monitor"       },
  followup: { color: "bg-orange-100 text-orange-700", dot: "bg-orange-500",  icon: "RefreshCw"     },
  note:     { color: "bg-slate-100 text-slate-600",   dot: "bg-slate-400",   icon: "FileText"      },
  other:    { color: "bg-gray-100 text-gray-600",     dot: "bg-gray-400",    icon: "Calendar"      },
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
  if (!end) return null;
  const mins = Math.round((new Date(end) - new Date(start)) / 60000);
  if (mins <= 0) return null;
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};

// Backward compatible: accept a normalised `events` list, or fall back to raw
// `meetings` (shaped into events).
const toEvents = (events, meetings) => {
  if (events) return events;
  return (meetings || []).map((m) => ({
    id: `meeting-${m.id}`,
    kind: "meeting",
    type: m.type || "meeting",
    title: m.title,
    date: m.start_time,
    endDate: m.end_time || null,
    status: m.status,
    deal: m.deal,
    contact: m.contact,
    attendees: m.attendees,
    location: m.location,
    meetingUrl: m.meeting_url,
    raw: m,
  }));
};

const groupByDate = (events) => {
  const groups = {};
  events.forEach((ev) => {
    const key = new Date(ev.date).toDateString();
    if (!groups[key]) groups[key] = { label: fmtDate(ev.date), items: [] };
    groups[key].items.push(ev);
  });
  return Object.values(groups);
};

const MeetingList = ({ events, meetings, onEventClick, onMeetingClick, emptyMessage = "No events" }) => {
  const calEvents = toEvents(events, meetings);
  const handleClick = onEventClick || ((ev) => onMeetingClick && onMeetingClick(ev.raw));

  if (!calEvents.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Icon name="CalendarX" size={36} className="text-gray-200 mb-3" />
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  const groups = groupByDate(calEvents);

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.label}>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
            {group.label}
          </div>
          <div className="space-y-1.5">
            {group.items.map((ev) => {
              const tc = TYPE_CONFIG[ev.type] || TYPE_CONFIG.other;
              const isMeeting = ev.kind === "meeting";
              const sc = STATUS_CONFIG[ev.status] || null;
              const duration = fmtDuration(ev.date, ev.endDate);
              return (
                <div
                  key={ev.id}
                  onClick={() => handleClick(ev)}
                  className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
                >
                  {/* Type icon */}
                  <div className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${tc.color}`}>
                    <Icon name={tc.icon} size={14} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm font-medium text-foreground ${ev.status === "cancelled" ? "line-through text-muted-foreground" : ""}`}>
                        {ev.title}
                      </p>
                      {isMeeting && sc && (
                        <span className={`flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${sc.color}`}>
                          {sc.label}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-1">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Icon name="Clock" size={10} />
                        {fmtTime(ev.date)}{duration ? ` · ${duration}` : ""}
                      </span>
                      {isMeeting && (ev.location || ev.meetingUrl) && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Icon name={ev.meetingUrl ? "Video" : "MapPin"} size={10} />
                          {ev.location || "Video call"}
                        </span>
                      )}
                      {ev.deal && (
                        <span className="text-xs text-blue-600 flex items-center gap-1">
                          <Icon name="Briefcase" size={10} />{ev.deal.title}
                        </span>
                      )}
                      {ev.contact && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Icon name="User" size={10} />
                          {ev.contact.first_name} {ev.contact.last_name}
                        </span>
                      )}
                    </div>

                    {/* Attendees (meetings only) */}
                    {isMeeting && (ev.attendees || []).length > 0 && (
                      <div className="flex items-center gap-1 mt-1.5">
                        {ev.attendees.slice(0, 4).map((a) => (
                          <div key={a.id}
                            className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[9px] font-bold text-primary"
                            title={a.user?.full_name || a.name || a.email}
                          >
                            {(a.user?.full_name || a.name || "?")[0]?.toUpperCase()}
                          </div>
                        ))}
                        {ev.attendees.length > 4 && (
                          <span className="text-[10px] text-muted-foreground">+{ev.attendees.length - 4}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Type badge */}
                  <span className={`flex-shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${tc.color}`}>
                    {ev.type}
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
