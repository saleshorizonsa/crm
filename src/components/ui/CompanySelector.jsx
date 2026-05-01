import React, { useState, useRef, useEffect } from "react";
import Icon from "../AppIcon";
import Button from "./Button";

const CompanySelector = ({
  companies = [],
  selectedCompany = null,
  onCompanyChange,
  showAllOption = false,
  className = "",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef(null);

  // Create options array
  const options = [
    ...(showAllOption ? [{ id: null, name: "All Companies" }] : []),
    ...companies,
  ];

  // Get display name for selected company
  const getDisplayName = () => {
    if (!selectedCompany && showAllOption) {
      return "All Companies";
    }
    return selectedCompany?.name || "Select Company";
  };

  // Handle click outside dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleCompanySelect = (company) => {
    if (onCompanyChange) {
      onCompanyChange(company.id === null ? null : company);
    }
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <Button
        variant="outline"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full justify-between text-left"
        disabled={isLoading}
      >
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
            <Icon name="building" className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 truncate">
              {getDisplayName()}
            </div>
            <div className="text-xs text-gray-500">
              {selectedCompany ? "Current Company" : "Select Company"}
            </div>
          </div>
        </div>
        <Icon
          name={isOpen ? "chevron-up" : "chevron-down"}
          className="w-4 h-4 text-gray-400"
        />
      </Button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
          {options.map((company) => (
            <div
              key={company.id || "all"}
              onClick={() => handleCompanySelect(company)}
              className={`px-4 py-3 cursor-pointer hover:bg-gray-50 border-b border-gray-100 last:border-b-0 ${
                selectedCompany?.id === company.id ||
                (!selectedCompany && company.id === null)
                  ? "bg-blue-50 border-blue-200"
                  : ""
              }`}
            >
              <div className="flex items-center space-x-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    company.id === null ? "bg-gray-500" : "bg-blue-500"
                  }`}
                >
                  <Icon
                    name={company.id === null ? "globe" : "building"}
                    className="w-4 h-4 text-white"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {company.name}
                  </div>
                  {company.id !== null && (
                    <div className="text-xs text-gray-500 truncate">
                      {company.industry || "Business Operations"}
                    </div>
                  )}
                </div>
                {(selectedCompany?.id === company.id ||
                  (!selectedCompany && company.id === null)) && (
                  <Icon name="check" className="w-4 h-4 text-blue-600" />
                )}
              </div>
            </div>
          ))}

          {options.length === 0 && (
            <div className="px-4 py-8 text-center text-gray-500">
              <Icon
                name="building"
                className="w-8 h-8 mx-auto mb-2 text-gray-300"
              />
              <div className="text-sm">No companies available</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CompanySelector;
