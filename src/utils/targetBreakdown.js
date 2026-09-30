// What the Target card is made of: by target type, and by division.
//
// Both breakdowns are built from the SAME rows the card totals, and both are
// required to sum exactly to it. A breakdown that does not reconcile with the
// headline is worse than no breakdown, so the totals are returned alongside for
// callers (and tests) to assert on.
import { targetRowValue } from 'utils/planningCalculations';

const UNASSIGNED_DIVISION = 'unassigned';

// Only the two types exist in the data today; by_product is specified but
// unused. Anything unknown is prettified rather than dropped, so a new type
// appears in the breakdown the day it is first assigned.
const TYPE_LABELS = {
  total_value: 'Overall value',
  by_clients: 'By client',
  by_product: 'By product group',
  by_products: 'By product group',
};

export function labelForTargetType(type) {
  if (!type) return 'Unspecified';
  return TYPE_LABELS[type] || String(type).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * One entry per target_type held in the period.
 *
 * Target rows are ADDITIVE — a person holding a total_value AND a by_clients
 * row in the same month carries both commitments, which is why the card shows
 * their sum (see targetPerPerson). This breakdown is therefore a partition of
 * the card total, not alternative views of it.
 *
 * A row's own client_targets children are collapsed by targetRowValue, so a
 * by_clients header and its per-client rows can never both be counted.
 */
export function breakdownByType(targetRows) {
  const byType = new Map();
  let total = 0;
  (targetRows || []).forEach((row) => {
    const value = targetRowValue(row);
    if (!value) return;
    const key = row?.target_type || 'unspecified';
    if (!byType.has(key)) byType.set(key, { type: key, label: labelForTargetType(row?.target_type), amount: 0, rowCount: 0 });
    const e = byType.get(key);
    e.amount += value;
    e.rowCount += 1;
    total += value;
  });
  const rows = [...byType.values()].sort((a, b) => b.amount - a.amount);
  return { rows, total, typeCount: rows.length };
}

/** Every division a person belongs to: primary first, then the additional ones. */
export function divisionsOfPerson(user, extras) {
  const primary = user?.sales_division_id ? String(user.sales_division_id) : null;
  const all = [...new Set([primary, ...(extras || []).map((d) => String(d))].filter(Boolean))];
  return { primary, all };
}

/**
 * How ONE target row is attributed to a division.
 *
 *   row      the row names its own division_id — the real answer
 *   primary  no division_id, but the owner is in exactly one division, so
 *            there is only one answer it could have
 *   unsplit  no division_id and the owner is in SEVERAL divisions: the split
 *            was never recorded. Held against their primary division so the
 *            parts still sum, and reported as unsplit so it can be corrected.
 *   none     the owner has no division at all — nothing to attribute to
 */
export function attributionFor(row, user, extras) {
  const { primary, all } = divisionsOfPerson(user, extras);
  if (row?.division_id) return { divisionId: String(row.division_id), basis: 'row' };
  if (all.length === 1) return { divisionId: all[0], basis: 'primary' };
  if (all.length > 1) return { divisionId: primary, basis: 'unsplit' };
  return { divisionId: null, basis: 'none' };
}

/**
 * One entry per division, for a card whose total is a roll-up of several
 * people's targets.
 *
 * A target row may now carry its own division_id, and when it does that is
 * simply used. Where it is NULL the old rule still applies, because NULL means
 * one of two things and neither is a licence to guess:
 *
 *   - the owner is in exactly one division, so the row can only belong there
 *     (this is what the migration filled in for everyone single-division);
 *   - the owner is in several and the split was never recorded. Inventing a
 *     ratio would read as fact, so the whole amount is held against their
 *     primary division, exactly as before, and surfaced as `unsplitAmount` so
 *     the number can be corrected rather than quietly believed.
 *
 * Either way each ROW is counted exactly once, so the parts sum to the total.
 *
 * @param {object[]} targetRows   rows in the period, may carry division_id
 * @param {object[]} users        { id, full_name, sales_division_id }
 * @param {object[]} divisions    { id, name }
 * @param {object}   extraByUser  userId -> [divisionId] additional memberships
 */
export function breakdownByDivision({ targetRows, users, divisions, extraByUser = {} }) {
  const divisionName = new Map((divisions || []).map((d) => [String(d.id), d.name]));
  const userById = new Map((users || []).map((u) => [String(u.id), u]));

  const groups = new Map();
  const seenPeople = new Map();   // "divisionKey|personId" -> person entry
  const multiDivisionPeople = new Set();
  let total = 0;
  let unsplitAmount = 0;
  let unsplitRowCount = 0;

  (targetRows || []).forEach((row) => {
    const value = targetRowValue(row);
    if (!value || !row?.assigned_to) return;
    const id = String(row.assigned_to);
    const user = userById.get(id);
    const extras = extraByUser?.[id] || [];
    const { primary, all } = divisionsOfPerson(user, extras);
    if (all.length > 1) multiDivisionPeople.add(id);

    const { divisionId, basis } = attributionFor(row, user, extras);
    const key = divisionId || UNASSIGNED_DIVISION;
    if (!groups.has(key)) {
      groups.set(key, {
        divisionId: divisionId || null,
        name: divisionId ? (divisionName.get(divisionId) || 'Unknown division') : 'No division',
        amount: 0,
        unsplitAmount: 0,
        people: [],
      });
    }
    const g = groups.get(key);
    g.amount += value;
    total += value;
    if (basis === 'unsplit') {
      g.unsplitAmount += value;
      unsplitAmount += value;
      unsplitRowCount += 1;
    }

    const personKey = `${key}|${id}`;
    if (!seenPeople.has(personKey)) {
      const entry = {
        id,
        name: user?.full_name || 'Unknown',
        amount: 0,
        unsplitAmount: 0,
        // Other divisions this person belongs to, for context only — never a
        // second amount.
        alsoIn: all.filter((d) => d !== (divisionId || primary)).map((d) => divisionName.get(d) || 'Unknown division'),
      };
      seenPeople.set(personKey, entry);
      g.people.push(entry);
    }
    const p = seenPeople.get(personKey);
    p.amount += value;
    if (basis === 'unsplit') p.unsplitAmount += value;
  });

  const rows = [...groups.values()]
    .map((g) => ({ ...g, people: g.people.sort((a, b) => b.amount - a.amount) }))
    .sort((a, b) => b.amount - a.amount);

  return {
    rows,
    total,
    divisionCount: rows.length,
    multiDivisionCount: multiDivisionPeople.size,
    unsplitAmount,
    unsplitRowCount,
    // Every ROW counted once means this always holds; asserted in tests so a
    // future change to the attribution rule cannot quietly break it.
    reconciles: Math.abs(rows.reduce((s, g) => s + g.amount, 0) - total) < 0.005,
  };
}
