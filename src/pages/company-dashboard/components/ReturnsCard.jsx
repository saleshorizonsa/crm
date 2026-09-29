import React, { useState, useEffect } from "react";
import MetricsCard from "./MetricsCard";
import { useAuth } from "../../../contexts/AuthContext";
import { fetchReturnsSummary } from "../../../utils/returnsSummary";

// Sales returns this month, on every dashboard. One component rather than four
// copies, so the role scoping cannot drift between them — it all comes from
// utils/returnsSummary.js.
//
// Informational only: returns already reduce Achieved wherever it is shown, so
// this card changes no figure. It answers "how much came back this month",
// which was previously invisible.
//
// An increase is bad news, so a rise is red and a fall is green — the opposite
// of a revenue card, which is why changeType is inverted here.
const ReturnsCard = ({ userId, role, companyId, now }) => {
  const { user, userProfile, company } = useAuth();
  const ownerId = userId || user?.id;
  const ownerRole = role || userProfile?.role;
  const cid = companyId || company?.id;

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!cid || !ownerId) { setLoading(false); return undefined; }
    setLoading(true);
    (async () => {
      const s = await fetchReturnsSummary({
        companyId: cid, userId: ownerId, role: ownerRole, now: now || new Date(),
      });
      if (!cancelled) { setSummary(s); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [cid, ownerId, ownerRole, now]);

  if (loading) return <MetricsCard title="Returns This Month" value={0} icon="Undo2" isLoading />;
  // null means the read failed. Better to show nothing than a confident 0 that
  // reads as "no returns this month".
  if (!summary) return null;

  const { total, count, prevTotal, changePct, direction } = summary;

  const subtitle = count === 0
    ? "No returns this month"
    : `${count} return line${count === 1 ? "" : "s"}`;

  // A rise in returns is negative news; a fall is positive.
  const changeType = direction === "up" ? "negative" : direction === "down" ? "positive" : "neutral";
  const change = changePct === null
    ? (prevTotal === 0 && total > 0 ? "none last month" : null)
    : `${changePct > 0 ? "+" : ""}${changePct.toFixed(1)}% vs last month`;

  return (
    <MetricsCard
      title="Returns This Month"
      value={total}
      subtitle={subtitle}
      change={change}
      changeType={changeType}
      // The arrow follows the DIRECTION of the number, while the colour follows
      // whether that direction is good — an increase is an up arrow in red.
      changeIcon={direction === "up" ? "TrendingUp" : direction === "down" ? "TrendingDown" : "Minus"}
      icon="Undo2"
      iconColor="var(--color-error)"
      iconBgColor="bg-red-50"
    />
  );
};

export default ReturnsCard;
