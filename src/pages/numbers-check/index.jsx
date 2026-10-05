import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "lib/supabase";
import { useAuth } from "contexts/AuthContext";
import Header from "components/ui/Header";
import Icon from "components/AppIcon";
import {
  runNumbersCheck,
  formatCheckAsText,
  NUMBERS_CHECK_ROLES,
} from "utils/numbersCheck";
import { subtreeIdsOf } from "utils/teamHierarchy";
import { CONTRIBUTOR_ROLES } from "utils/planningCalculations";

// THE NUMBERS CHECK — a read-only audit page for admins and directors.
//
// Pick a company, a period and optionally a person, press Check, and every
// figure the app shows for that scope appears beside ONE reference figure
// computed straight from the shared rules. ✓ when they agree, ✗ with the
// difference when they do not.
//
// All of the arithmetic lives in utils/numbersCheck.js; this file is the form,
// the table and the "Copy as text" button. Nothing here computes a figure, and
// nothing here writes: no RPC, no insert, no update, and the company selector is
// local to this page so looking at another company does not switch the app's.
//
// Roles are enforced on the route as well (Routes.jsx), not only by hiding the
// nav entry — a hidden link is not a permission.

/** The current month as yyyy-MM, from LOCAL date parts (users are UTC+3). */
function currentMonthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * yyyy-MM → the whole month, and a year → the whole year, as yyyy-MM-dd.
 *
 * Built from the string's own numbers and formatted from local date parts.
 * Never toISOString(), which in Asia/Riyadh turns the 1st into the previous
 * month's last day.
 */
function boundsFor({ mode, month, year }) {
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (mode === "year") {
    return { start: `${year}-01-01`, end: `${year}-12-31` };
  }
  const y = Number(String(month).slice(0, 4));
  const m = Number(String(month).slice(5, 7)) - 1;
  return { start: ymd(new Date(y, m, 1)), end: ymd(new Date(y, m + 1, 0)) };
}

const fmtMoney = (v) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(Number(v) || 0));
const fmtPct = (v) => `${(Number(v) || 0).toFixed(1)}%`;
const show = (r) => (r.kind === "pct" ? fmtPct(r.value) : fmtMoney(r.value));
const showExp = (r) => (r.kind === "pct" ? fmtPct(r.expected) : fmtMoney(r.expected));
const showDiff = (r) => (r.kind === "pct" ? `${(Number(r.diff) || 0).toFixed(1)}pp` : fmtMoney(r.diff));

function Mark({ row }) {
  if (row.status === "ok") {
    return <span className="font-bold text-emerald-600" title="agrees with the reference">✓</span>;
  }
  if (row.status === "bad") {
    return (
      <span
        className={row.knownToDiffer ? "font-bold text-amber-600" : "font-bold text-red-600"}
        title={row.knownToDiffer ? "known to differ — expected" : "disagrees with the reference"}
      >
        ✗
      </span>
    );
  }
  return <span className="text-slate-300" title="nothing to compare it against">—</span>;
}

function RefLine({ label, value, sub }) {
  return (
    <div className="px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold text-slate-900">{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div> : null}
    </div>
  );
}

