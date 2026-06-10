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

    // Primary: material_groups table filtered by company
    const { data: tableGroups, error } = await supabase
      .from('material_groups')
      .select('id, name, is_active')
      .eq('company_id', company.id)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      console.error('[useMaterialGroups] Failed to load:', error.message);
    }

    if (!error && tableGroups?.length > 0) {
      setGroups(tableGroups.map(g => g.name));
      setLoading(false);
      return;
    }

    // Fallback: products table — NOTE: products has NO company_id column
    const { data: products } = await supabase
      .from('products')
      .select('material_group');

    const groupSet = new Set(
      (products || [])
        .map(p => (p.material_group || '').trim())
        .filter(Boolean)
    );

    setGroups([...groupSet].sort());
    setLoading(false);
  }, [company?.id]);

  // Initial load + realtime subscription
  // Channel name is unique per company so multiple hook instances
  // never share the same channel object (shared channels break when
  // any one instance unmounts and removes the channel).
  useEffect(() => {
    if (!company?.id) return;

    loadGroups();

    // Random suffix guarantees a fresh channel object on every effect run.
    // Without it, Supabase returns the already-subscribed channel and throws
    // "cannot add postgres_changes callbacks after subscribe()".
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

  // Same-tab updates via window event (admin creates/deletes/renames a group)
  useEffect(() => {
    function handleGroupsUpdated(e) {
      // Reload when the event has no companyId OR matches our company
      if (!e.detail?.companyId || e.detail.companyId === company?.id) {
        loadGroups();
      }
    }

    window.addEventListener('material-groups-updated', handleGroupsUpdated);
    return () => window.removeEventListener('material-groups-updated', handleGroupsUpdated);
  }, [company?.id, loadGroups]);

  return { groups, loading, reload: loadGroups };
}
