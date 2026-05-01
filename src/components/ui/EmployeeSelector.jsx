import React, { useState, useRef, useEffect } from "react";
import Icon from "../AppIcon";
import { useLanguage } from "../../i18n";

const EmployeeSelector = ({
  employees,
  selectedEmployee,
  onEmployeeChange,
  showAllOption = true,
  currentUserId = null, // Pass current user ID to identify director
  className = "",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const { t } = useLanguage();

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (employee) => {
    onEmployeeChange(employee);
    setIsOpen(false);
  };

  const getRoleBadgeColor = (role) => {
    const colors = {
      director: "bg-purple-100 text-purple-800",
      manager: "bg-blue-100 text-blue-800",
      supervisor: "bg-green-100 text-green-800",
      salesman: "bg-orange-100 text-orange-800",
      agent: "bg-gray-100 text-gray-800",
    };
    return colors[role] || "bg-gray-100 text-gray-800";
  };

  const selectedDisplay = selectedEmployee
    ? selectedEmployee.id === currentUserId
      ? t("dashboard.myData")
      : `${selectedEmployee.full_name || selectedEmployee.email} (${
          selectedEmployee.role
        })`
    : t("dashboard.allConsolidatedData");

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
      >
        <div className="flex items-center space-x-2">
          <Icon name="User" size={16} className="text-gray-500" />
          <span className="font-medium text-gray-900">{selectedDisplay}</span>
        </div>
        <Icon
          name={isOpen ? "ChevronUp" : "ChevronDown"}
          size={16}
          className="text-gray-500"
        />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-2 w-full bg-white rounded-lg shadow-lg border border-gray-200 max-h-96 overflow-y-auto">
          {showAllOption && (
            <>
              <button
                onClick={() => handleSelect(null)}
                className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors ${
                  !selectedEmployee ? "bg-blue-50" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                      <Icon name="Users" size={16} className="text-blue-600" />
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">
                        {t("dashboard.allConsolidatedData")}
                      </div>
                      <div className="text-xs text-gray-500">
                        {t("dashboard.viewAggregatedData")}
                      </div>
                    </div>
                  </div>
                  {!selectedEmployee && (
                    <Icon name="Check" size={16} className="text-blue-600" />
                  )}
                </div>
              </button>
              <div className="border-t border-gray-200"></div>
            </>
          )}

          {employees && employees.length > 0 ? (
            employees.map((employee) => {
              const isCurrentUser = employee.id === currentUserId;
              return (
                <button
                  key={employee.id}
                  onClick={() => handleSelect(employee)}
                  className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors ${
                    selectedEmployee?.id === employee.id ? "bg-blue-50" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div
                        className={`w-8 h-8 rounded-full ${
                          isCurrentUser ? "bg-purple-100" : "bg-gray-300"
                        } flex items-center justify-center`}
                      >
                        {isCurrentUser ? (
                          <Icon
                            name="User"
                            size={16}
                            className="text-purple-600"
                          />
                        ) : (
                          <span className="text-sm font-medium text-gray-700">
                            {(employee.full_name || employee.email)
                              .charAt(0)
                              .toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">
                          {isCurrentUser
                            ? t("dashboard.myData")
                            : employee.full_name || employee.email}
                          {isCurrentUser && (
                            <span className="ml-2 text-xs text-purple-600">
                              ({t("common.you")})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center space-x-2 mt-1">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getRoleBadgeColor(
                              employee.role
                            )}`}
                          >
                            {employee.role}
                          </span>
                          {employee.department && (
                            <span className="text-xs text-gray-500">
                              {employee.department}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {selectedEmployee?.id === employee.id && (
                      <Icon name="Check" size={16} className="text-blue-600" />
                    )}
                  </div>
                </button>
              );
            })
          ) : (
            <div className="px-4 py-8 text-center text-gray-500">
              <Icon
                name="Users"
                size={24}
                className="mx-auto mb-2 opacity-50"
              />
              <p className="text-sm">{t("dashboard.noEmployeesFound")}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default EmployeeSelector;
