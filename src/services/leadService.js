import { supabase } from '../lib/supabase';

const TITLE_MAP = {
  steel: [
    'procurement manager', 'supply chain manager', 'project manager',
    'construction manager', 'purchasing director', 'CEO', 'general manager',
  ],
  pvc: [
    'procurement manager', 'MEP manager', 'plumbing contractor',
    'facilities manager', 'operations manager', 'CEO', 'purchasing manager',
  ],
  trading: [
    'import manager', 'trading manager', 'procurement director',
    'CEO', 'commercial manager',
  ],
};

const REGION_MAP = {
  riyadh:   'Riyadh, Saudi Arabia',
  jeddah:   'Jeddah, Saudi Arabia',
  dammam:   'Dammam, Saudi Arabia',
  khobar:   'Al Khobar, Saudi Arabia',
  makkah:   'Mecca, Saudi Arabia',
  madinah:  'Medina, Saudi Arabia',
  dubai:    'Dubai, United Arab Emirates',
  abudhabi: 'Abu Dhabi, United Arab Emirates',
  kuwait:   'Kuwait City, Kuwait',
  bahrain:  'Manama, Bahrain',
  qatar:    'Doha, Qatar',
};

const TRACKED_FIELDS = [
  'first_name', 'last_name', 'email', 'phone', 'title',
  'company_name', 'company_website', 'industry', 'city',
  'country', 'region', 'status', 'assigned_to', 'notes',
  'lead_score', 'product_interest', 'creation_date',
  'source', 'last_contacted_at',
];

const FIELD_LABELS = {
  first_name:        'First name',
  last_name:         'Last name',
  email:             'Email',
  phone:             'Phone',
  title:             'Job title',
  company_name:      'Company',
  company_website:   'Website',
  industry:          'Industry',
  city:              'City',
  country:           'Country',
  region:            'Region',
  status:            'Stage',
  assigned_to:       'Assigned to',
  notes:             'Notes',
  lead_score:        'Lead score',
  product_interest:  'Product interest',
  creation_date:     'Creation date',
  source:            'Source',
  last_contacted_at: 'Last contacted',
  converted_at:      'Converted date',
};

export function getFieldLabel(field) {
  return FIELD_LABELS[field] || field;
}

const normalize = (v) => {
  if (v == null) return '';
  if (Array.isArray(v)) return JSON.stringify([...v].sort());
  return String(v);
};

async function recordHistory(leadId, companyId, userId, changes, changeType = 'update') {
  const rows = Object.entries(changes)
    .filter(([, vals]) => normalize(vals.old) !== normalize(vals.new))
    .map(([field, vals]) => ({
      lead_id:     leadId,
      company_id:  companyId,
      changed_by:  userId,
      field_name:  field,
      old_value:   vals.old != null
        ? (Array.isArray(vals.old) ? JSON.stringify(vals.old) : String(vals.old))
        : null,
      new_value:   vals.new != null
        ? (Array.isArray(vals.new) ? JSON.stringify(vals.new) : String(vals.new))
        : null,
      change_type: changeType,
    }));

  if (rows.length === 0) return;
  await supabase.from('lead_history').insert(rows);
}

