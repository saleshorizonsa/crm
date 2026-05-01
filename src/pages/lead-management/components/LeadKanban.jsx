import React, { useMemo } from "react";
import LeadCard from "./LeadCard";

const ACTIVE_STAGES = [
  { key: "new",       label: "New",           dot: "bg-gray-400",   header: "bg-gray-50 border-gray-200"   },
  { key: "contacted", label: "Contacted",      dot: "bg-blue-400",   header: "bg-blue-50 border-blue-200"   },
  { key: "qualified", label: "Qualified",      dot: "bg-purple-400", header: "bg-purple-50 border-purple-200"},
  { key: "proposal",  label: "Proposal Sent",  dot: "bg-orange-400", header: "bg-orange-50 border-orange-200"},
];

const CLOSED_STAGES = [
  { key: "converted", label: "Converted", dot: "bg-green-400", header: "bg-green-50 border-green-200" },
  { key: "lost",      label: "Lost",      dot: "bg-red-400",   header: "bg-red-50 border-red-200"     },
];

const LeadKanban = ({ leads, onEdit, onStatusChange, onDelete, showClosed }) => {
  const stages = showClosed ? [...ACTIVE_STAGES, ...CLOSED_STAGES] : ACTIVE_STAGES;

  const byStage = useMemo(() => {
    return leads.reduce((acc, lead) => {
      const key = lead.lead_status || "new";
      if (!acc[key]) acc[key] = [];
      acc[key].push(lead);
      return acc;
    }, {});
  }, [leads]);

  if (leads.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">🎯</span>
        </div>
        <p className="font-medium text-gray-500 mb-1">No leads yet</p>
        <p className="text-sm">Add your first lead to get started</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-4" style={{ minWidth: `${stages.length * 288 + (stages.length - 1) * 16}px` }}>
        {stages.map((stage) => {
          const stageLeads = byStage[stage.key] || [];
          return (
            <div key={stage.key} className="w-72 flex-shrink-0 flex flex-col">
              {/* Column header */}
              <div className={`flex items-center justify-between px-3 py-2 rounded-t-lg border ${stage.header} mb-2`}>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${stage.dot}`} />
                  <span className="text-sm font-semibold text-gray-700">{stage.label}</span>
                </div>
                <span className="text-xs bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                  {stageLeads.length}
                </span>
              </div>

              {/* Cards */}
              <div className="flex flex-col gap-3 flex-1">
                {stageLeads.length === 0 ? (
                  <div className="border-2 border-dashed border-gray-200 rounded-lg py-8 text-center text-sm text-gray-400">
                    No leads
                  </div>
                ) : (
                  stageLeads.map((lead) => (
                    <div key={lead.id} className="relative">
                      <LeadCard
                        lead={lead}
                        onEdit={onEdit}
                        onStatusChange={onStatusChange}
                        onDelete={onDelete}
                      />
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LeadKanban;
