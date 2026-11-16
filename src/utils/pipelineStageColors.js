/**
 * The Pipeline's stage colours — one map, read by the Pipeline's own columns
 * (pages/sales-pipeline/components/PipelineStage.jsx) and by the Sales
 * Monitor (session 42), so a stage looks the same on both.
 */
export const PIPELINE_STAGE_COLOR = {
  lead: 'bg-slate-500',
  contact_made: 'bg-blue-500',
  proposal_sent: 'bg-yellow-500',
  negotiation: 'bg-orange-500',
  won: 'bg-green-500',
  lost: 'bg-red-500',
};
