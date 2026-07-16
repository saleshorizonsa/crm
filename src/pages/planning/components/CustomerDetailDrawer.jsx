import { useState, useEffect } from 'react';
import { supabase } from 'lib/supabase';
import { useAuth } from 'contexts/AuthContext';
import Icon from 'components/AppIcon';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function StatusBadge({ type }) {
  const colorMap = {
    active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
    inactive: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
    dormant: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
    prospect: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
    blocked: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  };
  const label = type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Unknown';
  const classes = colorMap[type] || colorMap.blocked;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${classes}`}>
      {label}
    </span>
  );
}

function DetailRow({ icon, label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 text-muted-foreground shrink-0">
        <Icon name={icon} size={15} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm text-foreground break-words">{value}</p>
      </div>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase mb-2">
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// CustomerDetailDrawer
// ---------------------------------------------------------------------------

export default function CustomerDetailDrawer({
  customer,
  isOpen,
  onClose,
  onUpdated,
  canAssign,
  companyId,
}) {
  const { user } = useAuth();

  const [salesmen, setSalesmen] = useState([]);
  const [selectedOwner, setSelectedOwner] = useState('');
  const [selectedType, setSelectedType] = useState('active');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Derive dirty state
  const isDirty =
    selectedOwner !== (customer?.owner_id || '') ||
    selectedType !== (customer?.customer_type || 'active');

  // Load salesmen and reset local state whenever the drawer opens
  useEffect(() => {
    if (!isOpen || !customer) return;

    setSelectedOwner(customer.owner_id || '');
    setSelectedType(customer.customer_type || 'active');
    setSaveError('');

    async function fetchSalesmen() {
      const { data } = await supabase
        .from('users')
        .select('id, full_name, email, role')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .in('role', ['salesman', 'supervisor'])
        .order('full_name');
      setSalesmen(data || []);
    }

    if (canAssign) {
      fetchSalesmen();
    }
  }, [isOpen, customer, companyId, canAssign]);

  if (!isOpen || !customer) return null;

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function formatDate(dateStr) {
    if (!dateStr) return null;
    try {
      return new Date(dateStr).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    const { error } = await supabase
      .from('contacts')
      .update({
        owner_id: selectedOwner || null,
        assigned_by: user.id,
        assigned_at: new Date().toISOString(),
        customer_type: selectedType,
        updated_at: new Date().toISOString(),
      })
      .eq('id', customer.id);

    setSaving(false);
    if (error) {
      setSaveError(error.message || 'Failed to save changes.');
      return;
    }
    onUpdated();
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const ownerInitial = customer.owner?.full_name
    ? customer.owner.full_name.charAt(0).toUpperCase()
    : null;

  const selectClass =
    'w-full text-sm px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div className="fixed right-0 top-0 bottom-0 w-96 bg-card shadow-2xl z-50 flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border shrink-0">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-foreground truncate">
              {customer.company_name || 'Unknown Company'}
            </h3>
            <div className="mt-1">
              <StatusBadge type={customer.customer_type} />
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Close drawer"
          >
            <Icon name="X" size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* CONTACT */}
          <div>
            <SectionTitle>Contact</SectionTitle>
            <div className="space-y-3">
              <DetailRow
                icon="User"
                label="Name"
                value={
                  [customer.first_name, customer.last_name].filter(Boolean).join(' ') || null
                }
              />
              <DetailRow icon="Phone" label="Phone" value={customer.phone} />
              <DetailRow icon="Smartphone" label="Mobile" value={customer.mobile} />
              <DetailRow icon="Mail" label="Email" value={customer.email} />
            </div>
          </div>

          {/* LOCATION */}
          <div>
            <SectionTitle>Location</SectionTitle>
            <div className="space-y-3">
              <DetailRow icon="Building2" label="City" value={customer.city} />
              <DetailRow icon="MapPin" label="Region" value={customer.region} />
              <DetailRow icon="Globe" label="Country" value={customer.country} />
            </div>
          </div>

          {/* DETAILS */}
          <div>
            <SectionTitle>Details</SectionTitle>
            <div className="space-y-3">
              <DetailRow
                icon="ShoppingCart"
                label="Last Order Date"
                value={formatDate(customer.last_order_date)}
              />
              <DetailRow icon="Tag" label="Source" value={customer.source} />
              <DetailRow
                icon="CalendarCheck"
                label="Assigned Date"
                value={formatDate(customer.assigned_at)}
              />
            </div>
          </div>

          {/* NOTES */}
          {customer.notes && (
            <div>
              <SectionTitle>Notes</SectionTitle>
              <div className="rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground whitespace-pre-wrap">
                {customer.notes}
              </div>
            </div>
          )}

          {/* ASSIGNMENT */}
          {canAssign ? (
            <div>
              <SectionTitle>Assignment</SectionTitle>
              <div className="space-y-3">
                {/* Current owner display */}
                {customer.owner ? (
                  <div className="flex items-center gap-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 px-3 py-2.5">
                    <div className="shrink-0 w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-semibold">
                      {ownerInitial}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-blue-800 dark:text-blue-300 truncate">
                        {customer.owner.full_name}
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-400 truncate">
                        {customer.owner.email}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2.5 text-red-700 dark:text-red-400">
                    <Icon name="UserX" size={15} />
                    <span className="text-sm font-medium">Unassigned</span>
                  </div>
                )}

                {/* Change salesman */}
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">
                    Change Salesman
                  </label>
                  <select
                    className={selectClass}
                    value={selectedOwner}
                    onChange={(e) => setSelectedOwner(e.target.value)}
                  >
                    <option value="">— Unassigned —</option>
                    {salesmen.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name} ({s.role})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Customer type */}
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">
                    Customer Type
                  </label>
                  <select
                    className={selectClass}
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value)}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="dormant">Dormant</option>
                    <option value="prospect">Prospect</option>
                    <option value="blocked">Blocked</option>
                  </select>
                </div>

                {saveError && (
                  <p className="text-xs text-red-600 dark:text-red-400">{saveError}</p>
                )}
              </div>
            </div>
          ) : (
            <div>
              <SectionTitle>Assignment</SectionTitle>
              <div className="flex items-start gap-2 text-muted-foreground">
                <Icon name="Lock" size={15} className="mt-0.5 shrink-0" />
                <p className="text-sm">Contact your manager to change assignment.</p>
              </div>
              {customer.owner && (
                <div className="mt-2 flex items-center gap-2 text-sm text-foreground">
                  <span className="text-muted-foreground">Current owner:</span>
                  <span className="font-medium">{customer.owner.full_name}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer — only shown when canAssign */}
        {canAssign && (
          <div className="shrink-0 px-5 py-4 border-t border-border flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!isDirty || saving}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving && (
                <svg
                  className="animate-spin h-3.5 w-3.5"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
              )}
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
