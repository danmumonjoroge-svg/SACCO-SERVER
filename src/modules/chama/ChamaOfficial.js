// modules/chama/ChamaOfficials.js
// Sophisticated Officials Panel — multi-role, multi-chama aware
// Roles handled: treasurer, chairperson, secretary (+ admin fallback)

import React, { useState, useEffect, useCallback } from 'react';
import { useChama } from './ChamaContext';
import { supabase } from '../../supabaseClient';
import './ChamaOfficial.css';

// ─── Icon set (inline SVG, zero dependencies) ────────────────────────────────
const Icon = ({ name, size = 18 }) => {
  const icons = {
    approve:   <><polyline points="20 6 9 17 4 12"/></>,
    reject:    <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    pin:       <><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>,
    upload:    <><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></>,
    fund:      <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>,
    member:    <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    doc:       <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>,
    send:      <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
    eye:       <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
    reset:     <><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/></>,
    chevron:   <><polyline points="9 18 15 12 9 6"/></>,
    bank:      <><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></>,
    check:     <><polyline points="20 6 9 17 4 12"/></>,
    alert:     <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
    refresh:   <><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.08-3.44"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {icons[name]}
    </svg>
  );
};

// ─── Role badge ───────────────────────────────────────────────────────────────
const RoleBadge = ({ role }) => {
  const map = {
    treasurer:   { label: 'Treasurer',   color: '#f59e0b' },
    chairperson: { label: 'Chairperson', color: '#6366f1' },
    secretary:   { label: 'Secretary',   color: '#10b981' },
    admin:       { label: 'Admin',       color: '#ef4444' },
  };
  const r = map[role] || { label: role, color: '#64748b' };
  return (
    <span className="role-badge" style={{ '--badge-color': r.color }}>
      {r.label}
    </span>
  );
};

// ─── Status pill ──────────────────────────────────────────────────────────────
const StatusPill = ({ status }) => (
  <span className={`status-pill status-${status?.toLowerCase()}`}>{status}</span>
);

// ─── Confirm modal ────────────────────────────────────────────────────────────
const ConfirmModal = ({ message, onConfirm, onCancel }) => (
  <div className="modal-overlay">
    <div className="modal-box">
      <p>{message}</p>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-danger" onClick={onConfirm}>Confirm</button>
      </div>
    </div>
  </div>
);

// ─── Toast ────────────────────────────────────────────────────────────────────
const useToast = () => {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg, type = 'success') => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);
  return { toasts, push };
};