export default function NumbersCheck() {
  const { user, company, userProfile, availableCompanies } = useAuth();
  const role = userProfile?.role;
  const permitted = NUMBERS_CHECK_ROLES.includes(role);

  // ── Inputs ───────────────────────────────────────────────────────────────
  // Local to this page on purpose: picking another company here must not switch
  // the company the rest of the app is looking at.
  const [companyId, setCompanyId] = useState(company?.id || "");
  const [mode, setMode] = useState("month"); // 'month' | 'year'
  const [month, setMonth] = useState(currentMonthValue());
  const [year, setYear] = useState(new Date().getFullYear());
  const [who, setWho] = useState("company"); // 'company' | `team:<id>` | `person:<id>`

  const [people, setPeople] = useState([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { if (company?.id && !companyId) setCompanyId(company.id); }, [company?.id, companyId]);

  // Who can be chosen. Every active user of the company, so a manager's team and
  // a flagged manager who sells himself are both selectable; `teamSize` decides
  // whether the "+ team" option is offered at all.
  useEffect(() => {
    if (!companyId || !permitted) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("users")
        .select("id, full_name, role, supervisor_id, is_active, is_contributor")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("full_name");
      if (cancelled) return;
      const rows = data || [];
      setPeople(rows.map((u) => ({
        ...u,
        teamSize: subtreeIdsOf({ users: rows, rootId: u.id }).length,
      })));
    })();
    return () => { cancelled = true; };
  }, [companyId, permitted]);

  // Changing an input invalidates the result rather than leaving a stale table
  // under new inputs — the one thing an audit page must never do.
  useEffect(() => { setResult(null); setError(null); }, [companyId, mode, month, year, who]);

  const scope = useMemo(() => {
    if (who === "company") return { kind: "company" };
    const [kind, userId] = who.split(":");
    return { kind, userId };
  }, [who]);

  const onCheck = useCallback(async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const { start, end } = boundsFor({ mode, month, year });
      const res = await runNumbersCheck({
        companyId,
        start,
        end,
        scope,
        viewer: { id: user?.id, role },
      });
      setResult(res);
    } catch (e) {
      console.error("numbers check:", e);
      setError(e?.message || String(e));
    } finally {
      setRunning(false);
    }
  }, [companyId, mode, month, year, scope, user?.id, role]);

  const onCopy = useCallback(async () => {
    const text = formatCheckAsText(result);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission can be refused; a prompt the user can copy from by
      // hand beats a button that silently does nothing.
      // eslint-disable-next-line no-alert
      window.prompt("Copy the check (Ctrl+C, Enter):", text);
    }
  }, [result]);

  if (!permitted) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <Icon name="Lock" size={40} className="mx-auto text-slate-400" />
          <h1 className="mt-4 text-xl font-semibold text-slate-900">Access denied</h1>
          <p className="mt-2 text-sm text-slate-600">
            The numbers check is for admins and directors.
          </p>
        </div>
      </div>
    );
  }

  const companyList = (availableCompanies?.length ? availableCompanies : [company]).filter(Boolean);
  const ref = result?.reference;
  const meta = result?.meta;
  const yearChoices = [];
  for (let y = new Date().getFullYear() + 1; y >= new Date().getFullYear() - 4; y -= 1) yearChoices.push(y);

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <div className="mx-auto max-w-[1400px] px-4 py-6">
        <div className="mb-5">
          <h1 className="text-2xl font-semibold text-slate-900">Numbers check</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Every figure the app shows for one scope, beside one reference figure computed
            straight from the shared rules. Each row calls the same function its screen
            calls — nothing here recomputes a figure a second way. Read-only: this page
            never writes.
          </p>
        </div>

        {/* ── Inputs ───────────────────────────────────────────────────── */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-end gap-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Company</span>
              <select
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                className="min-w-[200px] rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {companyList.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Period</span>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="month">A month</option>
                <option value="year">A whole year</option>
              </select>
            </label>

            {mode === "month" ? (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Month</span>
                <input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            ) : (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Year</span>
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  {yearChoices.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </label>
            )}

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Person</span>
              <select
                value={who}
                onChange={(e) => setWho(e.target.value)}
                className="min-w-[260px] rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="company">Whole company</option>
                {people.filter((p) => p.teamSize > 0).map((p) => (
                  <option key={`team:${p.id}`} value={`team:${p.id}`}>
                    {p.full_name} + team ({p.teamSize} below)
                  </option>
                ))}
                {people.map((p) => (
                  <option key={`person:${p.id}`} value={`person:${p.id}`}>
                    {p.full_name}
                    {CONTRIBUTOR_ROLES.includes(p.role) ? "" : ` (${p.role}${p.is_contributor ? ", sells" : ""})`}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={onCheck}
              disabled={running || !companyId}
              className="rounded-md bg-slate-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {running ? "Checking…" : "Check"}
            </button>

            {result ? (
              <button
                type="button"
                onClick={onCopy}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
              >
                {copied ? "Copied" : "Copy as text"}
              </button>
            ) : null}
          </div>

          <p className="mt-3 text-xs text-slate-500">
            Nothing is computed until you press Check — the page issues about a dozen reads
            and several of them are company-wide.
          </p>
        </div>

        {running ? (
          <div className="mt-5 rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
            <Icon name="Loader" size={24} className="mx-auto mb-3 animate-spin text-slate-400" />
            Reading the company once, then asking every screen for its own figures…
          </div>
        ) : null}

        {error ? (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <span className="font-semibold">The check could not run.</span> {error}
          </div>
        ) : null}

        {result ? (
          <>
            {/* ── Verdict ────────────────────────────────────────────────── */}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <span
                className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
                  meta.bad === 0
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                {meta.ok}/{meta.checked} rows agree
                {meta.bad ? ` · ${meta.bad} disagree` : ""}
              </span>
              {meta.badKnown ? (
                <span className="rounded-md bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-800">
                  {meta.badKnown} known to differ — expected
                </span>
              ) : null}
              <span className="text-sm text-slate-600">
                {meta.start} → {meta.end} ({meta.periodKind}) · {meta.scopeLabel}
              </span>
              <span className="text-xs text-slate-500">
                {meta.achieverCount} achievers · {meta.contributorCount} contributors ·{" "}
                {meta.dealsRead} deals read
              </span>
            </div>

            {meta.loadError ? (
              <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                One of the reads failed, so some figures below are incomplete:{" "}
                {meta.loadError}
              </div>
            ) : null}

            {/* ── The reference, at the top ──────────────────────────────── */}
            <div className="mt-5 overflow-hidden rounded-lg border-2 border-slate-900 bg-white">
              <div className="border-b border-slate-200 bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
                Reference — the shared rules, computed once
              </div>
              <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 sm:grid-cols-3 lg:grid-cols-4">
                <RefLine
                  label="Achieved"
                  value={fmtMoney(ref.achieved)}
                  sub={`gross ${fmtMoney(ref.achievedGross)} − returns ${fmtMoney(ref.returns)} · ${ref.dealCount} invoices`}
                />
                <RefLine label="Target" value={fmtMoney(ref.target)} sub="monthly rows, per-person rule" />
                <RefLine label="Gap to target" value={fmtMoney(ref.gap)} />
                <RefLine
                  label="Conversion (3m)"
                  value={fmtPct(ref.conversion3m)}
                  sub={`${ref.conversionWon3m}/${ref.conversionTotal3m} created · ${ref.importedExcluded} imported excluded`}
                />
                <RefLine
                  label="Funnel, this month"
                  value={fmtMoney(ref.funnelNow)}
                  sub={`undated ${fmtMoney(ref.funnelNowUndated)} · the live figure`}
                />
                <RefLine
                  label="Funnel, this period"
                  value={fmtMoney(ref.funnelWindow)}
                  sub={`undated ${fmtMoney(ref.funnelWindowUndated)}`}
                />
                <RefLine
                  label="Pipeline conversion (3m)"
                  value={fmtPct(ref.pipelineConversion3m)}
                  sub="information only — nothing calculates with it"
                />
                <RefLine
                  label="Won, not yet invoiced"
                  value={fmtMoney(ref.wniTotal)}
                  sub={`${ref.wniCount} deals · a status, not windowed`}
                />
                {ref.annualTarget !== null && ref.annualTarget !== undefined ? (
                  <>
                    <RefLine label="Annual allocation" value={fmtMoney(ref.annualTarget)} sub="the yearly rows" />
                    <RefLine label="Monthly assigned" value={fmtMoney(ref.target)} />
                    <RefLine label="Not yet assigned" value={fmtMoney(ref.unassignedAnnual)} />
                  </>
                ) : null}
              </div>
            </div>

            {/* ── The rows, grouped by screen ────────────────────────────── */}
            {result.groups.map((g) => (
              <div
                key={g.screen}
                className={`mt-4 overflow-hidden rounded-lg border bg-white ${
                  g.knownToDiffer ? "border-amber-300" : "border-slate-200"
                }`}
              >
                <div
                  className={`flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-2 ${
                    g.knownToDiffer
                      ? "border-amber-200 bg-amber-50"
                      : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <h2 className="text-sm font-semibold text-slate-900">{g.screen}</h2>
                  <code className="text-[11px] text-slate-500">{g.fn}</code>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {g.rows.map((r, i) => (
                      <tr
                        key={`${g.screen}-${r.label}`}
                        className={i % 2 ? "bg-slate-50/40" : undefined}
                      >
                        <td className="w-8 px-3 py-2 text-center align-top">
                          <Mark row={r} />
                        </td>
                        <td className="px-2 py-2 align-top">
                          <div className="text-slate-800">{r.label}</div>
                          {r.note ? (
                            <div className="mt-0.5 max-w-3xl text-xs text-slate-500">{r.note}</div>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right align-top font-medium tabular-nums text-slate-900">
                          {show(r)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right align-top tabular-nums text-slate-500">
                          {r.expected !== null ? showExp(r) : ""}
                        </td>
                        <td
                          className={`whitespace-nowrap px-3 py-2 text-right align-top tabular-nums ${
                            r.status === "bad"
                              ? r.knownToDiffer
                                ? "text-amber-700"
                                : "font-semibold text-red-700"
                              : "text-slate-400"
                          }`}
                        >
                          {r.status === "bad" ? showDiff(r) : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-600">
              <div className="grid gap-1">
                <div><span className="font-semibold text-emerald-600">✓</span> agrees with the reference, to 1 SAR or 0.1 of a percentage point.</div>
                <div><span className="font-semibold text-red-600">✗</span> disagrees — the third column is the difference.</div>
                <div><span className="font-semibold text-amber-600">✗</span> in the amber group: known to differ, not yet unified. Expected, not alarming.</div>
                <div><span className="text-slate-400">—</span> nothing to compare it against: a reference figure, or a count shown for context.</div>
              </div>
              <div className="mt-3 text-slate-500">
                Run {meta.ranAt}. The reference is computed once from the shared rules; every
                other row calls the function its own screen calls, with that screen&apos;s
                arguments.
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
