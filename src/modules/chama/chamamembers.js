// modules/chama/ChamaMembers.js
// Members Panel — self-contained mock data layer, strictly scoped per chama_id.
// Swap `db.listMembers` for a real Supabase call when wiring to your backend —
// it already returns a Promise filtered by chama_id, so it's a drop-in change.

import React, { useState, useEffect, useCallback } from 'react';
import './chamamembers.css';

// ============================================================================
// MOCK DATA LAYER — replace with real Supabase calls when integrating
// ============================================================================

const wait = (ms = 300) => new Promise((res) => setTimeout(res, ms));

const seedMembers = {
  'chama-alpha': [
    { id: 'a1', chama_id: 'chama-alpha', name: 'Wanjiru Kamau', phone: '+254712345001', national_id: '24551201', role: 'chairperson', status: 'active', chama_no: 'ALPHA-001', created_at: '2023-01-12', joined_at: '2023-01-15', approved_by: 'Samuel Kiprotich', approved_at: '2023-01-16', suspended_at: null, remarks: 'Founding member.', pin: true, auth_user_id: 'u1', last_login: '2026-07-06T08:12:00' },
    { id: 'a2', chama_id: 'chama-alpha', name: 'Grace Muthoni', phone: '+254712345002', national_id: '24551202', role: 'treasurer', status: 'active', chama_no: 'ALPHA-002', created_at: '2023-01-12', joined_at: '2023-01-15', approved_by: 'Samuel Kiprotich', approved_at: '2023-01-16', suspended_at: null, remarks: '', pin: true, auth_user_id: 'u2', last_login: '2026-07-07T17:40:00' },
    { id: 'a3', chama_id: 'chama-alpha', name: 'Otieno Achieng', phone: '+254712345003', national_id: '24551203', role: 'member', status: 'active', chama_no: 'ALPHA-003', created_at: '2023-02-02', joined_at: '2023-02-05', approved_by: 'Grace Muthoni', approved_at: '2023-02-06', suspended_at: null, remarks: '', pin: false, auth_user_id: 'u3', last_login: '2026-06-29T10:05:00' },
    { id: 'a4', chama_id: 'chama-alpha', name: 'Fatuma Hassan', phone: '+254712345004', national_id: '24551204', role: 'secretary', status: 'active', chama_no: 'ALPHA-004', created_at: '2023-03-11', joined_at: '2023-03-14', approved_by: 'Grace Muthoni', approved_at: '2023-03-15', suspended_at: null, remarks: 'Handles minutes.', pin: true, auth_user_id: 'u4', last_login: '2026-07-08T06:22:00' },
    { id: 'a5', chama_id: 'chama-alpha', name: 'Kiplagat Rono', phone: '+254712345005', national_id: '24551205', role: 'member', status: 'suspended', chama_no: 'ALPHA-005', created_at: '2023-04-01', joined_at: '2023-04-03', approved_by: 'Grace Muthoni', approved_at: '2023-04-04', suspended_at: '2026-05-20', remarks: 'Missed 3 consecutive contributions.', pin: true, auth_user_id: 'u5', last_login: '2026-05-18T09:00:00' },
    { id: 'a6', chama_id: 'chama-alpha', name: 'Njoki Mwangi', phone: '+254712345006', national_id: '', role: 'member', status: 'pending', chama_no: 'ALPHA-006', created_at: '2026-07-01', joined_at: null, approved_by: null, approved_at: null, suspended_at: null, remarks: 'Awaiting ID verification.', pin: false, auth_user_id: null, last_login: null },
  ],
  'chama-beta': [
    { id: 'b1', chama_id: 'chama-beta', name: 'Brian Odhiambo', phone: '+254798765001', national_id: '31882001', role: 'chairperson', status: 'active', chama_no: 'BETA-001', created_at: '2024-05-01', joined_at: '2024-05-03', approved_by: 'Aisha Noor', approved_at: '2024-05-04', suspended_at: null, remarks: '', pin: true, auth_user_id: 'u6', last_login: '2026-07-08T07:00:00' },
    { id: 'b2', chama_id: 'chama-beta', name: 'Aisha Noor', phone: '+254798765002', national_id: '31882002', role: 'treasurer', status: 'active', chama_no: 'BETA-002', created_at: '2024-05-01', joined_at: '2024-05-03', approved_by: 'Brian Odhiambo', approved_at: '2024-05-04', suspended_at: null, remarks: '', pin: true, auth_user_id: 'u7', last_login: '2026-07-05T14:30:00' },
    { id: 'b3', chama_id: 'chama-beta', name: 'Peter Mutua', phone: '+254798765003', national_id: '31882003', role: 'member', status: 'inactive', chama_no: 'BETA-003', created_at: '2024-06-10', joined_at: '2024-06-12', approved_by: 'Aisha Noor', approved_at: '2024-06-13', suspended_at: null, remarks: 'Relocated upcountry.', pin: false, auth_user_id: 'u8', last_login: '2026-02-11T11:11:00' },
  ],
};

