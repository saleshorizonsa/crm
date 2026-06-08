import React from 'react';
import Icon from './AppIcon';
import { activityService } from '../services/supabaseService';
import { format, isValid } from 'date-fns';

const TYPE_COLORS = {
  visit:    'bg-green-100 text-green-600',
  call:     'bg-blue-100 text-blue-600',
  whatsapp: 'bg-green-100 text-green-700',
  email:    'bg-purple-100 text-purple-600',
  meeting:  'bg-amber-100 text-amber-600',
  demo:     'bg-indigo-100 text-indigo-600',
  followup: 'bg-cyan-100 text-cyan-600',
  note:     'bg-gray-100 text-gray-500',
};

const OUTCOME_STYLES = {
  positive:      'bg-green-50 text-green-600',
  neutral:       'bg-gray-100 text-gray-500',
  followup:      'bg-amber-50 text-amber-600',
  not_interested:'bg-red-50 text-red-600',
};

function safeFormat(dateStr, fmt) {
  try {
    const d = new Date(dateStr);
    return isValid(d) ? format(d, fmt) : '—';
  } catch { return '—'; }
}

export default function ActivityTimeline({ activities = [], loading = false, onDelete, showContact = false, compact = false }) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl bg-gray-100 animate-pulse" />)}
      </div>
    );
  }

  if (!activities.length) {
    return (
      <div className="text-center py-8 text-gray-400">
        <Icon name="Activity" size={28} className="mx-auto mb-2 opacity-40" />
        <p className="text-sm">No activities logged yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {activities.map((activity, index) => {
        const typeCfg    = activityService.getTypeConfig(activity.type);
        const outcomeCfg = activityService.getOutcomeConfig(activity.outcome);
        const isOverdueFollowup = activity.next_action_date &&
          new Date(activity.next_action_date) < new Date() &&
          !['won', 'lost'].includes(activity.stage);

        return (
          <div key={activity.id} className="flex gap-3 pb-3 relative">
            {/* Vertical connector */}
            {index < activities.length - 1 && (
              <div className="absolute left-4 top-8 w-px bg-gray-100" style={{ height: 'calc(100% - 8px)' }} />
            )}

            {/* Icon bubble */}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 ${TYPE_COLORS[activity.type] || TYPE_COLORS.note}`}>
              <Icon name={typeCfg.icon} size={14} />
            </div>

            {/* Card */}
            <div className={`flex-1 min-w-0 bg-white border border-gray-100 rounded-xl ${compact ? 'p-2.5' : 'p-3'}`}>
              {/* Header */}
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-semibold text-gray-800">{typeCfg.label}</span>
                  {outcomeCfg && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${OUTCOME_STYLES[outcomeCfg.value] || 'bg-gray-100 text-gray-500'}`}>
                      {outcomeCfg.label}
                    </span>
                  )}
                  {activity.duration_minutes && (
                    <span className="text-xs text-gray-400">{activity.duration_minutes} min</span>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    {safeFormat(activity.created_at, 'd MMM, h:mm a')}
                  </span>
                  {onDelete && (
                    <button onClick={() => onDelete(activity.id)} className="p-0.5 text-gray-300 hover:text-red-400 transition-colors">
                      <Icon name="Trash2" size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* Owner + contact */}
              <p className="text-xs text-gray-400 mb-1">
                by {activity.owner?.full_name || '—'}
                {showContact && activity.contact?.company_name && (
                  <span className="ml-1">· {activity.contact.company_name}</span>
                )}
              </p>

              {/* Notes */}
              {activity.description && (
                <p className="text-sm text-gray-600 leading-relaxed">{activity.description}</p>
              )}

              {/* Next action */}
              {activity.next_action && (
                <div className="mt-2 pt-2 border-t border-gray-50 flex items-center gap-1.5">
                  <Icon name="ArrowRight" size={11} className="text-blue-400 flex-shrink-0" />
                  <span className={`text-xs ${isOverdueFollowup ? 'text-red-600' : 'text-blue-600'}`}>
                    {activity.next_action}
                    {activity.next_action_date && (
                      <span className={`ml-1 ${isOverdueFollowup ? 'text-red-400' : 'text-gray-400'}`}>
                        — {safeFormat(activity.next_action_date, 'd MMM yyyy')}
                        {isOverdueFollowup && ' (overdue)'}
                      </span>
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
