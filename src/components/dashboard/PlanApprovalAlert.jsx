import React, { useState, useEffect } from 'react';
import { useAuth } from 'contexts/AuthContext';
import { supabase } from 'lib/supabase';
import { fetchTeamHierarchy } from 'utils/teamHierarchy';
import { fetchPendingApprovalCount } from 'utils/planApproval';

const DIRECTOR_ROLES = ['director', 'admin', 'head'];
const TEAM_ROLES = ['manager', 'supervisor'];

// Banner on the manager/supervisor/director dashboard: how many submitted plans
// are waiting on a decision. Renders nothing when there are none, when the role
// cannot approve, or when the approval migration has not been applied yet.
export default function PlanApprovalAlert({ adminCompany }) {
  const { user, company: authCompany, userProfile } = useAuth();
  const company = adminCompany || authCompany;
  const companyId = company?.id;
  const role = userProfile?.role;
  const canApprove = TEAM_ROLES.includes(role) || DIRECTOR_ROLES.includes(role);

  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!companyId || !user?.id || !canApprove) { setCount(0); return; }
      let ownerIds;
      if (DIRECTOR_ROLES.includes(role)) {
        const { data } = await supabase.from('users').select('id').eq('company_id', companyId);
        ownerIds = (data || []).map((u) => u.id);
      } else {
        const team = await fetchTeamHierarchy({ companyId, userId: user.id, role });
        ownerIds = team.map((m) => m.id).filter(Boolean);
      }
      const n = await fetchPendingApprovalCount({ companyId, ownerIds });
      if (!cancelled) setCount(n);
    })();
    return () => { cancelled = true; };
  }, [companyId, user?.id, role, canApprove]);

  if (!canApprove || count === 0) return null;

  return (
    <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl mb-4 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <span>📋</span>
        <p className="text-sm font-semibold text-blue-800">
          {count} Plan{count > 1 ? 's' : ''} Awaiting Your Approval
        </p>
      </div>
      <a
        href="/planning#approvals"
        className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
      >
        Review Now
      </a>
    </div>
  );
}
