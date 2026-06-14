import React, { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import Icon from "components/AppIcon";

const AdminCompanySelector = ({ value, onSelect }) => {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("companies")
      .select("id, name")
      .order("name")
      .then(({ data }) => {
        setCompanies(data || []);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-6 py-3 border-b border-border">
        <Icon name="Loader2" size={15} className="animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading companies…</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-6 py-3 bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-800">
      <Icon name="Building2" size={15} className="text-amber-600 shrink-0" />
      <span className="text-sm font-medium text-amber-800 dark:text-amber-300 shrink-0">
        Managing:
      </span>
      <select
        value={value?.id || ""}
        onChange={(e) => {
          const found = companies.find((c) => c.id === e.target.value) || null;
          onSelect(found);
        }}
        className="text-sm px-3 py-1.5 border border-amber-300 dark:border-amber-700 rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-amber-400"
      >
        <option value="">— Select a company —</option>
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {!value && (
        <span className="text-xs text-amber-700 dark:text-amber-400">
          Select a company to view and manage its data
        </span>
      )}
    </div>
  );
};

export default AdminCompanySelector;
