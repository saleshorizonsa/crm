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

/**
 * One entry per division, for a card whose total is a roll-up of several
 * people's targets.
 *
 * sales_targets has NO division_id — a target belongs to a PERSON, not a
 * division — so a division figure can only be assembled by attributing each
 * person's target to a division. With multi-division membership that is where
 * the double count creeps in: counting a person under every division they
 * belong to inflates the total by their whole target for each extra division.
 *
 * So each person is counted EXACTLY ONCE, under their primary division
 * (users.sales_division_id). Their additional memberships are reported on the
 * person as `alsoIn` — visible, but never a second amount. Splitting the target
 * across their divisions was rejected: nothing in the data says how it divides,
 * and an invented split would read as fact.
 *
 * @param {object[]} targetRows   monthly rows in the period
 * @param {object[]} users        { id, full_name, sales_division_id }
 * @param {object[]} divisions    { id, name }
 * @param {object}   extraByUser  userId -> [divisionId] additional memberships
 */
export function breakdownByDivision({ targetRows, users, divisions, extraByUser = {} }) {
  const divisionName = new Map((divisions || []).map((d) => [String(d.id), d.name]));
  const userById = new Map((users || []).map((u) => [String(u.id), u]));

  // Per person first — a person is the unit that gets counted once.
  const perPerson = new Map();
  let total = 0;
  (targetRows || []).forEach((row) => {
    const value = targetRowValue(row);
    if (!value || !row?.assigned_to) return;
    const id = String(row.assigned_to);
    if (!perPerson.has(id)) perPerson.set(id, 0);
    perPerson.set(id, perPerson.get(id) + value);
    total += value;
  });

  const groups = new Map();
  let multiDivisionCount = 0;

  perPerson.forEach((amount, id) => {
    const user = userById.get(id);
    const primary = user?.sales_division_id ? String(user.sales_division_id) : null;
    const key = primary || UNASSIGNED_DIVISION;
    if (!groups.has(key)) {
      groups.set(key, {
        divisionId: primary,
        name: primary ? (divisionName.get(primary) || 'Unknown division') : 'No division',
        amount: 0,
        people: [],
      });
    }
    const extras = (extraByUser?.[id] || [])
      .map((d) => String(d))
      .filter((d) => d !== primary)
      .map((d) => divisionName.get(d) || 'Unknown division');
    if (extras.length) multiDivisionCount += 1;

    const g = groups.get(key);
    g.amount += amount;
    g.people.push({ id, name: user?.full_name || 'Unknown', amount, alsoIn: extras });
  });

  const rows = [...groups.values()]
    .map((g) => ({ ...g, people: g.people.sort((a, b) => b.amount - a.amount) }))
    .sort((a, b) => b.amount - a.amount);

  return {
    rows,
    total,
    divisionCount: rows.length,
    multiDivisionCount,
    // Every person counted once means this always holds; asserted in tests so a
    // future change to the attribution rule cannot quietly break it.
    reconciles: Math.abs(rows.reduce((s, g) => s + g.amount, 0) - total) < 0.005,
  };
}
