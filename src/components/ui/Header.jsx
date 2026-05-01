import React, { useState, useRef, useEffect } from "react";
import Icon from "../AppIcon";
import Button from "./Button";
import CompanySelector from "./CompanySelector";
import { useAuth } from "contexts/AuthContext";
import { companyService, notificationService } from "services/supabaseService";
import { capitalize } from "utils/helper";
import { useLanguage } from "../../i18n";
import { useNavigate } from "react-router-dom";

const Header = ({
  isCollapsed = false,
  onToggleSidebar,
  onCompanyChange,
  selectedCompany: propSelectedCompany,
}) => {
  const { user, userProfile, company, signOut, changeCompany } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState(
    propSelectedCompany || company || null
  );
  const [companies, setCompanies] = useState([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const companySelectorRef = useRef(null);
  const userMenuRef = useRef(null);
  const mobileMenuRef = useRef(null);

  console.log(user);

  // Update local state when prop changes
  useEffect(() => {
    if (propSelectedCompany) {
      setSelectedCompany(propSelectedCompany);
    }
  }, [propSelectedCompany]);

  // Load unread notification count
  useEffect(() => {
    if (user?.id) {
      loadUnreadCount();
      
      // Refresh count every 30 seconds
      const interval = setInterval(loadUnreadCount, 30000);
      
      return () => clearInterval(interval);
    }
  }, [user?.id]);

  const loadUnreadCount = async () => {
    try {
      const { count } = await notificationService.getUnreadCount(user?.id);
      setUnreadCount(count || 0);
    } catch (error) {
      console.error("Error loading unread count:", error);
    }
  };

  const navigationItems = [
    {
      label: t("nav.dashboard"),
      path: "/company-dashboard",
      icon: "LayoutDashboard",
    },
    { label: t("nav.pipeline"), path: "/sales-pipeline", icon: "TrendingUp" },
    { label: "Leads", path: "/lead-management", icon: "UserPlus" },
    { label: t("nav.clients"), path: "/contact-management", icon: "Users" },
    { label: t("nav.tasks"), path: "/task-management", icon: "ListTodo" },
  ];

  // Add user management for admins and managers only
  const adminItems = [];

  const secondaryItems = [
    ...adminItems,
    { label: t("nav.settings"), path: "/settings", icon: "Settings" },
    { label: t("dashboard.help"), path: "/help", icon: "Info" },
    ...(userProfile?.role === "admin"
      ? [
          {
            label: t("nav.adminDashboard"),
            path: "/admin-dashboard",
            icon: "Shield",
          },
        ]
      : []),
  ];

  // Load companies for directors and admins
  useEffect(() => {
    const loadCompanies = async () => {
      if (userProfile?.role === "director" || userProfile?.role === "admin") {
        setLoadingCompanies(true);
        try {
          const { data: companiesData, error } =
            await companyService.getAllCompanies();
          if (error) {
            console.error("Error loading companies:", error);
            setCompanies([]);
          } else {
            setCompanies(companiesData || []);
          }
        } catch (error) {
          console.error("Error loading companies:", error);
        } finally {
          setLoadingCompanies(false);
        }
      }
    };

    if (userProfile?.role) {
      loadCompanies();
    }
  }, [userProfile?.role]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        companySelectorRef?.current &&
        !companySelectorRef?.current?.contains(event?.target)
      ) {
      }
      if (
        userMenuRef?.current &&
        !userMenuRef?.current?.contains(event?.target)
      ) {
        setIsUserMenuOpen(false);
      }
      if (
        mobileMenuRef?.current &&
        !mobileMenuRef?.current?.contains(event?.target)
      ) {
        setIsMobileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleNavigation = (path) => {
    window.location.href = path;
    setIsMobileMenuOpen(false);
  };

  const handleAccountSettings = () => {
    window.location.href = "/account-settings";
    setIsUserMenuOpen(false);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const handleCompanyChange = (company) => {
    if (!company) {
      setSelectedCompany(null);
      if (onCompanyChange) {
        onCompanyChange(null);
      }
      return;
    }

    setSelectedCompany(company);

    // Update company in AuthContext for admin/director
    if (
      changeCompany &&
      (userProfile?.role === "admin" || userProfile?.role === "director")
    ) {
      changeCompany(company);
    }

    // Call parent callback if provided
    if (onCompanyChange) {
      onCompanyChange(company);
    }
  };

  const currentPath = window.location?.pathname;

  return (
    <>
      <header className="sticky top-0 z-100 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center px-4 lg:px-6">
          {/* Mobile Menu Toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden mr-2"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            <Icon name="Menu" size={20} />
          </Button>

          {/* Logo */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center justify-center w-8 h-8 bg-primary rounded-lg">
              <Icon name="Building2" size={20} color="white" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-lg font-semibold text-foreground">
                JASCO CRM
              </h1>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center space-x-1 ml-8">
            {navigationItems?.map((item) => (
              <Button
                key={item?.path}
                variant={currentPath === item?.path ? "default" : "ghost"}
                size="sm"
                onClick={() => handleNavigation(item?.path)}
                className="transition-enterprise"
              >
                <Icon name={item?.icon} size={16} className="mr-2" />
                {item?.label}
              </Button>
            ))}

            {/* More Menu */}
            <div className="relative" ref={mobileMenuRef}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="transition-enterprise"
              >
                <Icon name="CircleEllipsis" size={16} className="mr-2" />
                More
              </Button>

              {isMobileMenuOpen && (
                <div className="absolute top-full left-0 mt-1 w-48 bg-popover border border-border rounded-md shadow-enterprise-md animate-slide-down z-200">
                  <div className="py-1">
                    {secondaryItems?.map((item) => (
                      <button
                        key={item?.path}
                        onClick={() => handleNavigation(item?.path)}
                        className="flex items-center w-full px-3 py-2 text-sm text-popover-foreground hover:bg-muted transition-enterprise"
                      >
                        <Icon name={item?.icon} size={16} className="mr-3" />
                        {item?.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </nav>

          <div className="flex-1" />

          {/* Company Selector - Directors and Admins can switch companies */}
          {(userProfile?.role === "director" || userProfile?.role === "admin") && (
            <div className="relative mr-4" ref={companySelectorRef}>
              <CompanySelector
                companies={companies}
                selectedCompany={selectedCompany}
                onCompanyChange={handleCompanyChange}
                loading={loadingCompanies}
                showAllOption={false}
                className="hidden sm:block min-w-[150px]"
              />
            </div>
          )}
          
          {/* Company Name Display - For other roles */}
          {userProfile?.role && userProfile?.role !== "director" && userProfile?.role !== "admin" && company && (
            <div className="relative mr-4">
              <span className="hidden sm:inline text-sm font-medium text-foreground">
                {company?.name}
              </span>
            </div>
          )}

          {/* Notifications Icon */}
          <div className="relative mr-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/notifications")}
              className="transition-enterprise relative"
            >
              <Icon name="Bell" size={20} />
              {unreadCount > 0 && (
                <span className="absolute top-0 right-0 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>
          </div>

          {/* User Account Menu */}
          <div className="relative" ref={userMenuRef}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="transition-enterprise"
            >
              <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                <Icon name="User" size={16} color="var(--color-primary)" />
              </div>
            </Button>

            {isUserMenuOpen && (
              <div className="absolute top-full right-0 mt-1 w-56 bg-popover border border-border rounded-md shadow-enterprise-md animate-slide-down z-200">
                <div className="px-3 py-2 border-b border-border">
                  <p className="text-sm font-medium text-popover-foreground">
                    {userProfile?.full_name || "Loading..."}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {userProfile?.role
                      ? capitalize(userProfile.role)
                      : "Loading..."}
                  </p>
                </div>
                <div className="py-1">
                  {/* <button className="flex items-center w-full px-3 py-2 text-sm text-popover-foreground hover:bg-muted transition-enterprise">
                    <Icon name="User" size={16} className="mr-3" />
                    Profile
                  </button> */}
                  <button
                    onClick={handleAccountSettings}
                    className="flex items-center w-full px-3 py-2 text-sm text-popover-foreground hover:bg-muted transition-enterprise"
                  >
                    <Icon name="Settings" size={16} className="mr-3" />
                    Account Settings
                  </button>
                  <div className="border-t border-border my-1"></div>
                  <button
                    onClick={handleSignOut}
                    className="flex items-center w-full px-3 py-2 text-sm text-popover-foreground hover:bg-muted transition-enterprise"
                  >
                    <Icon name="LogOut" size={16} className="mr-3" />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>
      {/* Mobile Navigation Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-300 lg:hidden">
          <div
            className="fixed inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="fixed top-16 left-0 right-0 bg-background border-b border-border shadow-enterprise-lg animate-slide-down">
            <nav className="px-4 py-4 space-y-2">
              {navigationItems?.map((item) => (
                <button
                  key={item?.path}
                  onClick={() => handleNavigation(item?.path)}
                  className={`flex items-center w-full px-3 py-2 text-sm rounded-md transition-enterprise ${
                    currentPath === item?.path
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-muted"
                  }`}
                >
                  <Icon name={item?.icon} size={16} className="mr-3" />
                  {item?.label}
                </button>
              ))}

              <div className="border-t border-border my-2 pt-2">
                {secondaryItems?.map((item) => (
                  <button
                    key={item?.path}
                    onClick={() => handleNavigation(item?.path)}
                    className="flex items-center w-full px-3 py-2 text-sm text-muted-foreground hover:bg-muted rounded-md transition-enterprise"
                  >
                    <Icon name={item?.icon} size={16} className="mr-3" />
                    {item?.label}
                  </button>
                ))}
              </div>
            </nav>
          </div>
        </div>
      )}
    </>
  );
};

export default Header;