const ToastStack = ({ toasts }) => (
  <div className="toast-stack">
    {toasts.map(t => (
      <div key={t.id} className={`toast toast-${t.type}`}>
        <Icon name={t.type === 'success' ? 'check' : 'alert'} size={15} />
        {t.msg}
      </div>
    ))}
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// PANEL: Approve Send (Treasurer)
// ═══════════════════════════════════════════════════════════════════════════════
const ApproveSend = ({ chama, member, toast }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [filter, setFilter] = useState('pending');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('chama_contributions')
      .select(`
        id, amount, contribution_type, account_name, account_number,
        bank_name, narration, status, created_at,
        chama_members!inner(name, phone)
      `)
      .eq('chama_id', chama.id)
      .eq('status', filter)
      .order('created_at', { ascending: false });
    if (!error) setRows(data || []);
    setLoading(false);
  }, [chama.id, filter]);

  useEffect(() => { load(); }, [load]);

  const act = async (id, status) => {
    const { error } = await supabase
      .from('chama_contributions')
      .update({ status, approved_by: member.id, approved_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { toast(error.message, 'error'); return; }
    toast(status === 'approved' ? 'Contribution approved ✓' : 'Contribution rejected', status === 'approved' ? 'success' : 'error');
    setSelected(null);
    setConfirm(null);
    load();
  };

  const typeColor = { savings: '#10b981', fines: '#ef4444', welfare: '#f59e0b', 'merry-go-round': '#6366f1', loans: '#3b82f6' };

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2>Approve Contributions</h2>
          <p className="panel-subtitle">Review and approve member send submissions</p>
        </div>
        <div className="filter-tabs">
          {['pending','approved','rejected'].map(f => (
            <button key={f} className={`filter-tab ${filter===f?'active':''}`}
              onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>
      </div>

      {loading ? <div className="skeleton-list">{[...Array(4)].map((_,i)=><div key={i} className="skeleton-row"/>)}</div> : (
        <div className="card-grid">
          {rows.length === 0 && <div className="empty-state"><Icon name="send" size={40}/><p>No {filter} submissions</p></div>}
          {rows.map(r => (
            <div key={r.id} className={`contrib-card ${selected?.id===r.id?'selected':''}`}
              onClick={() => setSelected(selected?.id===r.id ? null : r)}>
              <div className="contrib-top">
                <span className="contrib-type" style={{background: typeColor[r.contribution_type]+'22', color: typeColor[r.contribution_type]}}>
                  {r.contribution_type}
                </span>
                <StatusPill status={r.status}/>
              </div>
              <div className="contrib-name">{r.chama_members?.name}</div>
              <div className="contrib-amount">KES {Number(r.amount).toLocaleString()}</div>
              <div className="contrib-meta">{r.bank_name} · {r.account_number}</div>
              <div className="contrib-date">{new Date(r.created_at).toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'numeric'})}</div>

              {selected?.id===r.id && (
                <div className="contrib-detail" onClick={e=>e.stopPropagation()}>
                  <div className="detail-row"><span>Account Name</span><strong>{r.account_name}</strong></div>
                  <div className="detail-row"><span>Narration</span><strong>{r.narration||'—'}</strong></div>
                  <div className="detail-row"><span>Member Phone</span><strong>{r.chama_members?.phone}</strong></div>
                  {filter==='pending' && (
                    <div className="action-row">
                      <button className="btn btn-success" onClick={()=>setConfirm({id:r.id,action:'approved'})}>
                        <Icon name="approve"/> Approve
                      </button>
                      <button className="btn btn-danger" onClick={()=>setConfirm({id:r.id,action:'rejected'})}>
                        <Icon name="reject"/> Reject
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {confirm && <ConfirmModal
        message={`${confirm.action === 'approved' ? 'Approve' : 'Reject'} this contribution?`}
        onConfirm={() => act(confirm.id, confirm.action)}
        onCancel={() => setConfirm(null)}
      />}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// PANEL: Update Funds (Treasurer)
// ═══════════════════════════════════════════════════════════════════════════════
const UpdateFunds = ({ chama, member, toast }) => {
  const [funds, setFunds] = useState([]);
  const [form, setForm] = useState({ account_name:'', bank_name:'', account_number:'', fund_type:'savings', balance:'', notes:'' });
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  const fundTypes = ['savings','investment','emergency','livestock','business','other'];
  const bankColors = { KCB:'#00a651', Equity:'#d40000', 'Co-op':'#0066b3', NCBA:'#0A3161', CIC:'#f7941d', Stanbic:'#009FE3', DTB:'#003882' };

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('chama_funds')
        .select('*').eq('chama_id', chama.id).order('created_at', { ascending: false });
      setFunds(data || []);
    })();
  }, [chama.id]);

  const save = async () => {
    if (!form.account_name || !form.balance) { toast('Fill required fields', 'error'); return; }
    setSaving(true);
    const { error } = await supabase.from('chama_funds').insert({
      ...form, chama_id: chama.id, updated_by: member.id,
      balance: parseFloat(form.balance), updated_at: new Date().toISOString()
    });
    if (error) { toast(error.message, 'error'); setSaving(false); return; }
    toast('Fund account updated ✓');
    setAdding(false);
    setForm({ account_name:'', bank_name:'', account_number:'', fund_type:'savings', balance:'', notes:'' });
    const { data } = await supabase.from('chama_funds').select('*').eq('chama_id', chama.id).order('created_at',{ascending:false});
    setFunds(data||[]);
    setSaving(false);
  };

  const totalBalance = funds.reduce((a, f) => a + (parseFloat(f.balance)||0), 0);

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2>Fund Accounts</h2>
          <p className="panel-subtitle">Manage chama fund allocations across accounts</p>
        </div>
        <button className="btn btn-primary" onClick={() => setAdding(!adding)}>
          <Icon name="fund"/> {adding ? 'Cancel' : 'Add / Update Account'}
        </button>
      </div>

      <div className="total-banner">
        <span>Total Funds Under Management</span>
        <strong>KES {totalBalance.toLocaleString()}</strong>
      </div>

      {adding && (
        <div className="form-card">
          <h3>Record Fund Account</h3>
          <div className="form-grid">
            <label>Account Name *
              <input value={form.account_name} onChange={e=>setForm(f=>({...f,account_name:e.target.value}))} placeholder="e.g. KCB Chama Savings"/>
            </label>
            <label>Bank / Institution
              <input value={form.bank_name} onChange={e=>setForm(f=>({...f,bank_name:e.target.value}))} placeholder="e.g. KCB, CIC, Equity"/>
            </label>
            <label>Account Number
              <input value={form.account_number} onChange={e=>setForm(f=>({...f,account_number:e.target.value}))} placeholder="Account or policy number"/>
            </label>
            <label>Fund Type
              <select value={form.fund_type} onChange={e=>setForm(f=>({...f,fund_type:e.target.value}))}>
                {fundTypes.map(t=><option key={t}>{t}</option>)}
              </select>
            </label>
            <label>Current Balance (KES) *
              <input type="number" value={form.balance} onChange={e=>setForm(f=>({...f,balance:e.target.value}))} placeholder="0.00"/>
            </label>
            <label style={{gridColumn:'span 2'}}>Notes
              <input value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Optional notes"/>
            </label>
          </div>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save Fund Account'}
          </button>
        </div>
      )}

      <div className="fund-grid">
        {funds.map(f => {
          const bc = Object.entries(bankColors).find(([k]) => f.bank_name?.toLowerCase().includes(k.toLowerCase()));
          const color = bc?.[1] || '#6366f1';
          return (
            <div key={f.id} className="fund-card" style={{'--fund-color': color}}>
              <div className="fund-bank">{f.bank_name || 'Account'}</div>
              <div className="fund-name">{f.account_name}</div>
              <div className="fund-type-tag">{f.fund_type}</div>
              <div className="fund-balance">KES {Number(f.balance).toLocaleString()}</div>
              {f.account_number && <div className="fund-acno">••••{f.account_number.slice(-4)}</div>}
              <div className="fund-updated">Updated {new Date(f.updated_at||f.created_at).toLocaleDateString('en-KE',{day:'numeric',month:'short'})}</div>
            </div>
          );
        })}
        {funds.length===0 && <div className="empty-state"><Icon name="bank" size={40}/><p>No fund accounts recorded yet</p></div>}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// PANEL: Manage Pins (Treasurer)
// ═══════════════════════════════════════════════════════════════════════════════
const ManagePins = ({ chama, member, toast }) => {
  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState('');
  const [pinModal, setPinModal] = useState(null); // { memberId, name, mode: 'set'|'reset' }
  const [pin, setPin] = useState('');
  const [confirm, setConfirmPin] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('chama_members')
        .select('id, name, phone, role, status, has_pin')
        .eq('chama_id', chama.id).order('name');
      setMembers(data || []);
    })();
  }, [chama.id]);

  const filtered = members.filter(m =>
    m.name?.toLowerCase().includes(search.toLowerCase()) ||
    m.phone?.includes(search)
  );

  const savePin = async () => {
    if (pin.length < 4) { toast('PIN must be at least 4 digits', 'error'); return; }
    if (pin !== confirm) { toast('PINs do not match', 'error'); return; }
    setSaving(true);
    // Store hashed PIN — in production use bcrypt on server; here we store as-is for demo
    const { error } = await supabase.from('chama_members')
      .update({ pin, has_pin: true, pin_set_by: member.id, pin_set_at: new Date().toISOString() })
      .eq('id', pinModal.memberId).eq('chama_id', chama.id);
    if (error) { toast(error.message, 'error'); setSaving(false); return; }
    toast(`PIN ${pinModal.mode === 'set' ? 'set' : 'reset'} for ${pinModal.name} ✓`);
    setPinModal(null); setPin(''); setConfirmPin('');
    const { data } = await supabase.from('chama_members').select('id, name, phone, role, status, has_pin').eq('chama_id', chama.id).order('name');
    setMembers(data||[]);
    setSaving(false);
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2>Member PIN Management</h2>
          <p className="panel-subtitle">Set and reset member access PINs</p>
        </div>
        <input className="search-input" placeholder="Search member…" value={search} onChange={e=>setSearch(e.target.value)}/>
      </div>

      <div className="member-list">
        {filtered.map(m => (
          <div key={m.id} className="member-row">
            <div className="member-avatar">{m.name?.[0]}</div>
            <div className="member-info">
              <strong>{m.name}</strong>
              <span>{m.phone}</span>
            </div>
            <RoleBadge role={m.role}/>
            <span className={`pin-status ${m.has_pin?'has-pin':'no-pin'}`}>
              <Icon name="pin" size={13}/> {m.has_pin ? 'PIN set' : 'No PIN'}
            </span>
            <div className="pin-actions">
              {!m.has_pin && (
                <button className="btn btn-sm btn-primary" onClick={()=>{setPinModal({memberId:m.id,name:m.name,mode:'set'});setPin('');setConfirmPin('');}}>'
                  <Icon name="pin" size={13}/> Set PIN
                </button>
              )}
              {m.has_pin && (
                <button className="btn btn-sm btn-ghost" onClick={()=>{setPinModal({memberId:m.id,name:m.name,mode:'reset'});setPin('');setConfirmPin('');}}>'
                  <Icon name="reset" size={13}/> Reset
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {pinModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3>{pinModal.mode === 'set' ? 'Set PIN' : 'Reset PIN'}</h3>
            <p style={{color:'var(--text-muted)',marginBottom:'1rem'}}>for <strong>{pinModal.name}</strong></p>
            <label>New PIN
              <input type="password" maxLength={6} placeholder="4–6 digits"
                value={pin} onChange={e=>setPin(e.target.value.replace(/\D/,''))}/>
            </label>
            <label style={{marginTop:'0.75rem'}}>Confirm PIN
              <input type="password" maxLength={6} placeholder="Repeat PIN"
                value={confirm} onChange={e=>setConfirmPin(e.target.value.replace(/\D/,''))}/>
            </label>
            <div className="modal-actions" style={{marginTop:'1.25rem'}}>
              <button className="btn btn-ghost" onClick={()=>setPinModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={savePin} disabled={saving}>
                {saving ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// PANEL: Approve Members (Chairperson)
// ═══════════════════════════════════════════════════════════════════════════════
const ApproveMembers = ({ chama, member, toast }) => {
  const [applicants, setApplicants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('pending');
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('chama_members')
      .select('*').eq('chama_id', chama.id).eq('status', filter)
      .order('created_at', { ascending: false });
    if (!error) setApplicants(data || []);
    setLoading(false);
  }, [chama.id, filter]);

  useEffect(() => { load(); }, [load]);

  const act = async (id, status) => {
    const { error } = await supabase.from('chama_members')
      .update({ status, approved_by: member.id, approved_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { toast(error.message, 'error'); return; }
    toast(status === 'active' ? 'Member approved ✓' : 'Application rejected');
    setSelected(null); setConfirm(null); load();
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2>Member Applications</h2>
          <p className="panel-subtitle">Review and approve new membership requests</p>
        </div>
        <div className="filter-tabs">
          {['pending','active','rejected'].map(f=>(
            <button key={f} className={`filter-tab ${filter===f?'active':''}`} onClick={()=>setFilter(f)}>{f}</button>
          ))}
        </div>
      </div>

      {loading ? <div className="skeleton-list">{[...Array(3)].map((_,i)=><div key={i} className="skeleton-row"/>)}</div> : (
        <div className="member-list">
          {applicants.length===0 && <div className="empty-state"><Icon name="member" size={40}/><p>No {filter} applications</p></div>}
          {applicants.map(a => (
            <div key={a.id} className={`member-row expandable ${selected?.id===a.id?'expanded':''}`} onClick={()=>setSelected(selected?.id===a.id?null:a)}>
              <div className="member-avatar">{a.name?.[0]}</div>
              <div className="member-info">
                <strong>{a.name}</strong>
                <span>{a.phone}</span>
              </div>
              <RoleBadge role={a.role||'member'}/>
              <StatusPill status={a.status}/>
              <Icon name="chevron" size={16}/>

              {selected?.id===a.id && (
                <div className="expand-detail" onClick={e=>e.stopPropagation()}>
                  <div className="detail-grid">
                    <div className="detail-row"><span>ID/Passport</span><strong>{a.id_number||'—'}</strong></div>
                    <div className="detail-row"><span>Next of Kin</span><strong>{a.next_of_kin||'—'}</strong></div>
                    <div className="detail-row"><span>Joined</span><strong>{new Date(a.created_at).toLocaleDateString('en-KE')}</strong></div>
                    <div className="detail-row"><span>Email</span><strong>{a.email||'—'}</strong></div>
                  </div>
                  {filter==='pending' && (
                    <div className="action-row">
                      <button className="btn btn-success" onClick={()=>setConfirm({id:a.id,action:'active',name:a.name})}>
                        <Icon name="approve"/> Approve Membership
                      </button>
                      <button className="btn btn-danger" onClick={()=>setConfirm({id:a.id,action:'rejected',name:a.name})}>
                        <Icon name="reject"/> Reject
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {confirm && <ConfirmModal
        message={`${confirm.action==='active'?'Approve':'Reject'} membership for ${confirm.name}?`}
        onConfirm={()=>act(confirm.id,confirm.action)}
        onCancel={()=>setConfirm(null)}
      />}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// PANEL: Upload Documents (Secretary)
// ═══════════════════════════════════════════════════════════════════════════════
const UploadDocuments = ({ chama, member, toast }) => {
  const [docs, setDocs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [form, setForm] = useState({ title:'', doc_type:'minutes', description:'' });
  const [file, setFile] = useState(null);
  const inputRef = React.useRef();

  const docTypes = ['minutes','constitution','agreement','policy','resolution','circular','other'];

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('chama_documents')
        .select('*').eq('chama_id', chama.id).order('created_at',{ascending:false});
      setDocs(data||[]);
    })();
  }, [chama.id]);

  const handleDrop = e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if(f) setFile(f); };

  const upload = async () => {
    if (!file || !form.title) { toast('Provide a title and select a file', 'error'); return; }
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${chama.chama_no}/${Date.now()}_${form.doc_type}.${ext}`;
    const { error: upErr } = await supabase.storage.from('chama-docs').upload(path, file);
    if (upErr) { toast(upErr.message, 'error'); setUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from('chama-docs').getPublicUrl(path);
    const { error: dbErr } = await supabase.from('chama_documents').insert({
      chama_id: chama.id, uploaded_by: member.id, title: form.title,
      doc_type: form.doc_type, description: form.description,
      file_url: publicUrl, file_name: file.name, file_size: file.size,
    });
    if (dbErr) { toast(dbErr.message, 'error'); setUploading(false); return; }
    toast('Document uploaded ✓');
    setFile(null); setForm({ title:'', doc_type:'minutes', description:'' });
    const { data } = await supabase.from('chama_documents').select('*').eq('chama_id',chama.id).order('created_at',{ascending:false});
    setDocs(data||[]);
    setUploading(false);
  };

  const iconForType = t => ({ minutes:'📋', constitution:'📜', agreement:'🤝', policy:'📑', resolution:'⚖️', circular:'📢', other:'📄' })[t]||'📄';

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2>Chama Documents</h2>
          <p className="panel-subtitle">Upload and manage official chama documents</p>
        </div>
      </div>

      <div className="form-card">
        <h3>Upload New Document</h3>
        <div className="form-grid">
          <label>Document Title *
            <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="e.g. Minutes – Jan 2025"/>
          </label>
          <label>Document Type
            <select value={form.doc_type} onChange={e=>setForm(f=>({...f,doc_type:e.target.value}))}>
              {docTypes.map(t=><option key={t}>{t}</option>)}
            </select>
          </label>
          <label style={{gridColumn:'span 2'}}>Description
            <input value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Brief description (optional)"/>
          </label>
        </div>

        <div className={`dropzone ${dragOver?'drag-over':''} ${file?'has-file':''}`}
          onDragOver={e=>{e.preventDefault();setDragOver(true)}}
          onDragLeave={()=>setDragOver(false)}
          onDrop={handleDrop}
          onClick={()=>inputRef.current.click()}>
          <input ref={inputRef} type="file" accept=".pdf,.doc,.docx,.jpg,.png" style={{display:'none'}} onChange={e=>setFile(e.target.files[0])}/>
          {file ? (
            <div className="file-preview">
              <Icon name="doc" size={28}/>
              <span>{file.name}</span>
              <small>{(file.size/1024).toFixed(1)} KB</small>
            </div>
          ) : (
            <div className="dropzone-empty">
              <Icon name="upload" size={32}/>
              <p>Drop file here or click to browse</p>
              <small>PDF, Word, JPEG, PNG — max 10MB</small>
            </div>
          )}
        </div>

        <button className="btn btn-primary" onClick={upload} disabled={uploading}>
          {uploading ? 'Uploading…' : <><Icon name="upload"/> Upload Document</>}
        </button>
      </div>

      <div className="doc-grid">
        {docs.map(d => (
          <a key={d.id} href={d.file_url} target="_blank" rel="noreferrer" className="doc-card">
            <div className="doc-icon">{iconForType(d.doc_type)}</div>
            <div className="doc-info">
              <strong>{d.title}</strong>
              <span className="doc-type-tag">{d.doc_type}</span>
              <p>{d.description}</p>
              <small>{new Date(d.created_at).toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'numeric'})}</small>
            </div>
            <Icon name="eye" size={16}/>
          </a>
        ))}
        {docs.length===0 && <div className="empty-state"><Icon name="doc" size={40}/><p>No documents uploaded yet</p></div>}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// PANEL: Chairperson Tasks
// ═══════════════════════════════════════════════════════════════════════════════
const ChairTasks = ({ chama, member, toast }) => {
  const [stats, setStats] = useState({ pending_members: 0, pending_sends: 0, docs: 0, active_members: 0 });

  useEffect(() => {
    (async () => {
      const [mem, sends, docs, active] = await Promise.all([
        supabase.from('chama_members').select('id',{count:'exact'}).eq('chama_id',chama.id).eq('status','pending'),
        supabase.from('chama_contributions').select('id',{count:'exact'}).eq('chama_id',chama.id).eq('status','pending'),
        supabase.from('chama_documents').select('id',{count:'exact'}).eq('chama_id',chama.id),
        supabase.from('chama_members').select('id',{count:'exact'}).eq('chama_id',chama.id).eq('status','active'),
      ]);
      setStats({
        pending_members: mem.count||0,
        pending_sends: sends.count||0,
        docs: docs.count||0,
        active_members: active.count||0,
      });
    })();
  }, [chama.id]);

  const quickActions = [
    { label: 'Pending Memberships', count: stats.pending_members, color: '#6366f1', action: 'members', icon: 'member' },
    { label: 'Pending Contributions', count: stats.pending_sends, color: '#f59e0b', action: 'send', icon: 'send' },
    { label: 'Chama Documents', count: stats.docs, color: '#10b981', action: 'docs', icon: 'doc' },
    { label: 'Active Members', count: stats.active_members, color: '#3b82f6', action: null, icon: 'member' },
  ];

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2>Chairperson Overview</h2>
          <p className="panel-subtitle">{chama.name} · {chama.chama_no}</p>
        </div>
      </div>

      <div className="stats-grid">
        {quickActions.map((q,i) => (
          <div key={i} className="stat-card" style={{'--stat-color': q.color}}>
            <div className="stat-icon"><Icon name={q.icon} size={22}/></div>
            <div className="stat-count">{q.count}</div>
            <div className="stat-label">{q.label}</div>
            {q.count > 0 && q.action && (
              <div className="stat-badge">Needs attention</div>
            )}
          </div>
        ))}
      </div>

      <div className="chair-note">
        <Icon name="alert" size={16}/>
        <span>As Chairperson, use the <strong>Members</strong> tab to approve new applications and the <strong>Approve Send</strong> tab to oversee contributions. Resolutions and policy changes should be uploaded under Documents by the Secretary.</span>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN: ChamaOfficials
// ═══════════════════════════════════════════════════════════════════════════════
const ChamaOfficials = () => {
  const { chama, member } = useChama();
  const { toasts, push: toast } = useToast();
  const role = member?.role;

  // Define which tabs each role can see
  const allTabs = [
    { id: 'overview',  label: 'Overview',        icon: 'eye',    roles: ['chairperson','admin'] },
    { id: 'send',      label: 'Approve Send',     icon: 'send',   roles: ['treasurer','admin'] },
    { id: 'funds',     label: 'Update Funds',     icon: 'fund',   roles: ['treasurer','admin'] },
    { id: 'pins',      label: 'Member PINs',      icon: 'pin',    roles: ['treasurer','admin'] },
    { id: 'members',   label: 'Approve Members',  icon: 'member', roles: ['chairperson','admin'] },
    { id: 'docs',      label: 'Documents',        icon: 'doc',    roles: ['secretary','admin'] },
  ];

  const tabs = allTabs.filter(t => t.roles.includes(role));
  const [activeTab, setActiveTab] = useState(tabs[0]?.id || 'send');

  if (!chama || !member) return <div className="officials-loading">Loading officials panel…</div>;

  if (tabs.length === 0) {
    return (
      <div className="officials-wrap">
        <div className="access-denied">
          <Icon name="pin" size={48}/>
          <h2>Officials Access Only</h2>
          <p>This section is restricted to chama officials.<br/>Contact your Chairperson or Treasurer for access.</p>
        </div>
      </div>
    );
  }

  const renderPanel = () => {
    const props = { chama, member, toast };
    switch (activeTab) {
      case 'overview': return <ChairTasks {...props}/>;
      case 'send':     return <ApproveSend {...props}/>;
      case 'funds':    return <UpdateFunds {...props}/>;
      case 'pins':     return <ManagePins {...props}/>;
      case 'members':  return <ApproveMembers {...props}/>;
      case 'docs':     return <UploadDocuments {...props}/>;
      default:         return null;
    }
  };

  return (
    <div className="officials-wrap">
      <ToastStack toasts={toasts}/>

      {/* Officials Header */}
      <div className="officials-header">
        <div className="officials-title-block">
          <div className="officials-eyebrow">Officials Panel</div>
          <h1 className="officials-title">{chama.name}</h1>
          <div className="officials-meta">
            <span>{chama.chama_no}</span>
            <RoleBadge role={role}/>
          </div>
        </div>
      </div>

      {/* Tab nav */}
      <nav className="officials-nav">
        {tabs.map(t => (
          <button key={t.id}
            className={`officials-tab ${activeTab===t.id?'active':''}`}
            onClick={() => setActiveTab(t.id)}>
            <Icon name={t.icon} size={16}/>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      {/* Panel */}
      <div className="officials-content">
        {renderPanel()}
      </div>
    </div>
  );
};

export default ChamaOfficials;