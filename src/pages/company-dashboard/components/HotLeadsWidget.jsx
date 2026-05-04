import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../../lib/supabase";
import LeadScoreBadge from "../../../components/ui/LeadScoreBadge";
import Icon from "../../../components/AppIcon";

const HotLeadsWidget = ({ companyId }) => {
  const [leads, setLeads] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!companyId) return;

    const fetchHotLeads = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("contacts")
          .select("id, first_name, last_name, company_name, lead_score, lead_grade, owner:users!owner_id(company_id)")
          .in("lead_grade", ["hot", "warm"])
          .order("lead_score", { ascending: false })
          .limit(20);

        if (error) throw error;

        const filtered = (data || [])
          .filter((c) => c.owner?.company_id === companyId)
          .slice(0, 5);

        setLeads(filtered);
      } catch (err) {
        console.error("HotLeadsWidget error:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchHotLeads();
  }, [companyId]);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Icon name="TrendingUp" size={18} className="text-red-500" />
          Hot Leads
        </h3>
        <button
          onClick={() => navigate("/sales-pipeline?stage=lead", { state: { activeStage: "lead" } })}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
        >
          View Pipeline
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
          <p className="text-sm">No hot or warm leads yet</p>
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
