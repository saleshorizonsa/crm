import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

// ── Styles ────────────────────────────────────────────────────────────────────

const NAVY = "#1E3A5F";

const styles = StyleSheet.create({
  page: {
    padding:    32,
    fontFamily: "Helvetica",
    fontSize:   9,
    color:      "#222",
  },
  header: {
    backgroundColor: NAVY,
    color:           "white",
    fontSize:        16,
    padding:         "10 16",
    marginBottom:    4,
  },
  subheader: {
    fontSize:     10,
    color:        "#888",
    marginBottom: 16,
  },
  table: {
    width:        "100%",
    borderWidth:  0.5,
    borderColor:  "#ccc",
    borderStyle:  "solid",
  },
  headerRow: {
    flexDirection:  "row",
    backgroundColor: NAVY,
    fontFamily:     "Helvetica-Bold",
    fontSize:       9,
  },
  row: {
    flexDirection: "row",
    fontSize:      9,
  },
  cell: {
    padding:          "5 8",
    flex:             1,
    color:            "#222",
    borderRightWidth: 0.5,
    borderRightColor: "#ccc",
    borderRightStyle: "solid",
  },
  headerCell: {
    padding:          "5 8",
    flex:             1,
    color:            "white",
    borderRightWidth: 0.5,
    borderRightColor: "#3a5a8a",
    borderRightStyle: "solid",
  },
  footer: {
    fontSize:   8,
    color:      "#888",
    marginTop:  20,
    textAlign:  "center",
  },
});

// ── Column definitions per report type ────────────────────────────────────────

const COLUMNS = {
  pipeline: [
    { label: "Deal",       get: (r) => r.title || "—" },
    { label: "Contact",    get: (r) => r.contact ? `${r.contact.first_name || ""} ${r.contact.last_name || ""}`.trim() : "—" },
    { label: "Stage",      get: (r) => r.stage || "—" },
    { label: "Amount",     get: (r) => r.amount != null ? Number(r.amount).toLocaleString() : "—" },
    { label: "Owner",      get: (r) => r.owner?.full_name || "—" },
    { label: "Close Date", get: (r) => r.expected_close_date?.slice(0, 10) || "—" },
  ],
  targets: [
    { label: "Assignee",  get: (r) => r.assignee?.full_name || "—" },
    { label: "Target",    get: (r) => r.target_amount != null ? Number(r.target_amount).toLocaleString() : "—" },
    { label: "Achieved",  get: (r) => r.achieved != null ? Number(r.achieved).toLocaleString() : "—" },
    { label: "Remaining", get: (r) => {
      const rem = (r.target_amount || 0) - (r.achieved || 0);
      return rem > 0 ? Number(rem).toLocaleString() : "0";
    }},
    { label: "Period",    get: (r) => `${r.period_start || ""}  →  ${r.period_end || ""}` },
  ],
  leaderboard: [
    { label: "Rank",     get: (r) => String(r.rank ?? "") },
    { label: "Name",     get: (r) => r.name || "—" },
    { label: "Revenue",  get: (r) => r.revenue != null ? Number(r.revenue).toLocaleString() : "0" },
    { label: "Deals",    get: (r) => String(r.dealCount ?? 0) },
    { label: "Win Rate", get: (r) => `${r.winRate ?? 0}%` },
  ],
  activity: [
    { label: "Date",        get: (r) => r.created_at?.slice(0, 10) || "—" },
    { label: "Type",        get: (r) => r.type || "—" },
    { label: "Description", get: (r) => r.title || r.description || "—" },
    { label: "Deal",        get: (r) => r.deal?.title || "—" },
    { label: "User",        get: (r) => r.user?.full_name || "—" },
  ],
};

const TYPE_LABELS = {
  pipeline:    "Pipeline Report",
  targets:     "Targets Report",
  leaderboard: "Leaderboard",
  activity:    "Activity Report",
};

// ── PDF Document component ────────────────────────────────────────────────────

export const ReportPDF = ({ reportType, data = [], dateRange = {}, companyName = "" }) => {
  const cols  = COLUMNS[reportType] ?? COLUMNS.pipeline;
  const title = TYPE_LABELS[reportType] ?? "Report";
  const label = dateRange.from && dateRange.to
    ? `${dateRange.from} — ${dateRange.to}`
    : "All Time";

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* Header bar */}
        <View style={styles.header}>
          <Text>{companyName ? `${companyName} — ` : ""}{title}</Text>
        </View>

        {/* Sub-header */}
        <Text style={styles.subheader}>
          {label}  ·  Generated {new Date().toLocaleDateString()}  ·  {data.length} rows
        </Text>

        {/* Table */}
        <View style={styles.table}>
          {/* Column headers */}
          <View style={styles.headerRow}>
            {cols.map((c, i) => (
              <Text key={i} style={styles.headerCell}>{c.label}</Text>
            ))}
          </View>

          {/* Data rows (cap at 500 to keep PDF manageable) */}
          {data.slice(0, 500).map((row, ri) => (
            <View
              key={ri}
              style={[styles.row, { backgroundColor: ri % 2 === 0 ? "white" : "#f9f9f9" }]}
            >
              {cols.map((c, ci) => (
                <Text key={ci} style={styles.cell}>{String(c.get(row) ?? "")}</Text>
              ))}
            </View>
          ))}
        </View>

        <Text style={styles.footer}>
          {companyName}  ·  {title}  ·  {label}  ·  {new Date().toLocaleDateString()}
        </Text>
      </Page>
    </Document>
  );
};

// ── Download helper ───────────────────────────────────────────────────────────

/**
 * Render the ReportPDF to a Blob and trigger a browser download.
 */
export async function downloadReportPdf(reportType, data, dateRange, companyName) {
  const { pdf } = await import("@react-pdf/renderer");

  const blob = await pdf(
    <ReportPDF
      reportType={reportType}
      data={data}
      dateRange={dateRange}
      companyName={companyName}
    />,
  ).toBlob();

  const label = dateRange?.from ? `${dateRange.from}_${dateRange.to || ""}` : "all";
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement("a");
  a.href      = url;
  a.download  = `${reportType}-${label}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
