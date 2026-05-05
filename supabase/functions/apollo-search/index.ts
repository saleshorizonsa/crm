import { serve } from 'https://deno.land/std/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const {
      region,
      titles,
      industry,
      company_size,
      page     = 1,
      per_page = 25,
    } = await req.json();

    const APOLLO_KEY = Deno.env.get('APOLLO_API_KEY');
    if (!APOLLO_KEY) {
      return ok({ error: 'APOLLO_API_KEY secret is not set in this project.' });
    }

    // ── Step 1: Search people (no credits) ────────────────────────────────
    const searchBody: Record<string, unknown> = {
      person_locations: [region],
      person_titles:    titles,
      per_page,
      page,
    };
    if (industry)    searchBody.q_organization_industries = [industry];
    if (company_size) searchBody.organization_num_employees_ranges = [company_size];

    const searchRes = await fetch(
      'https://api.apollo.io/v1/mixed_people/search',
      {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Cache-Control': 'no-cache',
          'x-api-key':     APOLLO_KEY,
        },
        body: JSON.stringify(searchBody),
      }
    );

    const searchText = await searchRes.text();
    if (!searchRes.ok) {
      return ok({ error: `Apollo search error (${searchRes.status}): ${searchText}` });
    }

    const searchData = JSON.parse(searchText);
    const people: Record<string, unknown>[] = searchData.people || [];

    if (people.length === 0) {
      return ok({ results: [], total: searchData.pagination?.total_entries || 0 });
    }

    // ── Step 2: Bulk enrich — emails + phones (uses credits) ──────────────
    let matches: Record<string, unknown>[] = [];
    try {
      const enrichRes = await fetch(
        'https://api.apollo.io/v1/people/bulk_match',
        {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Cache-Control': 'no-cache',
            'x-api-key':     APOLLO_KEY,
          },
          body: JSON.stringify({
            details: people.map((p) => ({
              id:                p.id,
              first_name:        p.first_name,
              last_name:         p.last_name,
              organization_name: (p.organization as Record<string, unknown>)?.name,
            })),
            reveal_phone_number:    true,
            reveal_personal_emails: false,
          }),
        }
      );
      if (enrichRes.ok) {
        const enrichData = await enrichRes.json();
        matches = enrichData.matches || [];
      }
    } catch (_) {
      // enrichment is best-effort; fall back to search results
    }

    const source = matches.length > 0 ? matches : people;

    const results = source.map((m: Record<string, unknown>) => {
      const org          = m.organization as Record<string, unknown> | undefined;
      const phoneNumbers = m.phone_numbers as Array<Record<string, unknown>> | undefined;
      return {
        apollo_id:       m.id            || '',
        first_name:      m.first_name    || '',
        last_name:       m.last_name     || '',
        email:           m.email         || '',
        phone:           phoneNumbers?.[0]?.sanitized_number || '',
        title:           m.title         || '',
        linkedin_url:    m.linkedin_url  || '',
        company_name:    org?.name            || '',
        company_website: org?.website_url     || '',
        company_size:    String(org?.estimated_num_employees || ''),
        industry:        org?.industry        || '',
        city:            m.city          || '',
        country:         m.country       || 'Saudi Arabia',
        apollo_data:     m,
      };
    });

    return ok({ results, total: searchData.pagination?.total_entries || 0 });

  } catch (err) {
    return ok({ error: `Edge Function exception: ${String(err)}` });
  }
});
