import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { supabase } from "../../supabaseClient";
import "./chamacontributions.css";

import {
  Wallet,
  Search,
  RefreshCcw,
  Download,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  AlertTriangle,
  Users,
  Plus,
  Pencil,
  Trash2,
  X,
  Crown,
  CalendarRange,
} from "lucide-react";

/* ================= CONSTANTS ================= */
const PAGE_SIZE = 10;

const CATEGORIES = [
  { key: "savings", label: "Savings", tone: "green" },
  { key: "fines", label: "Fines", tone: "red" },
  { key: "loans", label: "Loans", tone: "blue" },
  { key: "welfare", label: "Welfare", tone: "purple" },
  { key: "merry_go_round", label: "Merry Go Round", tone: "amber" },
];

const currency = new Intl.NumberFormat("en-KE", {
  style: "currency",
  currency: "KES",
  maximumFractionDigits: 0,
});

const formatKES = (val) => currency.format(Number(val || 0));
const toNumber = (val) => Number(val || 0);

const emptyForm = () => ({
  id: null,
  name: "",
  created_at: new Date().toISOString().split("T")[0],
  savings: "",
  fines: "",
  loans: "",
  welfare: "",
  merry_go_round: "",
});

/* ================= COMPONENT ================= */
const Contributions = () => {
  const [data, setData] = useState([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [sort, setSort] = useState({ key: "created_at", dir: "desc" });
  const [page, setPage] = useState(1);
  const searchDebounce = useRef(null);

  const [categoryFilter, setCategoryFilter] = useState(
    CATEGORIES.reduce((acc, c) => ({ ...acc, [c.key]: true }), {})
  );
  const [dateRange, setDateRange] = useState({ from: "", to: "" });

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());

  /* ================= FETCH ================= */
  const fetchData = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);

    const { data: rows, error: err } = await supabase
      .from("chama_contributions")
      .select("*")
      .order("created_at", { ascending: false });

    if (err) {
      setError(err.message || "Could not load the ledger.");
    } else {
      setData(rows || []);
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ================= DEBOUNCED SEARCH ================= */
  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(searchDebounce.current);
  }, [search]);

  /* ================= DERIVED ROWS (totals honor active category filter) ================= */
  const withTotals = useMemo(() => {
    const activeKeys = CATEGORIES.filter((c) => categoryFilter[c.key]).map((c) => c.key);
    return data.map((row) => {
      const total = activeKeys.reduce((sum, key) => sum + toNumber(row[key]), 0);
      return { ...row, __total: total };
    });
  }, [data, categoryFilter]);

  /* ================= FILTER (search + date range) ================= */
  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const fromTime = dateRange.from ? new Date(dateRange.from).getTime() : null;
    const toTime = dateRange.to ? new Date(dateRange.to).getTime() + 86400000 - 1 : null;

    return withTotals.filter((row) => {
      if (q && !(row.name || "").toLowerCase().includes(q)) return false;
      if (fromTime || toTime) {
        const t = row.created_at ? new Date(row.created_at).getTime() : 0;
        if (fromTime && t < fromTime) return false;
        if (toTime && t > toTime) return false;
      }
      return true;
    });
  }, [withTotals, debouncedSearch, dateRange]);

  /* ================= SORT ================= */
  const sorted = useMemo(() => {
    const rows = [...filtered];
    const { key, dir } = sort;
    rows.sort((a, b) => {
      let av = key === "__total" ? a.__total : key === "created_at" ? a.created_at : a[key];
      let bv = key === "__total" ? b.__total : key === "created_at" ? b.created_at : b[key];

      if (key === "created_at") {
        av = av ? new Date(av).getTime() : 0;
        bv = bv ? new Date(bv).getTime() : 0;
      } else if (key === "name") {
        av = (av || "").toLowerCase();
        bv = (bv || "").toLowerCase();
      } else {
        av = toNumber(av);
        bv = toNumber(bv);
      }

      if (av < bv) return dir === "asc" ? -1 : 1;
      if (av > bv) return dir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }, [filtered, sort]);

  /* ================= PAGINATION ================= */
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return sorted.slice(start, start + PAGE_SIZE);
  }, [sorted, currentPage]);

  /* ================= SUMMARY ================= */
  const summary = useMemo(() => {
    const totals = CATEGORIES.reduce((acc, c) => {
      acc[c.key] = filtered.reduce((sum, row) => sum + toNumber(row[c.key]), 0);
      return acc;
    }, {});
    const grandTotal = filtered.reduce((sum, row) => sum + row.__total, 0);
    const members = new Set(filtered.map((r) => r.name)).size;

    const top = filtered.reduce(
      (best, row) => (row.__total > (best?.__total || 0) ? row : best),
      null
    );

    return { totals, grandTotal, members, top };
  }, [filtered]);

  /* ================= SORT HANDLER ================= */
  const toggleSort = (key) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    );
  };

  const sortIcon = (key) => {
    if (sort.key !== key) return <ArrowUpDown size={12} className="sort-icon idle" />;
    return sort.dir === "asc" ? (
      <ArrowUp size={12} className="sort-icon active" />
    ) : (
      <ArrowDown size={12} className="sort-icon active" />
    );
  };

  const toggleCategory = (key) => {
    setCategoryFilter((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  /* ================= EXPORT ================= */
  const exportCSV = () => {
    const headers = ["Name", "Date", ...CATEGORIES.map((c) => c.label), "Total"];
    const lines = sorted.map((row) => [
      row.name || "",
      row.created_at ? new Date(row.created_at).toLocaleDateString() : "",
      ...CATEGORIES.map((c) => toNumber(row[c.key])),
      row.__total,
    ]);

    const csv = [headers, ...lines]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `contributions-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  /* ================= ADD / EDIT MODAL ================= */
  const openAddModal = () => {
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEditModal = (row) => {
    setForm({
      id: row.id,
      name: row.name || "",
      created_at: row.created_at ? row.created_at.split("T")[0] : new Date().toISOString().split("T")[0],
      savings: row.savings ?? "",
      fines: row.fines ?? "",
      loans: row.loans ?? "",
      welfare: row.welfare ?? "",
      merry_go_round: row.merry_go_round ?? "",
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
  };

  const updateForm = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const saveForm = async () => {
    if (!form.name.trim()) {
      setError("Member name is required.");
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      name: form.name.trim(),
      created_at: form.created_at,
      savings: toNumber(form.savings),
      fines: toNumber(form.fines),
      loans: toNumber(form.loans),
      welfare: toNumber(form.welfare),
      merry_go_round: toNumber(form.merry_go_round),
    };

    const { error: err } = form.id
      ? await supabase.from("chama_contributions").update(payload).eq("id", form.id)
      : await supabase.from("chama_contributions").insert(payload);

    if (err) {
      setError(err.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setModalOpen(false);
    fetchData(true);
  };

  const deleteRow = async (row) => {
    if (!window.confirm(`Remove this entry for ${row.name || "this member"}? This can't be undone.`)) {
      return;
    }
    const { error: err } = await supabase.from("chama_contributions").delete().eq("id", row.id);
    if (err) {
      setError(err.message);
      return;
    }
    fetchData(true);
  };

  /* ================= RENDER ================= */
  return (
    <div className="contributions-container">
      {/* HEADER */}
      <div className="contributions-header">
        <div className="contributions-title">
          <span className="title-icon">
            <Wallet size={18} />
          </span>
          <div>
            <h2>Contributions Ledger</h2>
            <p className="subtitle">Every entry, tallied and traceable.</p>
          </div>
        </div>

        <div className="contributions-actions">
          <div className="contributions-search">
            <Search size={14} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search member..."
              aria-label="Search member"
            />
          </div>

          <div className="date-range">
            <CalendarRange size={14} />
            <input
              type="date"
              value={dateRange.from}
              onChange={(e) => setDateRange((d) => ({ ...d, from: e.target.value }))}
              aria-label="From date"
            />
            <span>–</span>
            <input
              type="date"
              value={dateRange.to}
              onChange={(e) => setDateRange((d) => ({ ...d, to: e.target.value }))}
              aria-label="To date"
            />
          </div>

          <button className="ghost-btn" onClick={exportCSV} disabled={!sorted.length}>
            <Download size={14} /> Export
          </button>

          <button
            className="refresh-btn"
            onClick={() => fetchData(true)}
            disabled={loading || refreshing}
          >
            <RefreshCcw size={14} className={refreshing ? "spin" : ""} />
            Refresh
          </button>

          <button className="add-btn" onClick={openAddModal}>
            <Plus size={14} /> Add Entry
          </button>
        </div>
      </div>

      {/* CATEGORY FILTER CHIPS */}
      <div className="chip-row" role="group" aria-label="Filter categories included in totals">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => toggleCategory(c.key)}
            className={`chip tone-${c.tone} ${categoryFilter[c.key] ? "chip-active" : ""}`}
            aria-pressed={categoryFilter[c.key]}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* SUMMARY CARDS */}
      <div className="summary-grid">
        <div className="summary-card members">
          <div className="summary-icon">
            <Users size={16} />
          </div>
          <div>
            <span className="summary-label">Members</span>
            <span className="summary-value">{summary.members}</span>
          </div>
        </div>

        {CATEGORIES.map((c) => (
          <div className={`summary-card tone-${c.tone} ${categoryFilter[c.key] ? "" : "dimmed"}`} key={c.key}>
            <span className="summary-dot" />
            <div>
              <span className="summary-label">{c.label}</span>
              <span className="summary-value">{formatKES(summary.totals[c.key])}</span>
            </div>
          </div>
        ))}

        <div className="summary-card grand-total">
          <div>
            <span className="summary-label">Grand Total</span>
            <span className="summary-value">{formatKES(summary.grandTotal)}</span>
          </div>
        </div>

        {summary.top && summary.top.__total > 0 && (
          <div className="summary-card top-contributor">
            <div className="summary-icon">
              <Crown size={16} />
            </div>
            <div>
              <span className="summary-label">Top Contributor</span>
              <span className="summary-value small">
                {summary.top.name || "Unnamed"} · {formatKES(summary.top.__total)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ERROR */}
      {error && (
        <div className="ledger-error">
          <AlertTriangle size={16} />
          <span>{error}</span>
          <button onClick={() => fetchData()}>Try again</button>
        </div>
      )}

      {/* TABLE */}
      <div className="table-wrapper">
        {loading ? (
          <div className="skeleton-list" aria-label="Loading ledger">
            {Array.from({ length: 6 }).map((_, i) => (
              <div className="skeleton-row" key={i} />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="empty-state">
            <Wallet size={28} />
            <h3>No entries found</h3>
            <p>
              {debouncedSearch
                ? `No contributions match "${debouncedSearch}".`
                : "Contributions will appear here once recorded."}
            </p>
            <button className="add-btn" onClick={openAddModal}>
              <Plus size={14} /> Add the first entry
            </button>
          </div>
        ) : (
          <>
            <table className="contributions-table">
              <thead>
                <tr>
                  <th onClick={() => toggleSort("name")} className="sortable">
                    Name {sortIcon("name")}
                  </th>
                  <th onClick={() => toggleSort("created_at")} className="sortable">
                    Date {sortIcon("created_at")}
                  </th>

                  {CATEGORIES.map((c) => (
                    <th
                      key={c.key}
                      onClick={() => toggleSort(c.key)}
                      className={`sortable tone-${c.tone} ${
                        c.key === "merry_go_round" ? "mg-header" : ""
                      } ${categoryFilter[c.key] ? "" : "dimmed"}`}
                    >
                      {c.key === "merry_go_round" && <span className="mg-coin" aria-hidden="true" />}
                      {c.label} {sortIcon(c.key)}
                    </th>
                  ))}

                  <th onClick={() => toggleSort("__total")} className="sortable">
                    Total {sortIcon("__total")}
                  </th>
                  <th className="actions-header">Actions</th>
                </tr>
              </thead>

              <tbody>
                {paginated.map((row) => (
                  <tr key={row.id} className="data-row">
                    <td className="name-cell" data-label="Name">
                      <span className="avatar">{(row.name || "?").charAt(0).toUpperCase()}</span>
                      {row.name || "Unnamed"}
                    </td>

                    <td className="date-cell" data-label="Date">
                      {row.created_at ? new Date(row.created_at).toLocaleDateString() : "-"}
                    </td>

                    {CATEGORIES.map((c) => (
                      <td
                        key={c.key}
                        className={`num tone-${c.tone} ${categoryFilter[c.key] ? "" : "dimmed"}`}
                        data-label={c.label}
                      >
                        {formatKES(row[c.key])}
                      </td>
                    ))}

                    <td className="num total" data-label="Total">
                      {formatKES(row.__total)}
                    </td>

                    <td className="actions-cell" data-label="Actions">
                      <button className="icon-btn" onClick={() => openEditModal(row)} aria-label="Edit entry">
                        <Pencil size={14} />
                      </button>
                      <button className="icon-btn danger" onClick={() => deleteRow(row)} aria-label="Delete entry">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* PAGINATION */}
            <div className="pagination">
              <span className="pagination-info">
                Showing {(currentPage - 1) * PAGE_SIZE + 1}–
                {Math.min(currentPage * PAGE_SIZE, sorted.length)} of {sorted.length}
              </span>
              <div className="pagination-controls">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </button>
                <span className="page-count">
                  {currentPage} / {totalPages}
                </span>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ADD / EDIT MODAL */}
      {modalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{form.id ? "Edit Entry" : "Add Entry"}</h3>
              <button className="icon-btn" onClick={closeModal} aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className="modal-body">
              <label className="field">
                <span>Member Name</span>
                <input value={form.name} onChange={(e) => updateForm("name", e.target.value)} />
              </label>

              <label className="field">
                <span>Date</span>
                <input
                  type="date"
                  value={form.created_at}
                  onChange={(e) => updateForm("created_at", e.target.value)}
                />
              </label>

              <div className="form-grid">
                {CATEGORIES.map((c) => (
                  <label className="field" key={c.key}>
                    <span className={`tone-${c.tone}`}>{c.label}</span>
                    <input
                      type="number"
                      value={form[c.key]}
                      onChange={(e) => updateForm(c.key, e.target.value)}
                      placeholder="0"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="modal-footer">
              <button className="ghost-btn" onClick={closeModal} disabled={saving}>
                Cancel
              </button>
              <button className="add-btn" onClick={saveForm} disabled={saving}>
                {saving ? "Saving..." : form.id ? "Save Changes" : "Add Entry"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Contributions;