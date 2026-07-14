import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "../../supabaseClient";
import { useChama } from "../ChamaContext";
import { CalendarPlus, MapPin, Wallet, CheckSquare, Square, Plus, X, Loader2, Lock, Trash2 } from "lucide-react";
import "./WelfareEventPlanner.css";

// -----------------------------------------------------------------------------
// WelfareEventPlanner (NEW)
// Welfare-officer-managed. Plans an event — a fundraiser, a hospital visit,
// a memorial gathering, a wedding send-off — and gives it a task checklist.
// Can optionally be linked to an open welfare_case so a fundraiser event and
// its case share the same beneficiary/target.
// -----------------------------------------------------------------------------

const EVENT_TYPES = [
  { value: "fundraiser", label: "Fundraiser" },
  { value: "gathering", label: "Gathering" },
  { value: "visit", label: "Visit" },
  { value: "ceremony", label: "Ceremony" },
  { value: "other", label: "Other" },
];

const STATUS_FLOW = ["planned", "ongoing", "completed", "cancelled"];

function formatKES(v) { return `KES ${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`; }

const emptyForm = { title: "", event_type: "gathering", event_date: "", location: "", description: "", budget: "", case_id: "" };

export default function WelfareEventPlanner({ chamaId: chamaIdProp }) {
  const { chama, member, hasRole } = useChama();
  const chamaId = chamaIdProp || chama?.id;
  const canManage = hasRole(["welfare_officer", "admin"]);
  const canView = canManage || hasRole(["chairperson", "treasurer", "secretary"]);

  const [events, setEvents] = useState([]);
  const [openCases, setOpenCases] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const [activeEvent, setActiveEvent] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState({ task: "", assignee_member_id: "", due_date: "" });

  const load = useCallback(async () => {
    if (!chamaId) return;
    setLoading(true);
    const [eventsRes, casesRes, membersRes] = await Promise.all([
      supabase.from("welfare_events").select("*").eq("chama_id", chamaId).order("event_date", { ascending: true }),
      supabase.from("welfare_cases").select("id,title").eq("chama_id", chamaId).eq("status", "open"),
      supabase.from("chama_members").select("id,name").eq("chama_id", chamaId).eq("status", "active"),
    ]);
    setEvents(eventsRes.data || []);
    setOpenCases(casesRes.data || []);
    setMembers(membersRes.data || []);
    setLoading(false);
  }, [chamaId]);

  useEffect(() => { load(); }, [load]);

  const createEvent = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSubmitting(true);
    const { error } = await supabase.from("welfare_events").insert([{
      chama_id: chamaId,
      case_id: form.case_id || null,
      title: form.title,
      event_type: form.event_type,
      event_date: form.event_date || null,
      location: form.location || null,
      description: form.description || null,
      budget: Number(form.budget) || 0,
      status: "planned",
      created_by: member.id,
    }]);
    setSubmitting(false);
    if (!error) {
      setForm(emptyForm);
      setFormOpen(false);
      load();
    }
  };

  const openEvent = async (ev) => {
    setActiveEvent(ev);
    const { data } = await supabase.from("welfare_event_tasks").select("*").eq("event_id", ev.id).order("due_date", { ascending: true });
    setTasks(data || []);
  };

  const addTask = async () => {
    if (!newTask.task.trim()) return;
    const { error } = await supabase.from("welfare_event_tasks").insert([{
      event_id: activeEvent.id, task: newTask.task, assignee_member_id: newTask.assignee_member_id || null, due_date: newTask.due_date || null,
    }]);
    if (!error) {
      setNewTask({ task: "", assignee_member_id: "", due_date: "" });
      openEvent(activeEvent);
    }
  };

  const toggleTask = async (task) => {
    const next = task.status === "done" ? "pending" : "done";
    await supabase.from("welfare_event_tasks").update({ status: next }).eq("id", task.id);
    openEvent(activeEvent);
  };

  const removeTask = async (taskId) => {
    await supabase.from("welfare_event_tasks").delete().eq("id", taskId);
    openEvent(activeEvent);
  };

  const advanceStatus = async (status) => {
    await supabase.from("welfare_events").update({ status }).eq("id", activeEvent.id);
    setActiveEvent((e) => ({ ...e, status }));
    load();
  };

  const memberName = (id) => members.find((m) => m.id === id)?.name || "Unassigned";

  if (!canView) {
    return (
      <div className="wep-locked">
        <Lock size={18} />
        <p>Event planning is managed by the welfare officer.</p>
      </div>
    );
  }

  return (
    <div className="wep-page">
      <div className="wep-header">
        <div>
          <h2>Welfare Events</h2>
          <p>Plan fundraisers, visits and gatherings, with a task checklist for each.</p>
        </div>
        {canManage && (
          <button className="wep-new-btn" onClick={() => setFormOpen((v) => !v)}>
            <CalendarPlus size={16} /> Plan an event
          </button>
        )}
      </div>

      {formOpen && (
        <form className="wep-form" onSubmit={createEvent}>
          <div className="wep-form-grid">
            <label>
              Title
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Fundraiser for hospital bill" required />
            </label>
            <label>
              Type
              <select value={form.event_type} onChange={(e) => setForm((f) => ({ ...f, event_type: e.target.value }))}>
                {EVENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label>
              Date
              <input type="date" value={form.event_date} onChange={(e) => setForm((f) => ({ ...f, event_date: e.target.value }))} />
            </label>
            <label>
              Location
              <input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="e.g. Chairman's home, Kikuyu" />
            </label>
            <label>
              Budget (KES)
              <input type="number" min="0" value={form.budget} onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))} />
            </label>
            <label>
              Linked case (optional)
              <select value={form.case_id} onChange={(e) => setForm((f) => ({ ...f, case_id: e.target.value }))}>
                <option value="">None</option>
                {openCases.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </label>
            <label className="wep-span-2">
              Description
              <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </label>
          </div>
          <div className="wep-form-actions">
            <button type="button" className="wep-cancel" onClick={() => setFormOpen(false)}>Cancel</button>
            <button type="submit" className="wep-submit" disabled={submitting}>
              {submitting ? <Loader2 size={15} className="spin" /> : "Create event"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="wep-loading"><Loader2 size={20} className="spin" /></div>
      ) : events.length === 0 ? (
        <div className="wep-empty"><CalendarPlus size={22} /><p>No events planned yet.</p></div>
      ) : (
        <div className="wep-grid">
          {events.map((ev) => (
            <div className="wep-card" key={ev.id} onClick={() => openEvent(ev)}>
              <div className="wep-card-top">
                <h3>{ev.title}</h3>
                <span className={`wep-status ${ev.status}`}>{ev.status}</span>
              </div>
              <p className="wep-meta">{ev.event_type} {ev.event_date ? `· ${ev.event_date}` : ""}</p>
              {ev.location && <p className="wep-loc"><MapPin size={12} /> {ev.location}</p>}
              {ev.budget > 0 && <p className="wep-budget"><Wallet size={12} /> {formatKES(ev.budget)}</p>}
            </div>
          ))}
        </div>
      )}

      {activeEvent && (
        <div className="wep-modal-overlay" onClick={() => setActiveEvent(null)}>
          <div className="wep-modal" onClick={(e) => e.stopPropagation()}>
            <div className="wep-modal-head">
              <div>
                <h3>{activeEvent.title}</h3>
                <p>{activeEvent.event_type} {activeEvent.event_date ? `· ${activeEvent.event_date}` : ""}</p>
              </div>
              <button onClick={() => setActiveEvent(null)}><X size={18} /></button>
            </div>

            {canManage && (
              <div className="wep-status-row">
                {STATUS_FLOW.map((s) => (
                  <button key={s} className={`wep-status-chip ${activeEvent.status === s ? "active" : ""}`} onClick={() => advanceStatus(s)}>{s}</button>
                ))}
              </div>
            )}

            <h4>Task checklist</h4>
            <div className="wep-task-list">
              {tasks.length === 0 && <p className="wep-empty-inline">No tasks yet.</p>}
              {tasks.map((t) => (
                <div className="wep-task-row" key={t.id}>
                  <button className="wep-task-check" onClick={() => canManage && toggleTask(t)}>
                    {t.status === "done" ? <CheckSquare size={16} /> : <Square size={16} />}
                  </button>
                  <div className="wep-task-body">
                    <span className={t.status === "done" ? "done" : ""}>{t.task}</span>
                    <small>{memberName(t.assignee_member_id)}{t.due_date ? ` · due ${t.due_date}` : ""}</small>
                  </div>
                  {canManage && (
                    <button className="wep-task-remove" onClick={() => removeTask(t.id)}><Trash2 size={13} /></button>
                  )}
                </div>
              ))}
            </div>

            {canManage && (
              <div className="wep-add-task">
                <input placeholder="New task" value={newTask.task} onChange={(e) => setNewTask((t) => ({ ...t, task: e.target.value }))} />
                <select value={newTask.assignee_member_id} onChange={(e) => setNewTask((t) => ({ ...t, assignee_member_id: e.target.value }))}>
                  <option value="">Assign to...</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <input type="date" value={newTask.due_date} onChange={(e) => setNewTask((t) => ({ ...t, due_date: e.target.value }))} />
                <button onClick={addTask}><Plus size={14} /></button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
