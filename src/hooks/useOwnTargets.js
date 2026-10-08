import { useCallback, useEffect, useMemo, useState } from 'react';
import { salesTargetService } from 'services/supabaseService';
import { fetchReturns } from 'utils/planningCalculations';
import {
  withTargetRowProgress, targetRowsWindow, achievedForRows,
} from 'utils/targetProgress';

/**
 * THE TARGET TABLES' DATA, for one person's own scope.
 *
 * Insights now shows a salesman and a supervisor their assigned targets and
 * their product targets, which until now only the Dashboard did. This is the
 * WIRING for those two tables — which rows to read, over which window, with
 * which people — so the new screen cannot assemble them slightly differently
 * from the old one.
 *
 * It computes nothing itself. Progress comes from utils/targetProgress.js
 * (withTargetRowProgress, achievedForRows, targetRowsWindow) and product
 * progress from salesTargetService.calculateProductTargetProgress — the same
 * three rules the Dashboard calls, unchanged.
 *
 * Returns net of credit notes, like every other Achieved figure: fetchReturns
 * over the widest window the rows cover. A failed read degrades to gross
 * (fetchReturns logs and returns []), which is what these tables showed before
 * returns existed.
 *
 * NOTE — the dashboards still hold their own copy of this wiring inline
 * (EnhancedSalesmanDashboard, EnhancedSupervisorDashboard). They were not
 * rewired in this session: they are 2,240 and 3,394 lines, they stay reachable
 * through "View As" for a manager, and changing them is a separate, testable
 * step. Until then the two can drift, and this is the file to converge on.
 *
 * @param {string}   companyId
 * @param {string[]} ownerIds   whose targets to read — one salesman, or a team
 * @param {object[]} people     the user rows the rule needs (role, is_active)
 * @param {object}   deals      every deal already loaded by the caller
 * @param {object}   range      { from, to } as yyyy-MM-dd — the selected period
 * @param {function} amountOf   deal → money, for currency conversion
 */
export function useOwnTargets({
  companyId, ownerIds, people, deals, range, amountOf,
}) {
  const [rows, setRows] = useState([]);
  const [productRows, setProductRows] = useState([]);
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const ids = useMemo(() => (ownerIds || []).filter(Boolean), [ownerIds]);
  const idKey = ids.join(',');

  // ── the target rows, and the product rows that hang off them ──────────────
  useEffect(() => {
    let alive = true;
    if (!companyId || !ids.length) {
      setRows([]);
      setProductRows([]);
      return undefined;
    }
    setLoading(true);
    setError(null);
    (async () => {
      try {
        // One read per person, the same call the Dashboard makes. getMyTargets
        // is per assignee, so a team is the union of its members' rows.
        const perPerson = await Promise.all(
          ids.map((id) => salesTargetService.getMyTargets(companyId, id)),
        );
        if (!alive) return;
        const all = perPerson.flatMap((r) => r?.data || []);

        const productTargetIds = all
          .filter((t) => t.target_type === 'by_products')
          .map((t) => t.id);

        let products = [];
        if (productTargetIds.length) {
          const { data } = await salesTargetService
            .getProductTargetsBySalesTargetIds(productTargetIds);
          products = data || [];
        }
        if (!alive) return;
        setRows(all);
        setProductRows(products);
      } catch (e) {
        if (alive) {
          console.error('useOwnTargets:', e);
          setError(e.message || String(e));
          setRows([]);
          setProductRows([]);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, idKey]);

  // ── the rows this period covers ───────────────────────────────────────────
  // A row counts when its period OVERLAPS the selection, which is the
  // Dashboard's rule: a yearly row is shown while looking at one of its months.
  const periodRows = useMemo(() => {
    if (!rows.length || !range?.from || !range?.to) return rows;
    const from = new Date(`${range.from}T00:00:00`);
    const to = new Date(`${range.to}T23:59:59`);
    return rows.filter((t) => new Date(t.period_start) <= to
      && new Date(t.period_end) >= from);
  }, [rows, range?.from, range?.to]);

  // ── returns, over the widest window in play ───────────────────────────────
  const window = useMemo(() => {
    const w = targetRowsWindow(rows || []);
    const days = [w?.start, w?.end, range?.from, range?.to].filter(Boolean).sort();
    return days.length ? { start: days[0], end: days[days.length - 1] } : null;
  }, [rows, range?.from, range?.to]);

  useEffect(() => {
    let alive = true;
    if (!companyId || !ids.length || !window) {
      setReturns([]);
      return undefined;
    }
    fetchReturns({
      companyId, ownerIds: ids, start: window.start, end: window.end,
    }).then((r) => { if (alive) setReturns(r || []); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, idKey, window?.start, window?.end]);

  // ── progress, by the shared rules ─────────────────────────────────────────
  const targetRows = useMemo(() => {
    if (!periodRows.length) return periodRows;
    return withTargetRowProgress(periodRows, {
      deals: deals || [],
      returns,
      users: people || [],
      amountOf,
    });
  }, [periodRows, deals, returns, people, amountOf]);

  // "Total Achieved" under a selection: Achieved over the selected ROWS' own
  // window, read once — never a sum of row progress, which counts the same
  // revenue once per row a person holds in the same month.
  const totalAchievedFor = useCallback(
    (selected) => achievedForRows(selected, {
      deals: deals || [],
      returns,
      users: people || [],
      amountOf,
      ...(targetRowsWindow(selected) || {}),
    }),
    [deals, returns, people, amountOf],
  );

  const productTargets = useMemo(
    () => salesTargetService.calculateProductTargetProgress(
      productRows, deals || [], ids.length ? ids : null,
    ),
    [productRows, deals, idKey],
  );

  return { targetRows, totalAchievedFor, productTargets, loading, error };
}

export default useOwnTargets;
