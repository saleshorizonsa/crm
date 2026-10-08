import React from "react";
import TargetChangeBanner from "components/dashboard/TargetChangeBanner";
import PlanSubmissionAlert from "components/dashboard/PlanSubmissionAlert";
import PlanApprovalAlert from "components/dashboard/PlanApprovalAlert";
import BounceBackAlert from "components/dashboard/BounceBackAlert";
import ForecastVarianceAlert from "components/dashboard/ForecastVarianceAlert";

/**
 * THE BANNERS THAT USED TO LIVE ON THE DASHBOARD.
 *
 * Insights became the landing page for salesmen and supervisors, and the
 * Dashboard is being taken away from them — so the things that TELL THEM TO ACT
 * have to be here, or they simply stop arriving. These are the same components
 * with the same props the dashboards pass; none of them is reimplemented, and
 * each keeps its own dismiss behaviour and its own read.
 *
 * WHO GETS WHAT follows what each role had before, not a new arrangement:
 *
 *   salesman    TargetChangeBanner — his target was changed under him. Only
 *               EnhancedSalesmanDashboard showed it.
 *   supervisor  PlanApprovalAlert   — his own plan's approval state
 *               PlanSubmissionAlert — his salesmen who have not submitted
 *               ForecastVarianceAlert, BounceBackAlert — his team's exceptions
 *               All four came from EnhancedSupervisorDashboard, over his
 *               subordinates, with himself as the reviewer.
 *
 * ContactReportsAudit is deliberately NOT here; see the note in the session
 * report about what was left behind and where its equivalent lives.
 */
export default function InsightsBanners({ role, userId, companyId, subordinateIds = [] }) {
  if (!companyId || !userId) return null;

  const isSalesman = role === "salesman";
  const isSupervisor = role === "supervisor";
  if (!isSalesman && !isSupervisor) return null;

  return (
    <div className="space-y-3 mb-5" data-testid="insights-banners">
      {isSalesman && (
        <TargetChangeBanner userId={userId} companyId={companyId} />
      )}

      {isSupervisor && (
        <>
          <PlanApprovalAlert />
          <PlanSubmissionAlert
            companyId={companyId}
            ownerIds={subordinateIds}
            reviewerId={userId}
          />
          <ForecastVarianceAlert
            companyId={companyId}
            ownerIds={subordinateIds}
            reviewerId={userId}
          />
          <BounceBackAlert
            companyId={companyId}
            ownerIds={subordinateIds}
            reviewerId={userId}
          />
        </>
      )}
    </div>
  );
}
