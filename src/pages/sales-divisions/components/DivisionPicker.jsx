import React, { useEffect, useMemo, useRef, useState } from "react";
import { divisionView, UNASSIGNED } from "utils/salesDivisionMetrics";

/**
 * "ALL DIVISIONS" PICKER — Manager → Division → Supervisor / team → Person.
 *
 * For manager, director, head and admin only; the page decides that. Each
 * column lists only what sits under the choice to its left, and every entry
 * can be chosen on its own: it jumps the page straight to that level, the
 * same `nav` a row click produces. Row clicking is untouched.
 *
 * WHO IS LISTED
 *   managers    active managers — a director sees all, a manager himself
 *   divisions   the page's own groups with an active person under that manager
 *               (his own reporting line, supervisor_id, or himself); a person
 *               in two divisions is a member of both, so appears under both
 *   supervisors the division's active supervisors in that line
 *   people      the supervisor's active team, or the division's active members
 *               when it has no supervisor
 * Departed people are never listed. Everything comes from the users and groups
 * the page already holds for the viewer's scope; nothing is read here.
 */
const active = (u) => u && u.is_active !== false;

export function pickerTree({ users = [], groups = [], viewerId, role }) {
  const byId = new Map(users.map((u) => [u.id, u]));
  const subtree = (id) => {
    const out = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      users.forEach((u) => { if (u.supervisor_id && out.has(u.supervisor_id) && !out.has(u.id)) { out.add(u.id); grew = true; } });
    }
    return out;
  };
  const managers = users
    .filter((u) => active(u) && u.role === "manager" && (role !== "manager" || u.id === viewerId))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  return managers.map((m) => {
    const line = subtree(m.id);
    const divisions = groups
      .filter((g) => g.id !== UNASSIGNED)
      .map((g) => {
        const v = divisionView({ group: g, users });
        const inLine = (id) => line.has(id) && active(byId.get(id));
        const supervisors = (v.supervisors || [])
          .filter((c) => inLine(c.user.id))
          .map((c) => ({
            user: c.user,
            people: (c.teamIds || []).filter((id) => id !== c.user.id && inLine(id)).map((id) => byId.get(id)),
          }));
        const members = (g.userIds || []).filter(inLine).map((id) => byId.get(id));
        return { group: g, mode: v.mode, supervisors, members };
      })
      .filter((d) => d.members.length > 0);
    return { manager: m, divisions };
  });
}

