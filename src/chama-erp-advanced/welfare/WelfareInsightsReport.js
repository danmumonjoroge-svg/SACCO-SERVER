import React, { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "../../supabaseClient";
import { useChama } from "../ChamaContext";
import { TrendingUp, TrendingDown, Award, AlertTriangle, Loader2, Lock, CalendarDays } from "lucide-react";
import "./WelfareInsightsReport.css";

// -----------------------------------------------------------------------------
// WelfareInsightsReport
// Official-facing. Ranks welfare cases/events by total raised (high vs low
// participation) and members by total welfare generosity (high vs low),
// so the committee can see where engagement is strong and where it's
// falling off. Restricted to officials — this is exactly the kind of
// comparison that would be uncomfortable if broadly visible to members.
// -----------------------------------------------------------------------------

function formatKES(v) { return `KES ${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`; }

export default function WelfareInsightsReport({ chamaId: chamaIdProp }) {
  const { chama, hasRole } = useChama();
  const chamaId = chamaIdProp || chama?.id;
  const canView = hasRole(["welfare_officer", "chairperson", "treasurer", "secretary", "admin"]);

  const [cases, setCases] = useState([]);
  const [contributions, setContributions] = useState([]);
  const [events, setEvents] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!chamaId) return;
    setLoading(true);
    const [casesRes, contribRes, eventsRes, membersRes] = await Promise.all([
      supabase.from("welfare_cases").select("*").eq("chama_id", chamaId),
      supabase.from("welfare_contributions").select("*").eq("chama_id", chamaId).eq("status", "Approved"),
      supabase.from("welfare_events").select("*").eq("chama_id", chamaId),
      supabase.from("chama_members").select("id,name").eq("chama_id", chamaId),
    ]);
    setCases(casesRes.data || []);
    setContributions(contribRes.data || []);
    setEvents(eventsRes.data || []);
    setMembers(membersRes.data || []);
    setLoading(false);
  }, [chamaId]);

  useEffect(() => { load(); }, [load]);

  const memberName = (id) => members.find((m) => m.id === id)?.name || "Unknown member";

  const caseStats = useMemo(() => {
    return cases.map((c) => {
      const rows = contributions.filter((ct) => ct.case_id === c.id);
      const total = rows.reduce((s, r) => s + Number(r.amount), 0);
      return { ...c, total, contributorCount: new Set(rows.map((r) => r.member_id)).size };
    }).sort((a, b) => b.total - a.total);
  }, [cases, contributions]);

  const highCases = caseStats.slice(0, 5);
  const lowCases = [...caseStats].filter((c) => c.status === "closed" || c.contributorCount > 0).sort((a, b) => a.total - b.total).slice(0, 5);

  const memberStats = useMemo(() => {
    const byMember = {};
    contributions.forEach((c) => {
      byMember[c.member_id] = (byMember[c.member_id] || 0) + Number(c.amount);
    });
    return Object.entries(byMember)
      .map(([memberId, total]) => ({ memberId, name: memberName(memberId), total }))
      .sort((a, b) => b.total - a.total);
  }, [contributions, members]);

  const highMembers = memberStats.slice(0, 5);
  const lowMembers = [...memberStats].sort((a, b) => a.total - b.total).slice(0, 5);
  const nonContributors = members.filter((m) => !memberStats.some((s) => s.memberId === m.id));

  const eventsSummary = useMemo(() => {
    const byStatus = {};
    events.forEach((e) => { byStatus[e.status] = (byStatus[e.status] || 0) + 1; });
    return byStatus;
  }, [events]);

  if (!canView) {
    return (
      <div className="wir-locked">
        <Lock size={18} />
        <p>Welfare insights are visible to the welfare officer and chama officials only.</p>
      </div>
    );
  }

  if (loading) {
    return <div className="wir-loading"><Loader2 size={22} className="spin" /></div>;
  }

  return (
    <div className="wir-page">
      <div className="wir-header">
        <h2>Welfare Insights</h2>
        <p>Participation patterns across cases and members.</p>
      </div>

      <div className="wir-summary-strip">
        <div><span>Total raised</span><strong>{formatKES(contributions.reduce((s, c) => s + Number(c.amount), 0))}</strong></div>
        <div><span>Open cases</span><strong>{cases.filter((c) => c.status === "open").length}</strong></div>
        <div><span>Closed cases</span><strong>{cases.filter((c) => c.status === "closed").length}</strong></div>
        <div><span>Events planned</span><strong>{events.length}</strong></div>
      </div>

      <div className="wir-columns">
        <section className="wir-panel">
          <h3><TrendingUp size={15} className="up" /> Highest-raising cases</h3>
          {highCases.length === 0 ? <p className="wir-empty">No data yet.</p> : (
            <ul className="wir-list">
              {highCases.map((c) => (
                <li key={c.id}>
                  <span>{c.title}</span>
                  <strong>{formatKES(c.total)}</strong>
                  <small>{c.contributorCount} contributor{c.contributorCount === 1 ? "" : "s"}</small>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="wir-panel">
          <h3><TrendingDown size={15} className="down" /> Lowest-raising cases</h3>
          {lowCases.length === 0 ? <p className="wir-empty">No data yet.</p> : (
            <ul className="wir-list">
              {lowCases.map((c) => (
                <li key={c.id}>
                  <span>{c.title}</span>
                  <strong>{formatKES(c.total)}</strong>
                  <small>{c.contributorCount} contributor{c.contributorCount === 1 ? "" : "s"}</small>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="wir-panel">
          <h3><Award size={15} className="up" /> Most generous members</h3>
          {highMembers.length === 0 ? <p className="wir-empty">No data yet.</p> : (
            <ul className="wir-list">
              {highMembers.map((m) => (
                <li key={m.memberId}><span>{m.name}</span><strong>{formatKES(m.total)}</strong></li>
              ))}
            </ul>
          )}
        </section>

        <section className="wir-panel">
          <h3><AlertTriangle size={15} className="down" /> Lowest / non-contributors</h3>
          <ul className="wir-list">
            {lowMembers.map((m) => (
              <li key={m.memberId}><span>{m.name}</span><strong>{formatKES(m.total)}</strong></li>
            ))}
            {nonContributors.slice(0, Math.max(0, 5 - lowMembers.length)).map((m) => (
              <li key={m.id}><span>{m.name}</span><strong className="wir-zero">KES 0</strong></li>
            ))}
          </ul>
        </section>
      </div>

      <section className="wir-panel wir-events-panel">
        <h3><CalendarDays size={15} /> Events by status</h3>
        <div className="wir-events-strip">
          {["planned", "ongoing", "completed", "cancelled"].map((s) => (
            <div className={`wir-event-chip ${s}`} key={s}>
              <span>{s}</span>
              <strong>{eventsSummary[s] || 0}</strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
