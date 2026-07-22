import React from "react";
import DirectorDashboard from "./DirectorDashboard";
import EnhancedManagerDashboard from "./EnhancedManagerDashboard";
import EnhancedSupervisorDashboard from "./EnhancedSupervisorDashboard";
import EnhancedSalesmanDashboard from "./EnhancedSalesmanDashboard";

const RoleBasedDashboard = ({ userRole, ...props }) => {
  const renderDashboard = () => {
    switch (userRole) {
      case "director":
        return <DirectorDashboard {...props} />;
      case "head":
        // Head = Director-level dashboard, but company switching is blocked
        // (CompanySwitcher only lets admin/director switch) and the company list
        // is scoped to their own company inside DirectorDashboard.
        return <DirectorDashboard {...props} />;
      case "manager":
        return <EnhancedManagerDashboard {...props} />;
      case "supervisor":
        return <EnhancedSupervisorDashboard {...props} />;
      case "salesman":
        return <EnhancedSalesmanDashboard {...props} />;
      case "admin":
        // Admin gets director-level access
        return <DirectorDashboard {...props} />;
      case "agent":
        // Legacy role - treat as salesman
        return <EnhancedSalesmanDashboard {...props} />;
      default:
        return <EnhancedSalesmanDashboard {...props} />;
    }
  };

  return <div className="role-based-dashboard">{renderDashboard()}</div>;
};

export default RoleBasedDashboard;
