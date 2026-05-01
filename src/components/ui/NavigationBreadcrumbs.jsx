import React from 'react';
import Icon from '../AppIcon';
import Button from './Button';

const NavigationBreadcrumbs = ({ items = [], className = '' }) => {
  const defaultBreadcrumbs = [
    { label: 'Dashboard', path: '/company-dashboard', icon: 'Home' }
  ];

  const breadcrumbItems = items?.length > 0 ? items : defaultBreadcrumbs;
  const currentPath = window.location?.pathname;

  // Auto-generate breadcrumbs based on current path
  const generateBreadcrumbs = () => {
    const pathMap = {
      '/company-dashboard': [
        { label: 'Dashboard', path: '/company-dashboard', icon: 'LayoutDashboard' }
      ],
      '/sales-pipeline': [
        { label: 'Dashboard', path: '/company-dashboard', icon: 'Home' },
        { label: 'Sales Pipeline', path: '/sales-pipeline', icon: 'TrendingUp' }
      ],
      '/contact-management': [
        { label: 'Dashboard', path: '/company-dashboard', icon: 'Home' },
        { label: 'Contact Management', path: '/contact-management', icon: 'Users' }
      ],
      '/task-management': [
        { label: 'Dashboard', path: '/company-dashboard', icon: 'Home' },
        { label: 'Task Management', path: '/task-management', icon: 'CheckSquare' }
      ],
      '/settings': [
        { label: 'Dashboard', path: '/company-dashboard', icon: 'Home' },
        { label: 'Settings', path: '/settings', icon: 'Settings' }
      ],
      '/profile': [
        { label: 'Dashboard', path: '/company-dashboard', icon: 'Home' },
        { label: 'Profile', path: '/profile', icon: 'User' }
      ],
      '/help': [
        { label: 'Dashboard', path: '/company-dashboard', icon: 'Home' },
        { label: 'Help Center', path: '/help', icon: 'HelpCircle' }
      ]
    };

    return pathMap?.[currentPath] || defaultBreadcrumbs;
  };

  const finalBreadcrumbs = items?.length > 0 ? items : generateBreadcrumbs();

  const handleNavigation = (path) => {
    if (path && path !== currentPath) {
      window.location.href = path;
    }
  };

  if (finalBreadcrumbs?.length <= 1 && currentPath === '/company-dashboard') {
    return null; // Don't show breadcrumbs on dashboard home
  }

  return (
    <nav className={`flex items-center space-x-1 text-sm ${className}`} aria-label="Breadcrumb">
      <ol className="flex items-center space-x-1">
        {finalBreadcrumbs?.map((item, index) => {
          const isLast = index === finalBreadcrumbs?.length - 1;
          const isClickable = item?.path && !isLast && item?.path !== currentPath;

          return (
            <li key={`${item?.path}-${index}`} className="flex items-center">
              {index > 0 && (
                <Icon 
                  name="ChevronRight" 
                  size={16} 
                  className="text-muted-foreground mx-1" 
                />
              )}
              {isClickable ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleNavigation(item?.path)}
                  className="h-auto p-1 text-muted-foreground hover:text-foreground transition-enterprise"
                >
                  <div className="flex items-center space-x-1.5">
                    {item?.icon && index === 0 && (
                      <Icon name={item?.icon} size={14} />
                    )}
                    <span>{item?.label}</span>
                  </div>
                </Button>
              ) : (
                <div className={`flex items-center space-x-1.5 px-1 ${
                  isLast 
                    ? 'text-foreground font-medium' 
                    : 'text-muted-foreground'
                }`}>
                  {item?.icon && index === 0 && (
                    <Icon name={item?.icon} size={14} />
                  )}
                  <span>{item?.label}</span>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {/* Quick Actions for current page */}
      {currentPath !== '/company-dashboard' && (
        <div className="flex items-center ml-auto space-x-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.history?.back()}
            className="text-muted-foreground hover:text-foreground transition-enterprise"
          >
            <Icon name="ArrowLeft" size={14} className="mr-1" />
            Back
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.location?.reload()}
            className="text-muted-foreground hover:text-foreground transition-enterprise"
          >
            <Icon name="RotateCcw" size={14} className="mr-1" />
            Refresh
          </Button>
        </div>
      )}
    </nav>
  );
};

export default NavigationBreadcrumbs;