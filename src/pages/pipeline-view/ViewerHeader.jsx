import React from "react";
import { useAuth } from "../../contexts/AuthContext";
import Icon from "../../components/AppIcon";

const ViewerHeader = () => {
  const { userProfile, company, signOut } = useAuth();

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        <Icon name="BarChart2" size={28} className="text-blue-600" />
        <span className="font-semibold text-gray-900">JASCO CRM</span>
        <span className="text-gray-300">|</span>
        <span className="text-sm text-gray-500">{company?.name}</span>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-600 font-medium">
          View Only
        </span>
        <span className="text-sm text-gray-600">{userProfile?.full_name}</span>
        <button
          onClick={signOut}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          Sign out
        </button>
      </div>
    </header>
  );
};

export default ViewerHeader;
