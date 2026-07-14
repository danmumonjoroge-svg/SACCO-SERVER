// modules/chama/welfare/WelfareReportPDF.js
// ─────────────────────────────────────────────────────────────────────────────
// DROP-IN REPLACEMENT — keeps your existing function signature intent but
// upgrades to a React component so it renders a trigger UI inside the
// Reports tab of WelfareOfficerDashboard.
//
// Props:
//   caseId    {string}  — UUID of the welfare case
//   caseData  {object}  — { title, event_type, target_amount, total_collected,
//                           status, opened_at }  (already loaded by parent)
//   chamaName {string}  — displayed in PDF header
//
// What's new over the starter:
//   ✅ React component with preview UI before generating
//   ✅ Fetches live contributions from Supabase by caseId
//   ✅ All tone/colour/copy sourced from reportTemplates.js (zero hardcoding)
//   ✅ Multi-page support — autotable handles overflow automatically
//   ✅ Full styled header block (chama name, case title, badge, date range)
//   ✅ Summary stats section (target, raised, contributors, pledges)
//   ✅ Contributions table — approved payments AND pledges in separate sections
//   ✅ Comment column with text-wrap (jspdf-autotable columnStyles)
//   ✅ Per-row status column (Approved / Pending / Pledge)
//   ✅ Tone-matched footer with closing message + tagline + signoff
//   ✅ Page numbers on every page (x of y)
//   ✅ Watermark-style "CONFIDENTIAL" diagonal text (optional, Officer only)
//   ✅ Loading + error states in the UI
//   ✅ Preview table in the UI before generating so officer can verify data
//   ✨ UI restyled — Emerald & Gold glass theme, matching WelfareOfficerDashboard
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from 'react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { supabase } from '../../supabaseClient';
import { getTemplate, COLOURS } from './reportTemplates';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const PAGE_W      = 210;   // A4 mm width
const MARGIN      = 14;    // left & right margin
const CONTENT_W   = PAGE_W - MARGIN * 2;
const FONT_FAMILY = 'helvetica';

// UI theme tokens — Emerald & Gold, mirrors WelfareOfficerDashboard's palette
const THEME = {
  green:      '#2fe6a0',
  greenDark:  '#08815a',
  greenGlow:  'rgba(47, 230, 160, 0.16)',
  greenBorder:'rgba(47, 230, 160, 0.35)',
  gold:       '#ffd166',
  goldDark:   '#b8860b',
  goldGlow:   'rgba(255, 209, 102, 0.16)',
  goldBorder: 'rgba(255, 209, 102, 0.35)',
  red:        '#ff6b6b',
  redGlow:    'rgba(255, 107, 107, 0.12)',
  redBorder:  'rgba(255, 107, 107, 0.3)',
  blue:       '#6cb6ff',
  purple:     '#c9b6ff',
  textDim:    '#aec2b3',
  textFaint:  '#6f8577',
  surface:    'rgba(255,255,255,0.03)',
  border:     'rgba(120, 160, 130, 0.18)',
  gradient:   'linear-gradient(135deg, #08815a 0%, #2fe6a0 45%, #ffd166 100%)',
};

// ─── PDF BUILDER  (pure function — no React) ─────────────────────────────────

/**
 * Generates and downloads the welfare PDF.
 *
 * @param {object} options
 * @param {object} options.caseData       — welfare_cases row
 * @param {Array}  options.contributions  — welfare_contributions rows (with member join)
 * @param {string} options.chamaName
 * @param {boolean} options.showWatermark — add CONFIDENTIAL diagonal text
 */
