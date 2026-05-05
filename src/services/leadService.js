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

    // Role scoping
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
    // manager / director / admin: all company leads

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
    return { results: data?.results || [], total: data?.total || 0, error: null };
  },

  async importLeads(leads, companyId, userId) {
    let imported = 0;
    let duplicates = 0;
    let errors = 0;

    for (const lead of leads) {
      // Duplicate check: apollo_id
      if (lead.apollo_id) {
        const { data: existing } = await supabase
          .from('leads')
          .select('id')
          .eq('apollo_id', lead.apollo_id)
          .maybeSingle();
        if (existing) { duplicates++; continue; }
      }

      // Duplicate check: email within same company
      if (lead.email) {
        const { data: existing } = await supabase
          .from('leads')
          .select('id')
          .eq('company_id', companyId)
          .eq('email', lead.email)
          .maybeSingle();
        if (existing) { duplicates++; continue; }
      }

      // Territory-based assignment
      let assignedTo = userId;
      if (lead.region) {
        const owner = await this.getTerritoryOwner(lead.region, companyId);
        if (owner) assignedTo = owner;
      }

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
        })
        .select()
        .single();

      if (insertErr) { errors++; continue; }

      imported++;

      // Notification for assigned user (best-effort)
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

  async updateLead(leadId, updates) {
    const { data, error } = await supabase
      .from('leads')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', leadId)
      .select(`
        *,
        assigned_user:users!assigned_to(id, full_name),
        assigner:users!assigned_by(id, full_name)
      `)
      .single();
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

  async createLead(leadData) {
    const { data, error } = await supabase
      .from('leads')
      .insert({ ...leadData, updated_at: new Date().toISOString() })
      .select(`
        *,
        assigned_user:users!assigned_to(id, full_name),
        assigner:users!assigned_by(id, full_name)
      `)
      .single();
    return { data, error };
  },

  async convertLeadToContact(leadId, userId) {
    // Fetch the lead
    const { data: lead, error: fetchErr } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (fetchErr) return { contact: null, error: fetchErr };
    if (lead.status === 'converted') {
      return { contact: null, error: new Error('Lead is already converted') };
    }

    // Insert into contacts
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

    // Mark lead as converted
    await supabase
      .from('leads')
      .update({
        status:       'converted',
        converted_at: new Date().toISOString(),
        converted_to: contact.id,
        converted_by: userId,
        updated_at:   new Date().toISOString(),
      })
      .eq('id', leadId);

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
};
