import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from 'contexts/AuthContext';
import { supabase } from 'lib/supabase';
import Icon from 'components/AppIcon';
import { fetchPendingApprovals, approvePlan, rejectPlan, resolveApproverScope } from 'utils/planApproval';

const fmtSAR = (n) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));

const monthLabel = (m) =>
  m ? new Date(`${m}T00:00:00`).toLocaleString('en-US', { month: 'long', year: 'numeric' }) : '—';

const dateLabel = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

// Manager/supervisor/director queue of plans waiting on a decision.
export default function PlanApprovalsModule({ adminCompany, onChange }) {
  const { user, company: authCompany, userProfile } = useAuth();
  const company = adminCompany || authCompany;
  const companyId = company?.id;
  const role = userProfile?.role;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [rejecting, setRejecting] = useState(null); // submission being rejected
  const [reason, setReason] = useState('');
  const [viewing, setViewing] = useState(null);     // { row, opps, loading }

  const load = useCallback(async () => {
    if (!companyId || !user?.id) { setRows([]); setLoading(false); return; }
    setLoading(true);
    try {
      const ownerIds = await resolveApproverScope({ companyId, userId: user.id, role });
      const { rows: pending, schemaMissing: missing } = await fetchPendingApprovals({ companyId, ownerIds });
      setRows(pending);
      setSchemaMissing(missing);
    } finally {
      setLoading(false);
    }
  }, [companyId, user?.id, role]);

  useEffect(() => { load(); }, [load]);

  async function handleApprove(row) {
    setBusyId(row.id);
    const { error } = await approvePlan({
      submissionId: row.id, ownerId: row.owner_id, companyId, approverId: user?.id,
    });
    setBusyId(null);
    if (error) { alert(`Could not approve: ${error.message || error}`); return; }
    await load();
    onChange?.();
  }

  async function handleReject() {
    if (!rejecting || !reason.trim()) return;
    setBusyId(rejecting.id);
    const { error } = await rejectPlan({
      submissionId: rejecting.id, ownerId: rejecting.owner_id, companyId, reason: reason.trim(),
    });
    setBusyId(null);
    if (error) { alert(`Could not reject: ${error.message || error}`); return; }
    setRejecting(null);
    setReason('');
    await load();
    onChange?.();
  }

  // "View Plan" — the opportunities that make up the submitted plan.
  async function handleView(row) {
    setViewing({ row, opps: [], loading: true });
    const { data } = await supabase
      .from('opportunities')
      .select('id, customer_name, planned_amount, status, expected_month, material_group')
      .eq('company_id', companyId)
      .eq('owner_id', row.owner_id)
      .eq('expected_month', row.plan_month)
      .order('planned_amount', { ascending: false });
    setViewing({ row, opps: data || [], loading: false });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Icon name="LoaderCircle" size={22} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (schemaMissing) {
    return (
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <div className="flex items-center gap-2 mb-1">
          <Icon name="TriangleAlert" size={16} className="text-amber-700" />
          <p className="text-sm font-semibold text-amber-800">Approval workflow not enabled yet</p>
        </div>
        <p className="text-xs text-amber-700">
          Run <code className="font-mono">migrations/add_plan_approval_workflow.sql</code> in the
          Supabase SQL editor to add the approval columns. Submitted plans are being recorded and
          will appear here once it is applied.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          Plans Awaiting Approval {rows.length > 0 && `(${rows.length})`}
        </h2>
        <button onClick={load} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
          <Icon name="RefreshCw" size={12} /> Refresh
        </button>
      </div>

      {rows.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Icon name="CircleCheckBig" size={28} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">No plans are waiting for your approval.</p>
        </div>
      )}

      {rows.map((row) => {
        const planned = Number(row.total_planned) || 0;
        const required = Number(row.required_plan) || 0;
        const meets = required > 0 ? planned >= required : planned > 0;
        const busy = busyId === row.id;
        return (
          <div key={row.id} className="p-4 border border-border rounded-xl bg-card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">
                  {row.owner?.full_name || 'Unknown salesman'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {monthLabel(row.plan_month)} · submitted {dateLabel(row.submitted_at)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-foreground">
                  {fmtSAR(planned)} <span className="text-xs font-normal text-muted-foreground">planned</span>
                </p>
                <p className={`text-xs ${meets ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {fmtSAR(required)} required
                  {!meets && required > 0 && ` · short by ${fmtSAR(required - planned)}`}
                </p>
              </div>
            </div>

            {planned === 0 && (
              <p className="mt-2 text-xs text-amber-700 flex items-center gap-1">
                <Icon name="TriangleAlert" size={12} />
                This plan has no planned value — check before approving.
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => handleView(row)}
                className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted"
              >
                View Plan
              </button>
              <button
                disabled={busy}
                onClick={() => handleApprove(row)}
                className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy ? 'Working…' : 'Approve & Lock'}
              </button>
              <button
                disabled={busy}
                onClick={() => { setRejecting(row); setReason(''); }}
                className="text-xs px-3 py-1.5 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </div>
        );
      })}

      {/* Reject — reason is mandatory, it is sent to the salesman verbatim. */}
      {rejecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card border border-border rounded-xl p-4 w-full max-w-md">
            <h3 className="text-sm font-semibold text-foreground mb-1">
              Send back {rejecting.owner?.full_name || 'this plan'}
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              The reason is shown to them in the notification. Their plan reopens for editing.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              autoFocus
              placeholder="What needs to change?"
              className="w-full text-sm p-2 rounded-lg border border-border bg-background"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => { setRejecting(null); setReason(''); }}
                className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted"
              >
                Cancel
              </button>
              <button
                disabled={!reason.trim() || busyId === rejecting.id}
                onClick={handleReject}
                className="text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                Send Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Plan — the opportunities behind the number. */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  {viewing.row.owner?.full_name} — {monthLabel(viewing.row.plan_month)}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {viewing.opps.length} opportunit{viewing.opps.length === 1 ? 'y' : 'ies'} ·{' '}
                  {fmtSAR(viewing.opps.reduce((s, o) => s + (Number(o.planned_amount) || 0), 0))} SAR
                </p>
              </div>
              <button onClick={() => setViewing(null)} className="text-muted-foreground hover:text-foreground">
                <Icon name="X" size={18} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto">
              {viewing.loading ? (
                <div className="flex justify-center py-8">
                  <Icon name="LoaderCircle" size={20} className="animate-spin text-muted-foreground" />
                </div>
              ) : viewing.opps.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No opportunities recorded for this month.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground border-b border-border">
                        <th className="pb-2">Customer</th>
                        <th className="pb-2">Group</th>
                        <th className="pb-2">Status</th>
                        <th className="pb-2 text-right">Planned</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewing.opps.map((o) => (
                        <tr key={o.id} className="border-b border-border/50">
                          <td className="py-2 pr-2">{o.customer_name}</td>
                          <td className="py-2 pr-2 text-muted-foreground">{o.material_group || '—'}</td>
                          <td className="py-2 pr-2 text-muted-foreground">{o.status}</td>
                          <td className="py-2 text-right">{fmtSAR(o.planned_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
