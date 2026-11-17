import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { NEXT_STEP_EVENT } from "utils/nextStepBus";
import { resolveNextStep } from "utils/nextSteps";

/**
 * NEXT STEP — a small panel after a save (session 40, CEO 2026-11-16).
 *
 * One, mounted once (Routes.jsx). It listens for utils/nextStepBus events,
 * turns the latest into a line (utils/nextSteps.js) and shows it in the
 * corner: never a modal, never in the way of the form that saved, and gone
 * with ×. A newer save replaces it. Styled as the app's amber guidance panel.
 */
export default function NextStepPanel() {
  const navigate = useNavigate();
  const [step, setStep] = useState(null);
  const latest = useRef(0);

  useEffect(() => {
    const on = (ev) => {
      const at = ev.detail?.at || Date.now();
      latest.current = at;
      resolveNextStep(ev.detail || {}).then((s) => {
        // Only the newest event is shown, even if an older read finishes later.
        if (latest.current === at && s?.text) setStep({ ...s, at });
      });
    };
    window.addEventListener(NEXT_STEP_EVENT, on);
    return () => window.removeEventListener(NEXT_STEP_EVENT, on);
  }, []);

  if (!step) return null;
  const go = (to) => {
    if (!to) return;
    navigate({ pathname: to.path, hash: to.hash || "" }, to.state ? { state: to.state } : undefined);
    setStep(null);
  };
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="next-step-panel"
      data-kind={step.kind}
      className="fixed z-[700] bottom-4 right-4 left-4 sm:left-auto sm:w-[380px] bg-amber-50 border border-amber-200 text-amber-800 rounded-xl shadow-lg px-4 py-3"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Next step</p>
          <p className="text-sm leading-snug mt-0.5" data-testid="next-step-text">{step.text}</p>
          {step.extra && <p className="text-sm leading-snug mt-1" data-testid="next-step-extra">{step.extra.text}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            {step.button && (
              <button type="button" data-testid="next-step-button" onClick={() => go(step.button.to)}
                className="text-xs px-2.5 py-1 rounded border border-amber-300 bg-white text-amber-800 hover:bg-amber-100">{step.button.label}</button>
            )}
            {(step.extra?.buttons || []).map((b) => (
              <button key={b.label} type="button" data-testid="next-step-extra-button" onClick={() => go(b.to)}
                className="text-xs px-2.5 py-1 rounded border border-amber-300 bg-white text-amber-800 hover:bg-amber-100">{b.label}</button>
            ))}
          </div>
        </div>
        <button type="button" aria-label="Dismiss" data-testid="next-step-dismiss" onClick={() => setStep(null)}
          className="w-7 h-7 -mr-1 -mt-1 rounded hover:bg-amber-100 text-amber-700 text-lg leading-none flex-shrink-0">×</button>
      </div>
    </div>
  );
}
