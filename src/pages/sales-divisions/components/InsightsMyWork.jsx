import React, { useCallback, useEffect, useState } from "react";
import HotLeadsWidget from "pages/company-dashboard/components/HotLeadsWidget";
import ActivityFeed from "pages/company-dashboard/components/ActivityFeed";
import LogActivityModal from "components/LogActivityModal";
import Icon from "components/AppIcon";
import { activityService } from "services/supabaseService";

/**
 * "MY WORK" — the two panels a salesman and a supervisor actually worked from
 * on the Dashboard, and the button that logs an activity.
 *
 * SCOPE IS PASSED IN, NEVER ASSUMED. `ownerIds` is the viewer's own scope:
 * himself for a salesman, himself and his team for a supervisor. Both panels
 * take it:
 *
 *   HotLeadsWidget   needed a new `ownerIds` prop. Without one it reads every
 *                    user row RLS serves and shows that whole set's hot leads —
 *                    correct on a director's dashboard, a leak of other
 *                    people's customers on a salesman's landing page.
 *   ActivityFeed     fed by getTeamActivities(companyId, ownerIds, limit), the
 *                    existing service call that takes ids. The dashboards call
 *                    getUserActivities for the viewer alone, so a supervisor's
 *                    feed showed only his own work; here it is his team's,
 *                    which is what the scope means everywhere else on Insights.
 *
 * LogActivityModal is the Dashboard's own component, saving against
 * `ownerId = userId` so the activity belongs to the person logging it.
 */
export default function InsightsMyWork({
  companyId, userId, ownerIds = [], users = [], scopeLabel = "",
}) {
  const [activities, setActivities] = useState([]);
  const [showLog, setShowLog] = useState(false);
  const [loading, setLoading] = useState(false);
  const idKey = (ownerIds || []).join(",");

  const load = useCallback(async () => {
    if (!companyId || !idKey) {
      setActivities([]);
      return;
    }
    setLoading(true);
    try {
      const { data } = await activityService.getTeamActivities(
        companyId, idKey.split(","), 15,
      );
      setActivities(data || []);
    } catch (e) {
      // A feed that cannot load is not worth taking the page down for.
      console.error("InsightsMyWork activities:", e);
      setActivities([]);
    } finally {
      setLoading(false);
    }
  }, [companyId, idKey]);

  useEffect(() => { load(); }, [load]);

  if (!companyId) return null;

  return (
    <section className="mt-6" data-testid="insights-my-work">
      <div className="flex items-end justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">My work</h2>
          <p className="text-xs text-gray-500">
            {scopeLabel ? `${scopeLabel} — hottest leads and the latest activity` : "Hottest leads and the latest activity"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowLog(true)}
          data-testid="log-activity"
          className="flex items-center gap-1.5 text-xs font-medium border border-gray-300 rounded-lg px-3 py-1.5 bg-white hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <Icon name="PlusCircle" size={14} />
          Log activity
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <HotLeadsWidget companyId={companyId} ownerIds={ownerIds} />
        <div className="bg-white rounded-lg shadow">
          <ActivityFeed
            activities={activities}
            title={loading ? "Recent activity…" : "Recent activity"}
            companyId={companyId}
            users={users}
            currentUserId={userId}
          />
        </div>
      </div>

      <LogActivityModal
        isOpen={showLog}
        onClose={() => setShowLog(false)}
        onSaved={(a) => setActivities((prev) => [a, ...prev])}
        dealId={null}
        contactId={null}
        contactName=""
        ownerId={userId}
      />
    </section>
  );
}
