import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export function useMaterialGroups() {
  const { company } = useAuth();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadGroups = useCallback(async () => {
    if (!company?.id) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('material_groups')
      .select('id, name')
      .eq('company_id', company.id)
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
  }, [company?.id]);

  useEffect(() => {
    if (!company?.id) return;

    loadGroups();

    const channelName = `mg_${company.id}_${Math.random().toString(36).slice(2)}`;
    const subscription = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'material_groups',
          filter: `company_id=eq.${company.id}`,
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
  }, [company?.id, loadGroups]);

  useEffect(() => {
    function handleGroupsUpdated(e) {
      if (!e.detail?.companyId || e.detail.companyId === company?.id) {
        loadGroups();
      }
    }

    window.addEventListener('material-groups-updated', handleGroupsUpdated);
    return () => window.removeEventListener('material-groups-updated', handleGroupsUpdated);
  }, [company?.id, loadGroups]);

  return { groups, loading, reload: loadGroups };
}
