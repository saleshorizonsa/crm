// Which division a TARGET ROW or a PLAN ITEM belongs to.
//
// WHY THIS EXISTS. Targets and plan items used to be attributed per PERSON,
// while deals were attributed by deals.division_id. Someone in two divisions
// therefore had their whole target and whole plan counted in BOTH: Mohamed
// Kamal is in Export and PVC Compound, and the October panel summed to 5.75M of
// target against a company target of 3.70M. Business decision 2026-10-06
// (option 2) attributes them by division, like deals — which means whoever
// writes the row has to say which division it is for.
//
// SHOWN ONLY WHEN THERE IS A CHOICE. A person in one division has nothing to
// pick, and a field with a single option is a question with one answer: the
// component renders null, and the BEFORE INSERT trigger in
// migrations/division_attribution.sql fills the column from the owner's primary
// division. So the forms look exactly as they do today for everyone except the
// handful of people who actually span divisions.
//
// ONE implementation for all five write paths (the four target-assignment
// components and the plan-item form) rather than a copy per form, for the same
// reason the figures live in utils/: five copies drift, and a division picker
// that disagrees with itself puts the same business in two divisions again.

import React, { useEffect, useState } from "react";
import { supabase } from "lib/supabase";
import { fetchAdditionalDivisions, divisionIdsForUser } from "utils/divisionMembership";

/**
 * Loads the divisions one person belongs to.
 *
 * @returns {{ options: Array<{id: string, name: string}>, primaryId: string|null, loading: boolean }}
 *   `options` is primary-first and empty while loading or when the person has
 *   no division at all.
 */
export function useDivisionsForUser({ companyId, userId }) {
  const [state, setState] = useState({ options: [], primaryId: null, loading: false });

  useEffect(() => {
    let cancelled = false;
    if (!companyId || !userId) {
      setState({ options: [], primaryId: null, loading: false });
      return () => {};
    }
    setState((s) => ({ ...s, loading: true }));

    (async () => {
      try {
        const [{ data: user }, additionalByUser, { data: divisions }] = await Promise.all([
          supabase.from("users").select("id, sales_division_id").eq("id", userId).maybeSingle(),
          fetchAdditionalDivisions({ companyId, userIds: [userId] }),
          supabase
            .from("sales_divisions")
            .select("id, name, sort_order")
            .eq("company_id", companyId)
            .order("sort_order"),
        ]);
        if (cancelled) return;

        // divisionIdsForUser() puts the primary first and de-duplicates, so a
        // primary that is also listed in user_sales_divisions appears once.
        const ids = divisionIdsForUser(user || { id: userId }, additionalByUser);
        const byId = {};
        (divisions || []).forEach((d) => { byId[d.id] = d; });
        setState({
          options: ids.map((id) => ({ id, name: byId[id]?.name || "Unnamed division" })),
          primaryId: user?.sales_division_id || null,
          loading: false,
        });
      } catch (err) {
        // Degrade to "no choice", which is the pre-multi-division behaviour:
        // the picker hides and the trigger supplies the owner's primary. Better
        // than blocking a target assignment because one lookup failed.
        console.error("useDivisionsForUser:", err);
        if (!cancelled) setState({ options: [], primaryId: null, loading: false });
      }
    })();

    return () => { cancelled = true; };
  }, [companyId, userId]);

  return state;
}

/**
 * The picker itself. Renders NOTHING unless the person holds more than one
 * division, and reports the primary as the default the moment it knows it.
 *
 * @param {string} p.companyId
 * @param {string} p.userId      whose divisions to offer (assignee or plan owner)
 * @param {string|null} p.value  currently selected division id
 * @param {function} p.onChange  (divisionId) => void — also called with the
 *                               default (the primary) when the person changes
 * @param {string} [p.label]
 */
export default function DivisionPicker({
  companyId,
  userId,
  value,
  onChange,
  label = "Division",
  className = "",
}) {
  const { options, primaryId } = useDivisionsForUser({ companyId, userId });

  // Default to the primary, and re-default when the selected person changes or
  // when the current value is not one this person belongs to — otherwise
  // switching assignee could silently file the row under the previous
  // assignee's division.
  //
  // REPORTS NOTHING WHEN THERE IS NO CHOICE. For the great majority — one
  // division, no picker on screen — the form sends no division_id at all and
  // the BEFORE INSERT trigger fills it from the owner's primary. Reporting the
  // primary here instead would come to the same number today, but it would make
  // the app the thing that decides, and the trigger (which also covers every
  // other insert path, including the ones with no form at all) the thing that
  // never fires. One rule, in one place.
  useEffect(() => {
    if (options.length < 2) {
      if (value) onChange(null);
      return;
    }
    const valid = options.some((o) => o.id === value);
    if (!valid) onChange(primaryId || options[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.map((o) => o.id).join(","), primaryId]);

  if (options.length < 2) return null;

  return (
    <div className={className}>
      <label className="block text-sm font-medium text-card-foreground mb-1">
        {label}
      </label>
      <select
        value={value || primaryId || ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:border-blue-400"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
            {o.id === primaryId ? " (primary)" : ""}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-muted-foreground">
        This person belongs to {options.length} divisions — the figure is
        counted in the one chosen here, not in both.
      </p>
    </div>
  );
}
