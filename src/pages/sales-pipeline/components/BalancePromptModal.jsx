// "152,500 not invoiced. What happens to the balance?" — shown after a deal is
// invoiced for less than its original value (CEO decision 2026-10-13: ask
// every time, default a new plan item, this month unless the person picks the
// next). The invoice itself is already saved when this opens; nothing here can
// undo or block it. See utils/invoiceBalance.js for what each choice writes.
import React, { useState } from "react";
import Icon from "../../../components/AppIcon";
import { BALANCE_CHOICE, balanceMonths } from "../../../utils/invoiceBalance";

const SAR = (n) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(n) || 0);

const CHOICES = [
  { key: BALANCE_CHOICE.plan, label: "New plan item", hint: "Current Sales Plan, open, in the month below" },
  { key: BALANCE_CHOICE.lead, label: "New lead deal in the pipeline", hint: "Stage Lead, closing in the month below" },
  { key: BALANCE_CHOICE.drop, label: "Drop it — the customer reduced the order", hint: "Nothing is created" },
];

export default function BalancePromptModal({ deal, balance, saving = false, error = "", onConfirm, onCancel, now = new Date() }) {
  const [choice, setChoice] = useState(BALANCE_CHOICE.plan);
  const months = balanceMonths(now);
  const [monthKey, setMonthKey] = useState("current");
  const month = months.find((m) => m.key === monthKey) || months[0];

  return (
    <>
      <div className="fixed inset-0 z-[710] bg-black/40 backdrop-blur-sm" onClick={saving ? undefined : onCancel} />
      <div className="fixed inset-0 z-[710] flex items-center justify-center p-4 pointer-events-none">
        <div
          role="dialog"
          aria-label="Unbilled balance"
          data-testid="balance-prompt"
          className="bg-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden pointer-events-auto border border-border"
        >
          <div className="px-6 py-4 border-b border-border bg-amber-50">
            <h2 className="text-base font-semibold flex items-center gap-2 text-amber-800">
              <Icon name="SquareSplitHorizontal" size={16} />
              <span data-testid="balance-amount">{SAR(balance)}</span> not invoiced
            </h2>
            <p className="text-xs mt-0.5 font-medium text-amber-700 truncate">
              {deal?.title || "Deal"} · What happens to the balance?
            </p>
          </div>

          <div className="px-6 py-5 space-y-4">
            <fieldset className="space-y-2">
              {CHOICES.map((c) => (
                <label
                  key={c.key}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    choice === c.key ? "border-amber-400 bg-amber-50/60" : "border-border hover:bg-muted/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="balance-choice"
                    value={c.key}
                    data-testid={`balance-choice-${c.key}`}
                    checked={choice === c.key}
                    onChange={() => setChoice(c.key)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-sm font-medium text-foreground">{c.label}</span>
                    <span className="block text-xs text-muted-foreground">{c.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            {choice !== BALANCE_CHOICE.drop && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block" htmlFor="balance-month">
                  {choice === BALANCE_CHOICE.plan ? "Plan month" : "Expected close"}
                </label>
                <select
                  id="balance-month"
                  data-testid="balance-month"
                  value={monthKey}
                  onChange={(e) => setMonthKey(e.target.value)}
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                >
                  {months.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}{m.key === "current" ? " (this month)" : ""}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  Same customer, owner and division as this deal.
                </p>
              </div>
            )}

            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <div className="px-6 py-4 border-t border-border flex gap-3 justify-end">
            <button
              onClick={onCancel}
              disabled={saving}
              className="px-4 py-2 text-sm border border-border rounded-xl text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              Decide later
            </button>
            <button
              onClick={() => onConfirm?.({ choice, month })}
              disabled={saving}
              data-testid="balance-confirm"
              className="flex items-center gap-2 px-5 py-2 text-sm text-white font-medium rounded-xl transition-colors disabled:opacity-50 bg-amber-600 hover:bg-amber-700"
            >
              {saving && <Icon name="Loader2" size={14} className="animate-spin" />}
              Confirm
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