const seedChamas = {
  'chama-alpha': { id: 'chama-alpha', name: 'Alpha Chama', chama_no: 'ALPHA' },
  'chama-beta': { id: 'chama-beta', name: 'Beta Chama', chama_no: 'BETA' },
};

const db = {
  async listMembers(chamaId) {
    await wait(350);
    // STRICT SCOPING: only rows whose chama_id matches the requested chama.
    return (seedMembers[chamaId] || []).map((m) => ({ ...m }));
  },
  async getChama(chamaId) {
    await wait(120);
    // Falls back to a generic placeholder for any chamaId not in the demo
    // seed data (e.g. a real UUID from your app), so the panel still
    // renders instead of showing "Chama not found." — swap this whole
    // function for a real Supabase `.select().eq('id', chamaId).single()`
    // call when you wire this up to your backend.
    return seedChamas[chamaId] || { id: chamaId, name: 'Your Chama', chama_no: chamaId };
  },
};

const DEMO_CHAMAS = Object.values(seedChamas);

// ─── Inline SVG icons ────────────────────────────────────────────────────────
const Icon = ({ name, size = 16 }) => {
  const paths = {
    search:   <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    filter:   <><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></>,
    sort:     <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="9" y2="18"/></>,
    close:    <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    phone:    <><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6.13 6.13l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></>,
    id:       <><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="16" y1="9" x2="8" y2="9"/><line x1="12" y1="13" x2="8" y2="13"/></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    shield:   <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>,
    members:  <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    grid:     <><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></>,
    list:     <><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></>,
    chevronD: <><polyline points="6 9 12 15 18 9"/></>,
    chevronU: <><polyline points="18 15 12 9 6 15"/></>,
    check:    <><polyline points="20 6 9 17 4 12"/></>,
    alert:    <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
    eye:      <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
    pin:      <><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>,
    export:   <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>,
    refresh:  <><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.08-3.44"/></>,
    login:    <><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></>,
    building: <><rect x="4" y="2" width="16" height="20" rx="1"/><line x1="9" y1="8" x2="9" y2="8"/><line x1="15" y1="8" x2="15" y2="8"/><line x1="9" y1="12" x2="9" y2="12"/><line x1="15" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="9" y2="16"/><line x1="15" y1="16" x2="15" y2="16"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
};

const fmtTime = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return '—';
  return d.toLocaleString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const initials = (name) => {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
};

// Deterministic avatar color from name — pulled from the gold/green family
// so avatars never clash with the theme.
const avatarColor = (name) => {
  const colors = ['#0f5c4d', '#c9982f', '#1c7a64', '#9c7519', '#2f7d4f', '#b8791b', '#12695a', '#a97d24'];
  if (!name) return colors[0];
  let hash = 0;
  for (let c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return colors[Math.abs(hash) % colors.length];
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const RoleBadge = ({ role }) => {
  const map = {
    treasurer:   '#c9982f',
    chairperson: '#0f5c4d',
    secretary:   '#2f7d4f',
    admin:       '#b5442e',
    member:      '#5f6d64',
  };
  const color = map[role?.toLowerCase()] || '#5f6d64';
  return <span className="cm-role-badge" style={{ '--rc': color }}>{role || 'member'}</span>;
};

const StatusDot = ({ status }) => (
  <span className={`cm-status-dot cm-status-${status?.toLowerCase()}`}>
    <span className="cm-dot" />
    {status}
  </span>
);

const Toast = ({ msg, type }) => (
  <div className={`cm-toast cm-toast-${type}`}>
    <Icon name={type === 'success' ? 'check' : 'alert'} size={14} />
    {msg}
  </div>
);

// ─── Member Detail Drawer ─────────────────────────────────────────────────────
const MemberDrawer = ({ member: m, onClose, currentUserRole }) => {
  if (!m) return null;
  const color = avatarColor(m.name);
  const canSeePin = ['treasurer', 'admin'].includes(currentUserRole);

  return (
    <div className="cm-drawer-overlay" onClick={onClose}>
      <aside className="cm-drawer" onClick={e => e.stopPropagation()}>
        <button className="cm-drawer-close" onClick={onClose} type="button"><Icon name="close" size={18}/></button>

        <div className="cm-drawer-top" style={{ '--av': color }}>
          <div className="cm-drawer-avatar">{initials(m.name)}</div>
          <div>
            <h2 className="cm-drawer-name">{m.name || '—'}</h2>
            <div className="cm-drawer-badges">
              <RoleBadge role={m.role}/>
              <StatusDot status={m.status}/>
            </div>
          </div>
        </div>

        <div className="cm-drawer-body">
          <section className="cm-drawer-section">
            <div className="cm-drawer-section-title">Contact</div>
            <div className="cm-drawer-row">
              <Icon name="phone" size={14}/>
              <span>{m.phone || '—'}</span>
            </div>
            <div className="cm-drawer-row">
              <Icon name="id" size={14}/>
              <span>National ID: {m.national_id || <em>Not provided</em>}</span>
            </div>
          </section>

          <section className="cm-drawer-section">
            <div className="cm-drawer-section-title">Chama Info</div>
            <div className="cm-drawer-row"><Icon name="shield" size={14}/><span>Chama No: {m.chama_no || '—'}</span></div>
            <div className="cm-drawer-row"><Icon name="calendar" size={14}/><span>Joined: {fmt(m.joined_at)}</span></div>
            <div className="cm-drawer-row"><Icon name="calendar" size={14}/><span>Registered: {fmt(m.created_at)}</span></div>
            {m.approved_at && <div className="cm-drawer-row"><Icon name="check" size={14}/><span>Approved: {fmt(m.approved_at)}</span></div>}
            {m.suspended_at && <div className="cm-drawer-row cm-text-danger"><Icon name="alert" size={14}/><span>Suspended: {fmt(m.suspended_at)}</span></div>}
          </section>

          {m.remarks && (
            <section className="cm-drawer-section">
              <div className="cm-drawer-section-title">Remarks</div>
              <p className="cm-drawer-remarks">{m.remarks}</p>
            </section>
          )}

          <section className="cm-drawer-section">
            <div className="cm-drawer-section-title">System</div>
            <div className="cm-drawer-row"><Icon name="login" size={14}/><span>Last login: {fmtTime(m.last_login)}</span></div>
            {canSeePin && (
              <div className="cm-drawer-row">
                <Icon name="pin" size={14}/>
                <span>PIN: {m.pin ? <strong style={{color:'var(--cm-success)'}}>Set ✓</strong> : <em style={{color:'var(--cm-muted)'}}>Not set</em>}</span>
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
};

// ─── Member Avatar Card (grid view) ──────────────────────────────────────────
const MemberCard = ({ m, onClick }) => {
  const color = avatarColor(m.name);
  return (
    <div className="cm-card" onClick={() => onClick(m)}>
      <div className="cm-card-avatar" style={{ background: color + '22', color }}>
        {initials(m.name)}
      </div>
      <div className="cm-card-name">{m.name}</div>
      <div className="cm-card-phone">{m.phone}</div>
      <div className="cm-card-badges">
        <RoleBadge role={m.role}/>
        <StatusDot status={m.status}/>
      </div>
    </div>
  );
};

// ─── Member Row (list view) ───────────────────────────────────────────────────
const MemberRow = ({ m, onClick }) => {
  const color = avatarColor(m.name);
  return (
    <tr className="cm-row" onClick={() => onClick(m)}>
      <td>
        <div className="cm-row-name">
          <span className="cm-row-avatar" style={{ background: color + '22', color }}>{initials(m.name)}</span>
          <div>
            <div className="cm-row-fullname">{m.name}</div>
            {m.chama_no && <div className="cm-row-chama">{m.chama_no}</div>}
          </div>
        </div>
      </td>
      <td><span className="cm-mono">{m.phone}</span></td>
      <td>{m.national_id || <span className="cm-dim">—</span>}</td>
      <td><RoleBadge role={m.role}/></td>
      <td><StatusDot status={m.status}/></td>
      <td>{fmt(m.joined_at)}</td>
      <td>{fmtTime(m.last_login)}</td>
    </tr>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
const ChamaMembers = ({ chamaId: chamaIdProp, currentUserRole = 'treasurer' }) => {
  // Demo-only chama switcher, so you can prove the members list is scoped
  // strictly per chama. Remove this block (keep only the `chamaId` prop)
  // once wired into your real app shell / router / ChamaContext.
  const [demoChamaId, setDemoChamaId] = useState(chamaIdProp || DEMO_CHAMAS[0].id);
  const chamaId = chamaIdProp || demoChamaId;
  const showChamaSwitcher = !chamaIdProp;

  const [chama, setChama]         = useState(null);
  const [members, setMembers]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search,  setSearch]      = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode]   = useState('list');
  const [sortField, setSortField] = useState('name');
  const [sortDir,   setSortDir]   = useState('asc');
  const [selected,  setSelected]  = useState(null);
  const [toasts,    setToasts]    = useState([]);
  const [stats,     setStats]     = useState({ total: 0, active: 0, pending: 0, suspended: 0, officials: 0 });

  const pushToast = (msg, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200);
  };

  const load = useCallback(async (id) => {
    if (!id) return;
    setLoading(true);
    try {
      const [chamaData, rows] = await Promise.all([db.getChama(id), db.listMembers(id)]);
      setChama(chamaData);
      setMembers(rows);
      setStats({
        total:     rows.length,
        active:    rows.filter(r => r.status === 'active').length,
        pending:   rows.filter(r => r.status === 'pending').length,
        suspended: rows.filter(r => r.status === 'suspended').length,
        officials: rows.filter(r => ['treasurer','chairperson','secretary','admin'].includes(r.role)).length,
      });
    } catch (err) {
      pushToast(err.message || 'Failed to load members', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload — and reset filters/selection — whenever the active chama changes,
  // so no state from a previous chama can leak into the new view.
  useEffect(() => {
    setSelected(null);
    setSearch('');
    setRoleFilter('all');
    setStatusFilter('all');
    load(chamaId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chamaId]);

  // ── Filtering + sorting ──────────────────────────────────────────────────
  const filtered = members
    .filter(m => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        m.name?.toLowerCase().includes(q) ||
        m.phone?.includes(q) ||
        m.national_id?.includes(q) ||
        m.chama_no?.toLowerCase().includes(q);
      const matchRole   = roleFilter   === 'all' || m.role   === roleFilter;
      const matchStatus = statusFilter === 'all' || m.status === statusFilter;
      return matchSearch && matchRole && matchStatus;
    })
    .sort((a, b) => {
      let va = a[sortField] || '';
      let vb = b[sortField] || '';
      if (sortField === 'joined_at' || sortField === 'last_login') {
        va = va ? new Date(va).getTime() : 0;
        vb = vb ? new Date(vb).getTime() : 0;
      } else {
        va = String(va).toLowerCase();
        vb = String(vb).toLowerCase();
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ?  1 : -1;
      return 0;
    });

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <Icon name="sort" size={12}/>;
    return sortDir === 'asc' ? <Icon name="chevronU" size={12}/> : <Icon name="chevronD" size={12}/>;
  };

  // ── CSV export ───────────────────────────────────────────────────────────
  const exportCSV = () => {
    if (filtered.length === 0) {
      pushToast('Nothing to export for the current filters', 'error');
      return;
    }
    const cols = ['name','phone','national_id','role','status','chama_no','joined_at','last_login'];
    const header = cols.join(',');
    const rows = filtered.map(m => cols.map(c => `"${(m[c]||'').toString().replace(/"/g,'""')}"`).join(','));
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${chama?.chama_no || 'chama'}_members.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    pushToast('Members exported ✓');
  };

  const clearFilters = () => {
    setSearch('');
    setRoleFilter('all');
    setStatusFilter('all');
  };

  if (!chama && loading) return <div className="cm-loading"><Icon name="refresh" size={18}/> Loading members…</div>;
  if (!chama) return <div className="cm-loading">Chama not found.</div>;

  return (
    <div className="cm-wrap">
      {/* ── Toast stack ── */}
      <div className="cm-toasts">
        {toasts.map(t => <Toast key={t.id} msg={t.msg} type={t.type}/>)}
      </div>

      {/* ── Header ── */}
      <div className="cm-header">
        <div>
          <div className="cm-eyebrow">Members</div>
          <h1 className="cm-title">{chama.name}</h1>
          <div className="cm-subtitle">{chama.chama_no} · {stats.total} registered members</div>
        </div>
        <div className="cm-header-actions">
          {showChamaSwitcher && (
            <div className="cm-chama-switch">
              <Icon name="building" size={14}/>
              <select value={demoChamaId} onChange={(e) => setDemoChamaId(e.target.value)}>
                {DEMO_CHAMAS.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
          <button className="cm-btn cm-btn-ghost" onClick={() => load(chamaId)} title="Refresh" type="button">
            <Icon name="refresh" size={14}/> Refresh
          </button>
          <button className="cm-btn cm-btn-gold" onClick={exportCSV} title="Export CSV" type="button">
            <Icon name="export" size={14}/> Export
          </button>
        </div>
      </div>

      {/* ── Stat bar ── */}
      <div className="cm-stat-bar">
        {[
          { label: 'Total',     value: stats.total,     tone: 'neutral' },
          { label: 'Active',    value: stats.active,    tone: 'success' },
          { label: 'Pending',   value: stats.pending,   tone: 'warning' },
          { label: 'Suspended', value: stats.suspended, tone: 'danger' },
          { label: 'Officials', value: stats.officials, tone: 'gold' },
        ].map(s => (
          <div key={s.label} className={`cm-stat cm-stat-${s.tone}`}>
            <div className="cm-stat-num">{s.value}</div>
            <div className="cm-stat-lbl">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div className="cm-toolbar">
        <div className="cm-search-wrap">
          <Icon name="search" size={15}/>
          <input
            className="cm-search"
            placeholder="Search name, phone, ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && <button className="cm-clear" onClick={() => setSearch('')} type="button"><Icon name="close" size={12}/></button>}
        </div>

        <div className="cm-filters">
          <select className="cm-select" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
            <option value="all">All Roles</option>
            <option value="member">Member</option>
            <option value="treasurer">Treasurer</option>
            <option value="chairperson">Chairperson</option>
            <option value="secretary">Secretary</option>
            <option value="admin">Admin</option>
          </select>

          <select className="cm-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="suspended">Suspended</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <div className="cm-view-toggle">
          <button className={`cm-view-btn ${viewMode==='list'?'active':''}`} onClick={() => setViewMode('list')} title="List view" type="button">
            <Icon name="list" size={15}/>
          </button>
          <button className={`cm-view-btn ${viewMode==='grid'?'active':''}`} onClick={() => setViewMode('grid')} title="Grid view" type="button">
            <Icon name="grid" size={15}/>
          </button>
        </div>

        <div className="cm-count">{filtered.length} of {members.length}</div>
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div className="cm-skeleton">
          {[...Array(6)].map((_, i) => <div key={i} className="cm-skel-row"/>)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="cm-empty">
          <Icon name="members" size={44}/>
          <p>No members match your filters</p>
          <button className="cm-btn cm-btn-ghost" onClick={clearFilters} type="button">
            Clear filters
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="cm-grid">
          {filtered.map(m => <MemberCard key={m.id} m={m} onClick={setSelected}/>)}
        </div>
      ) : (
        <div className="cm-table-wrap">
          <table className="cm-table">
            <thead>
              <tr>
                <th onClick={() => toggleSort('name')} className="cm-th-sort">
                  Name <SortIcon field="name"/>
                </th>
                <th>Phone</th>
                <th>National ID</th>
                <th onClick={() => toggleSort('role')} className="cm-th-sort">
                  Role <SortIcon field="role"/>
                </th>
                <th onClick={() => toggleSort('status')} className="cm-th-sort">
                  Status <SortIcon field="status"/>
                </th>
                <th onClick={() => toggleSort('joined_at')} className="cm-th-sort">
                  Joined <SortIcon field="joined_at"/>
                </th>
                <th onClick={() => toggleSort('last_login')} className="cm-th-sort">
                  Last Login <SortIcon field="last_login"/>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => (
                <MemberRow key={m.id} m={m} onClick={setSelected}/>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Detail drawer ── */}
      <MemberDrawer
        member={selected}
        onClose={() => setSelected(null)}
        currentUserRole={currentUserRole}
      />
    </div>
  );
};

export default ChamaMembers;