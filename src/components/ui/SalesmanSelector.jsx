import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Search, Users, X, Check } from "lucide-react";

// Reusable salesman drill-down. `value` is the selected user id (or null = all).
// `teamMembers` is the already role-scoped list the caller is allowed to see.
export default function SalesmanSelector({ value, onChange, teamMembers = [] }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapRef = useRef(null);

  useEffect(() => {
    const onDocMouseDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  const filtered = teamMembers.filter(
    (m) => !search || m.full_name?.toLowerCase().includes(search.toLowerCase()),
  );
  const selected = value ? teamMembers.find((m) => m.id === value) : null;

  const pick = (id) => {
    onChange?.(id);
    setOpen(false);
    setSearch("");
  };

  return (
    <div ref={wrapRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 px-3 py-2 border rounded-xl text-sm transition-colors min-w-[11rem] ${
          value
            ? "border-primary bg-primary/5 text-primary"
            : "border-border bg-background text-muted-foreground hover:bg-accent"
        }`}
      >
        <Users size={14} className="flex-shrink-0" />
        <span className="flex-1 text-left truncate">
          {selected ? selected.full_name : "All Salesmen"}
        </span>
        {value ? (
          <span
            role="button"
            aria-label="Clear"
            onClick={(e) => { e.stopPropagation(); onChange?.(null); setSearch(""); }}
            className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-primary/20 transition-colors flex-shrink-0"
          >
            <X size={10} />
          </span>
        ) : (
          <ChevronDown
            size={14}
            className={`flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-[60] top-full left-0 mt-1 bg-popover border border-border rounded-xl shadow-lg overflow-hidden min-w-[14rem]">
          {/* Search */}
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search salesman…"
                autoFocus
                className="w-full pl-7 pr-3 py-1.5 text-xs bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {/* All option */}
          <button
            type="button"
            onClick={() => pick(null)}
            className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm transition-colors border-b border-border hover:bg-accent ${
              !value ? "bg-primary/5 text-primary" : "text-muted-foreground"
            }`}
          >
            <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
              <Users size={13} className="text-muted-foreground" />
            </div>
            <span className="flex-1 text-left font-medium">All Salesmen</span>
            {!value && <Check size={13} className="text-primary flex-shrink-0" />}
          </button>

          {/* List */}
          <div className="max-h-52 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-xs text-muted-foreground text-center">
                No results
              </div>
            ) : (
              filtered.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => pick(m.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm transition-colors hover:bg-accent ${
                    value === m.id ? "bg-primary/5" : ""
                  }`}
                >
                  <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {m.full_name?.charAt(0).toUpperCase() || "?"}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{m.full_name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{m.role}</p>
                  </div>
                  {value === m.id && <Check size={13} className="text-primary flex-shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
