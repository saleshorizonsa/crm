import React, { useState, useEffect } from "react";
import Icon from "../../../components/AppIcon";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";

const TYPES = [
  { value: "meeting",  label: "Meeting",    icon: "Users"      },
  { value: "call",     label: "Call",       icon: "Phone"      },
  { value: "demo",     label: "Demo",       icon: "Monitor"    },
  { value: "followup", label: "Follow-up",  icon: "RefreshCw"  },
  { value: "other",    label: "Other",      icon: "Calendar"   },
];

const REMINDERS = [
  { value: 0,   label: "No reminder"    },
  { value: 5,   label: "5 min before"   },
  { value: 15,  label: "15 min before"  },
  { value: 30,  label: "30 min before"  },
  { value: 60,  label: "1 hour before"  },
  { value: 1440,label: "1 day before"   },
];

const selClass =
  "w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary";

const toLocalDatetime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const addHours = (datetimeLocal, hours) => {
  if (!datetimeLocal) return "";
  const d = new Date(datetimeLocal);
  d.setHours(d.getHours() + hours);
  return toLocalDatetime(d.toISOString());
};

const EMPTY = {
  title:            "",
  type:             "meeting",
  start_time:       "",
  end_time:         "",
  location:         "",
  meeting_url:      "",
  deal_id:          "",
  contact_id:       "",
  reminder_minutes: 15,
  notes:            "",
  sync_google:      false,
};

