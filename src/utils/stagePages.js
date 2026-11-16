import { resolveTabs, rowMatches, defaultSelection } from 'utils/drillTabs';
import { achievedAmount } from 'utils/planningCalculations';
import { riyadhDate } from 'utils/visits';
import { THRESHOLDS } from 'utils/salesMonitorThresholds';
import { daysBetween } from 'utils/salesMonitor';
import { exceptionAction } from 'utils/exceptionActions';

/**
 * SALES MONITOR STAGE PAGES (session 39, CEO 2026-11-16).
 *
 * Opening a card took too many clicks. Each stage of the process now has one
 * page showing everything, expandable in place:
 *
 *   /sales-monitor/target      salesman ▸ target lines
 *   /sales-monitor/planned     salesman ▸ plan items (with outcome)
 *   /sales-monitor/funnel      salesman ▸ customer ▸ deals or plan items (session 41)
 *   /sales-monitor/visits      salesman ▸ customer ▸ visits
 *   /sales-monitor/achieved    salesman ▸ customer ▸ invoices
 *   /sales-monitor/exceptions  group ▸ exception ▸ record
 *
 * NOTHING HERE COMPUTES A FIGURE. Every row is one computeSalesMonitor
 * already made: a page's lists are the card's own tabs (model.drills[card].
 * tabs — session 36's filters), resolved by utils/drillTabs.js, and every
 * level's value is that tab's own total function over the rows under it. So a
 * page's total IS its card's figure, and a salesman row IS the sum of what it
 * expands into. The one list that is not a card tab — Won not invoiced on the
 * Achieved page — is the rows calcDivisionMetrics already returned, summed
 * with achievedAmount, exactly as the Won-not-invoiced figure is.
 *
 * Next steps are counts over these same rows, each linking to the list it
 * counted; thresholds come from utils/salesMonitorThresholds.js.
 */

/* ── the stages and their views ─────────────────────────────────────────── */

export const STAGES = [
  { id: 'target', n: 1, name: 'Target', views: ['target'] },
  { id: 'planned', n: 2, name: 'Planned', views: ['planStatus', 'planned'] },
  // Session 41: plan items become deals and move through the stages.
  { id: 'funnel', n: 3, name: 'Funnel', views: ['funnel'] },
  { id: 'visits', n: 4, name: 'Visits', views: ['visits'] },
  { id: 'achieved', n: 5, name: 'Achieved', views: ['achieved', 'fromPlan', 'outcomes', 'wni'] },
  { id: 'exceptions', n: null, name: 'Exceptions', views: ['exceptions'] },
];
export const STAGE_IDS = STAGES.map((s) => s.id);
export const stageById = (id) => STAGES.find((s) => s.id === id) || null;

export const VIEW_LABEL = {
  target: 'Target',
  planStatus: 'Plan submission',
  planned: 'Planned',
  visits: 'Visits, calls and WhatsApps',
  achieved: 'Achieved',
  fromPlan: 'From plan vs outside plan',
  outcomes: 'Plan outcomes',
  wni: 'Won not invoiced',
  funnel: 'Funnel',
  exceptions: 'Exceptions',
};

/** Which page, view and tab each monitor card opens. */
export const CARD_LINK = {
  target: { stage: 'target', view: 'target' },
  planStatus: { stage: 'planned', view: 'planStatus' },
  planned: { stage: 'planned', view: 'planned' },
  funnelPlan: { stage: 'funnel', view: 'funnel', tab: ['planDeal'] },
  funnelStages: { stage: 'funnel', view: 'funnel', tab: ['byStage'] },
  funnelMoves: { stage: 'funnel', view: 'funnel', tab: ['moves7'] },
  funnelStuck: { stage: 'funnel', view: 'funnel', tab: ['stuck'] },
  visits: { stage: 'visits', view: 'visits' },
  plannedVisited: { stage: 'visits', view: 'visits', tab: ['notVisited'] },
  achieved: { stage: 'achieved', view: 'achieved' },
  fromPlan: { stage: 'achieved', view: 'fromPlan' },
  outcomes: { stage: 'achieved', view: 'outcomes' },
  exceptions: { stage: 'exceptions', view: 'exceptions' },
};

/**
 * Narrower lists a next step links to: a filter over a tab's rows. The id
 * travels in the URL (?only=…), so a link is a plain address.
 */
export const ONLY = {
  noNext: { label: 'without a next action', test: (r) => !String(r.nextAction || '').replace(/^—$/, '').trim() },
  moved: { label: 'moved to a later month', test: (r) => /^→/.test(String(r.detail || '')) },
  notStarted: { label: 'not started (still open)', test: (r) => r.partKey === 'notStarted' },
  large: { label: `over ${Math.round(THRESHOLDS.negotiationLargeAmount).toLocaleString('en-US')}`, test: (r) => Number(r.value) > THRESHOLDS.negotiationLargeAmount },
};
const onlyFilter = (only) => {
  if (!only) return null;
  if (ONLY[only]) return ONLY[only];
  const m = /^rule:([a-z_]+)$/.exec(only);
  if (m) return { label: `rule ${m[1].replace(/_/g, ' ')}`, test: (r) => r.rule === m[1] };
  return null;
};

/** The address of a stage page (or the monitor) with month, division, day and the list. */
export function stageQuery({ month, division, day, view, tab, only } = {}) {
  const p = new URLSearchParams();
  if (month) p.set('month', month);
  if (division) p.set('division', division);
  if (day) p.set('day', day);
  if (view) p.set('view', view);
  if (tab && tab.length) p.set('tab', tab.join(','));
  if (only) p.set('only', only);
  const q = p.toString();
  return q ? `?${q}` : '';
}
export const stageHref = (stage, o = {}) => `/sales-monitor/${stage}${stageQuery(o)}`;
export const monitorHref = (o = {}) => `/sales-monitor${stageQuery({ month: o.month, division: o.division, day: o.day })}`;

