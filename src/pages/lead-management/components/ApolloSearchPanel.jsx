import React, { useState } from "react";
import Icon from "../../../components/AppIcon";
import Button from "../../../components/ui/Button";
import { leadService } from "../../../services/leadService";

const REGIONS = [
  { value: "",        label: "Select region…"  },
  { value: "riyadh",   label: "Riyadh"          },
  { value: "jeddah",   label: "Jeddah"          },
  { value: "dammam",   label: "Dammam"          },
  { value: "khobar",   label: "Al Khobar"       },
  { value: "makkah",   label: "Makkah"          },
  { value: "madinah",  label: "Madinah"         },
  { value: "dubai",    label: "Dubai"           },
  { value: "abudhabi", label: "Abu Dhabi"       },
  { value: "kuwait",   label: "Kuwait"          },
  { value: "bahrain",  label: "Bahrain"         },
  { value: "qatar",    label: "Qatar"           },
];

const PRODUCTS = [
  { value: "",        label: "Select product…" },
  { value: "steel",   label: "Steel"           },
  { value: "pvc",     label: "PVC"             },
  { value: "trading", label: "Trading"         },
];

const selClass =
  "w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary";

const ApolloSearchPanel = ({ isOpen, onClose, onImport, companyId }) => {
  const [filters,   setFilters]   = useState({ region: "", product: "", industry: "" });
  const [results,   setResults]   = useState([]);
  const [total,     setTotal]     = useState(0);
  const [loading,   setLoading]   = useState(false);
  const [selected,  setSelected]  = useState(new Set());
  const [importing, setImporting] = useState(false);
  const [error,     setError]     = useState("");
  const [searched,  setSearched]  = useState(false);

  if (!isOpen) return null;

  const setFilter = (key, value) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const handleSearch = async () => {
    if (!filters.region || !filters.product) {
      setError("Please select both a region and product interest.");
      return;
    }
    setError("");
    setLoading(true);
    setResults([]);
    setSelected(new Set());
    setSearched(true);

    const { results: res, total: t, error: err } = await leadService.searchApollo({
      region:    filters.region,
      product:   filters.product,
      industry:  filters.industry || undefined,
      companyId,
    });

    setLoading(false);
    if (err) {
      setError("Apollo search failed: " + (err.message || String(err)));
      return;
    }
    setResults(res || []);
    setTotal(t  || 0);
  };

  const toggleSelect = (apolloId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(apolloId) ? next.delete(apolloId) : next.add(apolloId);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === results.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(results.map((r) => r.apollo_id)));
    }
  };

  const handleImport = async () => {
    const toImport = results.filter((r) => selected.has(r.apollo_id));
    if (!toImport.length) return;
    setImporting(true);
    await onImport(toImport);
    setImporting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Slide-in panel */}
      <div className="relative ml-auto w-full max-w-xl bg-white shadow-2xl flex flex-col h-full">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <Icon name="Zap" size={15} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Apollo.io Search</h2>
              <p className="text-xs text-gray-500">Find and import prospects</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-md">
            <Icon name="X" size={18} />
          </button>
        </div>

        {/* Filters */}
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 space-y-3 flex-shrink-0">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Region <span className="text-red-500">*</span>
              </label>
              <select
                value={filters.region}
                onChange={(e) => setFilter("region", e.target.value)}
                className={selClass}
              >
                {REGIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Product Interest <span className="text-red-500">*</span>
              </label>
              <select
                value={filters.product}
                onChange={(e) => setFilter("product", e.target.value)}
                className={selClass}
              >
                {PRODUCTS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Industry <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              className={selClass}
              placeholder="e.g. Construction, Manufacturing"
              value={filters.industry}
              onChange={(e) => setFilter("industry", e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
          </div>
          {error && (
            <p className="text-xs text-red-600 flex items-center gap-1.5">
              <Icon name="AlertCircle" size={12} />{error}
            </p>
          )}
          <Button
            size="sm"
            onClick={handleSearch}
            disabled={loading}
            className="w-full gap-2 justify-center"
          >
            {loading
              ? <><Icon name="Loader2" size={13} className="animate-spin" />Searching…</>
              : <><Icon name="Search" size={13} />Search Apollo</>}
          </Button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3">
              <Icon name="Loader2" size={28} className="text-blue-500 animate-spin" />
              <p className="text-sm text-gray-500">Searching Apollo.io…</p>
              <p className="text-xs text-gray-400">This may take a few seconds</p>
            </div>
          ) : !searched ? (
            <div className="flex flex-col items-center justify-center h-56 gap-3 text-center px-8">
              <Icon name="Users" size={40} className="text-gray-200" />
              <p className="text-sm font-medium text-gray-500">Ready to search</p>
              <p className="text-xs text-gray-400">
                Select a region and product interest, then click Search Apollo.
              </p>
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-56 gap-3 text-center px-8">
              <Icon name="SearchX" size={36} className="text-gray-200" />
              <p className="text-sm font-medium text-gray-500">No results found</p>
              <p className="text-xs text-gray-400">Try a different region or product.</p>
            </div>
          ) : (
            <>
              {/* Selection header */}
              <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-2.5 flex items-center justify-between z-10">
                <label className="flex items-center gap-2.5 text-sm text-gray-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={results.length > 0 && selected.size === results.length}
                    onChange={toggleAll}
                    className="rounded border-gray-300"
                  />
                  {selected.size > 0
                    ? `${selected.size} of ${results.length} selected`
                    : `${results.length} results${total > results.length ? ` (${total.toLocaleString()} total)` : ""}`}
                </label>
                {selected.size > 0 && (
                  <span className="text-xs text-blue-600 font-medium">
                    {selected.size} to import
                  </span>
                )}
              </div>

              {/* Result rows */}
              <div className="divide-y divide-gray-100">
                {results.map((r) => (
                  <div
                    key={r.apollo_id}
                    className={`px-5 py-3 flex items-start gap-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                      selected.has(r.apollo_id) ? "bg-blue-50 hover:bg-blue-50" : ""
                    }`}
                    onClick={() => toggleSelect(r.apollo_id)}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(r.apollo_id)}
                      onChange={() => toggleSelect(r.apollo_id)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1 rounded border-gray-300 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900">
                          {r.first_name} {r.last_name}
                        </span>
                        {r.linkedin_url && (
                          <a
                            href={r.linkedin_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-blue-500 hover:text-blue-700"
                            title="LinkedIn"
                          >
                            <Icon name="Linkedin" size={12} />
                          </a>
                        )}
                      </div>
                      {r.title && (
                        <p className="text-xs text-gray-500 truncate">{r.title}</p>
                      )}
                      {r.company_name && (
                        <p className="text-xs text-gray-700 font-medium truncate mt-0.5">
                          {r.company_name}
                        </p>
                      )}
                      <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-1">
                        {r.email && (
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <Icon name="Mail" size={10} />
                            <span className="truncate max-w-[160px]">{r.email}</span>
                          </span>
                        )}
                        {r.phone && (
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <Icon name="Phone" size={10} />{r.phone}
                          </span>
                        )}
                        {r.city && (
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <Icon name="MapPin" size={10} />{r.city}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {results.length > 0 && (
          <div className="border-t border-gray-200 px-5 py-4 bg-white flex items-center justify-between gap-3 flex-shrink-0">
            <p className="text-xs text-gray-500">
              {selected.size === 0
                ? "Select leads above to import"
                : `${selected.size} lead${selected.size !== 1 ? "s" : ""} ready to import`}
            </p>
            <Button
              onClick={handleImport}
              disabled={selected.size === 0 || importing}
              className="gap-2"
            >
              {importing
                ? <><Icon name="Loader2" size={13} className="animate-spin" />Importing…</>
                : <><Icon name="Download" size={13} />Import {selected.size > 0 ? selected.size : ""}</>}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ApolloSearchPanel;
