import React, { useState, useEffect } from "react";
import Icon from "components/AppIcon";
import { supabase } from "../../../lib/supabase";
import {
  downloadCustomerTemplate,
  exportCustomersToExcel,
} from "../../../utils/importExportUtils";
import CustomerImportModal from "./CustomerImportModal";

const CustomerMaster = ({ adminCompany }) => {
  const [contacts, setContacts]     = useState([]);
  const [loading, setLoading]       = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [exporting, setExporting]   = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (adminCompany?.id) loadContacts();
    else setContacts([]);
  }, [adminCompany?.id]);

  async function loadContacts() {
    setLoading(true);
    const { data, error } = await supabase
      .from("contacts")
      .select(`
        id, company_name, first_name, last_name,
        email, phone, mobile, city, region,
        industry, status, created_at,
        owner:owner_id ( id, full_name, email )
      `)
      .eq("company_id", adminCompany.id)
      .order("company_name");

    if (!error) setContacts(data || []);
    setLoading(false);
  }

  async function handleDownloadTemplate() {
    const { data: salesmen } = await supabase
      .from("users")
      .select("id, full_name, email")
      .eq("company_id", adminCompany.id)
      .eq("is_active", true)
      .order("full_name");

    downloadCustomerTemplate(adminCompany.name, salesmen || []);
  }

  async function handleExportCurrentData() {
    setExporting(true);
    try {
      const { data } = await supabase
        .from("contacts")
        .select(`
          company_name, first_name, last_name,
          email, phone, mobile, city, region,
          country, industry, notes, status,
          owner:owner_id ( email )
        `)
        .eq("company_id", adminCompany.id)
        .order("company_name");

      if (!data?.length) {
        alert(`No customers found for ${adminCompany.name}`);
        return;
      }
      exportCustomersToExcel(data, adminCompany.name);
    } finally {
      setExporting(false);
    }
  }

  const filtered = contacts.filter(c => {
    if (!searchTerm) return true;
    const t = searchTerm.toLowerCase();
    return (
      c.company_name?.toLowerCase().includes(t) ||
      c.first_name?.toLowerCase().includes(t)   ||
      c.last_name?.toLowerCase().includes(t)    ||
      c.email?.toLowerCase().includes(t)        ||
      c.city?.toLowerCase().includes(t)
    );
  });

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold">Customer Master</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {adminCompany
              ? `${contacts.length} customer${contacts.length !== 1 ? "s" : ""} for ${adminCompany.name}`
              : "Select a company to view customers"}
          </p>
        </div>

        {adminCompany && (
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Download Template */}
            <button
              onClick={handleDownloadTemplate}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-green-200 text-green-700 bg-green-50 hover:bg-green-100 dark:border-green-800 dark:text-green-400 dark:bg-green-950/20 dark:hover:bg-green-950/30 transition-colors"
            >
              <Icon name="Download" size={15} />
              Download Template
            </button>

            {/* Export Current Data */}
            <button
              onClick={handleExportCurrentData}
              disabled={exporting || contacts.length === 0}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-200 text-gray-700 bg-gray-50 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:bg-gray-800/30 dark:hover:bg-gray-800/50 disabled:opacity-40 transition-colors"
            >
              <Icon name={exporting ? "Loader2" : "FileDown"} size={15} className={exporting ? "animate-spin" : ""} />
              Export Current Data
            </button>

            {/* Import */}
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 dark:border-blue-800 dark:text-blue-400 dark:bg-blue-950/20 dark:hover:bg-blue-950/30 transition-colors"
            >
              <Icon name="Upload" size={15} />
              Import Customers
            </button>

            {/* Refresh */}
            <button
              onClick={loadContacts}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:bg-accent disabled:opacity-40 transition-colors"
            >
              <Icon name="RefreshCw" size={15} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        )}
      </div>

      {!adminCompany ? (
        <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
          Select a company above to view and manage customers
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center h-48 gap-2 text-muted-foreground">
          <Icon name="Loader2" size={20} className="animate-spin" />
          <span className="text-sm">Loading customers…</span>
        </div>
      ) : (
        <>
          {/* Search */}
          <div className="relative max-w-sm">
            <Icon name="Search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search customers…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full text-sm pl-9 pr-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Total Customers", value: contacts.length,                               icon: "Users",       color: "text-primary" },
              { label: "Active",          value: contacts.filter(c => c.status === "active").length, icon: "CheckCircle", color: "text-emerald-600" },
              { label: "Inactive",        value: contacts.filter(c => c.status !== "active").length, icon: "XCircle",     color: "text-red-500" },
            ].map(({ label, value, icon, color }) => (
              <div key={label} className="bg-card border border-border rounded-xl p-4 text-center">
                <Icon name={icon} size={20} className={`mx-auto ${color} mb-2`} />
                <div className="text-2xl font-semibold">{value}</div>
                <div className="text-xs text-muted-foreground mt-1">{label}</div>
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-muted-foreground">
                <Icon name="Users" size={40} className="mb-3" />
                <p className="text-sm font-medium">
                  {searchTerm ? "No customers match your search" : "No customers yet"}
                </p>
                {!searchTerm && (
                  <p className="text-xs mt-1">
                    Use Import Customers to add customers, or they will appear here as deals are created
                  </p>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left px-4 py-3 text-sm font-medium">Company Name</th>
                      <th className="text-left px-4 py-3 text-sm font-medium">Contact Person</th>
                      <th className="text-left px-4 py-3 text-sm font-medium">Email</th>
                      <th className="text-left px-4 py-3 text-sm font-medium">Phone</th>
                      <th className="text-left px-4 py-3 text-sm font-medium">City</th>
                      <th className="text-left px-4 py-3 text-sm font-medium">Salesman</th>
                      <th className="text-left px-4 py-3 text-sm font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filtered.map(c => (
                      <tr key={c.id} className="hover:bg-accent">
                        <td className="px-4 py-3">
                          <div className="font-medium text-sm">{c.company_name}</div>
                          {c.industry && (
                            <div className="text-xs text-muted-foreground">{c.industry}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {[c.first_name, c.last_name].filter(Boolean).join(" ") || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {c.email || "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {c.phone || c.mobile || "—"}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {c.city || "—"}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {c.owner?.full_name ? (
                            <span className="text-foreground">{c.owner.full_name}</span>
                          ) : (
                            <span className="text-muted-foreground">Unassigned</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                            c.status === "active"
                              ? "bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400"
                              : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                          }`}>
                            {c.status === "active" ? (
                              <><Icon name="CheckCircle" size={11} />Active</>
                            ) : (
                              <><Icon name="XCircle" size={11} />Inactive</>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {filtered.length > 0 && filtered.length !== contacts.length && (
            <p className="text-xs text-muted-foreground text-center">
              Showing {filtered.length} of {contacts.length} customers
            </p>
          )}
        </>
      )}

      <CustomerImportModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onSuccess={() => { setShowImport(false); loadContacts(); }}
        adminCompany={adminCompany}
      />
    </div>
  );
};

export default CustomerMaster;
