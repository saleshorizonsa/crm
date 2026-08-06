import React, { useState, useEffect, useRef, useMemo } from "react";
import { Search, X, User, Phone } from "lucide-react";

// Reusable smart contact/client picker.
//
// Searches an already-scoped `contacts` array (name, company, phone) and shows
// the top 5 matches as the user types. Client-side by design: the parent passes
// the contacts it already loaded (owner/company-scoped), so this never has to
// re-implement scoping. (Note: in this DB contacts.company_id is NULL — contacts
// belong to a company through their owner — which is exactly why we filter the
// caller's pre-scoped list instead of querying by company_id.)
//
// Props:
//   contacts   — array of { id, first_name, last_name, company_name, phone, mobile }
//   value      — selected contact id (or null)
//   onChange   — (contact | null) => void
//   label, placeholder, required, className

const displayName = (c) =>
  c?.company_name ||
  `${c?.first_name || ""} ${c?.last_name || ""}`.trim() ||
  "Unnamed";

const fullName = (c) => `${c?.first_name || ""} ${c?.last_name || ""}`.trim();

const haystack = (c) =>
  [
    c.company_name,
    c.first_name,
    c.last_name,
    fullName(c),
    c.phone,
    c.mobile,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

function Highlight({ text, q }) {
  if (!text) return null;
  if (!q) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-100 text-yellow-800 rounded px-0.5">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

export default function ContactSearchInput({
  contacts = [],
  value = null,
  onChange,
  label = "Client",
  placeholder = "Search by name, company or phone…",
  required = false,
  className = "",
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [touched, setTouched] = useState(false); // true once the user edits the text
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const selected = useMemo(
    () => (value ? contacts.find((c) => c.id === value) || null : null),
    [value, contacts],
  );

  // Reflect the externally-selected contact in the input (until the user types).
  useEffect(() => {
    if (!touched) setQuery(selected ? displayName(selected) : "");
  }, [selected, touched]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = contacts || [];
    if (!q) return pool.slice(0, 5);
    return pool.filter((c) => haystack(c).includes(q)).slice(0, 5);
  }, [query, contacts]);

  // Close on outside click
  useEffect(() => {
    function onDocMouseDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  const handleInput = (e) => {
    setTouched(true);
    setQuery(e.target.value);
    setOpen(true);
    if (selected) onChange?.(null); // typing clears the current selection
  };

  const handleSelect = (contact) => {
    onChange?.(contact);
    setQuery(displayName(contact));
    setTouched(false);
    setOpen(false);
    inputRef.current?.blur();
  };

  const handleClear = () => {
    onChange?.(null);
    setQuery("");
    setTouched(true);
    setOpen(false);
    inputRef.current?.focus();
  };

  const showQuery = query.trim().length > 0;

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      {label && (
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          {label}
          {required && <span className="text-destructive ml-0.5">*</span>}
        </label>
      )}

      <div className="relative">
        <Search
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInput}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            else if (e.key === "Enter" && open && results.length > 0) {
              e.preventDefault();
              handleSelect(results[0]);
            }
          }}
          placeholder={placeholder}
          autoComplete="off"
          className={`w-full pl-9 pr-8 py-2.5 rounded-md text-sm bg-background border transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring ${
            selected ? "border-primary" : "border-border hover:border-primary/40"
          }`}
        />
        {(query || selected) && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center text-muted-foreground hover:bg-accent transition-colors"
          >
            <X size={11} />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-[60] top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg overflow-hidden">
          {results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground text-center">
              {showQuery ? `No contacts found for "${query.trim()}"` : "No contacts available"}
            </div>
          ) : (
            results.map((contact) => (
              <button
                key={contact.id}
                type="button"
                onClick={() => handleSelect(contact)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent transition-colors border-b border-border last:border-0 text-left"
              >
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 text-xs font-bold">
                  {displayName(contact).charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  {contact.company_name && (
                    <p className="text-sm font-medium text-foreground truncate">
                      <Highlight text={contact.company_name} q={query.trim()} />
                    </p>
                  )}
                  {fullName(contact) && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                      <User size={10} className="flex-shrink-0" />
                      <Highlight text={fullName(contact)} q={query.trim()} />
                    </p>
                  )}
                  {(contact.phone || contact.mobile) && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                      <Phone size={10} className="flex-shrink-0" />
                      <Highlight text={contact.phone || contact.mobile} q={query.trim()} />
                    </p>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
