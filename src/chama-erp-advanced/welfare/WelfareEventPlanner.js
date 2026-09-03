import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { supabase } from "../../supabaseClient";
import { useChama } from "../ChamaContext";
import {
  CalendarPlus,
  MapPin,
  Wallet,
  CheckSquare,
  Square,
  Plus,
  X,
  Loader2,
  Lock,
  Trash2,
  Search,
  Download,
  Users,
  Clock,
  MessageSquare,
  Paperclip,
  ChevronRight,
  CheckCircle2,
  Calendar,
  GripVertical,
  Repeat,
  FileText,
  BarChart3,
  LayoutGrid,
  List,
  ListChecks,
  HandCoins,
} from "lucide-react";
import { format, parseISO, isPast, isFuture, isToday, differenceInDays } from "date-fns";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Toaster, toast } from "sonner";
import {
  formatKES, toCSV, CONTRIBUTION_SOURCES, PAYMENT_METHODS,
  contributorDisplayName, outstandingAmount, pledgeStatusLabel, logAudit,
} from "./welfareFormat";
import "./WelfareEventPlanner.css";

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------
function cn(...inputs) {
  return inputs.filter(Boolean).join(" ");
}

function classForStatus(status) {
  switch (status) {
    case "planned": return "bg-amber-100 text-amber-800 border-amber-200";
    case "ongoing": return "bg-sky-100 text-sky-800 border-sky-200";
    case "completed": return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "cancelled": return "bg-rose-100 text-rose-800 border-rose-200";
    default: return "bg-gray-100 text-gray-800 border-gray-200";
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const EVENT_TYPES = [
  { value: "fundraiser", label: "Fundraiser", icon: Wallet, color: "text-emerald-600" },
  { value: "gathering", label: "Gathering", icon: Users, color: "text-violet-600" },
  { value: "visit", label: "Visit", icon: MapPin, color: "text-sky-600" },
  { value: "ceremony", label: "Ceremony", icon: Calendar, color: "text-amber-600" },
  { value: "meeting", label: "Meeting", icon: MessageSquare, color: "text-indigo-600" },
  { value: "other", label: "Other", icon: FileText, color: "text-gray-600" },
];

const STATUS_FLOW = ["planned", "ongoing", "completed", "cancelled"];

const PRIORITY_STYLES = {
  low: "bg-slate-100 text-slate-700 border-slate-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  high: "bg-rose-50 text-rose-700 border-rose-200",
};

const VIEW_MODES = ["grid", "list", "calendar", "analytics"];

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------
function useRealtimeEvents(chamaId) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!chamaId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("welfare_events")
      .select("*")
      .eq("chama_id", chamaId)
      .order("event_date", { ascending: false });
    if (error) toast.error(`Couldn't load events: ${error.message}`);
    else setEvents(data || []);
    setLoading(false);
  }, [chamaId]);

  useEffect(() => {
    load();
    if (!chamaId) return;
    const channel = supabase
      .channel(`welfare_events:${chamaId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "welfare_events", filter: `chama_id=eq.${chamaId}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setEvents((prev) => [payload.new, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setEvents((prev) => prev.map((e) => (e.id === payload.new.id ? payload.new : e)));
          } else if (payload.eventType === "DELETE") {
            setEvents((prev) => prev.filter((e) => e.id !== payload.old.id));
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [chamaId, load]);

  return { events, loading, refresh: load };
}

function useEventDetails(eventId) {
  const [tasks, setTasks] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [contributions, setContributions] = useState([]);
  const [comments, setComments] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [budgetLines, setBudgetLines] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    const [tRes, aRes, cRes, cmRes, atRes, blRes] = await Promise.all([
      supabase.from("welfare_event_tasks").select("*").eq("event_id", eventId).order("sort_order", { ascending: true }),
      supabase.from("welfare_event_attendance").select("*").eq("event_id", eventId),
      supabase.from("welfare_event_contributions").select("*").eq("event_id", eventId).order("paid_at", { ascending: false }),
      supabase.from("welfare_event_comments").select("*, member:member_id(name, avatar_url)").eq("event_id", eventId).order("created_at", { ascending: true }),
      supabase.from("welfare_event_attachments").select("*").eq("event_id", eventId).order("created_at", { ascending: false }),
      supabase.from("welfare_event_budget_lines").select("*").eq("event_id", eventId).order("created_at", { ascending: true }),
    ]);
    setTasks(tRes.data || []);
    setAttendance(aRes.data || []);
    setContributions(cRes.data || []);
    setComments(cmRes.data || []);
    setAttachments(atRes.data || []);
    setBudgetLines(blRes.data || []);
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    load();
    if (!eventId) return;
    const channel = supabase
      .channel(`event_details:${eventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "welfare_event_tasks", filter: `event_id=eq.${eventId}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "welfare_event_contributions", filter: `event_id=eq.${eventId}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "welfare_event_comments", filter: `event_id=eq.${eventId}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "welfare_event_attendance", filter: `event_id=eq.${eventId}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "welfare_event_budget_lines", filter: `event_id=eq.${eventId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [eventId, load]);

  return { tasks, attendance, contributions, comments, attachments, budgetLines, loading, refresh: load, setTasks };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EventAnalytics({ events, members }) {
  const stats = useMemo(() => {
    const totalBudget = events.reduce((s, e) => s + (e.budget || 0), 0);
    const totalActual = events.reduce((s, e) => s + (e.actual_cost || 0), 0);
    const byType = EVENT_TYPES.map((t) => ({
      ...t,
      count: events.filter((e) => e.event_type === t.value).length,
      budget: events.filter((e) => e.event_type === t.value).reduce((s, e) => s + (e.budget || 0), 0),
    }));
    const byStatus = STATUS_FLOW.map((s) => ({
      status: s,
      count: events.filter((e) => e.status === s).length,
    }));
    const upcoming = events.filter((e) => e.event_date && isFuture(parseISO(e.event_date)) && e.status !== "cancelled");
    const overdue = events.filter((e) => e.event_date && isPast(parseISO(e.event_date)) && e.status === "planned");
    return { totalBudget, totalActual, byType, byStatus, upcoming: upcoming.length, overdue: overdue.length };
  }, [events]);

  return (
    <div className="wep-analytics">
      <div className="wep-stat-grid">
        <div className="wep-stat-card">
          <div className="wep-stat-icon bg-emerald-50 text-emerald-600"><Calendar size={20} /></div>
          <div>
            <div className="wep-stat-value">{events.length}</div>
            <div className="wep-stat-label">Total Events</div>
          </div>
        </div>
        <div className="wep-stat-card">
          <div className="wep-stat-icon bg-sky-50 text-sky-600"><Wallet size={20} /></div>
          <div>
            <div className="wep-stat-value">{formatKES(stats.totalBudget)}</div>
            <div className="wep-stat-label">Total Budget</div>
          </div>
        </div>
        <div className="wep-stat-card">
          <div className="wep-stat-icon bg-amber-50 text-amber-600"><BarChart3 size={20} /></div>
          <div>
            <div className="wep-stat-value">{formatKES(stats.totalActual)}</div>
            <div className="wep-stat-label">Actual Spent</div>
          </div>
        </div>
        <div className="wep-stat-card">
          <div className="wep-stat-icon bg-rose-50 text-rose-600"><Clock size={20} /></div>
          <div>
            <div className="wep-stat-value">{stats.overdue}</div>
            <div className="wep-stat-label">Overdue</div>
          </div>
        </div>
      </div>

      <div className="wep-analytics-sections">
        <div className="wep-analytics-panel">
          <h4>By Type</h4>
          <div className="wep-type-bars">
            {stats.byType.map((t) => (
              <div key={t.value} className="wep-type-bar-row">
                <span className={cn("wep-type-dot", t.color)}><t.icon size={14} /></span>
                <span className="wep-type-name">{t.label}</span>
                <div className="wep-type-track"><div className="wep-type-fill" style={{ width: `${events.length ? (t.count / events.length) * 100 : 0}%` }} /></div>
                <span className="wep-type-count">{t.count}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="wep-analytics-panel">
          <h4>By Status</h4>
          <div className="wep-status-donut">
            {stats.byStatus.map((s) => (
              <div key={s.status} className={cn("wep-status-seg", s.status)}>
                <span className="wep-status-seg-count">{s.count}</span>
                <span className="wep-status-seg-name">{s.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function EventCalendar({ events, onSelect }) {
  const [month, setMonth] = useState(new Date());
  const days = useMemo(() => {
    const start = new Date(month.getFullYear(), month.getMonth(), 1);
    const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const startDay = start.getDay();
    const totalDays = end.getDate();
    const cells = [];
    for (let i = 0; i < startDay; i++) cells.push({ date: null, events: [] });
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = format(new Date(month.getFullYear(), month.getMonth(), d), "yyyy-MM-dd");
      cells.push({ date: d, events: events.filter((e) => e.event_date === dateStr) });
    }
    return cells;
  }, [month, events]);

  return (
    <div className="wep-calendar">
      <div className="wep-cal-header">
        <button onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1))}><ChevronRight size={16} style={{ transform: "rotate(180deg)" }} /></button>
        <h4>{format(month, "MMMM yyyy")}</h4>
        <button onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1))}><ChevronRight size={16} /></button>
      </div>
      <div className="wep-cal-grid">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="wep-cal-day-label">{d}</div>
        ))}
        {days.map((cell, i) => (
          <div key={i} className={cn("wep-cal-cell", !cell.date && "empty", cell.date && isToday(new Date(month.getFullYear(), month.getMonth(), cell.date)) && "today")}>
            {cell.date && <span className="wep-cal-date">{cell.date}</span>}
            {cell.events.map((e) => (
              <button key={e.id} className={cn("wep-cal-event", e.status)} onClick={() => onSelect(e)} title={e.title}>
                {e.title}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
const emptyForm = {
  title: "",
  event_type: "gathering",
  event_date: "",
  location: "",
  description: "",
  budget: 0,
  case_id: null,
  status: "planned",
  is_recurring: false,
  recurrence_rule: null,
  parent_event_id: null,
  actual_cost: null,
  reminder_sent: false,
  template_id: "",
};

export default function WelfareEventPlanner({ chamaId: chamaIdProp }) {
  const { chama, member, hasRole } = useChama();
  const chamaId = chamaIdProp || chama?.id;
  const canManage = hasRole(["welfare_officer", "admin"]);
  const canView = canManage || hasRole(["chairperson", "treasurer", "secretary"]);

  const { events, loading, refresh } = useRealtimeEvents(chamaId);
  const [members, setMembers] = useState([]);
  const [openCases, setOpenCases] = useState([]);
  const [templates, setTemplates] = useState([]);

  const [viewMode, setViewMode] = useState("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("date");

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [submitting, setSubmitting] = useState(false);
  const [activeEvent, setActiveEvent] = useState(null);
  const [detailTab, setDetailTab] = useState("tasks");

  // Load auxiliary data
  useEffect(() => {
    if (!chamaId) return;
    Promise.all([
      supabase.from("chama_members").select("id,name,avatar_url").eq("chama_id", chamaId).eq("status", "active"),
      supabase.from("welfare_cases").select("id,title,target_amount,raised_amount").eq("chama_id", chamaId).eq("status", "open"),
      supabase.from("event_templates").select("*").eq("chama_id", chamaId),
    ]).then(([mRes, cRes, tRes]) => {
      setMembers(mRes.data || []);
      setOpenCases(cRes.data || []);
      setTemplates(tRes.data || []);
    });
  }, [chamaId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") { setActiveEvent(null); setFormOpen(false); }
      if (e.key === "n" && e.ctrlKey && canManage) { e.preventDefault(); setFormOpen(true); }
      if (e.key === "/") { e.preventDefault(); document.getElementById("wep-search")?.focus(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [canManage]);

  // Filtered & sorted events
  const filteredEvents = useMemo(() => {
    let res = [...events];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      res = res.filter((e) => e.title.toLowerCase().includes(q) || (e.location || "").toLowerCase().includes(q));
    }
    if (statusFilter !== "all") res = res.filter((e) => e.status === statusFilter);
    if (typeFilter !== "all") res = res.filter((e) => e.event_type === typeFilter);
    res.sort((a, b) => {
      if (sortBy === "date") return (b.event_date || "").localeCompare(a.event_date || "");
      if (sortBy === "budget") return (b.budget || 0) - (a.budget || 0);
      return (b.created_at || "").localeCompare(a.created_at || "");
    });
    return res;
  }, [events, searchQuery, statusFilter, typeFilter, sortBy]);

  const createEvent = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !chamaId) return;
    setSubmitting(true);
    const payload = {
      chama_id: chamaId,
      case_id: form.case_id || null,
      title: form.title.trim(),
      event_type: form.event_type,
      event_date: form.event_date || null,
      location: form.location?.trim() || null,
      description: form.description?.trim() || null,
      budget: Number(form.budget) || 0,
      status: "planned",
      created_by: member.id,
      is_recurring: form.is_recurring,
      recurrence_rule: form.is_recurring ? form.recurrence_rule : null,
      actual_cost: null,
      reminder_sent: false,
    };
    const { data: eventData, error } = await supabase.from("welfare_events").insert([payload]).select().single();
    if (!error && eventData) {
      const template = templates.find((t) => t.id === form.template_id);
      if (template?.default_tasks?.length) {
        const { error: taskErr } = await supabase.from("welfare_event_tasks").insert(
          template.default_tasks.map((t, i) => ({
            event_id: eventData.id,
            task: t.task,
            priority: t.priority,
            status: "pending",
            sort_order: i,
          }))
        );
        if (taskErr) toast.error(`Event created, but template tasks couldn't be added: ${taskErr.message}`);
      }
      toast.success("Event created successfully");
      setForm({ ...emptyForm });
      setFormOpen(false);
      refresh();
    } else {
      toast.error("Failed to create event");
    }
    setSubmitting(false);
  };

  const exportCSV = () => {
    if (filteredEvents.length === 0) {
      toast.error("No events to export — clear or adjust your filters first");
      return;
    }
    const rows = filteredEvents.map((e) => ({
      Title: e.title,
      Type: e.event_type,
      Date: e.event_date || "",
      Location: e.location || "",
      Budget: e.budget,
      Status: e.status,
      Description: e.description || "",
    }));
    // toCSV properly escapes embedded quotes/commas/newlines (e.g. in Description),
    // which the previous plain `"${v}"` template would corrupt.
    const csv = toCSV(rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `welfare-events-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  if (!canView) {
    return (
      <div className="wep-locked">
        <Lock size={18} />
        <p>Event planning is managed by the welfare officer and committee.</p>
      </div>
    );
  }

  return (
    <div className="wep-page">
      <Toaster position="top-right" richColors />

      {/* Header */}
      <div className="wep-header">
        <div>
          <h2 className="wep-title">Welfare Events</h2>
          <p className="wep-subtitle">Plan fundraisers, visits, ceremonies and gatherings. Track tasks, attendance, contributions and files.</p>
        </div>
        <div className="wep-header-actions">
          <div className="wep-view-toggle">
            {VIEW_MODES.map((m) => (
              <button key={m} className={cn("wep-view-btn", viewMode === m && "active")} onClick={() => setViewMode(m)} title={m}>
                {m === "grid" && <LayoutGrid size={16} />}
                {m === "list" && <List size={16} />}
                {m === "calendar" && <Calendar size={16} />}
                {m === "analytics" && <BarChart3 size={16} />}
              </button>
            ))}
          </div>
          {canManage && (
            <button className="wep-new-btn" onClick={() => setFormOpen((v) => !v)}>
              <CalendarPlus size={16} /> Plan event <kbd className="wep-kbd">Ctrl+N</kbd>
            </button>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="wep-toolbar">
        <div className="wep-search-wrap">
          <Search size={15} className="wep-search-icon" />
          <input
            id="wep-search"
            className="wep-search"
            placeholder="Search events..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <kbd className="wep-kbd">/</kbd>
        </div>
        <select className="wep-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All Statuses</option>
          {STATUS_FLOW.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="wep-filter" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">All Types</option>
          {EVENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select className="wep-filter" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="date">Sort by Date</option>
          <option value="budget">Sort by Budget</option>
          <option value="created">Sort by Created</option>
        </select>
        <button className="wep-export-btn" onClick={exportCSV} title="Export CSV" disabled={filteredEvents.length === 0}>
          <Download size={15} /> Export
        </button>
      </div>

      {/* Create Form */}
      {formOpen && (
        <form className="wep-form-card" onSubmit={createEvent}>
          <div className="wep-form-header">
            <h4><CalendarPlus size={16} /> New Event</h4>
            <button type="button" className="wep-form-close" onClick={() => setFormOpen(false)}><X size={16} /></button>
          </div>
          <div className="wep-form-grid">
            <label className="wep-field">
              <span>Title <span className="wep-req">*</span></span>
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Fundraiser for hospital bill" required />
            </label>
            <label className="wep-field">
              <span>Type</span>
              <select value={form.event_type} onChange={(e) => setForm((f) => ({ ...f, event_type: e.target.value }))}>
                {EVENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label className="wep-field">
              <span>Date</span>
              <input type="date" value={form.event_date} onChange={(e) => setForm((f) => ({ ...f, event_date: e.target.value }))} />
            </label>
            <label className="wep-field">
              <span>Location</span>
              <input value={form.location || ""} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="e.g. Chairman's home, Kikuyu" />
            </label>
            <label className="wep-field">
              <span>Budget (KES)</span>
              <input type="number" min="0" value={form.budget || ""} onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))} />
            </label>
            <label className="wep-field">
              <span>Linked case</span>
              <select value={form.case_id || ""} onChange={(e) => setForm((f) => ({ ...f, case_id: e.target.value || null }))}>
                <option value="">None</option>
                {openCases.map((c) => <option key={c.id} value={c.id}>{c.title} ({formatKES(c.raised_amount)}/{formatKES(c.target_amount)})</option>)}
              </select>
            </label>
            <label className="wep-field">
              <span>Template</span>
              <select value={form.template_id} onChange={(e) => setForm((f) => ({ ...f, template_id: e.target.value }))}>
                <option value="">No template</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label className="wep-field wep-checkbox">
              <input type="checkbox" checked={form.is_recurring} onChange={(e) => setForm((f) => ({ ...f, is_recurring: e.target.checked }))} />
              <span>Recurring event</span>
            </label>
            {form.is_recurring && (
              <label className="wep-field">
                <span>Recurrence</span>
                <select value={form.recurrence_rule || "weekly"} onChange={(e) => setForm((f) => ({ ...f, recurrence_rule: e.target.value }))}>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </label>
            )}
            <label className="wep-field wep-span-2">
              <span>Description</span>
              <textarea rows={3} value={form.description || ""} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Purpose, agenda, notes..." />
            </label>
          </div>
          <div className="wep-form-actions">
            <button type="button" className="wep-btn-secondary" onClick={() => setFormOpen(false)}>Cancel</button>
            <button type="submit" className="wep-btn-primary" disabled={submitting}>
              {submitting ? <Loader2 size={15} className="spin" /> : "Create event"}
            </button>
          </div>
        </form>
      )}

      {/* Content */}
      {loading ? (
        <div className="wep-loading"><Loader2 size={24} className="spin" /><p>Loading events...</p></div>
      ) : viewMode === "analytics" ? (
        <EventAnalytics events={events} members={members} />
      ) : viewMode === "calendar" ? (
        <EventCalendar events={events} onSelect={setActiveEvent} />
      ) : filteredEvents.length === 0 ? (
        <div className="wep-empty">
          <CalendarPlus size={32} className="wep-empty-icon" />
          <p>No events match your filters.</p>
          {(searchQuery || statusFilter !== "all" || typeFilter !== "all") && (
            <button className="wep-link" onClick={() => { setSearchQuery(""); setStatusFilter("all"); setTypeFilter("all"); }}>Clear filters</button>
          )}
        </div>
      ) : viewMode === "list" ? (
        <div className="wep-list">
          {filteredEvents.map((ev) => <EventListItem key={ev.id} ev={ev} members={members} onClick={() => setActiveEvent(ev)} />)}
        </div>
      ) : (
        <div className="wep-grid">
          {filteredEvents.map((ev) => <EventCard key={ev.id} ev={ev} members={members} onClick={() => setActiveEvent(ev)} />)}
        </div>
      )}

      {/* Detail Modal */}
      {activeEvent && (
        <EventDetailModal
          event={activeEvent}
          members={members}
          canManage={canManage}
          onClose={() => setActiveEvent(null)}
          tab={detailTab}
          setTab={setDetailTab}
          onUpdate={() => refresh()}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event Card (Grid)
// ---------------------------------------------------------------------------
function EventCard({ ev, members, onClick }) {
  const typeMeta = EVENT_TYPES.find((t) => t.value === ev.event_type) || EVENT_TYPES[5];
  const daysLeft = ev.event_date ? differenceInDays(parseISO(ev.event_date), new Date()) : null;
  const isOverdue = daysLeft !== null && daysLeft < 0 && ev.status === "planned";

  return (
    <div className="wep-card" onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onClick()}>
      <div className="wep-card-top">
        <div className="wep-card-type"><typeMeta.icon size={16} className={typeMeta.color} /></div>
        <span className={cn("wep-status-badge", classForStatus(ev.status))}>{ev.status}</span>
      </div>
      <h3 className="wep-card-title">{ev.title}</h3>
      <div className="wep-card-meta">
        {ev.event_date && (
          <span className={cn("wep-card-date", isOverdue && "overdue")}>
            <Clock size={12} />
            {isOverdue ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? "Today" : daysLeft !== null ? `${daysLeft}d left` : format(parseISO(ev.event_date), "MMM d, yyyy")}
          </span>
        )}
        {ev.location && <span className="wep-card-loc"><MapPin size={12} /> {ev.location}</span>}
      </div>
      {ev.budget > 0 && (
        <div className="wep-card-budget">
          <Wallet size={12} />
          <span>{formatKES(ev.budget)}</span>
          {ev.actual_cost !== null && ev.actual_cost > 0 && (
            <span className={cn("wep-card-actual", ev.actual_cost > ev.budget && "over-budget")}> / {formatKES(ev.actual_cost)}</span>
          )}
        </div>
      )}
      {ev.is_recurring && <span className="wep-card-recurring"><Repeat size={11} /> Recurring</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event List Item
// ---------------------------------------------------------------------------
function EventListItem({ ev, members, onClick }) {
  const typeMeta = EVENT_TYPES.find((t) => t.value === ev.event_type) || EVENT_TYPES[5];
  return (
    <div className="wep-list-item" onClick={onClick}>
      <typeMeta.icon size={18} className={cn("wep-list-icon", typeMeta.color)} />
      <div className="wep-list-main">
        <h4>{ev.title}</h4>
        <p>{ev.event_date ? format(parseISO(ev.event_date), "MMM d, yyyy") : "No date"} &middot; {ev.location || "No location"}</p>
      </div>
      <span className={cn("wep-status-badge", classForStatus(ev.status))}>{ev.status}</span>
      {ev.budget > 0 && <span className="wep-list-budget">{formatKES(ev.budget)}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail Modal
// ---------------------------------------------------------------------------
function EventDetailModal({
  event,
  members,
  canManage,
  onClose,
  tab,
  setTab,
  onUpdate,
}) {
  const { member } = useChama();
  const { tasks, attendance, contributions, comments, attachments, budgetLines, loading, refresh, setTasks } = useEventDetails(event.id);
  const [newTask, setNewTask] = useState({ task: "", assignee_member_id: "", due_date: "", priority: "medium" });
  const [commentText, setCommentText] = useState("");
  const [actualCost, setActualCost] = useState(event.actual_cost ?? "");
  const [newBudgetLine, setNewBudgetLine] = useState({ category: "", description: "", quantity: 1, unit_cost: "", responsible_member_id: "" });
  const [contribSource, setContribSource] = useState({ source_type: "member", contributor_name: "", is_pledge: false });
  const fileInputRef = useRef(null);

  const memberName = (id) => members.find((m) => m.id === id)?.name || "Unassigned";
  const totalContributions = contributions.reduce((s, c) => s + Number(c.is_pledge ? (c.amount_received || 0) : c.amount), 0);
  const completionRate = tasks.length ? Math.round((tasks.filter((t) => t.status === "done").length / tasks.length) * 100) : 0;

  const advanceStatus = async (status) => {
    const currentIndex = STATUS_FLOW.indexOf(event.status);
    const targetIndex = STATUS_FLOW.indexOf(status);
    // Guard against skipping steps forward (e.g. planned -> completed in one
    // click). Moving backward or cancelling is still allowed — an official
    // correcting a mistake shouldn't be blocked, only accidental skips are.
    if (targetIndex > currentIndex + 1) {
      toast.error(`Complete "${STATUS_FLOW[currentIndex + 1]}" before moving to "${status}".`);
      return;
    }
    await supabase.from("welfare_events").update({ status, updated_at: new Date().toISOString() }).eq("id", event.id);
    await logAudit({
      chamaId: event.chama_id, actorMemberId: member.id, module: "welfare_event", action: "status_changed",
      entityId: event.id, previousValue: { status: event.status }, newValue: { status },
    });
    toast.success(`Status updated to ${status}`);
    onUpdate();
  };

  const updateActualCost = async () => {
    if (actualCost === "") return;
    const previous = event.actual_cost;
    await supabase.from("welfare_events").update({ actual_cost: Number(actualCost) }).eq("id", event.id);
    await logAudit({
      chamaId: event.chama_id, actorMemberId: member.id, module: "welfare_event", action: "actual_cost_updated",
      entityId: event.id, previousValue: { actual_cost: previous }, newValue: { actual_cost: Number(actualCost) },
    });
    toast.success("Actual cost updated");
    onUpdate();
  };

  // ---------------------------------------------------------------------------
  // Budget line items
  // ---------------------------------------------------------------------------
  const totalBudgetLines = budgetLines.reduce((s, l) => s + Number(l.budget_amount || 0), 0);
  const totalActualLines = budgetLines.reduce((s, l) => s + Number(l.actual_amount || 0), 0);

  const addBudgetLine = async () => {
    if (!newBudgetLine.category.trim()) { toast.error("Give the budget line a category."); return; }
    const qty = Number(newBudgetLine.quantity) || 1;
    const unitCost = Number(newBudgetLine.unit_cost) || 0;
    const { error } = await supabase.from("welfare_event_budget_lines").insert([{
      event_id: event.id,
      category: newBudgetLine.category.trim(),
      description: newBudgetLine.description.trim() || null,
      quantity: qty,
      unit_cost: unitCost,
      budget_amount: qty * unitCost,
      responsible_member_id: newBudgetLine.responsible_member_id || null,
      created_by: member.id,
    }]);
    if (error) { toast.error(`Couldn't add budget line: ${error.message}`); return; }
    setNewBudgetLine({ category: "", description: "", quantity: 1, unit_cost: "", responsible_member_id: "" });
    toast.success("Budget line added");
    refresh();
  };

  const updateBudgetLineActual = async (line, value) => {
    if (value === "") return;
    const { error } = await supabase.from("welfare_event_budget_lines").update({ actual_amount: Number(value), updated_at: new Date().toISOString() }).eq("id", line.id);
    if (error) { toast.error(`Couldn't update actual amount: ${error.message}`); return; }
    refresh();
  };

  const removeBudgetLine = async (lineId) => {
    const { error } = await supabase.from("welfare_event_budget_lines").delete().eq("id", lineId);
    if (error) { toast.error(`Couldn't remove line: ${error.message}`); return; }
    toast.success("Budget line removed");
    refresh();
  };

  const addTask = async () => {
    if (!newTask.task.trim()) return;
    await supabase.from("welfare_event_tasks").insert([{
      event_id: event.id,
      task: newTask.task.trim(),
      assignee_member_id: newTask.assignee_member_id || null,
      due_date: newTask.due_date || null,
      priority: newTask.priority,
      status: "pending",
      sort_order: tasks.length,
    }]);
    setNewTask({ task: "", assignee_member_id: "", due_date: "", priority: "medium" });
    toast.success("Task added");
    refresh();
  };

  const toggleTask = async (task) => {
    const next = task.status === "done" ? "pending" : "done";
    await supabase.from("welfare_event_tasks").update({ status: next }).eq("id", task.id);
    refresh();
  };

  const removeTask = async (taskId) => {
    await supabase.from("welfare_event_tasks").delete().eq("id", taskId);
    toast.success("Task removed");
    refresh();
  };

  const onDragEnd = async (result) => {
    if (!result.destination) return;
    const reordered = Array.from(tasks);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    setTasks(reordered);
    await Promise.all(reordered.map((t, i) => supabase.from("welfare_event_tasks").update({ sort_order: i }).eq("id", t.id)));
    refresh();
  };

  const addComment = async () => {
    if (!commentText.trim()) return;
    await supabase.from("welfare_event_comments").insert([{ event_id: event.id, member_id: member.id, content: commentText.trim() }]);
    setCommentText("");
    refresh();
  };

  const setAttendance = async (memberId, status) => {
    const existing = attendance.find((a) => a.member_id === memberId);
    if (existing) {
      await supabase.from("welfare_event_attendance").update({ status }).eq("id", existing.id);
    } else {
      await supabase.from("welfare_event_attendance").insert([{ event_id: event.id, member_id: memberId, status, note: null }]);
    }
    refresh();
  };

  const addContribution = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const amount = Number(fd.get("amount"));
    const sourceType = contribSource.source_type;
    const isPledge = contribSource.is_pledge;
    if (!amount) return;
    if (sourceType === "member" && !fd.get("member_id")) { toast.error("Choose a member."); return; }
    if ((sourceType === "external" || sourceType === "organization") && !contribSource.contributor_name.trim()) {
      toast.error("Enter a contributor/organization name.");
      return;
    }
    await supabase.from("welfare_event_contributions").insert([{
      event_id: event.id,
      source_type: sourceType,
      member_id: sourceType === "member" ? fd.get("member_id") : null,
      contributor_name: sourceType === "member" || sourceType === "anonymous" ? null : contribSource.contributor_name.trim(),
      amount,
      is_pledge: isPledge,
      pledged_amount: isPledge ? amount : null,
      amount_received: isPledge ? 0 : amount,
      paid_at: new Date().toISOString(),
      note: fd.get("note") || null,
    }]);
    toast.success(isPledge ? "Pledge recorded" : "Contribution recorded");
    setContribSource({ source_type: "member", contributor_name: "", is_pledge: false });
    e.target.reset();
    refresh();
  };

  const receiveEventPledgePayment = async (contribution) => {
    const remaining = outstandingAmount(contribution);
    const input = window.prompt(`Amount received now (outstanding: ${formatKES(remaining)})`, remaining);
    if (input === null) return;
    const amount = Number(input);
    if (!amount || amount <= 0 || amount > remaining) { toast.error("Enter a valid amount up to the outstanding balance."); return; }
    const { error } = await supabase.from("welfare_event_contributions")
      .update({ amount_received: Number(contribution.amount_received || 0) + amount })
      .eq("id", contribution.id);
    if (error) { toast.error(`Couldn't record payment: ${error.message}`); return; }
    toast.success("Pledge payment recorded");
    refresh();
  };

  const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB

  const uploadFile = async (file) => {
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File is too large — max size is 15MB");
      return;
    }
    const path = `${event.chama_id}/${event.id}/${Date.now()}_${file.name}`;
    const { error: upError } = await supabase.storage.from("event-attachments").upload(path, file);
    if (upError) { toast.error("Upload failed"); return; }
    const { data: urlData } = supabase.storage.from("event-attachments").getPublicUrl(path);
    await supabase.from("welfare_event_attachments").insert([{
      event_id: event.id,
      file_name: file.name,
      file_url: urlData.publicUrl,
      file_size: file.size,
      uploaded_by: member.id,
    }]);
    toast.success("File uploaded");
    refresh();
  };

  const tabs = [
    { id: "tasks", label: `Tasks (${tasks.length})`, icon: CheckSquare },
    { id: "budget", label: `Budget (${budgetLines.length})`, icon: ListChecks },
    { id: "attendance", label: `Attendance (${attendance.length})`, icon: Users },
    { id: "contributions", label: `Funds (${formatKES(totalContributions)})`, icon: Wallet },
    { id: "comments", label: `Comments (${comments.length})`, icon: MessageSquare },
    { id: "files", label: `Files (${attachments.length})`, icon: Paperclip },
  ];

  return (
    <div className="wep-modal-overlay" onClick={onClose}>
      <div className="wep-modal" onClick={(e) => e.stopPropagation()}>
        <div className="wep-modal-head">
          <div>
            <h3>{event.title}</h3>
            <p className="wep-modal-meta">
              {EVENT_TYPES.find((t) => t.value === event.event_type)?.label} &middot;
              {event.event_date ? format(parseISO(event.event_date), "MMMM d, yyyy") : "No date"} &middot;
              {event.location || "No location"}
            </p>
          </div>
          <button className="wep-modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        {canManage && (
          <div className="wep-status-flow">
            {STATUS_FLOW.map((s, i) => (
              <React.Fragment key={s}>
                <button
                  className={cn("wep-status-step", event.status === s && "active", STATUS_FLOW.indexOf(event.status) > i && "completed")}
                  onClick={() => advanceStatus(s)}
                >
                  {STATUS_FLOW.indexOf(event.status) > i ? <CheckCircle2 size={14} /> : <span className="wep-step-num">{i + 1}</span>}
                  {s}
                </button>
                {i < STATUS_FLOW.length - 1 && <ChevronRight size={14} className="wep-step-arrow" />}
              </React.Fragment>
            ))}
          </div>
        )}

        <div className="wep-modal-stats">
          <div className="wep-modal-stat">
            <span className="wep-modal-stat-label">Budget</span>
            <span className="wep-modal-stat-value">{formatKES(event.budget)}</span>
          </div>
          <div className="wep-modal-stat">
            <span className="wep-modal-stat-label">Actual</span>
            {canManage ? (
              <input
                type="number"
                className="wep-modal-stat-input"
                value={actualCost}
                onChange={(e) => setActualCost(e.target.value === "" ? "" : Number(e.target.value))}
                onBlur={updateActualCost}
                placeholder="-"
              />
            ) : (
              <span className="wep-modal-stat-value">{event.actual_cost !== null ? formatKES(event.actual_cost) : "-"}</span>
            )}
          </div>
          <div className="wep-modal-stat">
            <span className="wep-modal-stat-label">Raised</span>
            <span className="wep-modal-stat-value">{formatKES(totalContributions)}</span>
          </div>
          <div className="wep-modal-stat">
            <span className="wep-modal-stat-label">Tasks</span>
            <span className="wep-modal-stat-value">{completionRate}%</span>
          </div>
        </div>

        <div className="wep-modal-tabs">
          {tabs.map((t) => (
            <button key={t.id} className={cn("wep-modal-tab", tab === t.id && "active")} onClick={() => setTab(t.id)}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>

        <div className="wep-modal-body">
          {tab === "tasks" && (
            <div className="wep-tasks">
              {canManage && (
                <div className="wep-add-task-row">
                  <input placeholder="New task..." value={newTask.task} onChange={(e) => setNewTask((t) => ({ ...t, task: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && addTask()} />
                  <select value={newTask.assignee_member_id} onChange={(e) => setNewTask((t) => ({ ...t, assignee_member_id: e.target.value }))}>
                    <option value="">Assign</option>
                    {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <select value={newTask.priority} onChange={(e) => setNewTask((t) => ({ ...t, priority: e.target.value }))}>
                    <option value="low">Low</option>
                    <option value="medium">Med</option>
                    <option value="high">High</option>
                  </select>
                  <input type="date" value={newTask.due_date} onChange={(e) => setNewTask((t) => ({ ...t, due_date: e.target.value }))} />
                  <button className="wep-btn-icon" onClick={addTask}><Plus size={16} /></button>
                </div>
              )}
              {tasks.length === 0 ? (
                <p className="wep-empty-inline">No tasks yet.</p>
              ) : (
                <DragDropContext onDragEnd={onDragEnd}>
                  <Droppable droppableId="tasks">
                    {(provided) => (
                      <div {...provided.droppableProps} ref={provided.innerRef} className="wep-task-list">
                        {tasks.map((t, index) => (
                          <Draggable key={t.id} draggableId={t.id} index={index} isDragDisabled={!canManage}>
                            {(prov, snap) => (
                              <div
                                ref={prov.innerRef}
                                {...prov.draggableProps}
                                {...prov.dragHandleProps}
                                className={cn("wep-task-row", t.status === "done" && "done", snap.isDragging && "dragging")}
                                style={prov.draggableProps.style}
                              >
                                {canManage && <GripVertical size={14} className="wep-task-drag" />}
                                <button className="wep-task-check" onClick={() => canManage && toggleTask(t)}>
                                  {t.status === "done" ? <CheckSquare size={16} className="text-emerald-600" /> : <Square size={16} />}
                                </button>
                                <div className="wep-task-body">
                                  <span className={cn("wep-task-text", t.status === "done" && "line-through")}>{t.task}</span>
                                  <div className="wep-task-tags">
                                    <span className={cn("wep-task-priority", PRIORITY_STYLES[t.priority])}>{t.priority}</span>
                                    <span className="wep-task-assignee">{memberName(t.assignee_member_id)}</span>
                                    {t.due_date && <span className={cn("wep-task-due", isPast(parseISO(t.due_date)) && t.status !== "done" && "overdue")}>due {format(parseISO(t.due_date), "MMM d")}</span>}
                                  </div>
                                </div>
                                {canManage && (
                                  <button className="wep-task-remove" onClick={() => removeTask(t.id)}><Trash2 size={13} /></button>
                                )}
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>
              )}
            </div>
          )}

          {tab === "budget" && (
            <div className="wep-budget">
              <div className="wep-budget-summary">
                <div><span>Overall budget</span><strong>{formatKES(event.budget)}</strong></div>
                <div><span>Line items budgeted</span><strong>{formatKES(totalBudgetLines)}</strong></div>
                <div><span>Line items actual</span><strong>{formatKES(totalActualLines)}</strong></div>
                <div><span>Variance</span><strong className={totalActualLines > totalBudgetLines ? "over" : ""}>{formatKES(totalBudgetLines - totalActualLines)}</strong></div>
              </div>

              {canManage && (
                <div className="wep-budget-add-row">
                  <input placeholder="Category (e.g. Catering)" value={newBudgetLine.category} onChange={(e) => setNewBudgetLine((b) => ({ ...b, category: e.target.value }))} />
                  <input placeholder="Description" value={newBudgetLine.description} onChange={(e) => setNewBudgetLine((b) => ({ ...b, description: e.target.value }))} />
                  <input type="number" min="0" placeholder="Qty" value={newBudgetLine.quantity} onChange={(e) => setNewBudgetLine((b) => ({ ...b, quantity: e.target.value }))} />
                  <input type="number" min="0" placeholder="Unit cost" value={newBudgetLine.unit_cost} onChange={(e) => setNewBudgetLine((b) => ({ ...b, unit_cost: e.target.value }))} />
                  <select value={newBudgetLine.responsible_member_id} onChange={(e) => setNewBudgetLine((b) => ({ ...b, responsible_member_id: e.target.value }))}>
                    <option value="">Responsible</option>
                    {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <button className="wep-btn-icon" onClick={addBudgetLine}><Plus size={16} /></button>
                </div>
              )}

              {budgetLines.length === 0 ? (
                <p className="wep-empty-inline">No budget lines yet — add categories to break the overall budget down and track variance per item.</p>
              ) : (
                <div className="wep-budget-list">
                  {budgetLines.map((l) => {
                    const variance = Number(l.budget_amount || 0) - Number(l.actual_amount || 0);
                    return (
                      <div key={l.id} className="wep-budget-row">
                        <div className="wep-budget-row-main">
                          <strong>{l.category}</strong>
                          {l.description && <span className="wep-budget-desc">{l.description}</span>}
                          <span className="wep-budget-owner">{memberName(l.responsible_member_id)}</span>
                        </div>
                        <span className="wep-budget-planned">{formatKES(l.budget_amount)}</span>
                        {canManage ? (
                          <input
                            type="number" min="0" className="wep-budget-actual-input" placeholder="Actual"
                            defaultValue={l.actual_amount ?? ""}
                            onBlur={(e) => updateBudgetLineActual(l, e.target.value)}
                          />
                        ) : (
                          <span className="wep-budget-actual">{l.actual_amount !== null && l.actual_amount !== undefined ? formatKES(l.actual_amount) : "-"}</span>
                        )}
                        <span className={cn("wep-budget-variance", variance < 0 && "over")}>{formatKES(variance)}</span>
                        {canManage && <button className="wep-task-remove" onClick={() => removeBudgetLine(l.id)}><Trash2 size={13} /></button>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === "attendance" && (
            <div className="wep-attendance">
              <div className="wep-attendance-summary">
                <span className="confirmed"><CheckCircle2 size={14} /> {attendance.filter((a) => a.status === "confirmed").length} confirmed</span>
                <span className="maybe"><Clock size={14} /> {attendance.filter((a) => a.status === "maybe").length} maybe</span>
                <span className="declined"><X size={14} /> {attendance.filter((a) => a.status === "declined").length} declined</span>
              </div>
              <div className="wep-attendance-list">
                {members.map((m) => {
                  const a = attendance.find((x) => x.member_id === m.id);
                  return (
                    <div key={m.id} className="wep-attendance-row">
                      <span className="wep-attendance-name">{m.name}</span>
                      <div className="wep-attendance-actions">
                        {["confirmed", "maybe", "declined"].map((s) => (
                          <button
                            key={s}
                            className={cn("wep-attendance-btn", a?.status === s && "active", s)}
                            onClick={() => setAttendance(m.id, s)}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "contributions" && (
            <div className="wep-contributions">
              {canManage && (
                <form className="wep-contribution-form" onSubmit={addContribution}>
                  <select value={contribSource.source_type} onChange={(e) => setContribSource((s) => ({ ...s, source_type: e.target.value }))}>
                    {CONTRIBUTION_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  {contribSource.source_type === "member" ? (
                    <select name="member_id" required>
                      <option value="">Member</option>
                      {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  ) : contribSource.source_type !== "anonymous" ? (
                    <input
                      placeholder={contribSource.source_type === "organization" ? "Organization name" : "Contributor name"}
                      value={contribSource.contributor_name}
                      onChange={(e) => setContribSource((s) => ({ ...s, contributor_name: e.target.value }))}
                    />
                  ) : (
                    <span className="wep-empty-inline">No identity recorded</span>
                  )}
                  <input name="amount" type="number" min="1" placeholder="Amount (KES)" required />
                  <input name="note" placeholder="Note (optional)" />
                  <label className="wep-field wep-checkbox wep-pledge-checkbox">
                    <input type="checkbox" checked={contribSource.is_pledge} onChange={(e) => setContribSource((s) => ({ ...s, is_pledge: e.target.checked }))} />
                    <span>Pledge</span>
                  </label>
                  <button type="submit" className="wep-btn-primary"><Plus size={14} /> Add</button>
                </form>
              )}
              <div className="wep-contribution-list">
                {contributions.length === 0 ? <p className="wep-empty-inline">No contributions yet.</p> : contributions.map((c) => {
                  const pledgeLabel = pledgeStatusLabel(c);
                  return (
                    <div key={c.id} className="wep-contribution-row">
                      <span className="wep-contribution-member">{contributorDisplayName(c, memberName)}</span>
                      <span className="wep-contribution-amount">
                        {formatKES(c.amount)}
                        {pledgeLabel && <em className="wep-pledge-tag">{pledgeLabel}</em>}
                      </span>
                      <span className="wep-contribution-date">{format(parseISO(c.paid_at), "MMM d, yyyy")}</span>
                      {c.note && <span className="wep-contribution-note">{c.note}</span>}
                      {canManage && c.is_pledge && outstandingAmount(c) > 0 && (
                        <button className="wep-btn-icon" title="Record payment" onClick={() => receiveEventPledgePayment(c)}><HandCoins size={14} /></button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "comments" && (
            <div className="wep-comments">
              <div className="wep-comment-list">
                {comments.map((c) => (
                  <div key={c.id} className="wep-comment">
                    <div className="wep-comment-avatar">{(c.member)?.name?.[0] || "?"}</div>
                    <div className="wep-comment-body">
                      <div className="wep-comment-head">
                        <strong>{(c.member)?.name || "Unknown"}</strong>
                        <span>{format(parseISO(c.created_at), "MMM d, h:mm a")}</span>
                      </div>
                      <p>{c.content}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="wep-comment-input-row">
                <input value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Write a comment..." onKeyDown={(e) => e.key === "Enter" && addComment()} />
                <button onClick={addComment}><Plus size={16} /></button>
              </div>
            </div>
          )}

          {tab === "files" && (
            <div className="wep-files">
              {canManage && (
                <div className="wep-file-upload">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadFile(file);
                      e.target.value = ""; // allow re-selecting the same file later
                    }}
                  />
                  <button className="wep-btn-secondary" onClick={() => fileInputRef.current?.click()}><Paperclip size={14} /> Upload file</button>
                </div>
              )}
              <div className="wep-file-list">
                {attachments.length === 0 ? <p className="wep-empty-inline">No attachments yet.</p> : attachments.map((a) => (
                  <a key={a.id} href={a.file_url} target="_blank" rel="noreferrer" className="wep-file-row">
                    <FileText size={16} />
                    <span className="wep-file-name">{a.file_name}</span>
                    <span className="wep-file-size">{(a.file_size / 1024).toFixed(1)} KB</span>
                    <span className="wep-file-date">{format(parseISO(a.created_at), "MMM d")}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}