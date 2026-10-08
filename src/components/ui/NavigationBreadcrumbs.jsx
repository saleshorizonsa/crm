import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Icon from '../AppIcon';
import Button from './Button';
import { useLanguage } from '../../i18n';

const NavigationBreadcrumbs = ({ items = [], className = '' }) => {
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();

  const defaultBreadcrumbs = [
    { label: 'Dashboard', path: '/company-dashboard', icon: 'Home' }
  ];

  // The ROUTER's location, not window.location: these crumbs navigate within
  // the app now, and a window-read pathname would keep describing the page the
  // browser last loaded.
  const currentPath = location.pathname;

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

  // Callers are inconsistent: the pathMap above uses `path`, every page that
  // passes its own items uses `href`. The component only ever read `path`, so
  // every hand-written crumb — which is most of them — rendered as dead text
  // with no icon. Read both.
  const targetOf = (item) => item?.path || item?.href || null;

  /**
   * THE FIRST CRUMB IS "HOME", AND HOME IS "/".
   *
   * Every crumb trail in the app starts with the Dashboard, because the
   * Dashboard used to be the home page. It is not any more: "/" routes through
   * HomeRedirect, which sends each role to its own landing page — Insights for
   * most, /pipeline-view for a viewer. So off the Dashboard the first crumb
   * becomes Home → "/", and the one page that still names the Dashboard is the
   * Dashboard itself.
   *
   * Done here rather than in a dozen call sites: the trails are written per
   * page, and the next page added would have started with the old crumb again.
   */
  const withHomeCrumb = (crumbs) => {
    const [first, ...rest] = crumbs || [];
    if (!first) return crumbs;
    if (currentPath === '/company-dashboard') return crumbs;
    if (targetOf(first) !== '/company-dashboard') return crumbs;
    return [{ label: t('nav.home'), path: '/', icon: 'Home' }, ...rest];
  };

  const finalBreadcrumbs = withHomeCrumb(
    items?.length > 0 ? items : generateBreadcrumbs(),
  );

  const handleNavigation = (path) => {
    // Client-side, so the app does not reload itself to move one level up.
    if (path && path !== currentPath) {
      navigate(path);
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
          const target = targetOf(item);
          const isClickable = target && !isLast && target !== currentPath;

          return (
            <li key={`${target}-${index}`} className="flex items-center">
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
                  onClick={() => handleNavigation(target)}
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