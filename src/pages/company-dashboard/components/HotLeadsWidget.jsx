import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../../lib/supabase";
import LeadScoreBadge from "../../../components/ui/LeadScoreBadge";
import Icon from "../../../components/AppIcon";
import { useLanguage } from "../../../i18n";

/**
 * `ownerIds` NARROWS THE WIDGET TO A SCOPE, and must be passed wherever the
 * viewer is not entitled to the whole company.
 *
 * Without it the widget reads every user row RLS will serve and shows the hot
 * leads of all of them — which is right on a director's dashboard and wrong on
 * a salesman's Insights page, where it would put other people's customers in
 * front of him. Insights passes his own id, or a supervisor's team.
 *
 * Omitted, the behaviour is exactly as before: every user the query can see.
 */
const HotLeadsWidget = ({ companyId, ownerIds = null }) => {
  const [leads, setLeads] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const { t } = useLanguage();

  useEffect(() => {
    const fetchHotLeads = async () => {
      setIsLoading(true);
      try {
        // contacts has no company_id column — scope via owner_id.
        let userIds = ownerIds;
        if (!userIds) {
          // RLS already limits the users query to the current company's users.
          const { data: users, error: usersError } = await supabase
            .from("users")
            .select("id");
          if (usersError) throw usersError;
          userIds = (users || []).map((u) => u.id);
        }

        if (!userIds || userIds.length === 0) {
          setLeads([]);
          return;
        }

        const { data, error } = await supabase
          .from("contacts")
          .select("id, first_name, last_name, company_name, lead_score, lead_grade")
          .in("owner_id", userIds)
          .in("lead_grade", ["hot", "warm"])
          .order("lead_score", { ascending: false })
          .limit(5);

        if (error) throw error;
        setLeads(data || []);
      } catch (err) {
        console.error("HotLeadsWidget error:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchHotLeads();
    // Re-runs when the scope changes. It used to run once with no
    // dependencies, which was harmless while the only caller was a dashboard
    // that never changed company — but Insights resolves the viewer's scope
    // asynchronously, so a fetch pinned to the first render would have read the
    // whole company before `ownerIds` arrived and then never corrected itself.
  }, [companyId, ownerIds ? ownerIds.join(",") : null]);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Icon name="TrendingUp" size={18} className="text-red-500" />
          {t("dashboard.hotLeads")}
        </h3>
        <button
          onClick={() => navigate("/sales-pipeline?stage=lead", { state: { activeStage: "lead" } })}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
        >
          {t("dashboard.viewPipeline")}
          <Icon name="ArrowRight" size={12} />
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Icon name="Loader2" size={24} className="text-gray-400 animate-spin" />
        </div>
      ) : leads.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <Icon name="Users" size={32} className="mx-auto mb-2" />
          <p className="text-sm">{t("dashboard.noHotLeads")}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {leads.map((lead) => (
            <li
              key={lead.id}
              onClick={() => navigate("/sales-pipeline?stage=lead", { state: { activeStage: "lead" } })}
              className="flex items-center justify-between gap-3 cursor-pointer rounded-lg hover:bg-gray-50 -mx-2 px-2 py-1 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-xs font-semibold text-primary">
                  {lead.first_name?.[0]}{lead.last_name?.[0]}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {lead.first_name} {lead.last_name}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {lead.company_name || "—"}
                  </p>
                </div>
              </div>
              <LeadScoreBadge score={lead.lead_score} grade={lead.lead_grade} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default HotLeadsWidget;
