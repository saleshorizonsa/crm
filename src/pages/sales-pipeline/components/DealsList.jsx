import React, { useState } from "react";
import Icon from "../../../components/AppIcon";
import Button from "../../../components/ui/Button";
import Select from "../../../components/ui/Select";
import { useCurrency } from "../../../contexts/CurrencyContext";
import { Edit2Icon } from "lucide-react";

const DealsList = ({ deals, onStageChange, onEditDeal }) => {
  const [sortConfig, setSortConfig] = useState({
    key: "created_at",
    direction: "desc",
  });
  const [selectedRows, setSelectedRows] = useState([]);
  const { formatCurrency, preferredCurrency } = useCurrency();

  const formatDate = (date) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getStageLabel = (stage) => {
    const stageMap = {
      lead: "Lead",
      contact_made: "Qualified",
      proposal_sent: "Proposal",
      negotiation: "Negotiation",
      won: "Won",
      lost: "Lost",
      "closed-won": "Won",
      "closed-lost": "Lost",
    };
    return stageMap[stage] || stage;
  };

  const getStageColor = (stage) => {
    const colorMap = {
      lead: "bg-gray-100 text-gray-800",
      contact_made: "bg-blue-100 text-blue-800",
      proposal_sent: "bg-purple-100 text-purple-800",
      negotiation: "bg-yellow-100 text-yellow-800",
      won: "bg-green-100 text-green-800",
      lost: "bg-red-100 text-red-800",
      "closed-won": "bg-green-100 text-green-800",
      "closed-lost": "bg-red-100 text-red-800",
    };
    return colorMap[stage] || "bg-gray-100 text-gray-800";
  };

  const stageOptions = [
    { value: "lead", label: "Lead" },
    { value: "contact_made", label: "Qualified" },
    { value: "proposal_sent", label: "Proposal" },
    { value: "negotiation", label: "Negotiation" },
    { value: "closed-won", label: "Won" },
    { value: "closed-lost", label: "Lost" },
  ];

  const handleSort = (key) => {
    setSortConfig({
      key,
      direction:
        sortConfig.key === key && sortConfig.direction === "asc"
          ? "desc"
          : "asc",
    });
  };

  const sortedDeals = [...deals].sort((a, b) => {
    if (!a[sortConfig.key]) return 1;
    if (!b[sortConfig.key]) return -1;

    const compareResult =
      typeof a[sortConfig.key] === "string"
        ? a[sortConfig.key].localeCompare(b[sortConfig.key])
        : a[sortConfig.key] - b[sortConfig.key];

    return sortConfig.direction === "asc" ? compareResult : -compareResult;
  });

  const handleRowSelect = (dealId) => {
    setSelectedRows((prev) =>
      prev.includes(dealId)
        ? prev.filter((id) => id !== dealId)
        : [...prev, dealId]
    );
  };

  const handleSelectAll = () => {
    setSelectedRows(
      selectedRows.length === deals.length ? [] : deals.map((deal) => deal.id)
    );
  };

  const SortIcon = ({ column }) => (
    <Icon
      name={
        sortConfig.key === column
          ? sortConfig.direction === "asc"
            ? "ChevronUp"
            : "ChevronDown"
          : "ChevronsUpDown"
      }
      size={14}
      className="ml-1 text-gray-400"
    />
  );

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-700 uppercase bg-gray-50">
            <tr>
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={selectedRows.length === deals.length}
                  onChange={handleSelectAll}
                  className="rounded border-gray-300"
                />
              </th>
              <th
                className="px-4 py-3 cursor-pointer"
                onClick={() => handleSort("title")}
              >
                <div className="flex items-center">
                  Deal Name
                  <SortIcon column="title" />
                </div>
              </th>
              <th
                className="px-4 py-3 cursor-pointer"
                onClick={() => handleSort("amount")}
              >
                <div className="flex items-center">
                  Amount
                  <SortIcon column="amount" />
                </div>
              </th>
              <th
                className="px-4 py-3 cursor-pointer"
                onClick={() => handleSort("stage")}
              >
                <div className="flex items-center">
                  Stage
                  <SortIcon column="stage" />
                </div>
              </th>
              <th
                className="px-4 py-3 cursor-pointer"
                onClick={() => handleSort("expected_close_date")}
              >
                <div className="flex items-center">
                  Expected Close
                  <SortIcon column="expected_close_date" />
                </div>
              </th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedDeals.map((deal) => (
              <tr
                key={deal.id}
                className="border-b border-gray-200 hover:bg-gray-50"
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedRows.includes(deal.id)}
                    onChange={() => handleRowSelect(deal.id)}
                    className="rounded border-gray-300"
                  />
                </td>
                <td className="px-4 py-3 font-medium text-gray-900">
                  {deal.title}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {formatCurrency(
                    deal.amount,
                    deal.currency || preferredCurrency
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStageColor(
                      deal.stage
                    )}`}
                  >
                    {getStageLabel(deal.stage)}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {formatDate(deal.expected_close_date)}
                </td>
                <td className="px-4 py-3">
                  {deal.contact ? (
                    <div>
                      <div className="font-medium">
                        {deal.contact.first_name} {deal.contact.last_name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {deal.contact.email}
                      </div>
                    </div>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">
                  {deal.owner ? (
                    <div className="flex items-center">
                      {deal.owner.avatar_url ? (
                        <img
                          src={deal.owner.avatar_url}
                          alt=""
                          className="w-6 h-6 rounded-full mr-2"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-gray-200 mr-2 flex items-center justify-center text-xs text-gray-600">
                          {deal.owner.first_name?.[0]}
                          {deal.owner.last_name?.[0]}
                        </div>
                      )}
                      <span>
                        {deal.owner.first_name} {deal.owner.last_name}
                      </span>
                    </div>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEditDeal(deal)}
                    className="text-gray-700 hover:text-gray-900"
                  >
                    <Icon name="Edit" size={16} />
                    <Edit2Icon size={16} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DealsList;
