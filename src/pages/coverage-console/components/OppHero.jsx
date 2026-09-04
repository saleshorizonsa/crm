import React from "react";

// Deal-level hero. Replaces the coverage rail at the opportunity level, where
// a single deal has no coverage equation of its own — what matters instead is
// its size, its weighted contribution, and how long it has been sitting.
const OppHero = ({ deal, compact, SAR, pctFmt }) => {
  if (!deal) return null;

  const prob = Number(deal.forecast_probability || 0);
  const weighted =
    deal.forecast_amount != null
      ? Number(deal.forecast_amount)
      : Number(deal.amount || 0) * (prob / 100);

  const anchor = deal.stage_changed_at || deal.created_at;
  const daysInStage = anchor
    ? Math.floor((Date.now() - new Date(anchor).getTime()) / 86400000)
    : null;
  const slaBreach = daysInStage != null && daysInStage > 3;

  const contact = deal.contacts;
  const customer =
    contact?.company_name ||
    `${contact?.first_name || ""} ${contact?.last_name || ""}`.trim() ||
    "\u2014";

  const tiles = [
    { label: "Deal value", value: `${compact(deal.amount)} SAR`, tone: "text-gray-900" },
    { label: "Weighted", value: `${compact(weighted)} SAR`, tone: "text-emerald-700" },
    { label: "Probability", value: `${prob}%`, tone: "text-blue-600" },
    {
      label: "Days in stage",
      value: daysInStage != null ? `${daysInStage}d` : "\u2014",
      tone: slaBreach ? "text-red-600" : "text-gray-900",
    },
  ];

  return (
    <div>
      <div className="grid grid-cols-4 gap-3 mb-4">
        {tiles.map((t) => (
          <div key={t.label} className="bg-gray-50 rounded-xl px-3 py-2.5">
            <div className="text-[9px] font-mono text-gray-400 uppercase tracking-widest mb-1">
              {t.label}
            </div>
            <div className={`text-sm font-semibold font-mono ${t.tone}`}>
              {t.value}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap text-[11px] font-mono">
        <span className="text-gray-500">
          Customer <span className="text-gray-900 font-semibold">{customer}</span>
        </span>
        <span className="text-gray-300">|</span>
        <span className="text-gray-500">
          Stage{" "}
          <span className="text-gray-900 font-semibold capitalize">
            {String(deal.stage || "").replace(/_/g, " ")}
          </span>
        </span>
        {slaBreach && (
          <span className="ml-auto text-[10px] font-semibold px-2 py-1 rounded-full border bg-red-50 text-red-800 border-red-200">
            SLA breach &middot; no movement in {daysInStage}d
          </span>
        )}
      </div>
    </div>
  );
};

export default OppHero;
