import { serve } from 'https://deno.land/std/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
      page = 1,
      per_page = 25,
    } = await req.json();

    const APOLLO_KEY = Deno.env.get('APOLLO_API_KEY');
    if (!APOLLO_KEY) {
      return new Response(
        JSON.stringify({ error: 'APOLLO_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 1: Search people — no credits used
    const searchBody: Record<string, unknown> = {
      person_locations: [region],
      person_titles: titles,
      per_page,
      page,
    };
    if (industry) searchBody.organization_industry_tag_ids = [industry];
    if (company_size) searchBody.organization_num_employees_ranges = [company_size];

    const searchResponse = await fetch(
      'https://api.apollo.io/api/v1/mixed_people/search',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'x-api-key': APOLLO_KEY,
        },
        body: JSON.stringify(searchBody),
      }
    );

    if (!searchResponse.ok) {
      const errText = await searchResponse.text();
      return new Response(
        JSON.stringify({ error: `Apollo search failed: ${errText}` }),
        { status: searchResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const searchData = await searchResponse.json();
    const people = searchData.people || [];

    if (people.length === 0) {
      return new Response(
        JSON.stringify({ results: [], total: searchData.pagination?.total_entries || 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Bulk enrich to get emails and phones — uses credits
    const enrichResponse = await fetch(
      'https://api.apollo.io/api/v1/people/bulk_match',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'x-api-key': APOLLO_KEY,
        },
        body: JSON.stringify({
          details: people.map((p: Record<string, unknown>) => ({
            id: p.id,
            first_name: p.first_name,
            last_name: p.last_name,
            organization_name: (p.organization as Record<string, unknown>)?.name,
          })),
          reveal_phone_number: true,
          reveal_personal_emails: false,
        }),
      }
    );

    let matches: Record<string, unknown>[] = [];
    if (enrichResponse.ok) {
      const enrichData = await enrichResponse.json();
      matches = enrichData.matches || [];
    }

    // Fall back to raw search results if enrichment failed or returned nothing
    const source = matches.length > 0 ? matches : people;

    const results = source.map((m: Record<string, unknown>) => {
      const org = m.organization as Record<string, unknown> | undefined;
      const phoneNumbers = m.phone_numbers as Array<Record<string, unknown>> | undefined;
      return {
        apollo_id:       m.id || '',
        first_name:      m.first_name || '',
        last_name:       m.last_name || '',
        email:           m.email || '',
        phone:           phoneNumbers?.[0]?.sanitized_number || '',
        title:           m.title || '',
        linkedin_url:    m.linkedin_url || '',
        company_name:    org?.name || '',
        company_website: org?.website_url || '',
        company_size:    String(org?.estimated_num_employees || ''),
        industry:        org?.industry || '',
        city:            m.city || '',
        country:         m.country || 'Saudi Arabia',
        apollo_data:     m,
      };
    });

    return new Response(
      JSON.stringify({ results, total: searchData.pagination?.total_entries || 0 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
