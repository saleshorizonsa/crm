import React, { useState, useMemo } from "react";
import Icon from "../../../components/AppIcon";
import Button from "../../../components/ui/Button";
import LeadScoreBadge from "../../../components/ui/LeadScoreBadge";
import { Edit2Icon } from "lucide-react";

const NUMERIC_KEYS = new Set(["lead_score"]);

const ContactTable = ({
  contacts,
  selectedRows,
  onSelectRows,
  onEdit,
  isLoading,
  sort, // "hottest" | "coldest" | "" — set from ContactFilters
}) => {
  const [hoveredRow, setHoveredRow] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });

  const sortedContacts = useMemo(() => {
    // External sort (hottest/coldest) overrides column sort
    if (sort === "hottest") {
      return [...contacts].sort((a, b) => (b.lead_score ?? 0) - (a.lead_score ?? 0));
    }
    if (sort === "coldest") {
      return [...contacts].sort((a, b) => (a.lead_score ?? 0) - (b.lead_score ?? 0));
    }

    if (!sortConfig?.key) return contacts;

    return [...contacts].sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];

      if (sortConfig.key === "name") {
        aValue = `${a.first_name} ${a.last_name}`;
        bValue = `${b.first_name} ${b.last_name}`;
      }

      // Numeric sort for score columns
      if (NUMERIC_KEYS.has(sortConfig.key)) {
        aValue = aValue ?? 0;
        bValue = bValue ?? 0;
        return sortConfig.direction === "asc" ? aValue - bValue : bValue - aValue;
      }

      if (!aValue) return 1;
      if (!bValue) return -1;

      if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [contacts, sortConfig, sort]);

  const getStatusColor = (status) => {
    return status === "active"
      ? "bg-green-100 text-green-800"
      : "bg-gray-100 text-gray-800";
  };

  const formatLastContact = (date) => {
    if (!date) return "Never";

    const now = new Date();
    const contactDate = new Date(date);
    const diffTime = Math.abs(now - contactDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks ago`;
    return contactDate.toLocaleDateString();
  };

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const getSortIcon = (columnKey) => {
    if (sortConfig.key !== columnKey) {
      return (
        <Icon name="ArrowUpDown" size={14} className="text-muted-foreground" />
      );
    }
    return sortConfig.direction === "asc" ? (
      <Icon name="ArrowUp" size={14} className="text-primary" />
    ) : (
      <Icon name="ArrowDown" size={14} className="text-primary" />
    );
  };

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg p-12 text-center">
        <Icon
          name="Loader2"
          size={48}
          className="text-muted-foreground mx-auto mb-4 animate-spin"
        />
        <p className="text-muted-foreground">Loading contacts...</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="w-12 px-4 py-3">
                <input
                  type="checkbox"
                  checked={
                    selectedRows.length === contacts.length &&
                    contacts.length > 0
                  }
                  onChange={(e) => {
                    if (e.target.checked) {
                      onSelectRows(contacts.map((c) => c.id));
                    } else {
                      onSelectRows([]);
                    }
                  }}
                  className="rounded border-border"
                />
              </th>
              <th
                className="text-left px-4 py-3 cursor-pointer hover:bg-muted/70 transition-enterprise"
                onClick={() => handleSort("name")}
              >
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-muted-foreground">
                    Client
                  </span>
                  {getSortIcon("name")}
                </div>
              </th>
              <th
                className="text-left px-4 py-3 cursor-pointer hover:bg-muted/70 transition-enterprise"
                onClick={() => handleSort("company_name")}
              >
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-muted-foreground">
                    Company
                  </span>
                  {getSortIcon("company_name")}
                </div>
              </th>
              <th
                className="text-left px-4 py-3 cursor-pointer hover:bg-muted/70 transition-enterprise"
                onClick={() => handleSort("job_title")}
              >
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-muted-foreground">
                    Role
                  </span>
                  {getSortIcon("job_title")}
                </div>
              </th>
              <th
                className="text-left px-4 py-3 cursor-pointer hover:bg-muted/70 transition-enterprise"
                onClick={() => handleSort("last_contacted_at")}
              >
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-muted-foreground">
                    Last Contact
                  </span>
                  {getSortIcon("last_contacted_at")}
                </div>
              </th>
              <th
                className="text-left px-4 py-3 cursor-pointer hover:bg-muted/70 transition-enterprise"
                onClick={() => handleSort("status")}
              >
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-muted-foreground">
                    Status
                  </span>
                  {getSortIcon("status")}
                </div>
              </th>
              <th
                className="text-left px-4 py-3 cursor-pointer hover:bg-muted/70 transition-enterprise"
                onClick={() => handleSort("lead_score")}
              >
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-muted-foreground">
                    Lead Score
                  </span>
                  {getSortIcon("lead_score")}
                </div>
              </th>
              <th className="text-right px-4 py-3">
                <span className="text-sm font-medium text-muted-foreground">
                  Actions
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedContacts.map((contact) => (
              <tr
                key={contact.id}
                className={`border-b border-border hover:bg-muted/30 transition-enterprise cursor-pointer ${
                  selectedRows.includes(contact.id) ? "bg-primary/5" : ""
                }`}
                onMouseEnter={() => setHoveredRow(contact.id)}
                onMouseLeave={() => setHoveredRow(null)}
                onClick={() => onEdit(contact)}
              >
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedRows.includes(contact.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        onSelectRows([...selectedRows, contact.id]);
                      } else {
                        onSelectRows(
                          selectedRows.filter((id) => id !== contact.id)
                        );
                      }
                    }}
                    className="rounded border-border"
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-primary font-semibold">
                        {contact.first_name?.[0]}
                        {contact.last_name?.[0]}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-card-foreground">
                        {contact.first_name} {contact.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {contact.email}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <p className="text-sm text-card-foreground">
                    {contact.company_name || "-"}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <p className="text-sm text-card-foreground">
                    {contact.job_title || "-"}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <p className="text-sm text-muted-foreground">
                    {formatLastContact(contact.last_contacted_at)}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                      contact.status
                    )}`}
                  >
                    {contact.status || "active"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <LeadScoreBadge
                    score={contact.lead_score}
                    grade={contact.lead_grade}
                  />
                </td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <div
                    className={`flex items-center justify-end space-x-1 transition-enterprise ${
                      hoveredRow === contact.id ? "opacity-100" : "opacity-0"
                    }`}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => window.open(`mailto:${contact.email}`)}
                      className="h-8 w-8"
                      title="Email"
                    >
                      <Icon name="Mail" size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => window.open(`tel:${contact.phone}`)}
                      className="h-8 w-8"
                      title="Call"
                      disabled={!contact.phone}
                    >
                      <Icon name="Phone" size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEdit(contact)}
                      className="h-8 w-8"
                      title="Edit"
                    >
                      <Icon name="Edit" size={14} />
                      <Edit2Icon size={14} />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sortedContacts.length === 0 && (
        <div className="text-center py-12">
          <Icon
            name="Users"
            size={48}
            className="text-muted-foreground mx-auto mb-4"
          />
          <p className="text-muted-foreground">No clients found</p>
        </div>
      )}
    </div>
  );
};

export default ContactTable;
