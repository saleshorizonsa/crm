import { supabase } from '../lib/supabase';

const MEETING_SELECT = `
  *,
  deal:deals!deal_id(id, title),
  contact:contacts!contact_id(id, first_name, last_name, company_name),
  creator:users!created_by(id, full_name),
  attendees:meeting_attendees(
    id, user_id, email, name, status,
    user:users!user_id(id, full_name)
  )
`;

export const meetingService = {
  async getMeetings(companyId, filters = {}) {
    let query = supabase
      .from('meetings')
      .select(MEETING_SELECT)
      .eq('company_id', companyId);

    if (filters.status)     query = query.eq('status', filters.status);
    if (filters.type)       query = query.eq('type', filters.type);
    if (filters.created_by) query = query.eq('created_by', filters.created_by);
    if (filters.deal_id)    query = query.eq('deal_id', filters.deal_id);
    if (filters.contact_id) query = query.eq('contact_id', filters.contact_id);
    if (filters.from)       query = query.gte('start_time', filters.from);
    if (filters.to)         query = query.lte('start_time', filters.to);

    query = query.order('start_time', { ascending: true });

    const { data, error } = await query;
    return { data: data || [], error };
  },

  async createMeeting(meetingData, attendeeIds = []) {
    const { data: meeting, error } = await supabase
      .from('meetings')
      .insert({ ...meetingData, updated_at: new Date().toISOString() })
      .select(MEETING_SELECT)
      .single();

    if (error) return { data: null, error };

    if (attendeeIds.length > 0) {
      await supabase.from('meeting_attendees').insert(
        attendeeIds.map((id) => ({
          meeting_id: meeting.id,
          user_id:    id,
          status:     'invited',
        }))
      );
    }

    await this._createReminderNotification(meeting);
    return { data: meeting, error: null };
  },

  async updateMeeting(meetingId, updates, attendeeIds = null) {
    const { data: meeting, error } = await supabase
      .from('meetings')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', meetingId)
      .select(MEETING_SELECT)
      .single();

    if (error) return { data: null, error };

    if (attendeeIds !== null) {
      await supabase.from('meeting_attendees').delete().eq('meeting_id', meetingId);
      if (attendeeIds.length > 0) {
        await supabase.from('meeting_attendees').insert(
          attendeeIds.map((id) => ({
            meeting_id: meetingId,
            user_id:    id,
            status:     'invited',
          }))
        );
      }
    }

    return { data: meeting, error: null };
  },

  async deleteMeeting(meetingId) {
    const { error } = await supabase.from('meetings').delete().eq('id', meetingId);
    return { error };
  },

  async getMeetingStats(companyId) {
    const now       = new Date();
    const todayStr  = now.toISOString().split('T')[0];
    const todayStart = `${todayStr}T00:00:00.000Z`;
    const todayEnd   = `${todayStr}T23:59:59.999Z`;
    const weekEnd    = new Date(now.getTime() + 7 * 86400000).toISOString();

    const { data } = await supabase
      .from('meetings')
      .select('start_time, status')
      .eq('company_id', companyId)
      .neq('status', 'cancelled');

    const all = data || [];
    return {
      today:    all.filter((m) => m.start_time >= todayStart && m.start_time <= todayEnd).length,
      upcoming: all.filter((m) => m.start_time >= todayStart && m.start_time <= weekEnd).length,
      total:    all.filter((m) => m.status === 'scheduled').length,
      completed:all.filter((m) => m.status === 'completed').length,
    };
  },

  // ── Calendar OAuth ──────────────────────────────────────────────────────────

  async getCalendarConnection(userId) {
    const { data, error } = await supabase
      .from('calendar_connections')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    return { data, error };
  },

  async disconnectCalendar(userId) {
    const { error } = await supabase
      .from('calendar_connections')
      .delete()
      .eq('user_id', userId);
    return { error };
  },

  getGoogleAuthUrl(redirectUri) {
    const clientId  = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) return null;
    const params = new URLSearchParams({
      client_id:     clientId,
      redirect_uri:  redirectUri,
      response_type: 'code',
      scope:         'https://www.googleapis.com/auth/calendar.events',
      access_type:   'offline',
      prompt:        'consent',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  },

  async connectGoogleCalendar(code, redirectUri, userId) {
    const { data, error } = await supabase.functions.invoke('google-calendar-auth', {
      body: { code, redirect_uri: redirectUri, user_id: userId },
    });
    if (error) return { error };
    if (data?.error) return { error: new Error(data.error) };
    return { data, error: null };
  },

  getMicrosoftAuthUrl(redirectUri) {
    const clientId = import.meta.env.VITE_MICROSOFT_CLIENT_ID;
    if (!clientId) return null;
    const params = new URLSearchParams({
      client_id:     clientId,
      redirect_uri:  redirectUri,
      response_type: 'code',
      scope:         'Calendars.ReadWrite offline_access',
      response_mode: 'query',
    });
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
  },

  // ── Google Calendar sync ────────────────────────────────────────────────────

  async syncToGoogle(meetingId, userId) {
    const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
      body: { action: 'upsert', meeting_id: meetingId, user_id: userId },
    });
    if (error) return { error };
    if (data?.error) return { error: new Error(data.error) };
    return { data, error: null };
  },

  async deleteFromGoogle(meetingId, userId) {
    const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
      body: { action: 'delete', meeting_id: meetingId, user_id: userId },
    });
    if (error) return { error };
    if (data?.error) return { error: new Error(data.error) };
    return { data, error: null };
  },

  // ── Reminders ───────────────────────────────────────────────────────────────

  async _createReminderNotification(meeting) {
    if (!meeting.created_by || !meeting.company_id) return;
    const start = new Date(meeting.start_time);
    const now   = new Date();
    if (start < now) return; // past meeting

    await supabase.from('notifications').insert({
      user_id:    meeting.created_by,
      company_id: meeting.company_id,
      type:       'meeting_reminder',
      title:      `Meeting scheduled: ${meeting.title}`,
      message:    `${start.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })} at ${start.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}`,
      data:       { meeting_id: meeting.id },
      is_read:    false,
    }).catch(() => {});
  },
};
