import React, { useState } from "react";
import Icon from "../../../components/AppIcon";
import Button from "../../../components/ui/Button";
import LeadScoreBadge from "../../../components/ui/LeadScoreBadge";

const STAGE_FLOW = {
  new:       "contacted",
  contacted: "qualified",
  qualified: "proposal",
  proposal:  "converted",
};

const ADVANCE_LABEL = {
  new:       "Mark Contacted",
  contacted: "Mark Qualified",
  qualified: "Send Proposal",
  proposal:  "Convert",
};

const LeadCard = ({ lead, onEdit, onStatusChange, onDelete }) => {
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const stage = lead.lead_status;
  const nextStage = STAGE_FLOW[stage];

  const initials = `${lead.first_name?.[0] ?? ""}${lead.last_name?.[0] ?? ""}`.toUpperCase();

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-gray-300 transition-all">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-xs font-bold text-primary">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {lead.first_name} {lead.last_name}
            </p>
            {lead.company_name && (
              <p className="text-xs text-gray-500 truncate">{lead.company_name}</p>
            )}
          </div>
        </div>
        <button
          onClick={() => setIsActionsOpen((v) => !v)}
          className="text-gray-400 hover:text-gray-600 flex-shrink-0 p-0.5 rounded"
        >
          <Icon name="MoreVertical" size={14} />
        </button>
      </div>

      {/* Dropdown */}
      {isActionsOpen && (
        <div className="absolute z-10 right-0 mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1 text-sm">
          <button
            className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2"
            onClick={() => { setIsActionsOpen(false); onEdit(lead); }}
          >
            <Icon name="Edit2" size={13} /> Edit
          </button>
          <button
            className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 text-orange-600"
            onClick={() => { setIsActionsOpen(false); onStatusChange(lead.id, "lost"); }}
          >
            <Icon name="XCircle" size={13} /> Mark Lost
          </button>
          <button
            className="w-full text-left px-3 py-2 hover:bg-red-50 flex items-center gap-2 text-red-600"
            onClick={() => { setIsActionsOpen(false); onDelete(lead.id); }}
          >
            <Icon name="Trash2" size={13} /> Delete
          </button>
        </div>
      )}

      {/* Details */}
      {lead.job_title && (
        <p className="text-xs text-gray-500 mb-2">{lead.job_title}</p>
      )}

      <div className="mb-3">
        <LeadScoreBadge score={lead.lead_score} grade={lead.lead_grade} />
      </div>

      {/* Contact links */}
      <div className="flex items-center gap-3 mb-3 text-xs text-gray-500">
        {lead.email && (
          <a
            href={`mailto:${lead.email}`}
            className="flex items-center gap-1 hover:text-primary truncate"
            onClick={(e) => e.stopPropagation()}
          >
            <Icon name="Mail" size={11} />
            <span className="truncate max-w-28">{lead.email}</span>
          </a>
        )}
        {lead.phone && (
          <a
            href={`tel:${lead.phone}`}
            className="flex items-center gap-1 hover:text-primary flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <Icon name="Phone" size={11} />
          </a>
        )}
      </div>

      {/* Advance action */}
      {nextStage && (
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs"
          onClick={() => onStatusChange(lead.id, nextStage)}
        >
          <Icon name={nextStage === "converted" ? "CheckCircle" : "ArrowRight"} size={12} className="mr-1" />
          {ADVANCE_LABEL[stage]}
        </Button>
      )}
    </div>
  );
};

export default LeadCard;
