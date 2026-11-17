/**
 * NEXT STEPS FOR SALESMEN — the signal (session 40).
 *
 * A save that succeeded calls emitNextStep({ kind, ... }); the one panel
 * mounted in Routes.jsx (components/NextStepPanel.jsx) listens and shows the
 * text from utils/nextSteps.js. Fire-and-forget by design: it is called AFTER
 * the save, never awaited, and can never throw into the code that saved.
 */
export const NEXT_STEP_EVENT = 'crm:next-step';

export function emitNextStep(detail) {
  try {
    if (typeof window === 'undefined' || !detail?.kind) return;
    window.dispatchEvent(new window.CustomEvent(NEXT_STEP_EVENT, { detail: { ...detail, at: Date.now() } }));
  } catch (_) { /* a hint must never break a save */ }
}
