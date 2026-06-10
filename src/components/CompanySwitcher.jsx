import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

// Per-company color/initials config for the 4 JASCO entities
const COMPANY_COLORS = {
  'adf8ee78-cf78-4f02-932c-989a214bdd78': { bg: '#EFF6FF', color: '#2563EB', init: 'PVC' },
  '0872a05a-6fa4-4aee-9aa2-10898e133e65': { bg: '#F1F5F9', color: '#475569', init: 'STL' },
  '271aa099-0f92-4185-a2a9-27e4fab5b1e8': { bg: '#F0FDFA', color: '#0D9488', init: 'IMD' },
  '2524da2c-07e0-414d-9ceb-2adf83d92ca4': { bg: '#FAF5FF', color: '#7C3AED', init: 'JAE' },
};

function CompanyAvatar({ company, size = 6 }) {
  const cfg = COMPANY_COLORS[company?.id];
  if (company?.logo_url) {
    return (
      <img
        src={company.logo_url}
        alt={company.name}
        className={`w-${size} h-${size} rounded object-contain`}
      />
    );
  }
  return (
    <div
      className={`w-${size} h-${size} rounded flex items-center justify-center text-xs font-bold flex-shrink-0`}
      style={{
        background: cfg?.bg || '#F3F4F6',
        color: cfg?.color || '#374151',
      }}
    >
      {cfg?.init || company?.name?.charAt(0) || '?'}
    </div>
  );
}

export default function CompanySwitcher() {
  const { company, availableCompanies, switchCompany, userProfile } = useAuth();

  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const ref = useRef(null);

  const canSwitch =
    userProfile?.role === 'admin' || userProfile?.role === 'director';

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Static display for non-switching roles or single-company users
  if (!canSwitch || availableCompanies.length <= 1) {
    if (!company) return null;
    return (
      <div className="flex items-center gap-2 px-2 py-1.5">
        <CompanyAvatar company={company} size={6} />
        <span className="hidden sm:block text-sm font-medium text-foreground max-w-[140px] truncate">
          {company.name}
        </span>
      </div>
    );
  }

  async function handleSwitch(companyId) {
    if (companyId === company?.id) { setOpen(false); return; }
    setSwitching(true);
    await switchCompany(companyId);
    setOpen(false);
    setSwitching(false);
    window.location.reload();
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={switching}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50"
      >
        <CompanyAvatar company={company} size={6} />
        <span className="hidden sm:block text-sm font-medium text-foreground max-w-[120px] truncate">
          {switching ? 'Switching…' : company?.name}
        </span>
        <svg
          className="w-3 h-3 text-muted-foreground flex-shrink-0"
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full right-0 mt-1.5 w-64 bg-popover border border-border rounded-xl shadow-lg py-1.5 z-50">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3 py-2">
            Switch Company
          </p>

          {availableCompanies.map((co) => {
            const isActive = co.id === company?.id;
            const cfg = COMPANY_COLORS[co.id];
            return (
              <button
                key={co.id}
                onClick={() => handleSwitch(co.id)}
                disabled={switching}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors disabled:opacity-50 ${
                  isActive ? 'bg-blue-50 dark:bg-blue-950/20' : 'hover:bg-muted'
                }`}
              >
                {/* Avatar */}
                <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0 border border-border bg-background">
                  {co.logo_url ? (
                    <img
                      src={co.logo_url}
                      alt={co.name}
                      className="w-full h-full object-contain p-0.5"
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-xs font-bold"
                      style={{
                        background: cfg?.bg || '#F3F4F6',
                        color: cfg?.color || '#374151',
                      }}
                    >
                      {cfg?.init || co.name.charAt(0)}
                    </div>
                  )}
                </div>

                {/* Name */}
                <span className={`flex-1 text-sm font-medium truncate ${
                  isActive ? 'text-blue-700 dark:text-blue-400' : 'text-foreground'
                }`}>
                  {co.name}
                </span>

                {/* Active checkmark */}
                {isActive && (
                  <svg className="w-4 h-4 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