/* ── helpers ────────────────────────────────────────────────────────────── */

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const sum = (rows, f) => rows.reduce((s, r) => s + num(f(r)), 0);
const pct = (a, b) => (num(b) > 0 ? (num(a) / num(b)) * 100 : null);
const uniq = (xs) => [...new Set(xs.filter((x) => x !== null && x !== undefined && x !== ''))];
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const fmt = (v) => Math.round(num(v)).toLocaleString('en-US');
const groupBy = (rows, f) => {
  const m = new Map();
  rows.forEach((r) => { const k = f(r) ?? '—'; if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
  return [...m.entries()];
};
const byValue = (a, b) => (num(b.value) - num(a.value)) || String(a.name).localeCompare(String(b.name));

/** What search looks at, on every level: names, customers, deals, invoices. */
export const STAGE_SEARCH_KEYS = ['person', 'customer', 'title', 'invoiceNumber', 'dealTitle', 'detail', 'targetType', 'nextAction', 'division', 'owner'];

/** Column sets, by level. type: money | pct | date | month | text | int */
const C = {
  division: { key: 'division', label: 'Division' },
};

/**
 * Everything one stage needs from the model, built once per model: the tabs
 * of every view, lookups from a tab row back to the row it was made from.
 */
export function stageContext(model) {
  const people = new Map(model.people.map((p) => [p.id, p]));
  const divName = (id) => (model.groups.find((g) => g.id === id)?.name) || 'Unassigned';
  const nameOf = (id, fallback) => people.get(id)?.name || fallback || model.userName?.(id) || 'Unknown';
  const tabs = {};
  ['target', 'planStatus', 'planned', 'visits', 'achieved', 'fromPlan', 'outcomes', 'exceptions'].forEach((k) => {
    tabs[k] = model.drills?.[k]?.tabs || null;
  });
  tabs.funnel = model.funnel?.tabs || null;

  // Won not invoiced: the rows calcDivisionMetrics returned for the page
  // total, summed with achievedAmount — the Won-not-invoiced figure itself.
  const wniRows = (model.metrics?.drill?.wonNotInvoicedRows || []).map((d) => {
    const won = riyadhDate(d.closed_at || d.stage_changed_at);
    return {
      dealId: d.id,
      personId: d.owner_id,
      person: nameOf(d.owner_id),
      divisionId: d.division_id || 'unassigned',
      customer: model.customerOfDeal(d),
      title: d.title || '—',
      wonDate: won,
      daysWon: won ? daysBetween(won, model.today) : null,
      value: achievedAmount(d),
    };
  });
  tabs.wni = {
    base: {
      rows: wniRows,
      total: (rs) => sum(rs, (x) => x.value),
      columns: [
        { key: 'title', label: 'Deal' },
        { key: 'wonDate', label: 'Won', type: 'date' },
        { key: 'daysWon', label: 'Days since won', type: 'int' },
        { key: 'value', label: 'Amount', type: 'money' },
      ],
      unit: 'SAR',
      explain: 'Won deals not yet invoiced — the Won not invoiced figure. Each one is cleared by marking it invoiced in the pipeline.',
    },
    sets: [],
  };

  // A visit row → its contact row (buildTabs made visRows from mtdContacts in
  // order and its filters keep the same objects).
  const visitBase = tabs.visits?.base?.rows || [];
  const contactOf = new Map(visitBase.map((r, i) => [r, model.mtdContacts[i]]));
  // A "planned not visited" row → its plan customer, the same way.
  const nvOpt = tabs.visits?.sets?.[0]?.options?.find((o) => o.id === 'notVisited');
  const notVisitedGroups = model.planCustomerRows.filter((g) => !g.visited);
  const planCustomerOf = new Map((nvOpt?.rows || []).map((r, i) => [r, notVisitedGroups[i]]));
  // Plan now items (the Planned card's own rows), per person.
  const nowOpt = tabs.planned?.sets?.[0]?.options?.find((o) => o.id === 'now');
  const nowRows = nowOpt?.rows || [];
  const pcByKey = new Map(model.planCustomerRows.map((g) => [g.key, g]));
  const pcByName = new Map(model.planCustomerRows.map((g) => [`${g.ownerId}|${g.customer}`, g]));

  return {
    model, people, divName, nameOf, tabs, contactOf, planCustomerOf, nowRows, pcByKey, pcByName, wniRows,
  };
}

/** One option id per set: the given one where it exists, else the first. */
export function normalizeSelection(tabs, selection) {
  const first = defaultSelection(tabs);
  return (tabs?.sets || []).map((set, i) => {
    const want = selection?.[i];
    return set.options.some((o) => o.id === want) ? want : first[i];
  });
}

/* ── per-view shapes ─────────────────────────────────────────────────────── */

/** The tab's value column: what the number on every row is. */
function valueLabelOf(viewId, sel) {
  if (viewId === 'target') return 'Target';
  if (viewId === 'planStatus') return 'People';
  if (viewId === 'planned') return ({ submitted: 'Submitted plan', now: 'Plan now', below: 'Missing', none: 'People' })[sel[0]] || 'Plan now';
  if (viewId === 'visits') return sel[0] === 'notVisited' ? 'Customers' : 'Contacts';
  if (viewId === 'achieved') return sel[0] === 'invoices' ? 'Net' : 'Amount';
  if (viewId === 'fromPlan') return 'Amount';
  if (viewId === 'outcomes') return 'Planned';
  if (viewId === 'wni') return 'Amount';
  if (viewId === 'funnel') return ({ planDeal: 'Planned', moves7: 'Moves', movesMtd: 'Moves', autoMoved: 'Planned' })[sel[0]] || 'Amount';
  if (viewId === 'exceptions') return 'Exceptions';
  return 'Value';
}

/** The salesman row's own figures on each stage (from model.people). */
function personColumns(stageId) {
  if (stageId === 'target') {
    return [C.division, { key: 'achieved', label: 'Achieved', type: 'money' }, { key: 'achievedPct', label: '% of target', type: 'pct' }, { key: 'pace', label: 'Pace' }];
  }
  if (stageId === 'planned') {
    return [C.division, { key: 'planStatus', label: 'Plan status' }, { key: 'submitted', label: 'Submitted plan', type: 'money' },
      { key: 'planNow', label: 'Plan now', type: 'money' }, { key: 'required', label: 'Required', type: 'money' }, { key: 'requiredFrom', label: 'Required from' },
      { key: 'pctReq', label: '% of required', type: 'pct' }];
  }
  if (stageId === 'funnel') {
    return [C.division, { key: 'converted', label: 'Converted' }, { key: 'openValue', label: 'Open deals', type: 'money' }, { key: 'stuck', label: 'Stuck', type: 'int' }];
  }
  if (stageId === 'visits') {
    return [C.division, { key: 'visitsMtd', label: 'Contacts MTD', type: 'int' }, { key: 'inPlanPct', label: 'To planned customers', type: 'pct' },
      { key: 'plannedVisited', label: 'Planned customers visited' }, { key: 'lastVisit', label: 'Last visit', type: 'date' }];
  }
  if (stageId === 'achieved') {
    return [C.division, { key: 'target', label: 'Target', type: 'money' }, { key: 'achieved', label: 'Achieved', type: 'money' }, { key: 'achievedPct', label: '% of target', type: 'pct' },
      { key: 'fromPlan', label: 'From plan', type: 'money' }, { key: 'outsidePlan', label: 'Outside plan', type: 'money' }, { key: 'wni', label: 'Won not invoiced', type: 'money' }];
  }
  return [C.division];
}

function personCells(sc, stageId, id, rows) {
  const p = sc.people.get(id);
  const r0 = rows[0] || {};
  const division = p?.division || sc.divName(r0.divisionId);
  if (!p) return { division };
  if (stageId === 'target') {
    const behind = rows.some((x) => x.onPace === false);
    return { division, achieved: p.achieved, achievedPct: p.achievedPct, pace: rows.some((x) => 'onPace' in x) ? (behind ? 'behind' : 'on pace') : '—' };
  }
  if (stageId === 'planned') {
    const st = p.planStatus;
    return {
      division,
      planStatus: st ? (st.submitted ? `${st.timing === 'submitted late' ? 'late' : 'on time'} · ${st.approval}` : st.approval === 'rejected' ? 'rejected' : 'missing') : '—',
      submitted: p.submittedPlanned,
      planNow: p.planned,
      required: p.requiredPlan,
      pctReq: p.plannedPctOfRequired,
      requiredFrom: p.requiredSource === 'submitted' ? 'submitted plan' : p.requiredSource === 'estimated' ? 'estimate' : null,
    };
  }
  if (stageId === 'funnel') {
    const f = sc.model.funnel?.perPerson?.[id];
    return f ? { division, converted: `${f.converted} of ${f.items}`, openValue: f.openValue, stuck: f.stuck } : { division };
  }
  if (stageId === 'visits') {
    const mine = sc.model.planCustomerRows.filter((g) => g.ownerId === id);
    return {
      division, visitsMtd: p.visitsMtd, inPlanPct: p.visitsMtdInPlanPct,
      plannedVisited: `${mine.filter((g) => g.visited).length} of ${mine.length}`, lastVisit: p.lastVisit,
    };
  }
  if (stageId === 'achieved') {
    return {
      division, target: p.target, achieved: p.achieved, achievedPct: p.achievedPct,
      fromPlan: p.fromPlan, outsidePlan: p.outsidePlan, wni: p.wonNotInvoiced,
    };
  }
  return { division };
}

const CUSTOMER_COLUMNS = [
  { key: 'planValue', label: 'Plan value', type: 'money' },
  { key: 'status', label: 'Status' },
  { key: 'lastContact', label: 'Last contact', type: 'date' },
  { key: 'outcome', label: 'Outcome' },
];

/** A customer's plan value, status, last contact and outcome — the model's own rows. */
function customerCells(sc, ownerId, name, key = null) {
  const g = (key && sc.pcByKey.get(key)) || sc.pcByName.get(`${ownerId}|${name}`) || null;
  const items = g ? g.items : sc.model.itemRows.filter((r) => r.ownerId === ownerId && r.customer === name);
  const last = g ? g.lastContact : (sc.model.contactRows
    .filter((c) => c.ownerId === ownerId && c.customer === name && c.date <= sc.model.cutoff)
    .map((c) => c.date).sort().pop() || null);
  return {
    planValue: g ? g.planned : null,
    status: items.length ? uniq(items.map((i) => (i.status === 'open' ? 'open' : i.status === 'converted' ? 'became a deal' : String(i.status).replace(/_/g, ' ')))).join(' / ') : 'not in plan',
    lastContact: last,
    outcome: items.length ? uniq(items.map((i) => i.outcome)).join(' / ') : '—',
  };
}

const PLAN_ITEM_COLUMNS = [
  { key: 'status', label: 'Status' },
  { key: 'expectedMonth', label: 'Month', type: 'month' },
  { key: 'outcome', label: 'Outcome' },
];

/** How a record opens, as today: a deal → pipeline, a plan item → Planning, a visit → the Visit sheet. */
const openOf = (row, contact = null) => {
  if (contact) return { kind: 'visit', contactId: contact.id };
  if (row.dealId) return { kind: 'deal', dealId: row.dealId };
  if (row.oppId) return { kind: 'plan', oppId: row.oppId };
  if (row.personId) return { kind: 'person', personId: row.personId };
  return null;
};

/**
 * The shape of each view: how its tab rows group, what each leaf is called,
 * which columns each level shows, and what a leaf expands into when the tab's
 * rows are whole people or customers (context records).
 */
function viewShape(sc, stageId, viewId, sel) {
  const M = sc.model;
  const planItemLeaf = {
    kind: 'record',
    name: (r) => r.customer,
    columns: PLAN_ITEM_COLUMNS,
  };
  if (viewId === 'target') {
    return {
      group: ['person'],
      leaf: {
        kind: 'record', name: (r) => r.targetType || 'target',
        columns: [{ key: 'divisionName', label: 'Division' }, { key: 'period', label: 'Month', type: 'month' }],
        cells: (r) => ({ divisionName: sc.divName(r.divisionId), period: r.period }),
      },
    };
  }
  if (viewId === 'planStatus' || (viewId === 'planned' && sel[0] !== 'now')) {
    // One tab row per person: the person IS the row; it expands into his
    // plan-now items, which add up to his Plan now.
    return {
      group: [],
      leaf: {
        kind: 'person', name: (r) => r.person,
        context: (r) => ({
          rows: sc.nowRows.filter((x) => x.personId === r.personId),
          value: (x) => x.planned, valueLabel: 'Planned', sumKey: 'planNow',
          leaf: { ...planItemLeaf, cells: (x) => ({ status: x.status, expectedMonth: x.expectedMonth, outcome: x.outcome }) },
        }),
      },
    };
  }
  if (viewId === 'planned') {
    return {
      group: ['person'],
      leaf: { ...planItemLeaf, cells: (x) => ({ status: x.status, expectedMonth: x.expectedMonth, outcome: x.outcome }) },
    };
  }
  if (viewId === 'visits' && sel[0] === 'notVisited') {
    return {
      group: ['person'],
      leaf: {
        kind: 'customer', name: (r) => r.customer,
        cells: (r) => {
          const g = sc.planCustomerOf.get(r);
          return { ...customerCells(sc, r.personId, r.customer, g?.key), planValue: r.planned, lastContact: r.lastContact, outcome: r.outcome };
        },
        context: (r) => {
          const g = sc.planCustomerOf.get(r);
          return {
            rows: g ? g.items : [],
            value: (x) => x.planned, valueLabel: 'Planned', sumKey: 'planValue',
            leaf: {
              kind: 'record', name: (x) => x.customer, columns: PLAN_ITEM_COLUMNS,
              cells: (x) => ({ status: x.status === 'open' ? 'open' : x.status === 'converted' ? 'became a deal' : x.status, expectedMonth: x.expectedMonth, outcome: x.outcome }),
              open: (x) => openOf({ dealId: x.dealId, oppId: x.oppId }),
            },
          };
        },
      },
    };
  }
  if (viewId === 'visits') {
    return {
      group: ['person', 'customer'],
      customerKey: (r) => sc.contactOf.get(r)?.customerKey || `name:${r.customer}`,
      leaf: {
        kind: 'record', name: (r) => `${r.kindLabel}`,
        columns: [{ key: 'date', label: 'Date', type: 'date' }, { key: 'response', label: 'Response' }, { key: 'nextAction', label: 'Next action' }, { key: 'planTag', label: 'Plan' }],
        cells: (r) => ({ date: r.date, response: r.response, nextAction: r.nextAction, planTag: r.planTag }),
        open: (r) => openOf(r, sc.contactOf.get(r)),
      },
    };
  }
  if (viewId === 'achieved' || viewId === 'fromPlan') {
    const invoices = viewId === 'achieved' && sel[0] === 'invoices';
    return {
      group: viewId === 'achieved' && sel[0] === 'customer' ? ['customer'] : ['person', 'customer'],
      leaf: {
        kind: 'record', name: (r) => r.title,
        columns: invoices
          ? [{ key: 'invoiceNumber', label: 'Invoice no.' }, { key: 'invoiceDate', label: 'Date', type: 'date' }, { key: 'invValue', label: 'Value', type: 'money' }, { key: 'returns', label: 'Returns', type: 'money' }]
          : [{ key: 'invoiceNumber', label: 'Invoice no.' }, { key: 'invoiceDate', label: 'Date', type: 'date' }, { key: 'plan', label: 'Plan' }],
        cells: (r) => (invoices
          ? { invoiceNumber: r.invoiceNumber, invoiceDate: r.invoiceDate, invValue: r.value, returns: r.returns }
          : { invoiceNumber: r.invoiceNumber, invoiceDate: r.invoiceDate, plan: r.plan }),
      },
    };
  }
  if (viewId === 'outcomes') {
    return {
      group: ['person', 'customer'],
      leaf: {
        kind: 'record', name: (r) => r.detail,
        columns: [{ key: 'outcome', label: 'Outcome' }, { key: 'status', label: 'Status' }, { key: 'expectedMonth', label: 'Month', type: 'month' }, { key: 'invoiced', label: 'Invoiced', type: 'money' }],
        cells: (r) => ({ outcome: r.outcome, status: r.status, expectedMonth: r.expectedMonth, invoiced: r.invoiced }),
      },
    };
  }
  if (viewId === 'wni') {
    return {
      group: ['person', 'customer'],
      leaf: {
        kind: 'record', name: (r) => r.title,
        columns: [{ key: 'wonDate', label: 'Won', type: 'date' }, { key: 'daysWon', label: 'Days since won', type: 'int' }],
        cells: (r) => ({ wonDate: r.wonDate, daysWon: r.daysWon }),
      },
    };
  }
  if (viewId === 'funnel') {
    const k = sel[0];
    const cols = k === 'planDeal'
      ? [{ key: 'part', label: 'Became' }, { key: 'stage', label: 'Deal stage' }, { key: 'status', label: 'Plan status' }]
      : k === 'moves7' || k === 'movesMtd'
        ? [{ key: 'move', label: 'Move' }, { key: 'date', label: 'Date', type: 'date' }, { key: 'kindLabel', label: 'Kind' }, { key: 'stageNow', label: 'Stage now' }]
        : k === 'autoMoved'
          ? [{ key: 'movedDate', label: 'Moved', type: 'date' }, { key: 'expectedMonth', label: 'To', type: 'month' }, { key: 'status', label: 'Future order' }]
          : [{ key: 'stage', label: 'Stage' }, { key: 'expectedClose', label: 'Expected close', type: 'date' }, { key: 'daysInStage', label: 'Days in stage', type: 'int' },
            { key: 'lastContact', label: 'Last contact', type: 'date' }, ...(k === 'dueSoon' ? [{ key: 'dueIn', label: 'Moves' }] : [])];
    return {
      group: ['person', 'customer'],
      leaf: {
        kind: 'record', name: (r) => r.title, columns: cols,
        cells: (r) => Object.fromEntries(cols.map((c) => [c.key, r[c.key]])),
      },
    };
  }
  if (viewId === 'exceptions') {
    return {
      group: ['group'],
      leaf: {
        kind: 'exception', name: (r) => r.title,
        columns: [{ key: 'severity', label: 'Severity' }, { key: 'person', label: 'Salesman' }, { key: 'division', label: 'Division' }, { key: 'detail', label: 'Detail' }, { key: 'date', label: 'Date', type: 'date' }],
        cells: (r) => ({ severity: r.severity, person: r.person, division: sc.divName(r.divisionId), detail: r.detail, date: r.date }),
        context: (r) => {
          const act = exceptionAction(r, { monthStart: M.monthStart });
          const rec = r.record || {};
          // What clicking opens, in words: the deal (its title leads the
          // detail of every deal rule), the plan item, or the salesman.
          const what = rec.kind === 'deal' ? `Deal · ${String(r.detail || '').split(' · ')[0]}`
            : rec.kind === 'plan' ? `Plan item · ${String(r.detail || '').split(',')[0]}` : `Salesman · ${r.person}`;
          return {
            rows: [{ ...r, _what: what, _action: act }],
            value: () => null, valueLabel: null, sumKey: null,
            leaf: {
              kind: 'record', name: (x) => x._what,
              columns: [{ key: 'action', label: 'To clear it' }],
              cells: (x) => ({ action: x._action.text }),
              open: (x) => (x.record ? { ...x.record, exceptionId: x.id } : null),
              action: (x) => ({ ...x._action, exception: x }),
            },
          };
        },
      },
      groupOrder: ['Plan', 'Visits', 'Deals', 'Data'],
    };
  }
  return { group: ['person'], leaf: { kind: 'record', name: (r) => r.customer || r.title || '—', columns: [], cells: () => ({}) } };
}

/* ── the page ────────────────────────────────────────────────────────────── */

/**
 * One stage page: its views, the active view's tabs (with counts), its summary
 * figures, the row tree and the next steps.
 *
 * @param {object} model   computeSalesMonitor()'s result
 * @param {object} o
 * @param {string} o.stage      a STAGES id
 * @param {string} [o.view]     one of the stage's views; default the first
 * @param {string[]} [o.tab]    one option id per tab set; default the first
 * @param {string} [o.only]     an ONLY id, or rule:<rule> (from a next step)
 * @param {string} [o.query]    search, matched on every level
 * @param {string} [o.division] a row-level division filter (rows' divisionId)
 */
export function buildStagePage(model, {
  stage, view = null, tab = null, only = null, query = '', division = '',
} = {}, sc = stageContext(model)) {
  const st = stageById(stage) || STAGES[0];
  const viewId = st.views.includes(view) ? view : st.views[0];
  const list = resolveList(sc, st.id, viewId, tab, { only, query, division });
  return {
    stage: st,
    views: st.views.map((v) => ({ id: v, label: VIEW_LABEL[v], active: v === viewId })),
    view: viewId,
    ...list,
    summary: summaryOf(sc, st.id),
    nextSteps: nextStepsOf(sc, st.id),
    divisions: uniq(listRows(sc, viewId, list.selection, {}).map((r) => r.divisionId)).map((id) => ({ id, name: sc.divName(id) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** A view's tab rows for a selection, after `only` and the division filter — no search. */
function listRows(sc, viewId, selection, { only = null, division = '' } = {}) {
  const tabs = sc.tabs[viewId];
  if (!tabs) return [];
  const sel = normalizeSelection(tabs, selection);
  let rows = resolveTabs(tabs, sel, '').rows;
  const of = onlyFilter(only);
  if (of) rows = rows.filter(of.test);
  if (division) rows = rows.filter((r) => r.divisionId === division);
  return rows;
}

function resolveList(sc, stageId, viewId, selection, { only, query, division }) {
  const tabs = sc.tabs[viewId];
  if (!tabs) {
    return {
      selection: [], sets: [], total: 0, unit: 'SAR', valueLabel: 'Value', nodes: [], columns: {}, explain: null, hints: [], only: null, empty: true,
    };
  }
  const sel = normalizeSelection(tabs, selection);
  const cfg = resolveTabs(tabs, sel, '').cfg;
  const shape = viewShape(sc, stageId, viewId, sel);
  const of = onlyFilter(only);

  // Search: a tab row stays when it, or a record it expands into, matches.
  const q = String(query || '').trim();
  const matches = (r) => rowMatches(r, q, STAGE_SEARCH_KEYS);
  const passes = (r) => {
    if (!q) return true;
    if (matches(r)) return true;
    const ctx = shape.leaf.context ? shape.leaf.context(r) : null;
    return !!ctx && ctx.rows.some(matches);
  };
  const searched = (rows) => rows.filter(passes);

  const rows = searched(listRows(sc, viewId, sel, { only, division }));
  const total = cfg.total ? cfg.total(rows) : rows.length;
  const unit = cfg.unit || 'SAR';

  // The tab buttons, each counting its rows (with the search and division,
  // not the next-step narrowing).
  const resolvedSets = resolveTabs(tabs, sel, '').sets;
  const sets = resolvedSets.map((set, i) => ({
    id: set.id,
    options: set.options.map((o) => {
      const trial = [...sel];
      trial[i] = o.id;
      const trialRows = searched(listRows(sc, viewId, trial, { division }));
      return { ...o, count: trialRows.length };
    }),
  }));

  const valueLabel = valueLabelOf(viewId, sel);
  const valueOf = (rs) => (cfg.total ? cfg.total(rs) : rs.length);
  const nodes = buildNodes(sc, stageId, shape, rows, valueOf, q, matches);
  // The value column already shows the tab's figure: not twice on a row.
  const pCols = personColumns(stageId).filter((c) => c.label !== valueLabel);
  const columns = {
    person: pCols,
    customer: shape.group[0] === 'customer' ? [{ key: 'salesmen', label: 'Salesmen' }] : CUSTOMER_COLUMNS,
    group: [],
    record: shape.leaf.columns || [],
    exception: shape.leaf.columns || [],
  };
  return {
    selection: sel,
    sets,
    total,
    unit,
    valueLabel,
    nodes,
    columns,
    explain: cfg.explain || null,
    hints: resolveTabs(tabs, sel, '').hints,
    only: of ? { id: only, label: of.label } : null,
    rowCount: rows.length,
  };
}

/**
 * The row tree. Every grouping node's value is the tab's own total over the
 * rows under it; a leaf's value is that function over the one row.
 */
function buildNodes(sc, stageId, shape, rows, valueOf, q, matches) {
  const keyFns = {
    person: (r) => r.personId,
    customer: (r) => (shape.customerKey ? shape.customerKey(r) : `name:${r.customer}`),
    group: (r) => r.group,
  };
  const leafNode = (r, parentId, i) => {
    const L = shape.leaf;
    const id = `${parentId}/${L.kind}:${r.oppId || r.dealId || r.id || r.personId || ''}:${i}`;
    const node = {
      id,
      kind: L.kind,
      name: L.name(r),
      value: valueOf([r]),
      cells: L.kind === 'person' ? personCells(sc, stageId, r.personId, [r]) : (L.cells ? L.cells(r) : {}),
      open: L.open ? L.open(r) : openOf(r),
      action: L.action ? L.action(r) : null,
      row: r,
      tabRow: true,
    };
    if (L.context) {
      const ctx = L.context(r);
      const own = !q || matches(r);
      const ctxRows = own ? ctx.rows : ctx.rows.filter(matches);
      node.sumKey = ctx.sumKey;
      node.childValueLabel = ctx.valueLabel;
      node.children = ctxRows.map((x, j) => ({
        id: `${id}/r:${x.oppId || x.dealId || x.id || ''}:${j}`,
        kind: ctx.leaf.kind,
        name: ctx.leaf.name(x),
        value: ctx.value(x),
        valueLabel: ctx.valueLabel,
        valueUnit: 'SAR',
        cells: ctx.leaf.cells ? ctx.leaf.cells(x) : {},
        open: ctx.leaf.open ? ctx.leaf.open(x) : openOf(x),
        action: ctx.leaf.action ? ctx.leaf.action(x) : null,
        row: x,
      }));
    }
    return node;
  };
  const level = (rs, depth, parentId) => {
    if (depth >= shape.group.length) return rs.map((r, i) => leafNode(r, parentId, i));
    const key = shape.group[depth];
    const groups = groupBy(rs, keyFns[key]).map(([k, krs]) => {
      const id = `${parentId}/${key}:${k}`;
      const r0 = krs[0];
      const name = key === 'person' ? sc.nameOf(r0.personId, r0.person)
        : key === 'customer' ? r0.customer
          : key === 'group' ? k : k;
      const cells = key === 'person' ? personCells(sc, stageId, r0.personId, krs)
        : key === 'customer' && shape.group[0] === 'person'
          ? customerCells(sc, r0.personId, r0.customer, sc.contactOf.get(r0)?.customerKey || null)
          : key === 'customer' ? { salesmen: uniq(krs.map((x) => x.person)).join(', ') } : {};
      return { id, kind: key, name, value: valueOf(krs), cells, children: level(krs, depth + 1, id) };
    });
    if (key === 'group' && shape.groupOrder) {
      return groups.sort((a, b) => shape.groupOrder.indexOf(a.name) - shape.groupOrder.indexOf(b.name));
    }
    return groups.sort(byValue);
  };
  const out = level(rows, 0, 'root');
  // A person-per-row tab: the leaves ARE the salesmen; order them like groups.
  return shape.group.length ? out : out.sort(byValue);
}

/* ── showing the tree ───────────────────────────────────────────────────── */

/** Every node id that can expand. */
export function expandableIds(nodes) {
  const out = [];
  const walk = (ns) => ns.forEach((n) => { if (n.children?.length) { out.push(n.id); walk(n.children); } });
  walk(nodes);
  return out;
}

/** The rows on screen, top to bottom: { node, depth } for each visible row. */
export function visibleRows(nodes, expanded) {
  const out = [];
  const walk = (ns, depth) => ns.forEach((n) => {
    out.push({ node: n, depth });
    if (n.children?.length && expanded.has(n.id)) walk(n.children, depth + 1);
  });
  walk(nodes, 0);
  return out;
}

const LEVEL_NAME = { person: 'Salesman', customer: 'Customer', record: 'Record', group: 'Group', exception: 'Exception' };
export const levelName = (kind) => LEVEL_NAME[kind] || kind;

/**
 * The Excel rows: exactly the rows on screen, flat — one line per visible
 * row, its level, its parents, its value and its own columns, each column
 * headed once. Money is headed "(SAR)", as every other export.
 */
export function exportStageRows(page, expanded) {
  const vis = visibleRows(page.nodes, expanded);
  const colOf = (kind) => page.columns[kind] || [];
  const allCols = [];
  const seen = new Set();
  ['group', 'person', 'customer', 'exception', 'record'].forEach((k) => colOf(k).forEach((c) => {
    const head = c.type === 'money' ? `${c.label} (SAR)` : c.label;
    if (!seen.has(head)) { seen.add(head); allCols.push({ ...c, head }); }
  }));
  const headOf = (node) => {
    const unit = node.valueUnit || page.unit;
    const label = node.valueLabel || page.valueLabel;
    return unit === 'SAR' ? `${label} (SAR)` : `${label} (${unit})`;
  };
  const valueHeads = uniq(vis.map(({ node }) => headOf(node)));
  const path = [];
  return vis.map(({ node, depth }) => {
    path.length = depth;
    path[depth] = node.name;
    const row = {
      Level: levelName(node.kind),
      Under: path.slice(0, depth).join(' › '),
      Name: node.name ?? '',
    };
    valueHeads.forEach((h) => { row[h] = null; });
    if (node.value !== null && node.value !== undefined) row[headOf(node)] = Number(node.value);
    const own = new Set(colOf(node.kind).map((c) => c.key));
    allCols.forEach((c) => {
      const v = own.has(c.key) ? node.cells?.[c.key] : undefined;
      if (v === undefined || v === null || v === '') { row[c.head] = c.type === 'money' || c.type === 'pct' || c.type === 'int' ? null : ''; return; }
      if (c.type === 'money' || c.type === 'pct' || c.type === 'int') { row[c.head] = Number(v); return; }
      if (c.type === 'date' || c.type === 'month') {
        const d = new Date(String(v).length === 10 ? `${v}T00:00:00` : v);
        row[c.head] = Number.isNaN(d.getTime()) ? '' : d;
        return;
      }
      row[c.head] = String(v);
    });
    return row;
  });
}

/* ── the summary line ───────────────────────────────────────────────────── */

/** The stage's figures, as the monitor's cards show them. */
function summaryOf(sc, stageId) {
  const c = sc.model.cards;
  const M = sc.model;
  if (stageId === 'target') {
    const tabs = sc.tabs.target;
    const behind = tabs ? uniq(resolveTabs(tabs, ['behind'], '').rows.map((r) => r.personId)).length : 0;
    return [
      { id: 'target', label: 'Target', value: c.target.total, type: 'money', sub: c.target.span || null },
      { id: 'people', label: 'People with a target', value: M.people.filter((p) => p.target > 0).length, type: 'int' },
      { id: 'achieved', label: 'Achieved', value: c.achieved.total, type: 'money' },
      { id: 'pct', label: '% of target', value: c.achieved.pctOfTarget, type: 'pct' },
      { id: 'behind', label: 'Behind pace', value: behind, type: 'int' },
    ];
  }
  if (stageId === 'planned') {
    return [
      { id: 'submittedOf', label: 'Plans submitted', value: c.planStatus.loaded ? `${c.planStatus.onTime + c.planStatus.late} of ${c.planStatus.people}` : '—' },
      { id: 'missing', label: 'Not submitted', value: c.planStatus.missing, type: 'int' },
      { id: 'pending', label: 'Awaiting approval', value: c.planStatus.pending, type: 'int' },
      { id: 'submitted', label: 'Submitted', value: c.planned.submitted, type: 'money' },
      { id: 'planNow', label: 'Plan now', value: c.planned.total, type: 'money' },
      { id: 'pctTarget', label: 'Plan now, % of target', value: c.planned.pctOfTarget, type: 'pct' },
    ];
  }
  if (stageId === 'funnel') {
    const f = M.funnel?.cards;
    if (!f) return [];
    return [
      { id: 'converted', label: 'Plan items converted', value: `${f.plan.converted.count} of ${f.plan.total.count}` },
      { id: 'notStarted', label: 'Not started', value: f.plan.notStarted.count, type: 'int' },
      { id: 'funnel', label: 'Open funnel (as Insights)', value: f.stages.total, type: 'money' },
      { id: 'allDates', label: 'Open, all dates', value: f.stages.allDates.total, type: 'money' },
      { id: 'week', label: 'Moves, 7 days: forward / back', value: f.movement.loaded ? `${f.movement.week.forward} / ${f.movement.week.back}` : '—' },
      { id: 'stuck', label: `Stuck ${THRESHOLDS.stuckDays}+ days`, value: f.stuck.stuck.count, type: 'int' },
      { id: 'overdue', label: 'Past close date', value: f.stuck.overdue.count, type: 'int' },
      { id: 'autoMoved', label: 'Auto-moved this month', value: f.stuck.autoMoved.count, type: 'int' },
    ];
  }
  if (stageId === 'visits') {
    return [
      { id: 'mtd', label: 'Contacts, month to date', value: c.visits.mtd.count, type: 'int' },
      { id: 'day', label: 'On the day', value: c.visits.today.count, type: 'int', sub: c.visits.day },
      { id: 'inPlan', label: 'To planned customers', value: c.visits.mtd.inPlanPct, type: 'pct' },
      { id: 'plannedVisited', label: 'Planned customers visited', value: `${c.visits.plannedVisited} of ${c.visits.plannedCustomers}` },
      { id: 'responses', label: '+ / = / −', value: `${c.visits.mtd.responses.positive} / ${c.visits.mtd.responses.neutral} / ${c.visits.mtd.responses.negative}` },
    ];
  }
  if (stageId === 'achieved') {
    return [
      { id: 'achieved', label: 'Achieved', value: c.achieved.total, type: 'money' },
      { id: 'pct', label: '% of target', value: c.achieved.pctOfTarget, type: 'pct' },
      { id: 'fromPlan', label: 'From plan', value: c.fromPlan.fromPlan, type: 'money' },
      { id: 'outsidePlan', label: 'Outside plan', value: c.fromPlan.outsidePlan, type: 'money' },
      { id: 'items', label: 'Plan items', value: c.outcomes.total.count, type: 'int' },
      { id: 'wni', label: 'Won not invoiced', value: c.wonNotInvoiced.total, type: 'money' },
    ];
  }
  return [
    { id: 'total', label: 'Exceptions', value: c.exceptions.total, type: 'int' },
    { id: 'high', label: 'High', value: c.exceptions.high, type: 'int' },
    { id: 'medium', label: 'Medium', value: c.exceptions.medium, type: 'int' },
    { id: 'low', label: 'Low', value: c.exceptions.low, type: 'int' },
  ];
}

/* ── next steps ─────────────────────────────────────────────────────────── */

const names = (rows, max = 4) => {
  const all = uniq(rows.map((r) => r.person));
  return all.length > max ? `${all.slice(0, max).join(', ')} and ${all.length - max} more` : all.join(', ');
};

/**
 * What the manager does next, from the page's own rows. Each step:
 *   { id, text, count, level, link: { view, tab, only }, external? }
 * `count` is what the linked list shows at `level` ('person' = salesman rows,
 * 'customer', 'leaf' = the tab's rows), so the line and the list agree.
 * A step with nothing to do is left out.
 */
export function nextStepsOf(sc, stageId) {
  const M = sc.model;
  const out = [];
  const rows = (view, tab, only = null) => listRows(sc, view, tab, { only });
  const people = (rs) => uniq(rs.map((r) => r.personId)).length;

  if (stageId === 'target' && sc.tabs.target) {
    const behind = rows('target', ['behind']);
    const n = people(behind);
    if (n) {
      out.push({
        id: 'behind', count: n, level: 'person', link: { view: 'target', tab: ['behind'] },
        text: `${plural(n, 'salesman', 'salesmen')} behind pace → ${names(behind)}`,
      });
    }
  }

  if (stageId === 'planned') {
    if (sc.tabs.planStatus && M.cards.planStatus.loaded) {
      const missing = rows('planStatus', ['missing']);
      if (missing.length) {
        out.push({
          id: 'missing', count: missing.length, level: 'person', link: { view: 'planStatus', tab: ['missing'] },
          text: `${plural(missing.length, 'plan', 'plans')} not submitted → remind ${names(missing)}`,
        });
      }
      const pending = rows('planStatus', ['pending']);
      if (pending.length) {
        const late = pending.filter((r) => r.submittedAt && daysBetween(riyadhDate(r.submittedAt), M.today) > THRESHOLDS.approvalPendingDays).length;
        out.push({
          id: 'pending', count: pending.length, level: 'person', link: { view: 'planStatus', tab: ['pending'] },
          external: { label: 'Plans Awaiting Approval', path: '/planning', hash: '#approvals' },
          text: `${plural(pending.length, 'plan', 'plans')} awaiting approval${late ? ` (${late} for more than ${THRESHOLDS.approvalPendingDays} days)` : ''} → Plans Awaiting Approval`,
        });
      }
      const rejected = rows('planStatus', ['rejected']);
      if (rejected.length) {
        out.push({
          id: 'rejected', count: rejected.length, level: 'person', link: { view: 'planStatus', tab: ['rejected'] },
          text: `${plural(rejected.length, 'plan', 'plans')} rejected and not resubmitted → follow up with ${names(rejected)}`,
        });
      }
    }
    if (sc.tabs.planned) {
      const below = rows('planned', ['below']);
      if (below.length) {
        out.push({
          id: 'below', count: below.length, level: 'person', link: { view: 'planned', tab: ['below'] },
          text: `${plural(below.length, 'salesman', 'salesmen')} below the required plan, ${fmt(sum(below, (r) => r.gap))} SAR missing → add plan items with ${names(below)}`,
        });
      }
      const none = rows('planned', ['none']);
      if (none.length) {
        out.push({
          id: 'none', count: none.length, level: 'person', link: { view: 'planned', tab: ['none'] },
          text: `${plural(none.length, 'salesman', 'salesmen')} with no plan item this month → ${names(none)}`,
        });
      }
    }
  }

  if (stageId === 'funnel' && sc.tabs.funnel) {
    const ns = rows('funnel', ['planDeal', 'all'], 'notStarted');
    if (ns.length) {
      out.push({
        id: 'notConverted', count: ns.length, level: 'leaf', link: { view: 'funnel', tab: ['planDeal', 'all'], only: 'notStarted' },
        text: `${plural(ns.length, 'plan item', 'plan items')} not converted to a deal → ${names(ns)}`,
      });
    }
    const st = rows('funnel', ['stuck', 'all']);
    if (st.length) {
      out.push({
        id: 'stuck', count: st.length, level: 'leaf', link: { view: 'funnel', tab: ['stuck', 'all'] },
        text: `${plural(st.length, 'deal', 'deals')} stuck ${THRESHOLDS.stuckDays}+ days → review with ${names(st)}`,
      });
    }
    const od = rows('funnel', ['overdue', 'all']);
    if (od.length) {
      out.push({
        id: 'overdue', count: od.length, level: 'leaf', link: { view: 'funnel', tab: ['overdue', 'all'] },
        text: `${plural(od.length, 'deal', 'deals')} past close date, ${fmt(sum(od, (r) => r.value))} SAR → re-date or close with ${names(od)}`,
      });
    }
    const due = rows('funnel', ['dueSoon', 'all']);
    if (due.length) {
      out.push({
        id: 'dueSoon', count: due.length, level: 'leaf', link: { view: 'funnel', tab: ['dueSoon', 'all'] },
        text: `${plural(due.length, 'lead', 'leads')} due to auto-move within ${THRESHOLDS.autoMoveSoonDays} day → contact the customer: ${names(due)}`,
      });
    }
    const big = rows('funnel', ['allOpen', 'negotiation'], 'large');
    if (big.length) {
      out.push({
        id: 'large', count: big.length, level: 'leaf', link: { view: 'funnel', tab: ['allOpen', 'negotiation'], only: 'large' },
        text: `${plural(big.length, 'deal', 'deals')} over ${fmt(THRESHOLDS.negotiationLargeAmount)} in Negotiation → confirm with ${names(big)}`,
      });
    }
  }

  if (stageId === 'visits' && sc.tabs.visits) {
    const nv = rows('visits', ['notVisited']);
    if (nv.length) {
      out.push({
        id: 'notVisited', count: nv.length, level: 'customer', link: { view: 'visits', tab: ['notVisited'] },
        text: `${plural(nv.length, 'planned customer', 'planned customers')} not visited → open the list`,
      });
    }
    const neg = rows('visits', ['negative'], 'noNext');
    if (neg.length) {
      out.push({
        id: 'noNext', count: neg.length, level: 'leaf', link: { view: 'visits', tab: ['negative'], only: 'noNext' },
        text: `${plural(neg.length, 'negative visit', 'negative visits')} without a next action → agree one with ${names(neg)}`,
      });
    }
  }

  if (stageId === 'achieved') {
    const wni = rows('wni', []);
    if (wni.length) {
      out.push({
        id: 'wni', count: wni.length, level: 'leaf', link: { view: 'wni', tab: [] },
        text: `Won not invoiced ${fmt(sum(wni, (r) => r.value))} SAR on ${plural(wni.length, 'deal', 'deals')} → chase invoicing`,
      });
    }
    if (sc.tabs.outcomes) {
      const moved = rows('outcomes', ['bounced'], 'moved');
      if (moved.length) {
        out.push({
          id: 'moved', count: moved.length, level: 'leaf', link: { view: 'outcomes', tab: ['bounced'], only: 'moved' },
          text: `${plural(moved.length, 'plan item', 'plan items')} moved to later months → review with ${names(moved)}`,
        });
      }
      const failed = rows('outcomes', ['failed']);
      if (failed.length) {
        out.push({
          id: 'failed', count: failed.length, level: 'leaf', link: { view: 'outcomes', tab: ['failed'] },
          text: `${plural(failed.length, 'plan item', 'plan items')} failed, ${fmt(sum(failed, (r) => r.planned))} SAR planned → review why with ${names(failed)}`,
        });
      }
    }
  }

  if (stageId === 'exceptions' && sc.tabs.exceptions) {
    const high = rows('exceptions', ['high', 'all']);
    if (high.length) {
      out.push({
        id: 'high', count: high.length, level: 'leaf', link: { view: 'exceptions', tab: ['high', 'all'] },
        text: `${plural(high.length, 'high-severity exception', 'high-severity exceptions')} → clear these first`,
      });
    }
    const all = rows('exceptions', ['all', 'all']);
    groupBy(all, (r) => r.rule)
      .sort((a, b) => b[1].length - a[1].length || String(a[0]).localeCompare(String(b[0])))
      .slice(0, 3)
      .forEach(([rule, rs]) => {
        const act = exceptionAction(rs[0], { monthStart: M.monthStart });
        out.push({
          id: `rule:${rule}`, count: rs.length, level: 'leaf', link: { view: 'exceptions', tab: ['all', 'all'], only: `rule:${rule}` },
          text: `${rs.length} × ${rs[0].title.replace(/\d+ days/, 'N days')} → ${act.text.charAt(0).toLowerCase()}${act.text.slice(1)}`,
        });
      });
  }
  return out;
}

/**
 * Counts a page's rows at a level — the check behind every next step:
 * 'person' / 'customer' rows, or 'leaf' = the tab's own rows.
 */
export function countAtLevel(nodes, level) {
  let n = 0;
  const walk = (ns) => ns.forEach((x) => {
    if (level === 'leaf' ? x.tabRow : x.kind === level) n += 1;
    if (x.children) walk(x.children);
  });
  walk(nodes);
  return n;
}