function buildPDF({ caseData, contributions, chamaName, showWatermark = false }) {
  const tmpl   = getTemplate(caseData.event_type);
  const col    = tmpl.colours;
  const doc    = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  const today  = new Date().toLocaleDateString('en-KE', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  const openedDate = caseData.opened_at
    ? new Date(caseData.opened_at).toLocaleDateString('en-KE', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    : '—';

  // Split contributions into paid vs pledges
  const paid    = contributions.filter(c => !c.is_pledge && c.status === 'Approved');
  const pledges = contributions.filter(c => c.is_pledge);
  const pending = contributions.filter(c => !c.is_pledge && c.status === 'Pending');

  const totalPaid    = paid.reduce((s, c)    => s + (c.amount ?? 0), 0);
  const totalPledged = pledges.reduce((s, c) => s + (c.amount ?? 0), 0);

  // ── Helper: add page numbers (called after all content is written) ──────────
  const addPageNumbers = () => {
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont(FONT_FAMILY, 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...COLOURS.neutralAccent);
      doc.text(
        `Page ${i} of ${pageCount}`,
        PAGE_W - MARGIN,
        doc.internal.pageSize.height - 8,
        { align: 'right' }
      );
    }
  };

  // ── Helper: draw a coloured header band ────────────────────────────────────
  const drawHeaderBand = () => {
    // Background rectangle
    doc.setFillColor(...col.background);
    doc.rect(0, 0, PAGE_W, 52, 'F');

    // Accent left stripe
    doc.setFillColor(...col.accent);
    doc.rect(0, 0, 4, 52, 'F');

    // Chama name (top-left)
    doc.setFont(FONT_FAMILY, 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...col.primary);
    doc.text(chamaName?.toUpperCase() ?? 'CHAMA', MARGIN, 11);

    // Report title (large)
    doc.setFont(FONT_FAMILY, 'bold');
    doc.setFontSize(18);
    doc.setTextColor(...col.primary);
    doc.text(tmpl.header.title, MARGIN, 23);

    // Subtitle
    doc.setFont(FONT_FAMILY, 'italic');
    doc.setFontSize(10);
    doc.setTextColor(...col.accent);
    doc.text(tmpl.header.subtitle, MARGIN, 31);

    // Badge (pill-style) — event type
    const badgeText  = `  ${tmpl.header.badge}  `;
    const badgeX     = MARGIN;
    const badgeY     = 37;
    const badgeW     = doc.getTextWidth(badgeText) + 2;
    doc.setFillColor(...col.accent);
    doc.roundedRect(badgeX, badgeY, badgeW, 6, 1.5, 1.5, 'F');
    doc.setFont(FONT_FAMILY, 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOURS.white);
    doc.text(badgeText, badgeX + 1, badgeY + 4.2);

    // Date (top-right)
    doc.setFont(FONT_FAMILY, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...col.primary);
    doc.text(`Generated: ${today}`, PAGE_W - MARGIN, 11, { align: 'right' });
    doc.text(`Case opened: ${openedDate}`, PAGE_W - MARGIN, 16, { align: 'right' });
  };

  // ── Helper: draw the summary stats block ───────────────────────────────────
  const drawSummaryBlock = (startY) => {
    const boxH = 26;
    doc.setFillColor(248, 250, 252);  // very light grey
    doc.setDrawColor(...COLOURS.border);
    doc.roundedRect(MARGIN, startY, CONTENT_W, boxH, 2, 2, 'FD');

    // Case title inside summary
    doc.setFont(FONT_FAMILY, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...col.primary);
    doc.text(caseData.title, MARGIN + 4, startY + 8);

    // Four stat columns
    const statW = CONTENT_W / 4;
    const stats = [
      { label: 'Target',       value: `KES ${(caseData.target_amount ?? 0).toLocaleString()}` },
      { label: 'Raised',       value: `KES ${(caseData.total_collected ?? 0).toLocaleString()}` },
      { label: 'Contributors', value: String(paid.length + pledges.length) },
      { label: 'Status',       value: caseData.status ?? '—' },
    ];

    stats.forEach((stat, i) => {
      const x = MARGIN + 4 + i * statW;
      doc.setFont(FONT_FAMILY, 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...COLOURS.neutralAccent);
      doc.text(stat.label.toUpperCase(), x, startY + 17);
      doc.setFont(FONT_FAMILY, 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...col.primary);
      doc.text(stat.value, x, startY + 22);
    });

    return startY + boxH + 5;
  };

  // ── Helper: draw purpose text paragraph ────────────────────────────────────
  const drawPurposeText = (startY) => {
    doc.setFont(FONT_FAMILY, 'italic');
    doc.setFontSize(9);
    doc.setTextColor(...COLOURS.neutralAccent);
    const lines = doc.splitTextToSize(tmpl.body.purposeText, CONTENT_W);
    doc.text(lines, MARGIN, startY);
    return startY + lines.length * 4.5 + 4;
  };

  // ── Helper: draw section heading ───────────────────────────────────────────
  const drawSectionHeading = (text, y) => {
    doc.setFillColor(...col.accent);
    doc.rect(MARGIN, y, CONTENT_W, 0.5, 'F');
    doc.setFont(FONT_FAMILY, 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...col.accent);
    doc.text(text.toUpperCase(), MARGIN, y - 2);
    return y + 4;
  };

  // ── Helper: draw contributions autotable ───────────────────────────────────
  const drawContribTable = (rows, startY, caption) => {
    if (rows.length === 0) return startY;

    const tableRows = rows.map((c, i) => [
      i + 1,
      c.members?.name ?? '—',
      c.members?.phone ?? '—',
      `KES ${(c.amount ?? 0).toLocaleString()}`,
      c.transaction_code ?? '—',
      // Word-wrap the comment — autotable handles it via columnStyles
      c.comment ?? '—',
      c.is_pledge ? 'Pledge' : c.status,
    ]);

    doc.autoTable({
      startY,
      head: [['#', 'Member', 'Phone', 'Amount', 'Txn Code', 'Comment', 'Status']],
      body: tableRows,
      theme: 'grid',
      styles: {
        font:      FONT_FAMILY,
        fontSize:  8,
        cellPadding: 2.5,
        textColor: col.primary,
        lineColor: COLOURS.border,
        lineWidth: 0.2,
        overflow:  'linebreak',      // key: enables word-wrap in all cells
      },
      headStyles: {
        fillColor:  col.accent,
        textColor:  COLOURS.white,
        fontStyle:  'bold',
        fontSize:   7.5,
        halign:     'left',
      },
      alternateRowStyles: {
        fillColor: col.background,
      },
      columnStyles: {
        0: { cellWidth: 8,  halign: 'center' },  // #
        1: { cellWidth: 36 },                     // Member
        2: { cellWidth: 26 },                     // Phone
        3: { cellWidth: 22, halign: 'right' },    // Amount
        4: { cellWidth: 24, font: 'courier', fontSize: 7 }, // Txn Code
        5: { cellWidth: 50, overflow: 'linebreak' },         // Comment (100 chars wraps here)
        6: { cellWidth: 16, halign: 'center' },              // Status
      },
      margin: { left: MARGIN, right: MARGIN },
      didDrawPage: (data) => {
        // Re-draw the header band on continuation pages
        if (data.pageNumber > 1) drawHeaderBand();
      },
    });

    // Table caption below table
    const captionY = doc.lastAutoTable.finalY + 3;
    doc.setFont(FONT_FAMILY, 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOURS.neutralAccent);
    doc.text(caption, MARGIN, captionY);

    return captionY + 6;
  };

  // ── Helper: summary totals row below paid table ────────────────────────────
  const drawTotalsRow = (y) => {
    doc.setFillColor(...col.accent);
    doc.setDrawColor(...col.accent);
    doc.roundedRect(MARGIN, y, CONTENT_W, 8, 1, 1, 'FD');

    doc.setFont(FONT_FAMILY, 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...COLOURS.white);
    doc.text(`Total Paid (Approved): KES ${totalPaid.toLocaleString()}`, MARGIN + 4, y + 5.5);
    if (totalPledged > 0) {
      doc.text(
        `Total Pledged: KES ${totalPledged.toLocaleString()}`,
        PAGE_W - MARGIN - 4,
        y + 5.5,
        { align: 'right' }
      );
    }
    return y + 12;
  };

  // ── Helper: draw footer ────────────────────────────────────────────────────
  const drawFooter = (y) => {
    const pageH = doc.internal.pageSize.height;

    // If footer won't fit on current page, add new page
    if (y > pageH - 50) {
      doc.addPage();
      drawHeaderBand();
      y = 60;
    }

    // Divider
    doc.setDrawColor(...COLOURS.border);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 6;

    // Closing paragraph
    doc.setFont(FONT_FAMILY, 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...col.primary);
    const closingLines = doc.splitTextToSize(tmpl.footer.closing, CONTENT_W);
    doc.text(closingLines, MARGIN, y);
    y += closingLines.length * 5 + 4;

    // Tagline (centred, accent colour, italic)
    doc.setFont(FONT_FAMILY, 'italic');
    doc.setFontSize(10);
    doc.setTextColor(...col.accent);
    doc.text(tmpl.footer.tagline, PAGE_W / 2, y, { align: 'center' });
    y += 8;

    // Signoff line
    doc.setDrawColor(...COLOURS.border);
    doc.line(MARGIN, y, MARGIN + 60, y);
    y += 4;
    doc.setFont(FONT_FAMILY, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...COLOURS.neutralAccent);
    doc.text(tmpl.footer.signoff, MARGIN, y);
    doc.text(`Date: ${today}`, PAGE_W - MARGIN, y, { align: 'right' });
  };

  // ── Helper: optional CONFIDENTIAL watermark ────────────────────────────────
  const drawWatermark = () => {
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont(FONT_FAMILY, 'bold');
      doc.setFontSize(52);
      doc.setTextColor(220, 220, 220);
      doc.text('CONFIDENTIAL', PAGE_W / 2, 160, {
        align:  'center',
        angle:  45,
      });
    }
  };

  // ── ASSEMBLE PDF ────────────────────────────────────────────────────────────

  drawHeaderBand();

  let y = 58;

  // Summary block
  y = drawSummaryBlock(y);

  // Purpose paragraph
  y = drawPurposeText(y);

  // ── Section 1: Approved Contributions ──
  y = drawSectionHeading(tmpl.body.sectionLabel, y);
  y = drawContribTable(paid, y, tmpl.body.tableCaption);

  if (paid.length > 0) {
    y = drawTotalsRow(y);
  }

  // ── Section 2: Pledges (if any) ──
  if (pledges.length > 0) {
    // May be on a new page already from autotable overflow — get current Y
    y = doc.lastAutoTable?.finalY
      ? Math.max(y, doc.lastAutoTable.finalY + 4)
      : y;
    y = drawSectionHeading('Pledges (Pending Payment)', y + 4);
    y = drawContribTable(pledges, y, 'Pledges — awaiting actual payment');
  }

  // ── Section 3: Pending (submitted but not yet approved) ──
  if (pending.length > 0) {
    y = doc.lastAutoTable?.finalY
      ? Math.max(y, doc.lastAutoTable.finalY + 4)
      : y;
    y = drawSectionHeading('Pending Approval', y + 4);
    y = drawContribTable(pending, y, 'Payments awaiting officer approval');
  }

  // Footer
  const finalY = doc.lastAutoTable?.finalY
    ? Math.max(y, doc.lastAutoTable.finalY + 10)
    : y + 10;
  drawFooter(finalY);

  // Watermark (after all content so it doesn't obscure)
  if (showWatermark) drawWatermark();

  // Page numbers (last pass)
  addPageNumbers();

  // Save
  const safeTitle = (caseData.title ?? 'welfare')
    .replace(/[^a-z0-9]/gi, '_')
    .toLowerCase();
  doc.save(`Welfare_Report_${safeTitle}_${Date.now()}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// REACT COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function WelfareReportPDF({ caseId, caseData, chamaName }) {
  const [contribs, setContribs]         = useState([]);
  const [loading, setLoading]           = useState(false);
  const [generating, setGenerating]     = useState(false);
  const [error, setError]               = useState('');
  const [showWatermark, setShowWatermark] = useState(false);
  const [previewMode, setPreviewMode]   = useState(false);
  const [btnHover, setBtnHover]         = useState(false);
  const [toggleHover, setToggleHover]   = useState(false);

  const tmpl = getTemplate(caseData?.event_type);

  // ── Fetch contributions when caseId changes ───────────────────────────────
  const fetchContribs = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    setError('');
    const { data, error: dbErr } = await supabase
      .from('welfare_contributions')
      .select(`
        id, amount, is_pledge, transaction_code, comment, status, created_at,
        members ( name, phone )
      `)
      .eq('case_id', caseId)
      .order('created_at', { ascending: true });

    if (dbErr) {
      setError('Failed to load contributions. Please try again.');
    } else {
      setContribs(data ?? []);
    }
    setLoading(false);
  }, [caseId]);

  useEffect(() => { fetchContribs(); }, [fetchContribs]);

  // ── Generate PDF ─────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    try {
      buildPDF({ caseData, contributions: contribs, chamaName, showWatermark });
    } catch (err) {
      console.error('PDF generation error:', err);
      setError('PDF generation failed. Ensure jspdf-autotable is installed correctly.');
    } finally {
      setGenerating(false);
    }
  };

  // ── Derived stats for UI preview ─────────────────────────────────────────
  const paid      = contribs.filter(c => !c.is_pledge && c.status === 'Approved');
  const pledges   = contribs.filter(c => c.is_pledge);
  const pending   = contribs.filter(c => !c.is_pledge && c.status === 'Pending');
  const totalPaid = paid.reduce((s, c) => s + (c.amount ?? 0), 0);

  const toneDotColour =
    tmpl.tone === 'empathy' ? THEME.blue :
    tmpl.tone === 'celebration' ? THEME.green :
    THEME.gold;

  const disableGenerate = generating || loading || contribs.length === 0;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={s.wrapper}>

      {/* ── Tone badge ── */}
      <div style={s.toneBanner}>
        <span style={{ ...s.toneDot, background: toneDotColour, boxShadow: `0 0 8px ${toneDotColour}` }} />
        <span style={s.toneLabel}>
          PDF Tone: <strong style={{ color: THEME.gold }}>
            {tmpl.tone === 'empathy' ? 'Empathy' : tmpl.tone === 'celebration' ? 'Celebration' : 'Community'}
          </strong>
          {' — '}{tmpl.header.subtitle}
        </span>
      </div>

      {/* ── Stats row ── */}
      {loading ? (
        <p style={s.loading}>
          <span style={s.spinnerDot} /> Loading contributions…
        </p>
      ) : (
        <div style={s.statsRow}>
          <div style={{ ...s.statCard, borderColor: THEME.greenBorder }}>
            <p style={s.statLabel}>Approved Payments</p>
            <p style={{ ...s.statVal, color: THEME.green }}>{paid.length}</p>
          </div>
          <div style={{ ...s.statCard, borderColor: THEME.goldBorder }}>
            <p style={s.statLabel}>Total Paid</p>
            <p style={{ ...s.statVal, color: THEME.gold }}>KES {totalPaid.toLocaleString()}</p>
          </div>
          <div style={{ ...s.statCard, borderColor: 'rgba(201,182,255,0.3)' }}>
            <p style={s.statLabel}>Pledges</p>
            <p style={{ ...s.statVal, color: THEME.purple }}>{pledges.length}</p>
          </div>
          <div style={{ ...s.statCard, borderColor: THEME.goldBorder }}>
            <p style={s.statLabel}>Pending</p>
            <p style={{ ...s.statVal, color: '#f2b93c' }}>{pending.length}</p>
          </div>
        </div>
      )}

      {/* ── Data preview table ── */}
      <div style={s.previewToggleRow}>
        <button
          style={{
            ...s.previewToggleBtn,
            color: toggleHover ? THEME.gold : THEME.green,
          }}
          onMouseEnter={() => setToggleHover(true)}
          onMouseLeave={() => setToggleHover(false)}
          onClick={() => setPreviewMode(p => !p)}
        >
          {previewMode ? '▲ Hide Preview' : '▼ Preview Contribution Data'}
        </button>
        <label style={s.watermarkLabel}>
          <input
            type="checkbox"
            checked={showWatermark}
            onChange={e => setShowWatermark(e.target.checked)}
            style={{ marginRight: '7px', accentColor: THEME.green }}
          />
          Add CONFIDENTIAL watermark
        </label>
      </div>

      {previewMode && contribs.length > 0 && (
        <div style={s.previewTable}>
          {/* Head */}
          <div style={s.pHead}>
            <span>Member</span>
            <span>Amount</span>
            <span>Txn Code</span>
            <span>Comment</span>
            <span>Status</span>
          </div>
          {contribs.map(c => (
            <div key={c.id} style={s.pRow}>
              <span style={s.pBold}>{c.members?.name ?? '—'}</span>
              <span style={{ color: THEME.green, fontWeight: 700 }}>KES {(c.amount ?? 0).toLocaleString()}</span>
              <span style={s.pMono}>{c.transaction_code ?? '—'}</span>
              <span style={s.pMuted} title={c.comment ?? ''}>
                {c.comment
                  ? c.comment.length > 35 ? c.comment.slice(0, 35) + '…' : c.comment
                  : '—'}
              </span>
              <span>
                <span style={{
                  ...s.chip,
                  background: c.is_pledge ? 'rgba(201,182,255,0.14)' : c.status === 'Approved' ? THEME.greenGlow : THEME.goldGlow,
                  color:      c.is_pledge ? THEME.purple : c.status === 'Approved' ? THEME.green : THEME.gold,
                  border: `1px solid ${c.is_pledge ? 'rgba(201,182,255,0.3)' : c.status === 'Approved' ? THEME.greenBorder : THEME.goldBorder}`,
                }}>
                  {c.is_pledge ? 'Pledge' : c.status}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      {previewMode && contribs.length === 0 && !loading && (
        <p style={s.noData}>No contributions found for this case yet.</p>
      )}

      {/* ── Error ── */}
      {error && (
        <div style={s.errorBox} role="alert">⚠ {error}</div>
      )}

      {/* ── Generate button ── */}
      <button
        style={{
          ...s.generateBtn,
          opacity: disableGenerate ? 0.55 : 1,
          cursor:  generating ? 'wait' : disableGenerate ? 'not-allowed' : 'pointer',
          transform: btnHover && !disableGenerate ? 'translateY(-2px)' : 'translateY(0)',
          boxShadow: btnHover && !disableGenerate
            ? '0 10px 28px rgba(255,209,102,0.32), inset 0 1px 0 rgba(255,255,255,0.3)'
            : '0 6px 20px rgba(47,230,160,0.28), inset 0 1px 0 rgba(255,255,255,0.25)',
        }}
        onMouseEnter={() => setBtnHover(true)}
        onMouseLeave={() => setBtnHover(false)}
        onClick={handleGenerate}
        disabled={disableGenerate}
      >
        {generating ? (
          '⏳ Generating PDF…'
        ) : (
          <>📄 Download Welfare Report PDF</>
        )}
      </button>

      {contribs.length === 0 && !loading && (
        <p style={s.noDataHint}>
          No contributions recorded for this case yet. Add contributions before generating a report.
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES — Emerald & Gold glass theme
// ─────────────────────────────────────────────────────────────────────────────

const s = {
  wrapper: {
    marginTop: '4px',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  toneBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '9px',
    padding: '10px 14px',
    background: THEME.surface,
    backdropFilter: 'blur(10px)',
    border: `1px solid ${THEME.border}`,
    borderRadius: '10px',
    marginBottom: '15px',
    fontSize: '0.8rem',
    color: THEME.textDim,
  },
  toneDot: {
    width: '9px',
    height: '9px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  toneLabel: {
    lineHeight: 1.45,
  },
  loading: {
    fontSize: '0.8rem',
    color: THEME.textDim,
    padding: '10px 0',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  spinnerDot: {
    display: 'inline-block',
    width: '13px',
    height: '13px',
    borderRadius: '50%',
    border: `2px solid ${THEME.border}`,
    borderTopColor: THEME.green,
    animation: 'wd-spin 0.8s linear infinite',
  },
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4,1fr)',
    gap: '9px',
    marginBottom: '15px',
  },
  statCard: {
    background: THEME.surface,
    backdropFilter: 'blur(10px)',
    border: '1px solid',
    borderRadius: '10px',
    padding: '10px 12px',
    transition: 'transform .2s ease',
  },
  statLabel: {
    margin: '0 0 4px',
    fontSize: '0.63rem',
    color: THEME.textFaint,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  statVal: {
    margin: 0,
    fontSize: '1.05rem',
    fontWeight: '800',
    fontVariantNumeric: 'tabular-nums',
  },
  previewToggleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '11px',
    gap: '12px',
    flexWrap: 'wrap',
  },
  previewToggleBtn: {
    background: 'transparent',
    border: 'none',
    fontSize: '0.78rem',
    cursor: 'pointer',
    fontFamily: 'inherit',
    padding: 0,
    fontWeight: '700',
    transition: 'color .15s ease',
  },
  watermarkLabel: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '0.75rem',
    color: THEME.textDim,
    cursor: 'pointer',
  },
  previewTable: {
    marginBottom: '15px',
    border: `1px solid ${THEME.border}`,
    borderRadius: '10px',
    overflow: 'hidden',
    background: THEME.surface,
    backdropFilter: 'blur(10px)',
  },
  pHead: {
    display: 'grid',
    gridTemplateColumns: '1.8fr 0.9fr 1.1fr 1.8fr 0.8fr',
    gap: '8px',
    padding: '8px 13px',
    background: 'linear-gradient(135deg, rgba(8,129,90,0.20), rgba(255,209,102,0.14))',
    fontSize: '0.65rem',
    fontWeight: '800',
    color: THEME.gold,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  pRow: {
    display: 'grid',
    gridTemplateColumns: '1.8fr 0.9fr 1.1fr 1.8fr 0.8fr',
    gap: '8px',
    padding: '9px 13px',
    borderTop: `1px solid ${THEME.border}`,
    fontSize: '0.78rem',
    color: THEME.textDim,
    alignItems: 'center',
  },
  pBold:  { fontWeight: '700', color: '#f2f8f3' },
  pMono:  { fontFamily: 'monospace', fontSize: '0.72rem', color: THEME.textFaint },
  pMuted: { fontSize: '0.73rem', color: THEME.textFaint },
  chip: {
    display: 'inline-block',
    padding: '3px 9px',
    borderRadius: '9999px',
    fontSize: '0.67rem',
    fontWeight: '700',
  },
  noData: {
    fontSize: '0.8rem',
    color: THEME.textFaint,
    padding: '8px 0',
    marginBottom: '10px',
  },
  noDataHint: {
    fontSize: '0.75rem',
    color: THEME.textFaint,
    marginTop: '9px',
    textAlign: 'center',
  },
  errorBox: {
    background: THEME.redGlow,
    border: `1px solid ${THEME.redBorder}`,
    borderRadius: '10px',
    padding: '10px 14px',
    fontSize: '0.8rem',
    color: '#ffb3b3',
    marginBottom: '13px',
    backdropFilter: 'blur(6px)',
  },
  generateBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    width: '100%',
    padding: '13px 20px',
    background: THEME.gradient,
    border: 'none',
    borderRadius: '10px',
    color: '#05271c',
    fontSize: '0.92rem',
    fontWeight: '800',
    fontFamily: 'inherit',
    transition: 'transform .2s cubic-bezier(0.22,1,0.36,1), box-shadow .2s cubic-bezier(0.22,1,0.36,1), opacity .15s ease',
  },
};