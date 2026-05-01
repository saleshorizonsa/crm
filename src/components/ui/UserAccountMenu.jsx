import React, { useState, useRef, useEffect } from "react";
import Icon from "../AppIcon";
import Button from "./Button";

const UserAccountMenu = ({ className = "" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const menuRef = useRef(null);

  const user = {
    name: "John Smith",
    email: "john.smith@jascogroup.com",
    role: "Sales Manager",
    avatar: "/assets/images/user-avatar.png",
    company: "JASCO Group",
    lastLogin: "2025-10-08 09:15:00",
    permissions: ["sales", "contacts", "tasks", "reports"],
  };

  const menuItems = [
    {
      section: "Account",
      items: [
        { label: "Profile", icon: "User", action: "profile", path: "/profile" },
        {
          label: "Account Settings",
          icon: "Settings",
          action: "settings",
          path: "/account-settings",
        },
        {
          label: "Preferences",
          icon: "Sliders",
          action: "preferences",
          path: "/preferences",
        },
      ],
    },
    {
      section: "Support",
      items: [
        {
          label: "Help Center",
          icon: "HelpCircle",
          action: "help",
          path: "/help",
        },
        { label: "Keyboard Shortcuts", icon: "Keyboard", action: "shortcuts" },
        {
          label: "Contact Support",
          icon: "MessageCircle",
          action: "support",
          path: "/support",
        },
      ],
    },
    {
      section: "System",
      items: [
        {
          label: "Activity Log",
          icon: "Activity",
          action: "activity",
          path: "/activity",
        },
        {
          label: "Security",
          icon: "Shield",
          action: "security",
          path: "/security",
        },
      ],
    },
  ];

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef?.current && !menuRef?.current?.contains(event?.target)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event?.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const handleMenuAction = (action, path) => {
    if (action === "shortcuts") {
      // Show keyboard shortcuts modal
      console.log("Show keyboard shortcuts");
      setIsOpen(false);
      return;
    }

    if (path) {
      window.location.href = path;
    }
    setIsOpen(false);
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);

    // Simulate logout process
    setTimeout(() => {
      window.location.href = "/login";
    }, 1000);
  };

  const getInitials = (name) => {
    return name
      ?.split(" ")
      ?.map((n) => n?.[0])
      ?.join("")
      ?.toUpperCase();
  };

  return (
    <div className={`relative ${className}`} ref={menuRef}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
        className="transition-enterprise relative"
        disabled={isLoggingOut}
      >
        <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center relative">
          {user?.avatar ? (
            <img
              src={user?.avatar}
              alt={user?.name}
              className="w-full h-full rounded-full object-cover"
              onError={(e) => {
                e.target.style.display = "none";
                e.target.nextSibling.style.display = "flex";
              }}
            />
          ) : null}
          <div className="w-full h-full rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
            {getInitials(user?.name)}
          </div>

          {/* Online status indicator */}
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-success border-2 border-background rounded-full"></div>
        </div>
      </Button>
      {isOpen && (
        <div className="absolute top-full right-0 mt-1 w-72 bg-popover border border-border rounded-md shadow-enterprise-lg animate-slide-down z-200">
          {/* User Info Header */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                {user?.avatar ? (
                  <img
                    src={user?.avatar}
                    alt={user?.name}
                    className="w-full h-full rounded-full object-cover"
                    onError={(e) => {
                      e.target.style.display = "none";
                      e.target.nextSibling.style.display = "flex";
                    }}
                  />
                ) : null}
                <div className="w-full h-full rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                  {getInitials(user?.name)}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-popover-foreground truncate">
                  {user?.name}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {user?.email}
                </p>
                <div className="flex items-center mt-1">
                  <span className="text-xs text-muted-foreground">
                    {user?.role && capitalize(user.role)}
                  </span>
                  <span className="mx-1 text-muted-foreground">•</span>
                  <span className="text-xs text-muted-foreground">
                    {user?.company}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Menu Items */}
          <div className="max-h-64 overflow-y-auto">
            {menuItems?.map((section, sectionIndex) => (
              <div key={section?.section}>
                {sectionIndex > 0 && (
                  <div className="border-t border-border"></div>
                )}
                <div className="py-1">
                  <div className="px-3 py-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {section?.section}
                    </p>
                  </div>
                  {section?.items?.map((item) => (
                    <button
                      key={item?.action}
                      onClick={() => handleMenuAction(item?.action, item?.path)}
                      className="flex items-center w-full px-3 py-2 text-sm text-popover-foreground hover:bg-muted transition-enterprise"
                    >
                      <Icon
                        name={item?.icon}
                        size={16}
                        className="mr-3 text-muted-foreground"
                      />
                      {item?.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Logout Section */}
          <div className="border-t border-border p-1">
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex items-center w-full px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-enterprise disabled:opacity-50"
            >
              {isLoggingOut ? (
                <Icon name="Loader2" size={16} className="mr-3 animate-spin" />
              ) : (
                <Icon name="LogOut" size={16} className="mr-3" />
              )}
              {isLoggingOut ? "Signing out..." : "Sign Out"}
            </button>
          </div>

          {/* Footer Info */}
          <div className="px-3 py-2 border-t border-border bg-muted/30">
            <p className="text-xs text-muted-foreground">
              Last login: {new Date(user.lastLogin)?.toLocaleDateString()} at{" "}
              {new Date(user.lastLogin)?.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>
      )}
      {isLoggingOut && (
        <div className="fixed inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center z-400">
          <div className="bg-card border border-border rounded-lg p-6 shadow-enterprise-lg">
            <div className="flex items-center space-x-3">
              <Icon
                name="Loader2"
                size={20}
                className="animate-spin text-primary"
              />
              <p className="text-sm text-card-foreground">
                Signing you out securely...
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserAccountMenu;