export default function DivisionPicker({ users, groups, viewerId, role, onJump, onClose }) {
  const tree = useMemo(() => pickerTree({ users, groups, viewerId, role }), [users, groups, viewerId, role]);
  const [mId, setMId] = useState(tree[0]?.manager.id || null);
  const [dId, setDId] = useState(null);
  const [sId, setSId] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    // The crumb toggles the picker itself; closing on its mousedown as well
    // would reopen it on the click that follows.
    const onDown = (e) => {
      if (e.target?.closest?.('[data-testid="crumb-all-divisions"]')) return;
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [onClose]);

  const mgr = tree.find((t) => t.manager.id === mId) || null;
  const div = mgr?.divisions.find((d) => d.group.id === dId) || null;
  const sup = div?.supervisors.find((s) => s.user.id === sId) || null;
  const people = div ? (sup ? sup.people : div.mode === "supervisor" ? [] : div.members) : [];

  const nav = {
    company: () => ({ level: "company", division: null, supervisor: null, member: null, deal: null }),
    division: (d) => ({ level: d.mode === "team" ? "team" : "division", division: d.group.id, supervisor: null, member: null, deal: null }),
    team: (d, s) => ({ level: "team", division: d.group.id, supervisor: s.user.id, member: null, deal: null }),
    member: (d, s, u) => ({ level: "member", division: d.group.id, supervisor: s ? s.user.id : null, member: u.id, deal: null }),
  };
  const jump = (to) => { onJump(to); onClose(); };

  const Col = ({ title, children, testid }) => (
    <div className="min-w-0 flex-1 basis-40 border-r last:border-r-0 border-gray-100" data-testid={testid}>
      <p className="px-3 pt-2 pb-1 text-[10px] font-mono uppercase tracking-widest text-gray-400">{title}</p>
      <ul className="pb-2">{children}</ul>
    </div>
  );
  const Item = ({ label, sub, selected, onPick, onGo, testid }) => (
    <li className={`flex items-center gap-1 px-2 ${selected ? "bg-gray-100" : ""}`}>
      <button type="button" onClick={onPick} data-testid={testid}
        className="flex-1 min-w-0 text-left text-xs px-1 py-1.5 truncate hover:underline">
        {label}{sub && <span className="block text-[10px] text-gray-400 truncate">{sub}</span>}
      </button>
      <button type="button" onClick={onGo} data-testid={`${testid}-go`} title={`Open ${label}`}
        className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-gray-200 text-gray-600 hover:bg-white flex-shrink-0">
        Open
      </button>
    </li>
  );

  return (
    <div ref={ref} role="dialog" aria-label="Choose a level" data-testid="division-picker"
      className="absolute left-0 top-full mt-1 z-50 w-[min(44rem,calc(100vw-2rem))] bg-white rounded-xl border border-gray-200 shadow-xl">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-800">Jump to a level</span>
        <button type="button" onClick={() => jump(nav.company())} data-testid="picker-company"
          className="text-[11px] px-2 py-1 rounded border border-gray-200 hover:bg-gray-50">All Divisions</button>
      </div>
      <div className="flex flex-wrap sm:flex-nowrap max-h-[60vh] overflow-y-auto">
        <Col title="Manager" testid="picker-col-manager">
          {tree.map((t) => (
            <Item key={t.manager.id} label={t.manager.full_name} sub={`${t.divisions.length} divisions`}
              selected={t.manager.id === mId} testid={`picker-manager-${t.manager.id}`}
              onPick={() => { setMId(t.manager.id); setDId(null); setSId(null); }}
              onGo={() => jump(nav.company())} />
          ))}
          {!tree.length && <li className="px-3 py-1.5 text-xs text-gray-400">No active manager.</li>}
        </Col>
        <Col title="Division" testid="picker-col-division">
          {(mgr?.divisions || []).map((d) => (
            <Item key={d.group.id} label={d.group.name}
              sub={d.mode === "team" ? "no supervisor" : `${d.supervisors.length} supervisor${d.supervisors.length === 1 ? "" : "s"}`}
              selected={d.group.id === dId} testid={`picker-division-${d.group.id}`}
              onPick={() => { setDId(d.group.id); setSId(null); }}
              onGo={() => jump(nav.division(d))} />
          ))}
          {mgr && !mgr.divisions.length && <li className="px-3 py-1.5 text-xs text-gray-400">No division.</li>}
          {!mgr && <li className="px-3 py-1.5 text-xs text-gray-400">Choose a manager.</li>}
        </Col>
        <Col title="Supervisor / team" testid="picker-col-team">
          {(div?.supervisors || []).map((s) => (
            <Item key={s.user.id} label={`${s.user.full_name}'s team`} sub={`${s.people.length} people`}
              selected={s.user.id === sId} testid={`picker-team-${s.user.id}`}
              onPick={() => setSId(s.user.id)}
              onGo={() => jump(nav.team(div, s))} />
          ))}
          {div && div.mode !== "supervisor" && <li className="px-3 py-1.5 text-xs text-gray-400">No supervisor — people are listed directly.</li>}
          {!div && <li className="px-3 py-1.5 text-xs text-gray-400">Choose a division.</li>}
        </Col>
        <Col title="Person" testid="picker-col-person">
          {people.map((u) => (
            <Item key={u.id} label={u.full_name} sub={u.role}
              selected={false} testid={`picker-person-${u.id}`}
              onPick={() => jump(nav.member(div, sup, u))}
              onGo={() => jump(nav.member(div, sup, u))} />
          ))}
          {div && !people.length && <li className="px-3 py-1.5 text-xs text-gray-400">{div.mode === "supervisor" && !sup ? "Choose a team." : "Nobody listed."}</li>}
          {!div && <li className="px-3 py-1.5 text-xs text-gray-400">—</li>}
        </Col>
      </div>
    </div>
  );
}
