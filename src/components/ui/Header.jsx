import React, { useState, useRef, useEffect } from "react";
import Icon from "../AppIcon";
import Button from "./Button";
import { useAuth } from "contexts/AuthContext";
import { notificationService } from "services/supabaseService";
import CompanySwitcher from "../CompanySwitcher";
import { capitalize } from "utils/helper";
import { useLanguage } from "../../i18n";
import { useNavigate } from "react-router-dom";

const Header = ({
  isCollapsed = false,
  onToggleSidebar,
  onCompanyChange,
}) => {
  const { user, userProfile, company, signOut } = useAuth();
  const { t, language, setLanguage, isRTL } = useLanguage();
  const navigate = useNavigate();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const userMenuRef = useRef(null);
  const mobileMenuRef = useRef(null);

  // Load unread notification count and refresh immediately when notifications are read
  useEffect(() => {
    if (user?.id) {
      loadUnreadCount();
      const interval = setInterval(loadUnreadCount, 30000);
      window.addEventListener("notifications:read", loadUnreadCount);
      return () => {
        clearInterval(interval);
        window.removeEventListener("notifications:read", loadUnreadCount);
      };
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
    { label: t("nav.leads"),    path: "/lead-management", icon: "UserPlus"   },
    { label: t("nav.calendar"), path: "/calendar",        icon: "CalendarDays"},
    { label: t("nav.forecast"), path: "/forecast",        icon: "LineChart"   },
    { label: t("nav.reports"),  path: "/reports",  icon: "FileBarChart" },
    { label: t("nav.clients"), path: "/contact-management", icon: "Users" },
    { label: t("nav.tasks"), path: "/task-management", icon: "ListTodo" },
    { label: "Customer Base", path: "/planning", icon: "ClipboardList" },
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

  useEffect(() => {
    const handleClickOutside = (event) => {
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
            {company?.logo_url ? (
              <div className="flex items-center justify-center w-8 h-8 rounded-lg overflow-hidden bg-white border border-border">
                <img
                  src={company.logo_url}
                  alt={company?.name || "Company logo"}
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <div className="flex items-center justify-center w-8 h-8 bg-primary rounded-lg">
                <Icon name="Building2" size={20} color="white" />
              </div>
            )}
            <div className="hidden sm:block">
              <h1 className="text-lg font-semibold text-foreground">
                {company?.name || "JASCO CRM"}
              </h1>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className={`hidden lg:flex items-center space-x-1 ${isRTL ? "mr-8" : "ml-8"}`}>
            {navigationItems?.map((item) => (
              <Button
                key={item?.path}
                variant={currentPath === item?.path ? "default" : "ghost"}
                size="sm"
                onClick={() => handleNavigation(item?.path)}
                className="transition-enterprise"
              >
                <Icon name={item?.icon} size={16} className={isRTL ? "ml-2" : "mr-2"} />
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
                <Icon name="CircleEllipsis" size={16} className={isRTL ? "ml-2" : "mr-2"} />
                {t("common.more") || "More"}
              </Button>

              {isMobileMenuOpen && (
                <div className={`absolute top-full mt-1 w-48 bg-popover border border-border rounded-md shadow-enterprise-md animate-slide-down z-200 ${isRTL ? "right-0" : "left-0"}`}>
                  <div className="py-1">
                    {secondaryItems?.map((item) => (
                      <button
                        key={item?.path}
                        onClick={() => handleNavigation(item?.path)}
                        className="flex items-center w-full px-3 py-2 text-sm text-popover-foreground hover:bg-muted transition-enterprise"
                      >
                        <Icon name={item?.icon} size={16} className={isRTL ? "ml-3" : "mr-3"} />
                        {item?.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </nav>

          <div className="flex-1" />

          {/* Company Switcher — dropdown for admin/director, static label for all other roles */}
          <div className="mr-2">
            <CompanySwitcher />
          </div>

          {/* Language Toggle */}
          <button
            onClick={() => setLanguage(language === "en" ? "ar" : "en")}
            className="flex items-center gap-1.5 px-3 py-1.5 mr-2 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
            title={language === "en" ? "Switch to Arabic" : "Switch to English"}
          >
            {language === "en" ? (
              <>
                <span className="font-arabic">العربية</span>
                <span className="text-muted-foreground">AR</span>
              </>
            ) : (
              <>
                <span>English</span>
                <span className="text-muted-foreground">EN</span>
              </>
            )}
          </button>

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
              <div className={`absolute top-full mt-1 w-56 bg-popover border border-border rounded-md shadow-enterprise-md animate-slide-down z-200 ${isRTL ? "left-0" : "right-0"}`}>
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
                    <Icon name="Settings" size={16} className={isRTL ? "ml-3" : "mr-3"} />
                    {t("nav.settings") || "Account Settings"}
                  </button>
                  <div className="border-t border-border my-1"></div>
                  <button
                    onClick={handleSignOut}
                    className="flex items-center w-full px-3 py-2 text-sm text-popover-foreground hover:bg-muted transition-enterprise"
                  >
                    <Icon name="LogOut" size={16} className={isRTL ? "ml-3" : "mr-3"} />
                    {t("auth.signOut") || "Sign Out"}
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
            <nav className={`px-4 py-4 space-y-2 ${isRTL ? "text-right" : "text-left"}`}>
              {navigationItems?.map((item) => (
                <button
                  key={item?.path}
                  onClick={() => handleNavigation(item?.path)}
                  className={`flex items-center w-full px-3 py-2 text-sm rounded-md transition-enterprise ${isRTL ? "flex-row-reverse" : ""} ${
                    currentPath === item?.path
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-muted"
                  }`}
                >
                  <Icon name={item?.icon} size={16} className={isRTL ? "ml-3" : "mr-3"} />
                  {item?.label}
                </button>
              ))}

              <div className="border-t border-border my-2 pt-2">
                {secondaryItems?.map((item) => (
                  <button
                    key={item?.path}
                    onClick={() => handleNavigation(item?.path)}
                    className={`flex items-center w-full px-3 py-2 text-sm text-muted-foreground hover:bg-muted rounded-md transition-enterprise ${isRTL ? "flex-row-reverse" : ""}`}
                  >
                    <Icon name={item?.icon} size={16} className={isRTL ? "ml-3" : "mr-3"} />
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
