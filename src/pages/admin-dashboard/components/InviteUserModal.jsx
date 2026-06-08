import { useState, useEffect } from 'react';
import { supabase, supabaseAuthIsolated } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import Icon from '../../../components/AppIcon';

const ROLES = [
  { value: 'salesman',   label: 'Salesman'        },
  { value: 'supervisor', label: 'Supervisor'      },
  { value: 'manager',    label: 'Manager'         },
  { value: 'director',   label: 'Director'        },
  { value: 'viewer',     label: 'Pipeline Viewer' },
  { value: 'marketing',  label: 'Marketing'       },
];

export default function InviteUserModal({ isOpen = true, onClose, onSuccess }) {
  const { company } = useAuth();

  const [step, setStep] = useState('form'); // 'form' | 'success'

  const [form, setForm] = useState({
    fullName:  '',
    email:     '',
    password:  '',
    role:      'salesman',
    companyId: company?.id || '',
    reportsTo: '',
  });

  const [companies, setCompanies]             = useState([]);
  const [reportsToOptions, setReportsToOptions] = useState([]);
  const [showPassword, setShowPassword]       = useState(false);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState('');
  const [copied, setCopied]             = useState(false);
  const [createdUser, setCreatedUser]   = useState(null);

  useEffect(() => {
    if (isOpen) {
      setStep('form');
      setForm({
        fullName:  '',
        email:     '',
        password:  '',
        role:      'salesman',
        companyId: company?.id || '',
        reportsTo: '',
      });
      setError('');
      setCopied(false);
      setCreatedUser(null);
      setReportsToOptions([]);
      loadCompanies();
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadCompanies() {
    const { data } = await supabase
      .from('companies')
      .select('id, name')
      .eq('is_active', true)
      .order('name');
    setCompanies(data || []);
    if (data?.length && !form.companyId) {
      setForm(f => ({ ...f, companyId: company?.id || data[0].id }));
    }
  }

  // Load the "Reports To" candidates whenever role/company changes
  useEffect(() => {
    if (isOpen && form.role && form.companyId) {
      loadReportsToOptions(form.role, form.companyId);
    }
  }, [isOpen, form.role, form.companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadReportsToOptions(role, companyId) {
    let targetRole = null;
    if (role === 'manager')        targetRole = 'director';
    else if (role === 'supervisor') targetRole = 'manager';
    else if (role === 'salesman')   targetRole = 'supervisor';
    else {
      setReportsToOptions([]);
      setForm(f => ({ ...f, reportsTo: '' }));
      return;
    }

    // Directors span all companies; everyone else is scoped to the company
    let query = supabase
      .from('users')
      .select('id, full_name, role, company_id')
      .eq('role', targetRole)
      .eq('is_active', true)
      .order('full_name');

    if (targetRole !== 'director') {
      query = query.eq('company_id', companyId);
    }

    const { data } = await query;

    // Salesman with no supervisors → fall back to managers
    if (role === 'salesman' && (!data || data.length === 0)) {
      const { data: managers } = await supabase
        .from('users')
        .select('id, full_name, role')
        .eq('company_id', companyId)
        .eq('role', 'manager')
        .eq('is_active', true)
        .order('full_name');
      setReportsToOptions(managers || []);
      setForm(f => ({ ...f, reportsTo: managers?.[0]?.id || '' }));
      return;
    }

    setReportsToOptions(data || []);
    setForm(f => ({ ...f, reportsTo: data?.[0]?.id || '' }));
  }

  function generatePassword() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#';
    let pwd = '';
    for (let i = 0; i < 10; i++) {
      pwd += chars[Math.floor(Math.random() * chars.length)];
    }
    setForm(f => ({ ...f, password: pwd }));
    setShowPassword(true);
  }

  async function handleCreate() {
    const { fullName, email, password, role, companyId } = form;

    if (!fullName.trim()) {
      setError('Full name is required');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Valid email is required');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (!companyId) {
      setError('Please select a company');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const cleanEmail = email.trim().toLowerCase();

      // Reject duplicate email up front
      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (existing) {
        setError('A user with this email already exists');
        setSaving(false);
        return;
      }

      // Create auth user via the ISOLATED client so the admin's own
      // session is not replaced by the new user's session.
      const { data: authData, error: authErr } = await supabaseAuthIsolated.auth.signUp({
        email:    cleanEmail,
        password,
        options: { data: { full_name: fullName.trim() } },
      });

      if (authErr) {
        if (
          authErr.message.includes('already registered') ||
          authErr.message.includes('already been registered')
        ) {
          setError('This email is already registered. Use a different email address.');
        } else {
          setError(authErr.message);
        }
        setSaving(false);
        return;
      }

      const userId = authData?.user?.id;
      if (!userId) {
        setError('User creation failed — no ID returned');
        setSaving(false);
        return;
      }

      // Upsert the user profile (main client → admin session for RLS)
      const { error: profileErr } = await supabase
        .from('users')
        .upsert(
          {
            id:            userId,
            email:         cleanEmail,
            full_name:     fullName.trim(),
            role,
            company_id:    companyId,
            supervisor_id: form.reportsTo || null,
            is_active:     true,
            created_at:    new Date().toISOString(),
            updated_at:    new Date().toISOString(),
          },
          { onConflict: 'id' }
        );

      if (profileErr) {
        setError('Profile error: ' + profileErr.message);
        setSaving(false);
        return;
      }

      setCreatedUser({
        name:          fullName.trim(),
        email:         cleanEmail,
        password,
        role,
        company:       companies.find(c => c.id === companyId)?.name || '',
        reportsToName: reportsToOptions.find(u => u.id === form.reportsTo)?.full_name || '',
      });
      setStep('success');
    } catch (err) {
      setError(err.message || 'Unexpected error');
    } finally {
      setSaving(false);
    }
  }

  function copyCredentials() {
    const text = [
      'JASCO CRM — Login Credentials',
      '─────────────────────────────',
      `Name:     ${createdUser.name}`,
      `Email:    ${createdUser.email}`,
      `Password: ${createdUser.password}`,
      `Role:     ${createdUser.role}`,
      `Company:  ${createdUser.company}`,
      '─────────────────────────────',
      'Login URL: https://crmhorizon.vercel.app',
      '',
      'Please change your password after',
      'first login via Settings → Profile.',
    ].join('\n');

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  }

  function handleDone() {
    onSuccess?.(); // refresh the user list
    onClose?.();
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">

        {/* ── FORM STEP ── */}
        {step === 'form' && (
          <>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-tertiary">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
                  <Icon name="UserPlus" size={18} className="text-blue-600" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-text-primary">Create New User</h2>
                  <p className="text-xs text-text-tertiary">No email sent — share credentials manually</p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-background-secondary text-text-tertiary">
                <Icon name="X" size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Full Name */}
              <div>
                <label className="text-xs font-medium text-text-secondary block mb-1">Full Name *</label>
                <input
                  type="text"
                  value={form.fullName}
                  onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
                  placeholder="e.g. Ahmed Al-Rashidi"
                  className="w-full text-sm px-3 py-2 border border-border-secondary rounded-xl focus:outline-none focus:border-blue-400"
                  autoFocus
                />
              </div>

              {/* Email */}
              <div>
                <label className="text-xs font-medium text-text-secondary block mb-1">Email Address *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="ahmed@jascogroup.com"
                  className="w-full text-sm px-3 py-2 border border-border-secondary rounded-xl focus:outline-none focus:border-blue-400"
                />
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-text-secondary">Password *</label>
                  <button type="button" onClick={generatePassword} className="text-xs text-blue-600 hover:underline">
                    Generate password
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Min 8 characters"
                    className="w-full text-sm px-3 py-2 border border-border-secondary rounded-xl pr-10 focus:outline-none focus:border-blue-400 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
                  >
                    <Icon name={showPassword ? 'EyeOff' : 'Eye'} size={15} />
                  </button>
                </div>
                <p className="text-xs text-text-tertiary mt-1">User can change this after first login.</p>
              </div>

              {/* Role + Company */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-text-secondary block mb-1">Role *</label>
                  <select
                    value={form.role}
                    onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                    className="w-full text-sm px-3 py-2 border border-border-secondary rounded-xl focus:outline-none focus:border-blue-400 bg-white"
                  >
                    {ROLES.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-text-secondary block mb-1">Company *</label>
                  <select
                    value={form.companyId}
                    onChange={e => setForm(f => ({ ...f, companyId: e.target.value }))}
                    className="w-full text-sm px-3 py-2 border border-border-secondary rounded-xl focus:outline-none focus:border-blue-400 bg-white"
                  >
                    <option value="">Select company</option>
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Reports To — shown when role needs a reporting line */}
              {reportsToOptions.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-text-secondary block mb-1">
                    Reports To *
                  </label>
                  <select
                    value={form.reportsTo}
                    onChange={e => setForm(f => ({ ...f, reportsTo: e.target.value }))}
                    className="w-full text-sm px-3 py-2 border border-border-secondary rounded-xl focus:outline-none focus:border-blue-400 bg-white"
                  >
                    <option value="">— Select manager —</option>
                    {reportsToOptions.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.full_name}
                        {u.role === 'director'
                          ? ' (Director)'
                          : u.role === 'manager'
                          ? ' (Manager)'
                          : u.role === 'supervisor'
                          ? ' (Supervisor)'
                          : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-text-tertiary mt-1">
                    {form.role === 'manager'
                      ? 'This manager will report to the selected director'
                      : form.role === 'supervisor'
                      ? 'This supervisor will report to the selected manager'
                      : 'This salesman will report to the selected supervisor'}
                  </p>
                </div>
              )}

              {/* No options found warning */}
              {reportsToOptions.length === 0 &&
                ['manager', 'supervisor', 'salesman'].includes(form.role) &&
                form.companyId && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700">
                    <Icon name="AlertTriangle" size={13} className="flex-shrink-0" />
                    {form.role === 'manager'
                      ? 'No director found. User will have no reporting line set.'
                      : form.role === 'supervisor'
                      ? 'No manager found in this company. Assign a manager first.'
                      : 'No supervisor found. Salesman will report to the manager.'}
                  </div>
                )}

              {error && (
                <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
                  <Icon name="AlertCircle" size={14} className="flex-shrink-0 mt-0.5" />
                  {error}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border-tertiary">
              <button onClick={onClose} className="px-4 py-2 text-sm text-text-secondary rounded-xl hover:bg-background-secondary">
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50"
              >
                <Icon name="UserPlus" size={14} />
                {saving ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </>
        )}

        {/* ── SUCCESS STEP ── */}
        {step === 'success' && createdUser && (
          <div className="p-6">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <Icon name="CheckCircle" size={28} className="text-green-600" />
            </div>

            <h3 className="text-lg font-semibold text-text-primary text-center mb-1">User Created!</h3>
            <p className="text-sm text-text-secondary text-center mb-5">
              Share these credentials with <strong>{createdUser.name}</strong>
            </p>

            <div className="bg-background-secondary rounded-xl p-4 space-y-2.5 mb-4 border border-border-tertiary">
              {[
                { label: 'Name',     value: createdUser.name },
                { label: 'Email',    value: createdUser.email },
                { label: 'Password', value: createdUser.password, mono: true },
                { label: 'Role',     value: ROLES.find(r => r.value === createdUser.role)?.label },
                { label: 'Company',  value: createdUser.company },
                ...(createdUser.reportsToName
                  ? [{ label: 'Reports to', value: createdUser.reportsToName }]
                  : []),
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between gap-3">
                  <span className="text-xs text-text-tertiary flex-shrink-0 w-16">{row.label}</span>
                  <span className={`text-sm font-medium text-text-primary truncate ${row.mono ? 'font-mono' : ''}`}>
                    {row.value}
                  </span>
                </div>
              ))}

              <div className="flex items-center justify-between gap-3 pt-2 border-t border-border-tertiary">
                <span className="text-xs text-text-tertiary flex-shrink-0 w-16">URL</span>
                <span className="text-sm text-blue-600 font-medium">crmhorizon.vercel.app</span>
              </div>
            </div>

            <button
              onClick={copyCredentials}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium border transition-colors mb-2 border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100"
            >
              <Icon name={copied ? 'Check' : 'Copy'} size={15} />
              {copied ? 'Copied to clipboard!' : 'Copy Credentials'}
            </button>

            <button
              onClick={() => {
                setStep('form');
                setForm({
                  fullName:  '',
                  email:     '',
                  password:  '',
                  role:      'salesman',
                  companyId: company?.id || '',
                  reportsTo: '',
                });
                setError('');
                setCreatedUser(null);
                setReportsToOptions([]);
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium border border-border-secondary text-text-secondary hover:bg-background-secondary transition-colors mb-2"
            >
              <Icon name="UserPlus" size={15} />
              Create Another User
            </button>

            <button
              onClick={handleDone}
              className="w-full py-2.5 text-sm text-text-tertiary hover:text-text-secondary transition-colors"
            >
              Done
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