export const leadService = {
  async getLeads(companyId, filters = {}, userId = null, role = null) {
    let query = supabase
      .from('leads')
      .select(`
        *,
        assigned_user:users!assigned_to(id, full_name),
        assigner:users!assigned_by(id, full_name)
      `)
      .eq('company_id', companyId);

    if (role === 'salesman') {
      query = query.eq('assigned_to', userId);
    } else if (role === 'supervisor') {
      const { data: reports } = await supabase
        .from('users')
        .select('id')
        .eq('supervisor_id', userId)
        .eq('is_active', true);
      const ids = [userId, ...(reports || []).map((u) => u.id)];
      query = query.in('assigned_to', ids);
    }

    if (filters.status)           query = query.eq('status', filters.status);
    if (filters.region)           query = query.eq('region', filters.region);
    if (filters.source)           query = query.eq('source', filters.source);
    if (filters.assigned_to)      query = query.eq('assigned_to', filters.assigned_to);
    if (filters.product_interest) query = query.contains('product_interest', [filters.product_interest]);
    if (filters.search) {
      const s = `%${filters.search}%`;
      query = query.or(
        `first_name.ilike.${s},last_name.ilike.${s},company_name.ilike.${s}`
      );
    }

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;
    return { data: data || [], error };
  },

  async searchApollo({ region, product, industry, companyId }) {
    const titles       = TITLE_MAP[product] || TITLE_MAP.steel;
    const mappedRegion = REGION_MAP[region]  || region;

    const { data, error } = await supabase.functions.invoke('apollo-search', {
      body: { region: mappedRegion, titles, industry: industry || undefined, page: 1 },
    });

    if (error) return { results: [], total: 0, error };
    if (data?.error) return { results: [], total: 0, error: new Error(data.error) };
    return { results: data?.results || [], total: data?.total || 0, error: null };
  },

  async importLeads(leads, companyId, userId) {
    let imported = 0;
    let duplicates = 0;
    let errors = 0;

    for (const lead of leads) {
      if (lead.apollo_id) {
        const { data: existing } = await supabase
          .from('leads')
          .select('id')
          .eq('apollo_id', lead.apollo_id)
          .maybeSingle();
        if (existing) { duplicates++; continue; }
      }

      if (lead.email) {
        const { data: existing } = await supabase
          .from('leads')
          .select('id')
          .eq('company_id', companyId)
          .eq('email', lead.email)
          .maybeSingle();
        if (existing) { duplicates++; continue; }
      }

      let assignedTo = userId;
      if (lead.region) {
        const owner = await this.getTerritoryOwner(lead.region, companyId);
        if (owner) assignedTo = owner;
      }

      const today = new Date().toISOString().split('T')[0];

      const { data: inserted, error: insertErr } = await supabase
        .from('leads')
        .insert({
          company_id:      companyId,
          assigned_to:     assignedTo,
          assigned_by:     userId,
          first_name:      lead.first_name      || '',
          last_name:       lead.last_name       || '',
          email:           lead.email           || null,
          phone:           lead.phone           || null,
          title:           lead.title           || null,
          linkedin_url:    lead.linkedin_url    || null,
          company_name:    lead.company_name    || null,
          company_website: lead.company_website || null,
          company_size:    lead.company_size    || null,
          industry:        lead.industry        || null,
          city:            lead.city            || null,
          country:         lead.country         || 'Saudi Arabia',
          source:          'apollo',
          status:          'new',
          apollo_id:       lead.apollo_id       || null,
          apollo_data:     lead.apollo_data     || null,
          creation_date:   today,
          stage_dates:     { new: today },
        })
        .select()
        .single();

      if (insertErr) { errors++; continue; }

      imported++;

      // Record creation history
      recordHistory(inserted.id, companyId, userId, {
        first_name:   { old: null, new: lead.first_name || null },
        last_name:    { old: null, new: lead.last_name  || null },
        email:        { old: null, new: lead.email      || null },
        company_name: { old: null, new: lead.company_name || null },
        status:       { old: null, new: 'new' },
        source:       { old: null, new: 'apollo' },
        region:       { old: null, new: lead.region     || null },
        assigned_to:  { old: null, new: assignedTo },
        creation_date:{ old: null, new: today },
      }, 'create').catch(() => {});

      if (assignedTo && inserted) {
        supabase.from('notifications').insert({
          user_id:    assignedTo,
          company_id: companyId,
          type:       'lead_assigned',
          title:      'New lead assigned',
          message:    `${lead.first_name} ${lead.last_name}${lead.company_name ? ' from ' + lead.company_name : ''}`,
          data:       { lead_id: inserted.id, company_name: lead.company_name, assigned_by: userId },
          is_read:    false,
        }).then(() => {}).catch(() => {});
      }
    }

    return { imported, duplicates, errors };
  },

  async updateLead(leadId, updates, userId) {
    // Fetch current state for stage_dates merge + history tracking
    const { data: before } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    // Auto-record stage entry date (first time only)
    let mergedUpdates = { ...updates };
    if (updates.status && before) {
      const today = new Date().toISOString().split('T')[0];
      const currentStageDates = before.stage_dates || {};
      if (!currentStageDates[updates.status]) {
        mergedUpdates.stage_dates = { ...currentStageDates, [updates.status]: today };
      }
    }

    const { data, error } = await supabase
      .from('leads')
      .update({ ...mergedUpdates, updated_at: new Date().toISOString() })
      .eq('id', leadId)
      .select(`
        *,
        assigned_user:users!assigned_to(id, full_name),
        assigner:users!assigned_by(id, full_name)
      `)
      .single();

    // Record field-level history
    if (!error && data && userId && before) {
      const changes = {};
      TRACKED_FIELDS.forEach((field) => {
        if (updates[field] !== undefined) {
          const oldVal = before[field];
          const newVal = updates[field];
          if (normalize(oldVal) !== normalize(newVal)) {
            changes[field] = { old: oldVal, new: newVal };
          }
        }
      });

      if (Object.keys(changes).length > 0) {
        let changeType = 'update';
        if (changes.status)      changeType = 'stage_change';
        else if (changes.assigned_to) changeType = 'assignment';
        recordHistory(leadId, before.company_id, userId, changes, changeType).catch(() => {});
      }
    }

    return { data, error };
  },

  async deleteLead(leadId) {
    const { error } = await supabase.from('leads').delete().eq('id', leadId);
    return { error };
  },

  async deleteLeads(leadIds) {
    const { error } = await supabase.from('leads').delete().in('id', leadIds);
    return { error };
  },

  async createLead(leadData, userId) {
    const today = new Date().toISOString().split('T')[0];
    const insertData = {
      ...leadData,
      creation_date: leadData.creation_date || today,
      stage_dates:   { new: today },
      updated_at:    new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('leads')
      .insert(insertData)
      .select(`
        *,
        assigned_user:users!assigned_to(id, full_name),
        assigner:users!assigned_by(id, full_name)
      `)
      .single();

    if (!error && data && userId) {
      const histFields = [
        'first_name', 'last_name', 'email', 'phone', 'company_name',
        'status', 'assigned_to', 'creation_date', 'region', 'source',
      ];
      const changes = {};
      histFields.forEach((f) => {
        const val = insertData[f];
        if (val != null && val !== '') {
          changes[f] = { old: null, new: val };
        }
      });
      recordHistory(data.id, data.company_id, userId, changes, 'create').catch(() => {});
    }

    return { data, error };
  },

  async convertLeadToContact(leadId, userId) {
    const { data: lead, error: fetchErr } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (fetchErr) return { contact: null, error: fetchErr };
    if (lead.status === 'converted') {
      return { contact: null, error: new Error('Lead is already converted') };
    }

    const { data: contact, error: contactErr } = await supabase
      .from('contacts')
      .insert({
        first_name:   lead.first_name   || '',
        last_name:    lead.last_name    || '',
        email:        lead.email        || null,
        phone:        lead.phone        || null,
        company_name: lead.company_name || null,
        status:       'active',
        lead_source:  'apollo',
        owner_id:     userId,
      })
      .select()
      .single();

    if (contactErr) return { contact: null, error: contactErr };

    const convertedAt = new Date().toISOString();
    const today = new Date().toISOString().split('T')[0];

    // Update stage_dates for converted stage
    const currentStageDates = lead.stage_dates || {};
    const newStageDates = currentStageDates.converted
      ? currentStageDates
      : { ...currentStageDates, converted: today };

    await supabase
      .from('leads')
      .update({
        status:       'converted',
        converted_at: convertedAt,
        converted_to: contact.id,
        converted_by: userId,
        stage_dates:  newStageDates,
        updated_at:   convertedAt,
      })
      .eq('id', leadId);

    // Record history
    recordHistory(leadId, lead.company_id, userId, {
      status:       { old: lead.status, new: 'converted' },
      converted_at: { old: null,        new: convertedAt },
    }, 'stage_change').catch(() => {});

    return { contact, error: null };
  },

  async getLeadStats(companyId) {
    const { data, error } = await supabase
      .from('leads')
      .select('status')
      .eq('company_id', companyId);

    if (error) return { data: null, error };

    const counts = { new: 0, contacted: 0, qualified: 0, unqualified: 0, converted: 0, total: 0 };
    (data || []).forEach((r) => {
      if (r.status in counts) counts[r.status]++;
      counts.total++;
    });

    return { data: counts, error: null };
  },

  async getTerritoryOwner(region, companyId) {
    const { data } = await supabase
      .from('territory_assignments')
      .select('user_id')
      .eq('company_id', companyId)
      .contains('regions', [region])
      .maybeSingle();
    return data?.user_id || null;
  },

  async getLeadHistory(leadId) {
    const { data, error } = await supabase
      .from('lead_history')
      .select('*, changed_by_user:users!lead_history_changed_by_fkey(full_name, role)')
      .eq('lead_id', leadId)
      .order('changed_at', { ascending: false });

    if (error) return { data: [], error };

    const formatted = (data || []).map((row) => ({
      id:              row.id,
      changed_at:      row.changed_at,
      change_type:     row.change_type,
      field_name:      row.field_name,
      old_value:       row.old_value,
      new_value:       row.new_value,
      changed_by_name: row.changed_by_user?.full_name || 'System',
      label:           getFieldLabel(row.field_name),
    }));

    return { data: formatted, error: null };
  },

  async getHistoryCounts(leadIds) {
    if (!leadIds || leadIds.length === 0) return {};
    const { data } = await supabase
      .from('lead_history')
      .select('lead_id')
      .in('lead_id', leadIds);

    const counts = {};
    (data || []).forEach((row) => {
      counts[row.lead_id] = (counts[row.lead_id] || 0) + 1;
    });
    return counts;
  },
};
