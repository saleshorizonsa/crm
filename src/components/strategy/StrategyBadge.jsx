import React, { useState } from "react";
import { useLanguage } from "../../i18n";
import { useAuth } from "../../contexts/AuthContext";
import { strategyColour } from "utils/strategyColours";
import {
  STRATEGIES, NOT_SET, strategyKey, strategyLabel, canSetStrategy, setCustomerStrategy, useCustomerStrategy,
} from "utils/customerStrategy";

/**
 * CUSTOMER STRATEGY — the shared pieces (session 48). Colours come only from
 * utils/strategyColours.js; labels from the `strategy.*` translations.
 */

/** The badge. "Not set" is a light-grey dashed badge, shown only when asked (showNotSet). */
export function StrategyBadge({ strategy, showNotSet = false, className = "", title }) {
  const { t } = useLanguage();
  const key = strategyKey(strategy);
  if (key === NOT_SET && !showNotSet) return null;
  const c = strategyColour(key);
  return (
    <span
      data-strategy={key}
      data-testid="strategy-badge"
      title={title}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${className}`}
      style={{ background: c.bg, color: c.text, border: `1px ${c.dashed ? "dashed" : "solid"} ${c.dashed ? c.colour : c.bg}` }}
    >
      {strategyLabel(key, t)}
    </span>
  );
}

/** A coloured dot, with the label beside it when withLabel. Not set: nothing unless showNotSet. */
export function StrategyDot({ strategy, withLabel = true, showNotSet = false, className = "" }) {
  const { t } = useLanguage();
  const key = strategyKey(strategy);
  if (key === NOT_SET && !showNotSet) return null;
  const c = strategyColour(key);
  return (
    <span data-testid="strategy-dot" data-strategy={key} className={`inline-flex items-center gap-1 text-[11px] whitespace-nowrap ${className}`} style={{ color: c.text }}>
      <span
        aria-hidden="true"
        className="inline-block w-2 h-2 rounded-full"
        style={key === NOT_SET ? { border: `1px dashed ${c.colour}` } : { background: c.colour }}
      />
      {withLabel && strategyLabel(key, t)}
    </span>
  );
}

/** A contact's dot, looked up by id (renders nothing until the feature is on). */
export function ContactStrategyDot({ contactId, withLabel = true }) {
  const { enabled, strategy } = useCustomerStrategy(contactId);
  if (!enabled || !contactId) return null;
  return <StrategyDot strategy={strategy} withLabel={withLabel} />;
}

/**
 * Strategy multi-select as toggle chips (all five + Not set). value: array of
 * keys; empty = no filter.
 */
export function StrategyFilterChips({ value = [], onChange, className = "" }) {
  const { t } = useLanguage();
  const on = new Set(value || []);
  const toggle = (k) => {
    const next = new Set(on);
    if (next.has(k)) next.delete(k); else next.add(k);
    onChange?.([...STRATEGIES, NOT_SET].filter((x) => next.has(x)));
  };
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`} data-testid="strategy-filter">
      <span className="text-sm text-muted-foreground mr-1">{t("strategy.filterStrategy")}:</span>
      {[...STRATEGIES, NOT_SET].map((k) => {
        const c = strategyColour(k);
        const active = on.has(k);
        return (
          <button
            key={k}
            type="button"
            aria-pressed={active}
            data-testid={`strategy-filter-${k}`}
            onClick={() => toggle(k)}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border"
            style={active
              ? { background: c.bg, color: c.text, borderColor: c.colour }
              : { background: "#fff", color: "#475569", borderColor: "#E2E8F0", borderStyle: k === NOT_SET ? "dashed" : "solid" }}
          >
            <span aria-hidden="true" className="inline-block w-2 h-2 rounded-full" style={k === NOT_SET ? { border: `1px dashed ${c.colour}` } : { background: c.colour }} />
            {strategyLabel(k, t)}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Set / change / clear the strategy of one or more customers. 'Other' needs a
 * note. Reports customers the database did not let this user change.
 */
export function SetStrategyDialog({ contactIds, current = null, currentNote = "", onClose, onSaved }) {
  const { t } = useLanguage();
  const [choice, setChoice] = useState(current || "");
  const [note, setNote] = useState(currentNote || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const many = (contactIds || []).length > 1;

  const save = async () => {
    setMessage("");
    if (choice === "other" && !note.trim()) { setMessage(t("strategy.noteRequired")); return; }
    setBusy(true);
    const r = await setCustomerStrategy(contactIds, choice || null, note);
    setBusy(false);
    if (r.error) {
      setMessage(/only a manager/i.test(r.error) ? t("strategy.refused") : r.error === "NOTE_REQUIRED" ? t("strategy.noteRequired") : r.error);
      return;
    }
    if (r.notChanged.length) {
      setMessage(t("strategy.notChanged").replace("{n}", String(r.notChanged.length)));
      onSaved?.(r);
      return;
    }
    onSaved?.(r);
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-[800] flex items-center justify-center p-4" data-testid="strategy-dialog" onClick={(e) => e.stopPropagation()}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-5 space-y-3">
        <h3 className="text-base font-semibold text-gray-900">
          {current ? t("strategy.change") : t("strategy.set")}
          {many && <span className="ml-2 text-xs font-normal text-gray-500">{contactIds.length} {t("strategy.selected")}</span>}
        </h3>
        <div className="space-y-1.5" role="radiogroup" aria-label={t("strategy.label")}>
          {[...STRATEGIES, ""].map((k) => (
            <label key={k || "none"} className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="radio" name="strategy" value={k} checked={choice === k} onChange={() => setChoice(k)} data-testid={`strategy-option-${k || "none"}`} />
              {k ? <StrategyBadge strategy={k} /> : <span className="text-gray-500">{t("strategy.clear")}</span>}
            </label>
          ))}
        </div>
        {choice && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t("strategy.note")}</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              data-testid="strategy-note"
              placeholder={t("strategy.notePlaceholder")}
              className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
            />
          </div>
        )}
        {message && <p className="text-xs text-red-600" data-testid="strategy-message">{message}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm rounded-md border border-gray-300 text-gray-700">{t("strategy.cancel")}</button>
          <button type="button" onClick={save} disabled={busy} data-testid="strategy-save" className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white disabled:opacity-50">{t("strategy.save")}</button>
        </div>
      </div>
    </div>
  );
}

/**
 * A customer's strategy with its control: managers and above can change it;
 * everyone else sees it with the control disabled ("Set by your manager").
 */
export function StrategyControl({ contactId, compact = false, onChanged }) {
  const { t } = useLanguage();
  const { userProfile } = useAuth();
  const { enabled, info, strategy } = useCustomerStrategy(contactId);
  const [open, setOpen] = useState(false);
  if (!enabled || !contactId) return null;
  const allowed = canSetStrategy(userProfile?.role);
  return (
    <span className="inline-flex items-center gap-1.5" data-testid="strategy-control" onClick={(e) => e.stopPropagation()}>
      <StrategyBadge strategy={strategy} showNotSet title={info?.note || undefined} />
      <button
        type="button"
        disabled={!allowed}
        title={allowed ? (strategy ? t("strategy.change") : t("strategy.set")) : t("strategy.setByManager")}
        onClick={() => setOpen(true)}
        data-testid="strategy-edit"
        className={`text-[11px] ${allowed ? "text-blue-600 hover:underline" : "text-gray-300 cursor-not-allowed"}`}
      >
        {compact ? "✎" : (strategy ? t("strategy.change") : t("strategy.set"))}
      </button>
      {open && (
        <SetStrategyDialog
          contactIds={[contactId]}
          current={strategy}
          currentNote={info?.note || ""}
          onClose={() => setOpen(false)}
          onSaved={(r) => onChanged?.(r)}
        />
      )}
    </span>
  );
}
