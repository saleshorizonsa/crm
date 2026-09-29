import React, { useState, useRef, useEffect } from "react";
import Icon from "../AppIcon";
import Button from "./Button";
import { useAuth } from "contexts/AuthContext";
import { notificationService } from "services/supabaseService";
import CompanySwitcher from "../CompanySwitcher";
import { capitalize } from "utils/helper";
import { useLanguage } from "../../i18n";
import { useNavigate, useLocation } from "react-router-dom";
import { fetchPendingApprovalCount, resolveApproverScope } from "utils/planApproval";
import { buildNavGroups, canApproveFor, navTabIdDrift } from "./navGroups";

const Header = ({
  isCollapsed = false,
  onToggleSidebar,
  onCompanyChange,
}) => {
  const { user, userProfile, company, signOut } = useAuth();
  const { t, language, setLanguage, isRTL } = useLanguage();
  const navigate = useNavigate();
  // Router-aware rather than read off window at render time: a tab deep link
  // navigates in-place (no reload), so the highlight has to follow the route
  // instead of whatever the path happened to be when this last rendered.
  const location = useLocation();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  // Two separate UIs, two separate flags. They shared one boolean until a
  // mobile-navigation bug traced back to exactly that: the click-outside guard
  // was checking the desktop dropdown's ref while the mobile drawer was open.
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);      // mobile drawer
  // One open group at a time — opening a second closes the first, which is how
  // the single "More" dropdown behaved and what users expect of a menu bar.
  const [openGroup, setOpenGroup] = useState(null);             // desktop group key
  const [openFlyout, setOpenFlyout] = useState(null);           // nested tab flyout
  const [openMobileGroup, setOpenMobileGroup] = useState(null); // drawer section
  const [openMobileFlyout, setOpenMobileFlyout] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingApprovals, setPendingApprovals] = useState(0);

  const userMenuRef = useRef(null);
  const drawerRef = useRef(null);     // mobile drawer panel
  // One ref per desktop group, so click-outside can tell "outside the menu"
  // from "on one of its own items" per group, as the old single More ref did.
  const salesMenuRef = useRef(null);
  const performanceMenuRef = useRef(null);
  const planningMenuRef = useRef(null);
  const adminMenuRef = useRef(null);
  const groupRefs = {
    sales: salesMenuRef,
    performance: performanceMenuRef,
    planning: planningMenuRef,
    admin: adminMenuRef,
  };

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

  const role = userProfile?.role;

  // Structure and role gating live in ./navGroups so they can be exercised
  // directly per role; this component only renders what they return.
  const groups = buildNavGroups({ role, t });

  if (import.meta.env?.DEV) {
    const drift = navTabIdDrift(role, t);
    if (drift.length) console.error("Header tab flyout ids not present on the page:", drift);
  }

  // The Planning page shows this count in its own tab label; the shortcut to
  // that tab would be misleading without it, so the same two helpers the page
  // uses produce the same figure here.
  useEffect(() => {
    let cancelled = false;
    if (!company?.id || !user?.id || !canApproveFor(role)) {
      setPendingApprovals(0);
      return undefined;
    }
    (async () => {
      try {
        const ownerIds = await resolveApproverScope({
          companyId: company.id, userId: user.id, role,
        });
        const n = await fetchPendingApprovalCount({ companyId: company.id, ownerIds });
        if (!cancelled) setPendingApprovals(n || 0);
      } catch (error) {
        // A missing badge is not worth breaking the navigation over.
        console.error("Error loading pending approval count:", error);
      }
    })();
    return () => { cancelled = true; };
  }, [company?.id, user?.id, role]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        userMenuRef?.current &&
        !userMenuRef?.current?.contains(event?.target)
      ) {
        setIsUserMenuOpen(false);
      }
      // Same guard as the old single "More" ref, once per group: a click inside
      // the open group's own menu must not close it before onClick can fire.
      const openRef = openGroup ? groupRefs[openGroup]?.current : null;
      if (openRef && !openRef.contains(event?.target)) {
        setOpenGroup(null);
        setOpenFlyout(null);
      }
      // The drawer must not close on mousedown over its OWN buttons: mousedown
      // fires before click, so unmounting here would remove the button before
      // its onClick could run -- which is exactly why tapping a nav item did
      // nothing on mobile. The hamburger is excluded too, otherwise it would
      // close and immediately reopen the drawer on the same tap.
      if (
        drawerRef?.current &&
        !drawerRef?.current?.contains(event?.target) &&
        !event?.target?.closest?.("[data-drawer-toggle]")
      ) {
        setIsDrawerOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openGroup]);

  const closeMenus = () => {
    setOpenGroup(null);
    setOpenFlyout(null);
    setIsDrawerOpen(false);
    setOpenMobileGroup(null);
    setOpenMobileFlyout(null);
  };

  const handleNavigation = (path) => {
    window.location.href = path;
    closeMenus();
  };

  // Tab deep links navigate through the router rather than reloading: landing
  // on /planning#future_orders from elsewhere mounts the page with that tab
  // selected, and choosing another tab while already there only changes the
  // hash, which each page watches. Plain nav items keep their full reload.
  const handleTabNavigation = (basePath, tabId) => {
    navigate(`${basePath}#${tabId}`);
    closeMenus();
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

  const currentPath = location?.pathname || window.location?.pathname;
  const currentHash = location?.hash || "";
  // A group is highlighted when the page you are on lives inside it — including
  // when you are on one of Planning's or Reports' tabs, which are still that
  // page. Generalises the old single moreIsActive flag to every group.
  const groupIsActive = (group) => group.items.some((item) => currentPath === item.path);
  const tabIsActive = (basePath, tabId) => currentPath === basePath
    && currentHash.replace(/^#/, "") === tabId;

  const labelFor = (item) => (item.badge === "approvals" && pendingApprovals > 0
    ? `${item.label} (${pendingApprovals})`
    : item.label);

  return (
    <>
      <header className="sticky top-0 z-100 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center px-4 lg:px-6">
          {/* Mobile Menu Toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden mr-2"
            data-drawer-toggle
            onClick={() => setIsDrawerOpen((v) => !v)}
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

          {/* Desktop Navigation — four function groups */}
          <nav className={`hidden lg:flex items-center space-x-1 ${isRTL ? "mr-8" : "ml-8"}`}>
            {groups.map((group) => (
              <div className="relative" key={group.key} ref={groupRefs[group.key]}>
                <Button
                  variant={groupIsActive(group) ? "default" : "ghost"}
                  size="sm"
                  onClick={() => {
                    setOpenGroup((v) => (v === group.key ? null : group.key));
                    setOpenFlyout(null);
                  }}
                  className="transition-enterprise"
                >
                  <Icon name={group.icon} size={16} className={isRTL ? "ml-2" : "mr-2"} />
                  {group.label}
                  <Icon name="ChevronDown" size={14} className={isRTL ? "mr-1" : "ml-1"} />
                </Button>

                {openGroup === group.key && (
                  <div className={`absolute top-full mt-1 w-56 bg-popover border border-border rounded-md shadow-enterprise-md animate-slide-down z-200 ${isRTL ? "right-0" : "left-0"}`}>
                    <div className="py-1">
                      {group.items.map((item) => (
                        <div
                          key={item.path}
                          className="relative"
                          onMouseEnter={() => item.tabs && setOpenFlyout(item.path)}
                          onMouseLeave={() => item.tabs && setOpenFlyout(null)}
                        >
                          <button
                            onClick={() => (item.tabs
                              ? setOpenFlyout((v) => (v === item.path ? null : item.path))
                              : handleNavigation(item.path))}
                            className={`flex items-center w-full px-3 py-2 text-sm transition-enterprise hover:bg-muted ${
                              currentPath === item.path
                                ? "text-primary font-medium"
                                : "text-popover-foreground"
                            }`}
                          >
                            <Icon name={item.icon} size={16} className={isRTL ? "ml-3" : "mr-3"} />
                            <span className="flex-1 text-left">{item.label}</span>
                            {item.tabs && (
                              <Icon
                                name={isRTL ? "ChevronLeft" : "ChevronRight"}
                                size={14}
                                className="text-muted-foreground"
                              />
                            )}
                          </button>

                          {/* Nested flyout: the page's own tabs. The page itself
                              stays one click away via its header row below. */}
                          {item.tabs && openFlyout === item.path && (
                            <div className={`absolute top-0 w-60 bg-popover border border-border rounded-md shadow-enterprise-md z-300 ${isRTL ? "right-full mr-1" : "left-full ml-1"}`}>
                              <div className="py-1">
                                <button
                                  onClick={() => handleNavigation(item.path)}
                                  className="flex items-center w-full px-3 py-2 text-xs text-muted-foreground hover:bg-muted transition-enterprise border-b border-border"
                                >
                                  <Icon name={item.icon} size={14} className={isRTL ? "ml-3" : "mr-3"} />
                                  {`${t("nav.openPage")} ${item.label}`}
                                </button>
                                {item.tabs.map((tab) => (
                                  <button
                                    key={tab.id}
                                    onClick={() => handleTabNavigation(item.path, tab.id)}
                                    className={`flex items-center w-full px-3 py-2 text-sm transition-enterprise hover:bg-muted ${
                                      tabIsActive(item.path, tab.id)
                                        ? "bg-muted text-primary font-medium"
                                        : "text-popover-foreground"
                                    }`}
                                  >
                                    <Icon name={tab.icon} size={16} className={isRTL ? "ml-3" : "mr-3"} />
                                    {labelFor(tab)}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
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

      {/* Mobile Navigation Overlay — the same four groups, as collapsibles */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-300 lg:hidden">
          <div
            className="fixed inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setIsDrawerOpen(false)}
          />
          <div
            ref={drawerRef}
            className="fixed top-16 left-0 right-0 max-h-[calc(100vh-4rem)] overflow-y-auto bg-background border-b border-border shadow-enterprise-lg animate-slide-down"
          >
            <nav className={`px-4 py-4 space-y-1 ${isRTL ? "text-right" : "text-left"}`}>
              {groups.map((group) => {
                const expanded = openMobileGroup === group.key;
                return (
                  <div key={group.key} className="border-b border-border last:border-b-0 pb-1">
                    <button
                      onClick={() => setOpenMobileGroup((v) => (v === group.key ? null : group.key))}
                      className={`flex items-center w-full px-3 py-2 text-sm font-medium rounded-md transition-enterprise ${isRTL ? "flex-row-reverse" : ""} ${
                        groupIsActive(group) ? "text-primary" : "text-foreground"
                      }`}
                    >
                      <Icon name={group.icon} size={16} className={isRTL ? "ml-3" : "mr-3"} />
                      <span className="flex-1 text-left">{group.label}</span>
                      <Icon name={expanded ? "ChevronDown" : "ChevronRight"} size={16} />
                    </button>

                    {expanded && (
                      <div className={isRTL ? "pr-4" : "pl-4"}>
                        {group.items.map((item) => {
                          const tabsOpen = openMobileFlyout === item.path;
                          return (
                            <div key={item.path}>
                              <div className={`flex items-center ${isRTL ? "flex-row-reverse" : ""}`}>
                                <button
                                  onClick={() => handleNavigation(item.path)}
                                  className={`flex items-center flex-1 px-3 py-2 text-sm rounded-md transition-enterprise ${isRTL ? "flex-row-reverse" : ""} ${
                                    currentPath === item.path
                                      ? "bg-primary text-primary-foreground"
                                      : "text-foreground hover:bg-muted"
                                  }`}
                                >
                                  <Icon name={item.icon} size={16} className={isRTL ? "ml-3" : "mr-3"} />
                                  {item.label}
                                </button>
                                {item.tabs && (
                                  <button
                                    aria-label={`${item.label} tabs`}
                                    onClick={() => setOpenMobileFlyout((v) => (v === item.path ? null : item.path))}
                                    className="px-2 py-2 text-muted-foreground hover:bg-muted rounded-md"
                                  >
                                    <Icon name={tabsOpen ? "ChevronDown" : "ChevronRight"} size={16} />
                                  </button>
                                )}
                              </div>

                              {item.tabs && tabsOpen && (
                                <div className={isRTL ? "pr-4" : "pl-4"}>
                                  {item.tabs.map((tab) => (
                                    <button
                                      key={tab.id}
                                      onClick={() => handleTabNavigation(item.path, tab.id)}
                                      className={`flex items-center w-full px-3 py-2 text-sm rounded-md transition-enterprise ${isRTL ? "flex-row-reverse" : ""} ${
                                        tabIsActive(item.path, tab.id)
                                          ? "bg-muted text-primary font-medium"
                                          : "text-muted-foreground hover:bg-muted"
                                      }`}
                                    >
                                      <Icon name={tab.icon} size={16} className={isRTL ? "ml-3" : "mr-3"} />
                                      {labelFor(tab)}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </div>
        </div>
      )}
    </>
  );
};

export default Header;
