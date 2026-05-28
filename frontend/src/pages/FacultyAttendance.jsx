import { useState, useEffect } from "react";
import api from "../api";

const ROLE_COLOR = { admin: "#e63946", domain_lead: "#457b9d", member: "#2a9d8f", faculty: "#9c27b0" };
const ROLE_LABEL = { admin: "👨💼 Admin", domain_lead: "👨🏫 Domain Lead", member: "👨🎓 Member", faculty: "👨📚 Faculty" };

export default function FacultyAttendance() {
  const [users, setUsers] = useState([]);
  const [filters, setFilters] = useState({ start_date: "", end_date: "", month: "", year: "" });
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async (params = {}) => {
    setLoading(true);
    try {
      const res = await api.get("/analytics/all-users-attendance", { params });
      setUsers(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    const active = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    fetchData(active);
  };

  const resetFilters = () => {
    setFilters({ start_date: "", end_date: "", month: "", year: "" });
    setRoleFilter("");
    fetchData();
  };

  const downloadReport = async (fmt) => {
    try {
      const active = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
      const qs = new URLSearchParams({ ...active, format: fmt }).toString();
      const res = await fetch(`http://localhost:5001/api/analytics/report?${qs}`, {
        credentials: "include",
      });
      if (!res.ok) { alert("Failed to download report."); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `attendance_report.${fmt}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { alert("Download failed."); }
  };

  const filtered = users.filter(u => {
    const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.regno || "").toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter ? u.role === roleFilter : true;
    return matchSearch && matchRole;
  });

  const totalPresent = filtered.reduce((s, u) => s + u.present, 0);
  const totalRecords = filtered.reduce((s, u) => s + u.total, 0);
  const overallPct = totalRecords ? ((totalPresent / totalRecords) * 100).toFixed(1) : 0;

  return (
    <div style={styles.container}>
      <h2 style={{ color: "#f9fafb", margin: "0 0 4px" }}>🛡️ Admin — Full Attendance Monitor</h2>
      <p style={{ color: "#6b7280", fontSize: "13px", marginBottom: "16px" }}>
        View attendance of all users across all roles
      </p>

      {/* Filters */}
      <div style={styles.filterBox}>
        <p style={styles.filterTitle}>🔍 Filters</p>
        <div style={styles.filterRow}>
          <select style={styles.input} value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
            <option value="">All Roles</option>
            <option value="admin">Admin</option>
            <option value="domain_lead">Domain Lead</option>
            <option value="member">Member</option>
            <option value="faculty">Faculty</option>
            <option value="president">President</option>
            <option value="vice_president">Vice President</option>
          </select>
          <input style={styles.input} type="number" placeholder="Month (1-12)" value={filters.month}
            onChange={e => setFilters({ ...filters, month: e.target.value })} min="1" max="12" />
          <input style={styles.input} type="number" placeholder="Year" value={filters.year}
            onChange={e => setFilters({ ...filters, year: e.target.value })} />
          <input style={styles.input} type="date" value={filters.start_date}
            onChange={e => setFilters({ ...filters, start_date: e.target.value })} />
          <input style={styles.input} type="date" value={filters.end_date}
            onChange={e => setFilters({ ...filters, end_date: e.target.value })} />
          <button style={styles.btn} onClick={applyFilters}>Apply</button>
          <button style={{ ...styles.btn, background: "#888" }} onClick={resetFilters}>Reset</button>
        </div>
      </div>

      {/* Search */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
        <input style={{ ...styles.input, flex: 1, minWidth: "200px" }}
          placeholder="🔍 Search by name, email or regno..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Summary cards */}
      <div style={styles.statsRow}>
        <StatCard label="Total Users" value={filtered.length} color="#1a1a2e" />
        <StatCard label="Total Records" value={totalRecords} color="#457b9d" />
        <StatCard label="Total Present" value={totalPresent} color="#2a9d8f" />
        <StatCard label="Total Absent" value={totalRecords - totalPresent} color="#e63946" />
        <StatCard label="Overall %" value={`${overallPct}%`} color="#f4a261" />
      </div>

      {/* Download */}
      <div style={{ margin: "16px 0" }}>
        <button style={styles.btn} onClick={() => downloadReport("xlsx")}>⬇ Excel (.xlsx)</button>
        <button style={{ ...styles.btn, background: "#e63946", marginLeft: "10px" }} onClick={() => downloadReport("pdf")}>⬇ PDF</button>
      </div>

      {/* Users table */}
      {loading ? <p style={{ color: "#999" }}>Loading...</p> : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                {["Name", "Regno", "Email", "Dept", "Year", "Role", "Present", "Absent", "%", "Details"].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={10} style={{ ...styles.td, textAlign: "center", color: "#999" }}>No users found</td></tr>
              )}
              {filtered.map((u, i) => (
                <>
                  <tr key={u.id} style={{ background: "#111827", borderBottom: "1px solid #1f2937" }}>
                    <td style={styles.td}>{u.name}</td>
                    <td style={styles.td}>{u.regno}</td>
                    <td style={styles.td}>{u.email}</td>
                    <td style={styles.td}>{u.department}</td>
                    <td style={styles.td}>{u.year}</td>
                    <td style={styles.td}>
                      <span style={{ background: ROLE_COLOR[u.role] || "#888", color: "#fff",
                        padding: "2px 8px", borderRadius: "10px", fontSize: "11px" }}>
                        {ROLE_LABEL[u.role] || u.role}
                      </span>
                    </td>
                    <td style={{ ...styles.td, color: "#2a9d8f", fontWeight: "bold" }}>{u.present}</td>
                    <td style={{ ...styles.td, color: "#e63946", fontWeight: "bold" }}>{u.absent}</td>
                    <td style={styles.td}>{u.percentage}%</td>
                    <td style={styles.td}>
                      {u.total > 0 && (
                        <button style={styles.expandBtn}
                          onClick={() => setExpanded(expanded === u.id ? null : u.id)}>
                          {expanded === u.id ? "▲ Hide" : "▼ View"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expanded === u.id && (
                    <tr key={`exp-${u.id}`}>
                      <td colSpan={10} style={{ padding: "0 16px 12px", background: "#0d1117" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "8px" }}>
                          <thead>
                            <tr>
                              {["Date", "Domain", "Status", "Marked At"].map(h => (
                                <th key={h} style={{ ...styles.th, background: "#1e3a8a", padding: "6px 10px" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {u.records.map((r, j) => (
                              <tr key={j} style={{ background: j % 2 === 0 ? "#111827" : "#0d1117" }}>
                                <td style={{ ...styles.td, padding: "6px 10px" }}>{r.date}</td>
                                <td style={{ ...styles.td, padding: "6px 10px" }}>{r.domain}</td>
                                <td style={{ ...styles.td, padding: "6px 10px",
                                  color: r.status === "present" ? "#2a9d8f" : "#e63946", fontWeight: "bold" }}>
                                  {r.status}
                                </td>
                                <td style={{ ...styles.td, padding: "6px 10px" }}>{r.marked_at || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: color, color: "#fff", padding: "16px 20px", borderRadius: "10px", textAlign: "center", minWidth: "100px" }}>
      <div style={{ fontSize: "22px", fontWeight: "bold" }}>{value}</div>
      <div style={{ fontSize: "11px", marginTop: "4px" }}>{label}</div>
    </div>
  );
}

const styles = {
  container: { padding: "96px 28px 32px", maxWidth: "1200px", margin: "0 auto", background: "#0f1117", minHeight: "100vh", fontFamily: "'Inter','Segoe UI',sans-serif", color: "#f9fafb" },
  filterBox: { background: "#111827", padding: "16px 20px", borderRadius: "12px", border: "1px solid #1f2937", marginBottom: "16px" },
  filterTitle: { fontWeight: "bold", marginBottom: "10px", color: "#d1d5db" },
  filterRow: { display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" },
  input: { padding: "8px 10px", borderRadius: "8px", border: "1px solid #374151", fontSize: "13px", background: "#1f2937", color: "#f9fafb", outline: "none" },
  btn: { background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: 600 },
  statsRow: { display: "flex", gap: "12px", flexWrap: "wrap", margin: "16px 0" },
  tableWrap: { overflowX: "auto", borderRadius: "12px", border: "1px solid #1f2937" },
  table: { width: "100%", borderCollapse: "collapse", background: "#111827", borderRadius: "12px", overflow: "hidden" },
  th: { background: "#0d1117", color: "#9ca3af", padding: "12px 14px", textAlign: "left", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap" },
  td: { padding: "12px 14px", borderBottom: "1px solid #1f2937", fontSize: "13px", color: "#d1d5db" },
  expandBtn: { background: "#1e3a8a", color: "#93c5fd", border: "1px solid #1e40af", padding: "4px 10px", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: 600 }
};
