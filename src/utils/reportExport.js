import * as XLSX from "xlsx";

// ── PDF Export ────────────────────────────────────────────────────────────────
// Captures the reports content area using html2canvas and builds a multi-page
// A4 PDF with a branded header on every page.

export async function exportToPDF({ contentRef, filename, title, dateLabel, companyName }) {
  const [{ jsPDF }, html2canvasMod] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);
  const html2canvas = html2canvasMod.default;

  const el = contentRef.current;
  if (!el) return;

  const scrollY = window.scrollY;
  window.scrollTo(0, 0);

  const canvas = await html2canvas(el, {
    scale: 1.5,
    useCORS: true,
    allowTaint: true,
    backgroundColor: "#ffffff",
    logging: false,
    width: el.scrollWidth,
    height: el.scrollHeight,
    windowWidth: el.scrollWidth,
    windowHeight: el.scrollHeight,
  });

  window.scrollTo(0, scrollY);

  const pdf = new jsPDF.jsPDF("p", "mm", "a4");
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 12;
  const contentW = pageW - margin * 2;
  const headerH = 18;
  const footerH = 8;
  const pageContentH = pageH - headerH - footerH;

  const addHeader = (pageNum) => {
    pdf.setFillColor(37, 99, 235);
    pdf.rect(0, 0, pageW, headerH, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "bold");
    pdf.text(title, margin, 12);
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.text(
      `${companyName || ""}  •  ${dateLabel}  •  ${new Date().toLocaleDateString()}  •  Page ${pageNum}`,
      pageW - margin,
      12,
      { align: "right" },
    );
    pdf.setTextColor(0, 0, 0);
  };

  const scaleX = canvas.width / contentW;
  const sliceH_px = pageContentH * scaleX;
  let sliceY_px = 0;
  let pageNum = 1;

  while (sliceY_px < canvas.height) {
    if (pageNum > 1) pdf.addPage();
    addHeader(pageNum);

    const thisSliceH_px = Math.min(sliceH_px, canvas.height - sliceY_px);
    const thisSliceH_mm = thisSliceH_px / scaleX;

    const sliceCanvas = document.createElement("canvas");
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = thisSliceH_px;
    const ctx = sliceCanvas.getContext("2d");
    ctx.drawImage(canvas, 0, sliceY_px, canvas.width, thisSliceH_px, 0, 0, canvas.width, thisSliceH_px);

    pdf.addImage(sliceCanvas.toDataURL("image/png"), "PNG", margin, headerH + 2, contentW, thisSliceH_mm);

    sliceY_px += sliceH_px;
    pageNum++;
  }

  pdf.save(filename);
}

// ── XLSX Export ───────────────────────────────────────────────────────────────
// Builds a multi-sheet workbook: KPI Summary, All Deals, Pipeline by Stage,
// Lead Sources, Team Performance (if applicable), Deal Aging.

