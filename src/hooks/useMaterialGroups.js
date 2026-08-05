import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

// companyIdOverride: use when the managed company differs from the logged-in
// user's company (e.g. Admin → Products manages a company chosen in the admin
// selector, not the header company). Falls back to the auth company.
export function useMaterialGroups(companyIdOverride) {
  const { company } = useAuth();
  const companyId = companyIdOverride || company?.id;
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadGroups = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('material_groups')
      .select('id, name')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      console.error('[useMaterialGroups] Failed to load:', error.message);
      setGroups([]);
    } else {
      const names = (data || []).map(g => g.name);
      console.log('[useMaterialGroups] Groups loaded:', names);
      setGroups(names);
    }
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;

    loadGroups();

    const channelName = `mg_${companyId}_${Math.random().toString(36).slice(2)}`;
    const subscription = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'material_groups',
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          console.log('[useMaterialGroups] Realtime change:', payload.eventType);
          loadGroups();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [companyId, loadGroups]);

  useEffect(() => {
    function handleGroupsUpdated(e) {
      if (!e.detail?.companyId || e.detail.companyId === companyId) {
        loadGroups();
      }
    }

    window.addEventListener('material-groups-updated', handleGroupsUpdated);
    return () => window.removeEventListener('material-groups-updated', handleGroupsUpdated);
  }, [companyId, loadGroups]);

  return { groups, loading, reload: loadGroups };
}
