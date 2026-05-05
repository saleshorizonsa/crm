import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation } from "react-router-dom";
import Icon from "../../components/AppIcon";
import Button from "../../components/ui/Button";
import Header from "../../components/ui/Header";
import NavigationBreadcrumbs from "../../components/ui/NavigationBreadcrumbs";
import CalendarGrid from "./components/CalendarGrid";
import MeetingList from "./components/MeetingList";
import MeetingModal from "./components/MeetingModal";
import { useAuth } from "../../contexts/AuthContext";
import { meetingService } from "../../services/meetingService";
import { supabase } from "../../lib/supabase";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const CalendarPage = () => {
  const { user, userProfile, company } = useAuth();
  const location = useLocation();

  // ── State ──────────────────────────────────────────────────────────────────
  const [currentDate,  setCurrentDate]  = useState(new Date());
  const [meetings,     setMeetings]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [stats,        setStats]        = useState({ today: 0, upcoming: 0, total: 0, completed: 0 });
  const [view,         setView]         = useState("month"); // month | list
  const [selectedDate, setSelectedDate] = useState(null);
  const [showModal,    setShowModal]    = useState(false);
  const [editMeeting,  setEditMeeting]  = useState(null);
  const [prefillDealId,     setPrefillDealId]     = useState(null);
  const [prefillContactId,  setPrefillContactId]  = useState(null);
  const [googleConnected,   setGoogleConnected]   = useState(false);
  const [companyUsers,      setCompanyUsers]       = useState([]);
  const [deals,             setDeals]              = useState([]);
  const [contacts,          setContacts]           = useState([]);
  const [statusFilter,      setStatusFilter]       = useState("scheduled");

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadMeetings = useCallback(async () => {
    if (!company?.id) return;
    setLoading(true);
    const year  = currentDate.getFullYear();
    const month = currentDate.getMonth();
    // Fetch ±1 month buffer
    const from = new Date(year, month - 1, 1).toISOString();
    const to   = new Date(year, month + 2, 0).toISOString();
    const { data } = await meetingService.getMeetings(company.id, { from, to });
    setMeetings(data || []);
    setLoading(false);
  }, [company?.id, currentDate]);

  const loadStats = useCallback(async () => {
    if (!company?.id) return;
    const { data } = await meetingService.getMeetingStats(company.id);
    if (data) setStats(data);
  }, [company?.id]);

  const loadSupportData = useCallback(async () => {
    if (!company?.id) return;
    const [usersRes, dealsRes, contactsRes, connRes] = await Promise.all([
      supabase.from("users").select("id, full_name").eq("company_id", company.id).eq("is_active", true).order("full_name"),
      supabase.from("deals").select("id, title").eq("company_id", company.id).neq("stage","lost").neq("stage","won").order("title"),
      supabase.from("contacts").select("id, first_name, last_name").eq("company_id", company.id).order("first_name"),
      meetingService.getCalendarConnection(user.id),
    ]);
    setCompanyUsers(usersRes.data || []);
    setDeals(dealsRes.data || []);
    setContacts(contactsRes.data || []);
    setGoogleConnected(!!connRes.data);
  }, [company?.id, user?.id]);

  useEffect(() => {
    if (user?.id && company?.id) {
      loadMeetings();
      loadStats();
      loadSupportData();
    }
  }, [user?.id, company?.id]);

  useEffect(() => { loadMeetings(); }, [currentDate]);

  // Handle OAuth callback from Google (?google_callback=true&code=xxx)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code   = params.get("code");
    const state  = params.get("state");
    if (code && state === "google_calendar") {
      const redirectUri = `${window.location.origin}/calendar`;
      meetingService.connectGoogleCalendar(code, redirectUri, user?.id)
        .then(({ error }) => {
          if (!error) setGoogleConnected(true);
          window.history.replaceState({}, "", "/calendar");
        });
    }
  }, [location.search]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const visibleMeetings = useMemo(() => {
    let list = meetings;
    if (statusFilter) list = list.filter((m) => m.status === statusFilter);
    if (selectedDate) {
      list = list.filter((m) => {
        const d = new Date(m.start_time);
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
        return key === selectedDate;
      });
    }
    return list;
  }, [meetings, statusFilter, selectedDate]);

  const upcomingMeetings = useMemo(() => {
    const now = new Date().toISOString();
    return meetings
      .filter((m) => m.start_time >= now && m.status === "scheduled")
      .slice(0, 20);
  }, [meetings]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handlePrevMonth = () =>
    setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));

  const handleNextMonth = () =>
    setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  const handleToday = () => {
    setCurrentDate(new Date());
    setSelectedDate(new Date().toISOString().split("T")[0]);
  };

  const handleDateSelect = (dateStr) => {
    setSelectedDate((prev) => prev === dateStr ? null : dateStr);
  };

  const handleNewMeeting = (dateStr = null) => {
    setEditMeeting(null);
    setPrefillDealId(null);
    setPrefillContactId(null);
    setSelectedDate(dateStr || null);
    setShowModal(true);
  };

  const handleMeetingClick = (m) => {
    setEditMeeting(m);
    setShowModal(true);
  };

  const handleSaveMeeting = async (data, attendeeIds) => {
    const { id, sync_google, ...payload } = data;
    payload.company_id  = company.id;
    payload.created_by  = user.id;

    let savedMeeting;
    if (id) {
      const { data: updated, error } = await meetingService.updateMeeting(id, payload, attendeeIds);
      if (error) throw error;
      savedMeeting = updated;
      setMeetings((prev) => prev.map((m) => m.id === updated.id ? updated : m));
    } else {
      const { data: created, error } = await meetingService.createMeeting(payload, attendeeIds);
      if (error) throw error;
      savedMeeting = created;
      setMeetings((prev) => [...prev, created]);
    }

    // Google sync
    if (sync_google && googleConnected && savedMeeting) {
      meetingService.syncToGoogle(savedMeeting.id, user.id).catch(() => {});
    }

    setShowModal(false);
    setEditMeeting(null);
    loadStats();
  };

  const handleDeleteMeeting = async (meetingId) => {
    const meeting = meetings.find((m) => m.id === meetingId);
    if (meeting?.google_event_id) {
      meetingService.deleteFromGoogle(meetingId, user.id).catch(() => {});
    }
    const { error } = await meetingService.deleteMeeting(meetingId);
    if (!error) {
      setMeetings((prev) => prev.filter((m) => m.id !== meetingId));
      setShowModal(false);
      setEditMeeting(null);
      loadStats();
    }
  };

  if (!user) return <div>Loading…</div>;

  const monthLabel = `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="p-6 space-y-5">
        {/* Page header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <NavigationBreadcrumbs
              items={[
                { label: "Dashboard", href: "/company-dashboard" },
                { label: "Calendar",  href: "/calendar" },
              ]}
            />
            <h1 className="text-2xl font-semibold text-gray-900 mt-1">Calendar</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Meetings and scheduling</p>
          </div>
          <Button onClick={() => handleNewMeeting()} className="gap-2 flex-shrink-0">
            <Icon name="Plus" size={15} />Schedule Meeting
          </Button>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Today",     value: stats.today,     icon: "CalendarCheck", color: "text-blue-600",   bg: "bg-blue-50"  },
            { label: "This week", value: stats.upcoming,  icon: "Clock",         color: "text-amber-600",  bg: "bg-amber-50" },
            { label: "Scheduled", value: stats.total,     icon: "Calendar",      color: "text-primary",    bg: "bg-primary/10"},
            { label: "Completed", value: stats.completed, icon: "CheckCircle2",  color: "text-green-600",  bg: "bg-green-50" },
          ].map(({ label, value, icon, color, bg }) => (
            <div key={label} className="bg-card border border-border rounded-lg p-4 flex items-center gap-3">
              <div className={`w-10 h-10 ${bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                <Icon name={icon} size={18} className={color} />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Month navigation */}
          <div className="flex items-center gap-2">
            <button onClick={handlePrevMonth}
              className="p-1.5 rounded-md hover:bg-accent border border-border text-muted-foreground hover:text-foreground transition-colors">
              <Icon name="ChevronLeft" size={16} />
            </button>
            <span className="text-base font-semibold text-foreground min-w-[160px] text-center">
              {monthLabel}
            </span>
            <button onClick={handleNextMonth}
              className="p-1.5 rounded-md hover:bg-accent border border-border text-muted-foreground hover:text-foreground transition-colors">
              <Icon name="ChevronRight" size={16} />
            </button>
            <Button variant="outline" size="sm" onClick={handleToday} className="ml-1">Today</Button>
          </div>

          {/* View + filter */}
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 border border-border rounded-md bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary h-9"
            >
              <option value="">All statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <div className="flex border border-border rounded-md overflow-hidden">
              {[
                { id: "month", icon: "LayoutGrid" },
                { id: "list",  icon: "List"       },
              ].map((v) => (
                <button
                  key={v.id}
                  onClick={() => setView(v.id)}
                  className={`px-3 py-1.5 transition-colors ${
                    view === v.id
                      ? "bg-primary text-white"
                      : "bg-background text-muted-foreground hover:bg-accent"
                  }`}
                >
                  <Icon name={v.icon} size={15} />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Selected date chip */}
        {selectedDate && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Showing: <strong>{new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric" })}</strong>
            </span>
            <button onClick={() => setSelectedDate(null)}
              className="text-xs text-primary underline">Clear</button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Icon name="Loader2" size={32} className="text-gray-300 animate-spin" />
          </div>
        ) : view === "month" ? (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            {/* Calendar grid — 2/3 width */}
            <div className="xl:col-span-2">
              <CalendarGrid
                meetings={statusFilter ? meetings.filter(m => m.status === statusFilter) : meetings}
                currentDate={currentDate}
                selectedDate={selectedDate}
                onDateSelect={handleDateSelect}
                onMeetingClick={handleMeetingClick}
              />
            </div>

            {/* Side panel — 1/3 width */}
            <div className="space-y-4">
              {/* Day meetings or upcoming */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">
                    {selectedDate ? "Day meetings" : "Upcoming"}
                  </h3>
                  {selectedDate && (
                    <button
                      onClick={() => handleNewMeeting(selectedDate)}
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <Icon name="Plus" size={11} />Add
                    </button>
                  )}
                </div>
                <div className="p-3 max-h-[450px] overflow-y-auto">
                  <MeetingList
                    meetings={selectedDate ? visibleMeetings : upcomingMeetings}
                    onMeetingClick={handleMeetingClick}
                    emptyMessage={selectedDate ? "No meetings on this day" : "No upcoming meetings"}
                  />
                </div>
              </div>

              {/* Legend */}
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs font-semibold text-muted-foreground mb-2.5 uppercase tracking-wider">Legend</p>
                <div className="space-y-1.5">
                  {[
                    { color: "bg-blue-500",   label: "Meeting"   },
                    { color: "bg-green-500",  label: "Call"      },
                    { color: "bg-purple-500", label: "Demo"      },
                    { color: "bg-orange-500", label: "Follow-up" },
                    { color: "bg-gray-400",   label: "Other"     },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                      <span className="text-xs text-muted-foreground">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* List view */
          <div className="bg-card border border-border rounded-xl p-5">
            <MeetingList
              meetings={selectedDate ? visibleMeetings : upcomingMeetings}
              onMeetingClick={handleMeetingClick}
              emptyMessage="No meetings match current filters"
            />
          </div>
        )}
      </main>

      {/* Meeting modal */}
      <MeetingModal
        meeting={editMeeting}
        isOpen={showModal}
        onSave={handleSaveMeeting}
        onDelete={handleDeleteMeeting}
        onClose={() => { setShowModal(false); setEditMeeting(null); }}
        deals={deals}
        contacts={contacts}
        users={companyUsers}
        googleConnected={googleConnected}
        prefillDealId={prefillDealId}
        prefillContactId={prefillContactId}
        prefillDate={selectedDate}
      />
    </div>
  );
};

export default CalendarPage;
