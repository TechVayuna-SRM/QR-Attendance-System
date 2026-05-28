import { useState, useEffect } from "react";
import { Bar, Pie, Doughnut, Line } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  ArcElement, Tooltip, Legend, PointElement, LineElement, Filler
} from "chart.js";
import { useAuth } from "../context/AuthContext";
import api from "../api";

ChartJS.register(
  CategoryScale, LinearScale, BarElement,
  ArcElement, Tooltip, Legend, PointElement, LineElement, Filler
);

// ── Palette ──────────────────────────────────────────────────────
const COLORS = {
  present: "#4ade80", presentBg: "rgba(74,222,128,0.15)", presentBorder: "#22c55e",
  absent:  "#f87171", absentBg:  "rgba(248,113,113,0.15)", absentBorder:  "#ef4444",
  blue:    "#60a5fa", purple: "#a78bfa", amber: "#fbbf24",
  grid: "rgba(255,255,255,0.05)", text: "#9ca3af", textLight: "#d1d5db",
  card: "#111827", border: "#1f2937", page: "#0f1117",
};

const DOMAIN_PALETTE = [
  "#f72585","#7209b7","#3a0ca3","#4361ee","#4cc9f0",
  "#4ade80","#facc15","#fb923c","#f87171","#a78bfa","#34d399","#38bdf8"
];

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export default function Analytics() {
  const { user } = useAuth();
  const [summary,     setSummary]     = useState(null);
  const [domains,     setDomains]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [filters,     setFilters]     = useState({ domain_id: "", start_date: "", end_date: "", week: "", month: "", year: "" });
  const [filterMode,  setFilterMode]  = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [activeTab,   setActiveTab]   = useState("overview");  // overview | members | report

  useEffect(() => {
    api.get("/analytics/domains").then(r => setDomains(r.data)).catch(() => {});
    fetchSummary();
    const iv = setInterval(fetchSummary, 30000);
    return () => clearInterval(iv);
  }, []);

  const fetchSummary = async (params = {}) => {
    try {
      setLoading(true);
      const res = await api.get("/analytics/summary", { params });
      setSummary(res.data);
      setLastUpdated(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    } catch (err) {
      console.error("Analytics error:", err);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => fetchSummary(Object.fromEntries(Object.entries(filters).filter(([,v]) => v)));
  const resetFilters = () => {
    setFilters({ domain_id: "", start_date: "", end_date: "", week: "", month: "", year: "" });
    setFilterMode("");
    fetchSummary();
  };

  const downloadReport = async (fmt) => {
    try {
      const params = { ...Object.fromEntries(Object.entries(filters).filter(([,v]) => v)), format: fmt };
      const res = await api.get("/analytics/report", { params, responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a"); a.href = url;
      a.download = `attendance_report.${fmt}`; a.click();
    } catch (err) {
      alert(err.response?.status === 404 ? "No attendance data found for the selected filters." : "Download failed. Please try again.");
    }
  };

  // ── Derived data ─────────────────────────────────────────────
  const domainLabels  = summary ? Object.keys(summary.domain_stats) : [];
  const domainPresent = domainLabels.map(d => summary.domain_stats[d].present);
  const domainAbsent  = domainLabels.map(d => summary.domain_stats[d].absent);
  const dateLabels    = summary ? Object.keys(summary.date_trend).sort().slice(-10) : [];
  const datePresent   = dateLabels.map(d => summary.date_trend[d].present);
  const dateAbsent    = dateLabels.map(d => summary.date_trend[d].absent);
  const memberEntries = summary?.member_stats ? Object.entries(summary.member_stats) : [];
  const activeCount   = memberEntries.filter(([,m]) => m.present > 0).length;
  const inactiveCount = memberEntries.filter(([,m]) => m.present === 0).length;
  const isPrivileged  = ["admin","faculty","domain_lead"].includes(user.role);

  // ── Chart configs ─────────────────────────────────────────────
  const trendBarData = {
    labels: dateLabels,
    datasets: [
      { label: "Present", data: datePresent, backgroundColor: COLORS.presentBg, borderColor: COLORS.presentBorder, borderWidth: 2, borderRadius: 6 },
      { label: "Absent",  data: dateAbsent,  backgroundColor: COLORS.absentBg,  borderColor: COLORS.absentBorder,  borderWidth: 2, borderRadius: 6 },
    ]
  };
  const barOpts = (title) => ({
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: COLORS.text, padding: 16, font: { size: 12 } } }, title: { display: false } },
    scales: {
      x: { ticks: { color: COLORS.text, font: { size: 11 } }, grid: { color: COLORS.grid } },
      y: { ticks: { color: COLORS.text, font: { size: 11 } }, grid: { color: COLORS.grid }, beginAtZero: true }
    }
  });

  const domainBarData = {
    labels: domainLabels,
    datasets: [
      { label: "Present", data: domainPresent, backgroundColor: "rgba(74,222,128,0.75)",  borderColor: COLORS.presentBorder, borderWidth: 1.5, borderRadius: 5 },
      { label: "Absent",  data: domainAbsent,  backgroundColor: "rgba(248,113,113,0.75)", borderColor: COLORS.absentBorder,  borderWidth: 1.5, borderRadius: 5 },
    ]
  };

  const pieData = {
    labels: ["Present", "Absent"],
    datasets: [{ data: [summary?.present || 0, summary?.absent || 0],
      backgroundColor: [COLORS.presentBg, COLORS.absentBg],
      borderColor:     [COLORS.presentBorder, COLORS.absentBorder],
      borderWidth: 2, hoverOffset: 10 }]
  };
  const pieOpts = {
    responsive: true, maintainAspectRatio: false, cutout: "68%",
    plugins: { legend: { position: "bottom", labels: { color: COLORS.text, padding: 16, font: { size: 12 } } } }
  };

  const domainPieData = {
    labels: domainLabels,
    datasets: [{ data: domainPresent,
      backgroundColor: domainLabels.map((_, i) => DOMAIN_PALETTE[i % DOMAIN_PALETTE.length] + "99"),
      borderColor:     domainLabels.map((_, i) => DOMAIN_PALETTE[i % DOMAIN_PALETTE.length]),
      borderWidth: 2, hoverOffset: 8 }]
  };

  const activePieData = {
    labels: ["Active", "Inactive"],
    datasets: [{ data: [activeCount, inactiveCount],
      backgroundColor: ["rgba(74,222,128,0.8)", "rgba(248,113,113,0.8)"],
      borderColor:     [COLORS.presentBorder, COLORS.absentBorder],
      borderWidth: 2 }]
  };

  return (
    <div style={s.page}>

      {/* ── Page Header ── */}
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>📊 Analytics</h1>
          <p style={s.pageSubtitle}>
            {user.role === "admin" || user.role === "faculty" ? "Full System View" :
             user.role === "domain_lead" ? "Domain View" : "Personal View"}
            {lastUpdated && <span style={s.refreshPill}>🔄 {lastUpdated}</span>}
          </p>
        </div>
        {isPrivileged && (
          <div style={s.reportBtns}>
            <button style={{ ...s.btn, background: "#065f46" }} onClick={() => downloadReport("xlsx")}>⬇ Excel</button>
            <button style={{ ...s.btn, background: "#7f1d1d" }} onClick={() => downloadReport("pdf")}>⬇ PDF</button>
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <div style={s.tabs}>
        {[["overview","📈 Overview"],["members","👥 Members"],["report","⬇ Report"]].map(([key, label]) => (
          isPrivileged || key === "overview" ? (
            <button key={key}
              style={{ ...s.tabBtn, ...(activeTab === key ? s.tabBtnActive : {}) }}
              onClick={() => setActiveTab(key)}>
              {label}
            </button>
          ) : null
        ))}
      </div>

      {/* ── Filters ── */}
      <div style={s.filterCard}>
        <div style={s.filterHeader}>
          <span style={s.filterTitle}>🔍 Filters</span>
          <div style={s.filterModeTabs}>
            {[["week","Week"],["month","Month"],["year","Year"],["range","Range"]].map(([mode, label]) => (
              <button key={mode}
                style={{ ...s.chipBtn, ...(filterMode === mode ? s.chipActive : {}) }}
                onClick={() => { setFilterMode(mode); setFilters({ domain_id: filters.domain_id, start_date:"", end_date:"", week:"", month:"", year:"" }); }}>
                {label}
              </button>
            ))}
            {filterMode && <button style={{ ...s.chipBtn, color: "#f87171", borderColor: "#f87171" }} onClick={resetFilters}>✕ Clear</button>}
          </div>
        </div>

        <div style={s.filterRow}>
          {isPrivileged && (
            <select style={s.input} value={filters.domain_id} onChange={e => setFilters({...filters, domain_id: e.target.value})}>
              <option value="">All Domains</option>
              {domains.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}
          {filterMode === "week"  && <>
            <input style={s.input} type="number" placeholder="Year"     value={filters.year}  onChange={e => setFilters({...filters, year: e.target.value})} />
            <input style={s.input} type="number" placeholder="Week 1–52" value={filters.week}  onChange={e => setFilters({...filters, week: e.target.value})} min="1" max="52" />
          </>}
          {filterMode === "month" && <>
            <input style={s.input} type="number" placeholder="Year"     value={filters.year}  onChange={e => setFilters({...filters, year: e.target.value})} />
            <select style={s.input} value={filters.month} onChange={e => setFilters({...filters, month: e.target.value})}>
              <option value="">Month</option>
              {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
          </>}
          {filterMode === "year"  && <input style={s.input} type="number" placeholder="Year" value={filters.year} onChange={e => setFilters({...filters, year: e.target.value})} />}
          {filterMode === "range" && <>
            <input style={s.input} type="date" value={filters.start_date} onChange={e => setFilters({...filters, start_date: e.target.value})} />
            <span style={{ color: COLORS.text, alignSelf: "center" }}>→</span>
            <input style={s.input} type="date" value={filters.end_date}   onChange={e => setFilters({...filters, end_date: e.target.value})} />
          </>}
          {(filterMode || isPrivileged) && (
            <button style={s.btn} onClick={applyFilters}>Apply</button>
          )}
        </div>
      </div>

      {loading && <div style={s.loadingBar}><div style={s.loadingFill} /></div>}

      {summary && activeTab === "overview" && (
        <>
          {/* ── KPI Cards ── */}
          <div style={s.kpiGrid}>
            <KpiCard icon="🗃️" label="Total Records"  value={summary.total}                       color="#f59e0b" />
            <KpiCard icon="✅" label="Present"         value={summary.present}                     color="#4ade80" />
            <KpiCard icon="❌" label="Absent"          value={summary.absent}                      color="#f87171" />
            <KpiCard icon="📊" label="Attendance Rate" value={`${summary.attendance_percentage}%`} color="#a78bfa" />
          </div>

          {/* ── Row 1: Donut + Active/Inactive ── */}
          <div style={s.row}>
            <div style={{ ...s.chartCard, flex: "0 1 300px" }}>
              <p style={s.chartTitle}>Overall Split</p>
              <div style={{ height: 240, position: "relative" }}>
                <Doughnut data={pieData} options={pieOpts} />
                <div style={s.donutCenter}>
                  <span style={s.donutVal}>{summary.attendance_percentage}%</span>
                  <span style={s.donutSub}>overall</span>
                </div>
              </div>
            </div>

            {/* Trend Bar */}
            <div style={{ ...s.chartCard, flex: "1 1 400px" }}>
              <p style={s.chartTitle}>📈 Attendance Trend (Last 10 Sessions)</p>
              <div style={{ height: 240 }}>
                <Bar data={trendBarData} options={barOpts()} />
              </div>
            </div>
          </div>

          {/* ── Row 2: Domain Charts (privileged only) ── */}
          {isPrivileged && domainLabels.length > 0 && (
            <div style={s.row}>
              <div style={{ ...s.chartCard, flex: "1 1 400px" }}>
                <p style={s.chartTitle}>🏷️ Domain-wise Participation</p>
                <div style={{ height: 260 }}>
                  <Bar data={domainBarData} options={barOpts()} />
                </div>
              </div>

              <div style={{ ...s.chartCard, flex: "0 1 300px" }}>
                <p style={s.chartTitle}>Domain Present Distribution</p>
                <div style={{ height: 240, position: "relative" }}>
                  <Pie data={domainPieData} options={{ responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { position: "bottom", labels: { color: COLORS.text, font: { size: 10 }, padding: 8 } } }
                  }} />
                </div>
              </div>
            </div>
          )}

          {/* ── Row 3: Active/Inactive Pie ── */}
          {isPrivileged && (
            <div style={s.row}>
              <div style={{ ...s.chartCard, flex: "0 1 300px" }}>
                <p style={s.chartTitle}>👥 Active vs Inactive Members</p>
                <div style={{ height: 220, position: "relative" }}>
                  <Doughnut data={activePieData} options={{
                    responsive: true, maintainAspectRatio: false, cutout: "65%",
                    plugins: { legend: { position: "bottom", labels: { color: COLORS.text, padding: 12, font: { size: 12 } } } }
                  }} />
                  <div style={s.donutCenter}>
                    <span style={s.donutVal}>{activeCount}</span>
                    <span style={s.donutSub}>active</span>
                  </div>
                </div>
              </div>

              {/* Inactive member alert */}
              <div style={{ ...s.chartCard, flex: "1 1 380px" }}>
                <p style={s.chartTitle}>⚠️ Inactive Members</p>
                {memberEntries.filter(([,m]) => m.present === 0).length === 0 ? (
                  <div style={s.allGood}>✅ All members have attended at least once!</div>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                    {memberEntries.filter(([,m]) => m.present === 0).map(([name], i) => (
                      <span key={i} style={s.inactiveTag}>{name.split(" (")[0]}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Members Tab ── */}
      {summary && activeTab === "members" && isPrivileged && memberEntries.length > 0 && (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                {["#","Member","Role","Present","Absent","Rate","Progress"].map(h => <th key={h} style={s.th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {memberEntries
                .map(([name, stats]) => {
                  const tot = stats.present + stats.absent;
                  const pct = tot ? (stats.present / tot * 100) : 0;
                  return { name, stats, pct, tot };
                })
                .sort((a, b) => b.pct - a.pct)
                .map(({ name, stats, pct }, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <td style={{ ...s.td, color: COLORS.text, width: 40 }}>{i + 1}</td>
                    <td style={s.td}>
                      <div style={{ fontWeight: 600, color: COLORS.textLight }}>{name.split(" (")[0]}</div>
                      <div style={{ fontSize: 11, color: COLORS.text }}>{name.match(/\(([^)]+)\)/)?.[1]}</div>
                    </td>
                    <td style={s.td}>
                      <span style={{ ...s.rolePill,
                        background: stats.role === "admin" ? "#7f1d1d" : stats.role === "domain_lead" ? "#1e3a8a" : "#14532d",
                        color:      stats.role === "admin" ? "#fca5a5" : stats.role === "domain_lead" ? "#93c5fd" : "#86efac"
                      }}>{stats.role}</span>
                    </td>
                    <td style={{ ...s.td, color: COLORS.present, fontWeight: 700 }}>{stats.present}</td>
                    <td style={{ ...s.td, color: COLORS.absent,  fontWeight: 700 }}>{stats.absent}</td>
                    <td style={{ ...s.td, fontWeight: 700, color: pct >= 75 ? COLORS.present : pct >= 50 ? COLORS.amber : COLORS.absent }}>
                      {pct.toFixed(1)}%
                    </td>
                    <td style={{ ...s.td, width: 120 }}>
                      <div style={s.progressBg}>
                        <div style={{ ...s.progressFill,
                          width: `${pct}%`,
                          background: pct >= 75 ? COLORS.presentBorder : pct >= 50 ? "#f59e0b" : COLORS.absentBorder
                        }} />
                      </div>
                    </td>
                  </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Report Tab ── */}
      {activeTab === "report" && (
        <div style={{ ...s.chartCard, maxWidth: 480, marginTop: 8 }}>
          <p style={s.chartTitle}>📥 Download Report</p>
          <p style={{ color: COLORS.text, fontSize: 13, marginBottom: 20 }}>
            Download attendance data with current filters applied.
          </p>
          <div style={{ display: "flex", gap: 12 }}>
            <button style={{ ...s.btn, flex: 1, background: "#065f46", padding: "12px", fontSize: 14 }}
              onClick={() => downloadReport("xlsx")}>
              ⬇ Excel (.xlsx)
            </button>
            <button style={{ ...s.btn, flex: 1, background: "#7f1d1d", padding: "12px", fontSize: 14 }}
              onClick={() => downloadReport("pdf")}>
              ⬇ PDF
            </button>
          </div>
        </div>
      )}

      {!summary && !loading && (
        <div style={s.emptyState}>
          <p style={{ fontSize: 48 }}>📭</p>
          <p style={{ color: COLORS.text, marginTop: 8 }}>No data available yet.</p>
        </div>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, color }) {
  return (
    <div style={{ ...s.kpiCard, borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 28 }}>{icon}</div>
      <div style={{ fontSize: 34, fontWeight: 800, color, lineHeight: 1, margin: "6px 0 4px" }}>{value}</div>
      <div style={{ fontSize: 13, color: "#6b7280" }}>{label}</div>
    </div>
  );
}

const s = {
  page:           { minHeight: "100vh", background: COLORS.page, padding: "96px 28px 60px", fontFamily: "'Inter','Segoe UI',sans-serif", color: "#f9fafb" },
  pageHeader:     { display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 24 },
  pageTitle:      { fontSize: 26, fontWeight: 800, margin: 0, background: "linear-gradient(90deg,#f9fafb,#9ca3af)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" },
  pageSubtitle:   { color: COLORS.text, fontSize: 14, margin: "6px 0 0", display: "flex", alignItems: "center", gap: 10 },
  refreshPill:    { fontSize: 11, background: "#1f2937", padding: "2px 10px", borderRadius: 20, color: "#6b7280" },
  reportBtns:     { display: "flex", gap: 10 },
  tabs:           { display: "flex", gap: 4, marginBottom: 24, background: "#111827", padding: 4, borderRadius: 12, border: `1px solid ${COLORS.border}`, width: "fit-content" },
  tabBtn:         { background: "none", border: "none", color: COLORS.text, padding: "8px 18px", borderRadius: 9, cursor: "pointer", fontSize: 13, fontWeight: 500, transition: "all 0.2s" },
  tabBtnActive:   { background: "#1f2937", color: "#f9fafb", fontWeight: 600 },
  filterCard:     { background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: "16px 20px", marginBottom: 24 },
  filterHeader:   { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 12 },
  filterTitle:    { fontWeight: 700, color: "#d1d5db", fontSize: 14 },
  filterModeTabs: { display: "flex", gap: 6, flexWrap: "wrap" },
  filterRow:      { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" },
  chipBtn:        { background: "none", border: `1px solid ${COLORS.border}`, color: COLORS.text, padding: "5px 14px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontWeight: 500, transition: "all 0.2s" },
  chipActive:     { background: "#3b82f6", color: "#fff", borderColor: "#3b82f6" },
  input:          { background: "#0d1117", border: `1px solid ${COLORS.border}`, color: "#f9fafb", padding: "8px 12px", borderRadius: 8, fontSize: 13, outline: "none" },
  btn:            { background: "#2563eb", color: "#fff", border: "none", padding: "8px 20px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, transition: "opacity 0.2s" },
  loadingBar:     { height: 3, background: COLORS.border, borderRadius: 4, marginBottom: 24, overflow: "hidden" },
  loadingFill:    { height: "100%", width: "60%", background: "linear-gradient(90deg, #3b82f6, #8b5cf6)", borderRadius: 4, animation: "pulse 1.5s infinite" },
  kpiGrid:        { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 16, marginBottom: 24 },
  kpiCard:        { background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 4 },
  row:            { display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 20 },
  chartCard:      { background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: "20px 24px" },
  chartTitle:     { fontSize: 14, fontWeight: 700, color: "#d1d5db", margin: "0 0 16px", letterSpacing: "0.02em" },
  donutCenter:    { position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-58%)", textAlign: "center", pointerEvents: "none" },
  donutVal:       { display: "block", fontSize: 26, fontWeight: 800, color: "#f9fafb" },
  donutSub:       { display: "block", fontSize: 11, color: COLORS.text },
  allGood:        { background: "#14532d33", border: "1px solid #22c55e44", borderRadius: 10, padding: "12px 16px", color: "#4ade80", fontSize: 14, marginTop: 8 },
  inactiveTag:    { background: "#7f1d1d", color: "#fca5a5", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 500, border: "1px solid #ef444433" },
  tableWrap:      { background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, overflow: "hidden", marginBottom: 32 },
  table:          { width: "100%", borderCollapse: "collapse" },
  th:             { padding: "14px 20px", background: "#0d1117", color: COLORS.text, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", textAlign: "left", whiteSpace: "nowrap" },
  td:             { padding: "14px 20px", fontSize: 13, color: "#d1d5db" },
  rolePill:       { fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, textTransform: "capitalize" },
  progressBg:     { height: 6, background: "#1f2937", borderRadius: 10, overflow: "hidden" },
  progressFill:   { height: "100%", borderRadius: 10, transition: "width 0.5s ease" },
  emptyState:     { textAlign: "center", padding: "60px 20px", background: COLORS.card, borderRadius: 16, border: `1px solid ${COLORS.border}`, marginTop: 20 },
  amber:          "#fbbf24",
};
