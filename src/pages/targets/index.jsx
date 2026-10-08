import React, { useCallback, useEffect, useState } from "react";
import Header from "components/ui/Header";
import NavigationBreadcrumbs from "components/ui/NavigationBreadcrumbs";
import AnnualAllocationBanner from "components/AnnualAllocationBanner";
import SupervisorSalesTargetAssignment from "components/SupervisorSalesTargetAssignment";
import SalesTargetTable from "components/SalesTargetTable";
import Icon from "components/AppIcon";
import { useAuth } from "contexts/AuthContext";
import { salesTargetService, userService } from "services/supabaseService";

/**
 * /targets — WHERE A SUPERVISOR ASSIGNS TARGETS TO HIS SALESMEN.
 *
 * The Dashboard is no longer his to work from, and target assignment was one of
 * the things only the Dashboard could do. The component doing the work is
 * unchanged — SupervisorSalesTargetAssignment, with the same props
 * EnhancedSupervisorDashboard passed it — and this page is the frame around it.
 *
 * Session 7's annual allocation banner sits on top, so he can see what he has
 * been given before he hands any of it out. ManagerSalesTargetAssignment and
 * DirectorSalesTargetAssignment render that banner inside themselves; the
 * supervisor's component never did, so the page provides it.
 *
 * MANAGERS ARE NOT SENT HERE. They assign through
 * ManagerSalesTargetAssignment, a different component on a Dashboard they
 * keep, so moving them would give them two places rather than one. If that
 * changes, this page is where they belong: add the role to TARGETS_PAGE_ROLES
 * and render their component beside the supervisor's.
 */
export default function TargetsPage() {
  const { user, company, userProfile } = useAuth();

  const [myTargets, setMyTargets] = useState([]);
  const [assignedTargets, setAssignedTargets] = useState([]);
  const [editingTarget, setEditingTarget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const year = new Date().getFullYear();

  /**
   * The same two reads the Dashboard did:
   *   - targets assigned TO him, which cap what he can hand out
   *   - targets he has already assigned, filtered to his own assignments
   */
  const load = useCallback(async () => {
    if (!company?.id || !user?.id) return;
    setLoading(true);
    setError("");
    try {
      const [mine, assigned, subs] = await Promise.all([
        salesTargetService.getMyTargets(company.id, user.id),
        salesTargetService.getAssignedTargets(company.id),
        userService.getUserSubordinates(user.id),
      ]);
      setMyTargets(mine?.data || []);
      // getAssignedTargets returns the company's rows; his are the ones he
      // assigned. The Dashboard filters the same way.
      setAssignedTargets(
        (assigned?.data || []).filter((t) => t.assigned_by === user.id),
      );
      // Read for its error only: a supervisor with no team should see the
      // empty state, not a form that silently assigns to nobody.
      if (subs?.error) console.error("targets: subordinates", subs.error);
    } catch (e) {
      console.error("targets page:", e);
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [company?.id, user?.id]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!editingTarget) return;
    const name = editingTarget?.assignee?.full_name
      || editingTarget?.assignee?.email || "this salesman";
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete the sales target for ${name}?`)) return;
    const { error: delError } = await salesTargetService.deleteTarget(editingTarget.id);
    if (delError) {
      // eslint-disable-next-line no-alert
      alert(`Failed to delete target: ${delError.message}`);
      return;
    }
    setEditingTarget(null);
    setRefreshKey((k) => k + 1);
    load();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <NavigationBreadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Targets", href: "/targets" },
          ]}
        />

        <div>
          <h1 className="text-xl font-bold text-gray-900">Targets</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Assign this month&apos;s targets to your salesmen, and see what you
            have been given to hand out.
          </p>
        </div>

        {/* What he holds for the year, and how much of it is still unassigned. */}
        <AnnualAllocationBanner
          companyId={company?.id}
          managerId={user?.id}
          year={year}
          refreshKey={refreshKey}
        />

        {error && (
          <div className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            Targets could not load: <span className="font-mono">{error}</span>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-500">Loading targets…</p>
        ) : (
          <>
            <SupervisorSalesTargetAssignment
              companyId={company?.id}
              supervisorTargets={myTargets}
              existingTeamTargets={assignedTargets}
              editingTarget={editingTarget}
              onCancelEdit={() => setEditingTarget(null)}
              onDeleteTarget={handleDelete}
              onTargetCreated={() => {
                setEditingTarget(null);
                setRefreshKey((k) => k + 1);
                load();
              }}
            />

            {assignedTargets.length > 0 ? (
              <SalesTargetTable
                title="Targets you have assigned"
                targets={assignedTargets}
                role={userProfile?.role || "supervisor"}
                onEdit={(t) => setEditingTarget(t)}
              />
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 p-10 text-center">
                <Icon name="Target" size={20} className="mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">
                  You have not assigned any targets yet.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