export function exportToXLSX({ deals, contacts, teamMembers, period, company }) {
  const wb = XLSX.utils.book_new();
  const today = new Date();

  const won    = deals.filter((d) => d.stage === "won");
  const lost   = deals.filter((d) => d.stage === "lost");
  const open   = deals.filter((d) => !["won", "lost"].includes(d.stage));
  const closed = won.length + lost.length;
  const winRate  = closed > 0 ? Math.round((won.length / closed) * 100) : 0;
  const revenue  = won.reduce((s, d) => s + (d.amount || 0), 0);
  const pipeline = open.reduce((s, d) => s + (d.amount || 0), 0);
  const avgDeal  = won.length > 0 ? revenue / won.length : 0;
  const overdue  = open.filter((d) => d.expected_close_date && new Date(d.expected_close_date) < today);

  const periodStart = period?.special === "all" ? "All Time" : (period?.startDate?.toLocaleDateString() ?? "");
  const periodEnd   = period?.special === "all" ? "All Time" : (period?.endDate?.toLocaleDateString() ?? "");

  // ── Sheet 1: KPI Summary ──────────────────────────────────────────────────
  const kpiRows = [
    ["Metric", "Value"],
    ["Period Start", periodStart],
    ["Period End", periodEnd],
    ["Company", company?.name || "All"],
    [""],
    ["Revenue (Won)", revenue],
    ["Won Deals", won.length],
    ["Lost Deals", lost.length],
    ["Win Rate %", winRate],
    ["Pipeline Value (Open)", pipeline],
    ["Open Deals", open.length],
    ["Total Deals", deals.length],
    ["Avg Deal Size (Won)", avgDeal],
    ["New Contacts", contacts.length],
    ["Overdue Deals", overdue.length],
    ["Overdue Value", overdue.reduce((s, d) => s + (d.amount || 0), 0)],
  ];
  const wsKPI = XLSX.utils.aoa_to_sheet(kpiRows);
  wsKPI["!cols"] = [{ wch: 28 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsKPI, "KPI Summary");

  // ── Sheet 2: All Deals ────────────────────────────────────────────────────
  const dealHeaders = [
    "Title", "Stage", "Amount", "Priority", "Owner",
    "Contact Company", "Lead Source",
    "Created At", "Expected Close", "Age (days)", "Overdue",
  ];
  const dealRows = deals.map((d) => {
    const age = Math.floor((today - new Date(d.created_at)) / 86400000);
    const isOverdue =
      d.expected_close_date &&
      new Date(d.expected_close_date) < today &&
      !["won", "lost"].includes(d.stage);
    return [
      d.title || `Deal #${d.id?.slice(0, 8)}`,
      d.stage,
      d.amount || 0,
      d.priority || "",
      d.owner?.full_name || "",
      d.contact?.company_name || "",
      d.contact?.lead_source || "",
      d.created_at ? new Date(d.created_at).toLocaleDateString() : "",
      d.expected_close_date ? new Date(d.expected_close_date).toLocaleDateString() : "",
      age,
      isOverdue ? "Yes" : "",
    ];
  });
  dealRows.sort((a, b) => (b[2] || 0) - (a[2] || 0));
  const wsDeals = XLSX.utils.aoa_to_sheet([dealHeaders, ...dealRows]);
  wsDeals["!cols"] = [
    { wch: 32 }, { wch: 16 }, { wch: 14 }, { wch: 10 }, { wch: 22 },
    { wch: 26 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, wsDeals, "All Deals");

  // ── Sheet 3: Pipeline by Stage ────────────────────────────────────────────
  const stageOrder  = ["lead", "contact_made", "proposal_sent", "negotiation", "won", "lost"];
  const stageLabels = {
    lead: "Lead", contact_made: "Qualified", proposal_sent: "Proposal",
    negotiation: "Negotiation", won: "Won", lost: "Lost",
  };
  const stageHeaders = ["Stage", "Count", "Total Value", "Avg Value", "% of Total Deals"];
  const stageRows = stageOrder.map((stage) => {
    const sd = deals.filter((d) => d.stage === stage);
    const total = sd.reduce((s, d) => s + (d.amount || 0), 0);
    return [
      stageLabels[stage] || stage,
      sd.length,
      total,
      sd.length > 0 ? Math.round(total / sd.length) : 0,
      deals.length > 0 ? Math.round((sd.length / deals.length) * 100) : 0,
    ];
  });
  const wsStage = XLSX.utils.aoa_to_sheet([stageHeaders, ...stageRows]);
  wsStage["!cols"] = [{ wch: 18 }, { wch: 10 }, { wch: 18 }, { wch: 16 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsStage, "Pipeline by Stage");

  // ── Sheet 4: Lead Sources ─────────────────────────────────────────────────
  const sourceCounts  = {};
  const sourceRevenue = {};
  const sourcePipeline = {};
  contacts.forEach((c) => {
    const src = c.lead_source || "Unknown";
    sourceCounts[src] = (sourceCounts[src] || 0) + 1;
  });
  won.forEach((d) => {
    const src = d.contact?.lead_source || "Unknown";
    sourceRevenue[src] = (sourceRevenue[src] || 0) + (d.amount || 0);
  });
  open.forEach((d) => {
    const src = d.contact?.lead_source || "Unknown";
    sourcePipeline[src] = (sourcePipeline[src] || 0) + (d.amount || 0);
  });
  const allSources = [...new Set([...Object.keys(sourceCounts), ...Object.keys(sourceRevenue)])];
  const srcHeaders = ["Lead Source", "Contacts", "Revenue (Won)", "Pipeline (Open)"];
  const srcRows = allSources.map((src) => [
    src,
    sourceCounts[src] || 0,
    sourceRevenue[src] || 0,
    sourcePipeline[src] || 0,
  ]);
  srcRows.sort((a, b) => b[2] - a[2]);
  const wsSource = XLSX.utils.aoa_to_sheet([srcHeaders, ...srcRows]);
  wsSource["!cols"] = [{ wch: 22 }, { wch: 12 }, { wch: 22 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsSource, "Lead Sources");

  // ── Sheet 5: Team Performance (supervisor+) ───────────────────────────────
  if (teamMembers && teamMembers.length > 0) {
    const tmHeaders = [
      "Rep Name", "Email", "Total Deals", "Won", "Lost",
      "Win Rate %", "Revenue (Won)", "Pipeline (Open)", "Avg Deal Size",
    ];
    const tmRows = teamMembers.map((m) => {
      const myDeals   = deals.filter((d) => d.owner_id === m.id);
      const myWon     = myDeals.filter((d) => d.stage === "won");
      const myLost    = myDeals.filter((d) => d.stage === "lost");
      const myClosed  = myWon.length + myLost.length;
      const myWinRate = myClosed > 0 ? Math.round((myWon.length / myClosed) * 100) : 0;
      const myRevenue = myWon.reduce((s, d) => s + (d.amount || 0), 0);
      const myPipe    = myDeals
        .filter((d) => !["won", "lost"].includes(d.stage))
        .reduce((s, d) => s + (d.amount || 0), 0);
      const myAvg     = myWon.length > 0 ? Math.round(myRevenue / myWon.length) : 0;
      return [m.full_name || m.email, m.email, myDeals.length, myWon.length, myLost.length, myWinRate, myRevenue, myPipe, myAvg];
    });
    tmRows.sort((a, b) => b[6] - a[6]);
    const wsTM = XLSX.utils.aoa_to_sheet([tmHeaders, ...tmRows]);
    wsTM["!cols"] = [
      { wch: 24 }, { wch: 30 }, { wch: 13 }, { wch: 8 }, { wch: 8 },
      { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 16 },
    ];
    XLSX.utils.book_append_sheet(wb, wsTM, "Team Performance");
  }

  // ── Sheet 6: Deal Aging (open only) ──────────────────────────────────────
  const agingHeaders = [
    "Title", "Stage", "Amount", "Owner",
    "Created At", "Age (days)", "Expected Close", "Overdue",
  ];
  const agingRows = open
    .map((d) => {
      const age = Math.floor((today - new Date(d.created_at)) / 86400000);
      const isOverdue = d.expected_close_date && new Date(d.expected_close_date) < today;
      return [
        d.title || `Deal #${d.id?.slice(0, 8)}`,
        d.stage,
        d.amount || 0,
        d.owner?.full_name || "",
        d.created_at ? new Date(d.created_at).toLocaleDateString() : "",
        age,
        d.expected_close_date ? new Date(d.expected_close_date).toLocaleDateString() : "",
        isOverdue ? "Yes" : "",
      ];
    })
    .sort((a, b) => b[5] - a[5]);
  const wsAging = XLSX.utils.aoa_to_sheet([agingHeaders, ...agingRows]);
  wsAging["!cols"] = [
    { wch: 32 }, { wch: 16 }, { wch: 14 }, { wch: 22 },
    { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, wsAging, "Deal Aging");

  // ── Write file ────────────────────────────────────────────────────────────
  const name = company?.name || "Report";
  const label =
    period?.special === "all"
      ? "AllTime"
      : `${periodStart}-${periodEnd}`.replace(/\//g, "-");
  XLSX.writeFile(wb, `${name}_${label}.xlsx`);
}