const MeetingModal = ({
  meeting,
  isOpen,
  onSave,
  onDelete,
  onClose,
  deals        = [],
  contacts     = [],
  users        = [],
  googleConnected = false,
  prefillDealId   = null,
  prefillContactId = null,
  prefillDate     = null,
}) => {
  const [form,       setForm]       = useState(EMPTY);
  const [attendeeIds,setAttendeeIds]= useState([]);
  const [isSaving,   setIsSaving]   = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error,      setError]      = useState("");
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (meeting) {
      const start = toLocalDatetime(meeting.start_time);
      const end   = toLocalDatetime(meeting.end_time);
      setForm({
        title:            meeting.title            || "",
        type:             meeting.type             || "meeting",
        start_time:       start,
        end_time:         end,
        location:         meeting.location         || "",
        meeting_url:      meeting.meeting_url      || "",
        deal_id:          meeting.deal_id          || "",
        contact_id:       meeting.contact_id       || "",
        reminder_minutes: meeting.reminder_minutes ?? 15,
        notes:            meeting.notes            || "",
        sync_google:      !!meeting.google_event_id,
      });
      setAttendeeIds((meeting.attendees || []).map((a) => a.user_id).filter(Boolean));
    } else {
      // Default start: next full hour
      const now = new Date();
      now.setMinutes(0, 0, 0);
      now.setHours(now.getHours() + 1);
      const startLocal = prefillDate
        ? `${prefillDate}T${String(now.getHours()).padStart(2,"0")}:00`
        : toLocalDatetime(now.toISOString());
      setForm({
        ...EMPTY,
        start_time: startLocal,
        end_time:   addHours(startLocal, 1),
        deal_id:    prefillDealId    || "",
        contact_id: prefillContactId || "",
      });
      setAttendeeIds([]);
    }
    setError("");
    setConfirmDel(false);
  }, [meeting, isOpen, prefillDealId, prefillContactId, prefillDate]);

  if (!isOpen) return null;

  const set = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  const handleStartChange = (val) => {
    set("start_time", val);
    set("end_time",   addHours(val, 1));
  };

  const toggleAttendee = (uid) => {
    setAttendeeIds((prev) =>
      prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]
    );
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.title.trim()) { setError("Title is required."); return; }
    if (!form.start_time)   { setError("Start time is required."); return; }
    if (!form.end_time)     { setError("End time is required."); return; }
    if (new Date(form.end_time) <= new Date(form.start_time)) {
      setError("End time must be after start time.");
      return;
    }
    setIsSaving(true);
    try {
      await onSave(
        {
          ...form,
          start_time:  new Date(form.start_time).toISOString(),
          end_time:    new Date(form.end_time).toISOString(),
          deal_id:     form.deal_id    || null,
          contact_id:  form.contact_id || null,
          id:          meeting?.id,
        },
        attendeeIds
      );
    } catch (err) {
      setError(err.message || "Failed to save.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDel) { setConfirmDel(true); return; }
    setIsDeleting(true);
    try { await onDelete(meeting.id); }
    finally { setIsDeleting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">
            {meeting ? "Edit Meeting" : "Schedule Meeting"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-md">
            <Icon name="X" size={18} />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 overflow-y-auto">
          <div className="px-6 py-5 space-y-4">

            {/* Title */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Title <span className="text-red-500">*</span>
              </label>
              <Input
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="e.g. Product demo with Acme Corp"
                autoFocus
              />
            </div>

            {/* Type chips */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">Type</label>
              <div className="flex flex-wrap gap-2">
                {TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => set("type", t.value)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      form.type === t.value
                        ? "bg-primary text-white border-primary"
                        : "bg-white text-gray-600 border-gray-200 hover:border-primary hover:text-primary"
                    }`}
                  >
                    <Icon name={t.icon} size={11} />{t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Date / Time */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Start <span className="text-red-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  value={form.start_time}
                  onChange={(e) => handleStartChange(e.target.value)}
                  className={selClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  End <span className="text-red-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  value={form.end_time}
                  onChange={(e) => set("end_time", e.target.value)}
                  className={selClass}
                />
              </div>
            </div>

            {/* Location + URL */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Location</label>
                <Input
                  value={form.location}
                  onChange={(e) => set("location", e.target.value)}
                  placeholder="Office / address"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Video link</label>
                <Input
                  value={form.meeting_url}
                  onChange={(e) => set("meeting_url", e.target.value)}
                  placeholder="https://meet.google.com/…"
                />
              </div>
            </div>

            {/* Deal + Contact */}
            <div className="grid grid-cols-2 gap-3">
              {deals.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Linked deal</label>
                  <select value={form.deal_id} onChange={(e) => set("deal_id", e.target.value)} className={selClass}>
                    <option value="">— None —</option>
                    {deals.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                  </select>
                </div>
              )}
              {contacts.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Linked contact</label>
                  <select value={form.contact_id} onChange={(e) => set("contact_id", e.target.value)} className={selClass}>
                    <option value="">— None —</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Attendees */}
            {users.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">Attendees</label>
                <div className="flex flex-wrap gap-2 p-3 border border-border rounded-md bg-background min-h-[42px]">
                  {users.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleAttendee(u.id)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                        attendeeIds.includes(u.id)
                          ? "bg-primary/10 text-primary border-primary/30"
                          : "bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-bold ${
                        attendeeIds.includes(u.id) ? "bg-primary text-white" : "bg-gray-300 text-gray-500"
                      }`}>
                        {u.full_name?.[0]?.toUpperCase()}
                      </div>
                      {u.full_name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Reminder */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Reminder</label>
                <select
                  value={form.reminder_minutes}
                  onChange={(e) => set("reminder_minutes", parseInt(e.target.value))}
                  className={selClass}
                >
                  {REMINDERS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              {/* Google sync toggle */}
              {googleConnected && (
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <button
                      type="button"
                      onClick={() => set("sync_google", !form.sync_google)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        form.sync_google ? "bg-primary" : "bg-gray-300"
                      }`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                        form.sync_google ? "translate-x-[18px]" : "translate-x-[2px]"
                      }`} />
                    </button>
                    <span className="text-xs font-medium text-gray-700 flex items-center gap-1">
                      <Icon name="Calendar" size={12} className="text-blue-500" />
                      Sync to Google Calendar
                    </span>
                  </label>
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                className={`${selClass} resize-none`}
                placeholder="Agenda, talking points…"
              />
            </div>

            {error && (
              <p className="text-xs text-red-600 flex items-center gap-1.5">
                <Icon name="AlertCircle" size={12} />{error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              {meeting && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className={`gap-1.5 ${confirmDel ? "text-red-600 bg-red-50" : "text-gray-500"}`}
                  >
                    {isDeleting
                      ? <Icon name="Loader2" size={13} className="animate-spin" />
                      : <Icon name="Trash2" size={13} />}
                    {confirmDel ? "Confirm?" : "Delete"}
                  </Button>
                  {confirmDel && (
                    <button type="button" onClick={() => setConfirmDel(false)}
                      className="text-xs text-gray-400 hover:text-gray-600 underline">
                      Cancel
                    </button>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" type="button" onClick={onClose} size="sm">Cancel</Button>
              <Button type="submit" size="sm" disabled={isSaving} className="gap-1.5">
                {isSaving
                  ? <><Icon name="Loader2" size={13} className="animate-spin" />Saving…</>
                  : <><Icon name="CalendarCheck" size={13} />{meeting ? "Save" : "Schedule"}</>}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MeetingModal;
