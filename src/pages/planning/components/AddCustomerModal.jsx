import { useState, useEffect } from 'react';
import { supabase } from 'lib/supabase';
import { useAuth } from 'contexts/AuthContext';
import Icon from 'components/AppIcon';

// ---------------------------------------------------------------------------
// Default form state factory
// ---------------------------------------------------------------------------

function defaultForm() {
  return {
    company_name: '',
    first_name: '',
    last_name: '',
    phone: '',
    mobile: '',
    email: '',
    city: '',
    region: '',
    customer_type: 'active',
    last_order_date: '',
    notes: '',
    owner_id: '',
  };
}

// ---------------------------------------------------------------------------
// AddCustomerModal
// ---------------------------------------------------------------------------

export default function AddCustomerModal({
  isOpen,
  onClose,
  onSuccess,
  adminCompany,
  canAssign,
}) {
  const { user } = useAuth();

  const [form, setForm] = useState(defaultForm());
  const [salesmen, setSalesmen] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Reset form and optionally load salesmen on open
  useEffect(() => {
    if (!isOpen) return;
    setForm(defaultForm());
    setError('');
    setSaving(false);

    if (canAssign && adminCompany?.id) {
      supabase
        .from('users')
        .select('id, full_name, email, role')
        .eq('company_id', adminCompany.id)
        .eq('is_active', true)
        .in('role', ['salesman', 'supervisor'])
        .order('full_name')
        .then(({ data }) => setSalesmen(data || []));
    }
  }, [isOpen, adminCompany, canAssign]);

  if (!isOpen) return null;

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setError('');

    if (!form.company_name.trim()) {
      setError('Company name is required.');
      return;
    }

    setSaving(true);

    const { error: insertError } = await supabase.from('contacts').insert({
      company_id: adminCompany.id,
      company_name: form.company_name.trim(),
      first_name: form.first_name.trim() || null,
      last_name: form.last_name.trim() || null,
      phone: form.phone.trim() || null,
      mobile: form.mobile.trim() || null,
      email: form.email.trim() || null,
      city: form.city.trim() || null,
      region: form.region.trim() || null,
      country: 'Saudi Arabia',
      customer_type: form.customer_type,
      last_order_date: form.last_order_date || null,
      notes: form.notes.trim() || null,
      owner_id: form.owner_id || null,
      assigned_by: form.owner_id ? user.id : null,
      assigned_at: form.owner_id ? new Date().toISOString() : null,
      source: 'manual',
      status: 'active',
    });

    setSaving(false);

    if (insertError) {
      setError(insertError.message || 'Failed to create customer.');
      return;
    }

    onSuccess();
  }

  // -------------------------------------------------------------------------
  // Shared class for all inputs / selects / textareas
  // -------------------------------------------------------------------------

  const inputClass =
    'w-full text-sm px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring';

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Modal panel */}
      <div className="w-full max-w-lg bg-card rounded-xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2 text-foreground">
            <Icon name="UserPlus" size={18} />
            <h2 className="text-base font-semibold">Add Customer</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Close modal"
          >
            <Icon name="X" size={16} />
          </button>
        </div>

        {/* Scrollable form body */}
        <form
          id="add-customer-form"
          onSubmit={handleSave}
          className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
        >
          {/* Company Name */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Company Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className={inputClass}
              placeholder="e.g. Al Jazeera Trading"
              value={form.company_name}
              onChange={(e) => setField('company_name', e.target.value)}
              required
            />
          </div>

          {/* First Name + Last Name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                First Name
              </label>
              <input
                type="text"
                className={inputClass}
                placeholder="Ahmed"
                value={form.first_name}
                onChange={(e) => setField('first_name', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Last Name
              </label>
              <input
                type="text"
                className={inputClass}
                placeholder="Al-Rashid"
                value={form.last_name}
                onChange={(e) => setField('last_name', e.target.value)}
              />
            </div>
          </div>

          {/* Phone + Mobile */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Phone
              </label>
              <input
                type="tel"
                className={inputClass}
                placeholder="+966 11 000 0000"
                value={form.phone}
                onChange={(e) => setField('phone', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Mobile
              </label>
              <input
                type="tel"
                className={inputClass}
                placeholder="+966 5X XXX XXXX"
                value={form.mobile}
                onChange={(e) => setField('mobile', e.target.value)}
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Email
            </label>
            <input
              type="email"
              className={inputClass}
              placeholder="contact@company.com"
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
            />
          </div>

          {/* City + Region */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                City
              </label>
              <input
                type="text"
                className={inputClass}
                placeholder="Riyadh"
                value={form.city}
                onChange={(e) => setField('city', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Region
              </label>
              <input
                type="text"
                className={inputClass}
                placeholder="Central"
                value={form.region}
                onChange={(e) => setField('region', e.target.value)}
              />
            </div>
          </div>

          {/* Customer Type + Last Order Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Customer Type
              </label>
              <select
                className={inputClass}
                value={form.customer_type}
                onChange={(e) => setField('customer_type', e.target.value)}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="dormant">Dormant</option>
                <option value="prospect">Prospect</option>
                <option value="blocked">Blocked</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Last Order Date
              </label>
              <input
                type="date"
                className={inputClass}
                value={form.last_order_date}
                onChange={(e) => setField('last_order_date', e.target.value)}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Notes
            </label>
            <textarea
              className={inputClass}
              rows={3}
              placeholder="Any additional notes about this customer…"
              value={form.notes}
              onChange={(e) => setField('notes', e.target.value)}
            />
          </div>

          {/* Assign To Salesman — only when canAssign */}
          {canAssign && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Assign To Salesman
              </label>
              <select
                className={inputClass}
                value={form.owner_id}
                onChange={(e) => setField('owner_id', e.target.value)}
              >
                <option value="">— Unassigned —</option>
                {salesmen.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} ({s.role})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2.5 text-red-700 dark:text-red-400">
              <Icon name="AlertCircle" size={15} className="shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="shrink-0 px-5 py-4 border-t border-border flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="add-customer-form"
            disabled={saving}
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
            {saving ? 'Creating…' : 'Create Customer'}
          </button>
        </div>
      </div>
    </div>
  );
}
