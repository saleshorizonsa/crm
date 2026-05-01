import React, { useState, useEffect } from "react";
import Icon from "../../../components/AppIcon";
import Button from "../../../components/ui/Button";
import { companyService } from "../../../services/supabaseService";

const CompanyManagement = () => {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [filter, setFilter] = useState("all"); // all, active, inactive

  useEffect(() => {
    loadCompanies();
  }, []);

  const loadCompanies = async () => {
    setLoading(true);
    try {
      // Get all companies including inactive ones for admin management
      const { data, error } = await companyService.getAllCompanies(false);
      if (!error && data) {
        setCompanies(data);
      }
    } catch (error) {
      console.error("Error loading companies:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (companyId, currentStatus) => {
    if (
      !confirm(
        `Are you sure you want to ${
          currentStatus ? "deactivate" : "activate"
        } this company?`
      )
    ) {
      return;
    }

    setUpdatingId(companyId);
    try {
      const { error } = await companyService.updateCompanyStatus(
        companyId,
        !currentStatus
      );

      if (!error) {
        // Update local state
        setCompanies((prev) =>
          prev.map((company) =>
            company.id === companyId
              ? { ...company, is_active: !currentStatus }
              : company
          )
        );
      } else {
        alert("Failed to update company status");
      }
    } catch (error) {
      console.error("Error updating company status:", error);
      alert("Failed to update company status");
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredCompanies = companies.filter((company) => {
    if (filter === "active") return company.is_active;
    if (filter === "inactive") return !company.is_active;
    return true;
  });

  const activeCount = companies.filter((c) => c.is_active).length;
  const inactiveCount = companies.filter((c) => !c.is_active).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header with Stats */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Company Management</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage company activation status
          </p>
        </div>
        <div className="flex gap-4">
          <div className="px-4 py-2 bg-green-50 border border-green-200 rounded-lg">
            <div className="text-xs text-green-600 font-medium">Active</div>
            <div className="text-2xl font-bold text-green-700">
              {activeCount}
            </div>
          </div>
          <div className="px-4 py-2 bg-red-50 border border-red-200 rounded-lg">
            <div className="text-xs text-red-600 font-medium">Inactive</div>
            <div className="text-2xl font-bold text-red-700">
              {inactiveCount}
            </div>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setFilter("all")}
          className={`px-4 py-2 font-medium transition-colors ${
            filter === "all"
              ? "text-primary border-b-2 border-primary"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          All Companies ({companies.length})
        </button>
        <button
          onClick={() => setFilter("active")}
          className={`px-4 py-2 font-medium transition-colors ${
            filter === "active"
              ? "text-primary border-b-2 border-primary"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Active ({activeCount})
        </button>
        <button
          onClick={() => setFilter("inactive")}
          className={`px-4 py-2 font-medium transition-colors ${
            filter === "inactive"
              ? "text-primary border-b-2 border-primary"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Inactive ({inactiveCount})
        </button>
      </div>

      {/* Companies Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Company Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Industry
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Location
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Contact
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredCompanies.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                  No companies found
                </td>
              </tr>
            ) : (
              filteredCompanies.map((company) => (
                <tr
                  key={company.id}
                  className={!company.is_active ? "bg-gray-50" : ""}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        <div
                          className={`h-10 w-10 rounded-full flex items-center justify-center ${
                            company.is_active ? "bg-blue-100" : "bg-gray-300"
                          }`}
                        >
                          <Icon
                            name="Building2"
                            size={20}
                            className={
                              company.is_active
                                ? "text-blue-600"
                                : "text-gray-500"
                            }
                          />
                        </div>
                      </div>
                      <div className="ml-4">
                        <div
                          className={`text-sm font-medium ${
                            company.is_active
                              ? "text-gray-900"
                              : "text-gray-500"
                          }`}
                        >
                          {company.name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {company.employee_count || 0} employees
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {company.industry || "—"}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {company.city && company.country
                        ? `${company.city}, ${company.country}`
                        : company.country || company.city || "—"}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {company.phone || "—"}
                    </div>
                    <div className="text-sm text-gray-500">
                      {company.website || "—"}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${
                        company.is_active
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {company.is_active ? (
                        <>
                          <Icon name="CheckCircle" size={14} className="mr-1" />
                          Active
                        </>
                      ) : (
                        <>
                          <Icon name="XCircle" size={14} className="mr-1" />
                          Inactive
                        </>
                      )}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <Button
                      variant={company.is_active ? "outline" : "primary"}
                      size="sm"
                      onClick={() =>
                        handleToggleStatus(company.id, company.is_active)
                      }
                      disabled={updatingId === company.id}
                      className="gap-2"
                    >
                      {updatingId === company.id ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                          Updating...
                        </>
                      ) : company.is_active ? (
                        <>
                          <Icon name="Ban" size={14} />
                          Deactivate
                        </>
                      ) : (
                        <>
                          <Icon name="CheckCircle" size={14} />
                          Activate
                        </>
                      )}
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Icon name="Info" size={20} className="text-blue-600 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-blue-900 mb-1">
              About Company Status
            </h4>
            <p className="text-sm text-blue-800">
              Deactivating a company will hide it from all dropdowns and
              listings across the system. Users associated with inactive
              companies will not be able to access company-specific features.
              You can reactivate a company at any time to restore full access.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompanyManagement;
