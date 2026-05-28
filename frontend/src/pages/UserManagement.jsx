import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../api";

const C = {
  page: "#0f1117", card: "#111827", border: "#1f2937",
  text: "#9ca3af", textLight: "#d1d5db", textBright: "#f9fafb",
  green: "#4ade80", greenBg: "#14532d", greenBorder: "#22c55e",
  red: "#f87171", redBg: "#7f1d1d",
  blue: "#60a5fa", blueBg: "#1e3a5f",
  amber: "#fbbf24", purple: "#c4b5fd",
};

const ROLE_STYLE = {
  admin:         { bg: "#7f1d1d",  color: "#fca5a5", label: "Admin" },
  domain_lead:   { bg: "#1e3a8a",  color: "#93c5fd", label: "Domain Lead" },
  faculty:       { bg: "#4c1d95",  color: "#c4b5fd", label: "Faculty" },
  member:        { bg: "#14532d",  color: "#86efac", label: "Member" },
  president:     { bg: "#78350f",  color: "#fcd34d", label: "President" },
  vice_president:{ bg: "#064e3b",  color: "#6ee7b7", label: "Vice President" },
};

export default function UserManagement() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [pending, setPending] = useState([]);
  const [tab, setTab] = useState("all"); // "all" | "pending"
  const [search, setSearch] = useState("");
  const [msg, setMsg] = useState({ text: "", type: "" });
  const [confirmId, setConfirmId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState("");

  const canApprove = user.role === "admin" || user.role === "faculty";

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    try {
      const res = await api.get("/auth/users");
      setUsers(res.data);
      if (canApprove) {
        const pRes = await api.get("/auth/pending-users");
        setPending(pRes.data);
      }
    } catch (err) {
      setMsg({ text: err.response?.data?.error || "Failed to load users.", type: "error" });
    } finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    try {
      const res = await api.delete(`/auth/delete-user/${id}`);
      setMsg({ text: res.data.message, type: "success" });
      setUsers(prev => prev.filter(u => u.id !== id));
      setPending(prev => prev.filter(u => u.id !== id));
    } catch (err) {
      setMsg({ text: err.response?.data?.error || "Delete failed.", type: "error" });
    } finally { setConfirmId(null); }
  };

  const handleApprove = async (id) => {
    try {
      await api.post(`/auth/approve-user/${id}`);
      setMsg({ text: "User approved successfully.", type: "success" });
      setPending(prev => prev.filter(u => u.id !== id));
      setUsers(prev => prev.map(u => u.id === id ? { ...u, is_approved: true } : u));
    } catch (err) {
      setMsg({ text: err.response?.data?.error || "Approval failed.", type: "error" });
    }
  };

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.regno || "").toLowerCase().includes(q);
    const matchRole = !filterRole || u.role === filterRole;
    return matchSearch && matchRole;
  });

  const roleOptions = [...new Set(users.map(u => u.role))];

  if (loading) return (
    <div style={{ background: C.page, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={s.spinner} />
    </div>
  );

  const displayList = tab === "pending" ? pending : filtered;

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>👥 User Management</h1>
          <p style={s.pageSubtitle}>
            {user.role === "admin" ? "Full system access" : user.role === "faculty" ? "Monitor & manage all users" : "Your domain members"}
          </p>
        </div>
        <div style={s.countBadge}>{tab === "pending" ? pending.length : filtered.length} users</div>
      </div>

      {/* Message */}
      {msg.text && (
        <div style={{
          ...s.msgBox,
          background: msg.type === "success" ? C.greenBg + "33" : C.redBg + "33",
          border: `1px solid ${msg.type === "success" ? C.greenBorder + "55" : "#ef444455"}`,
          color: msg.type === "success" ? C.green : C.red,
        }}>
          {msg.type === "success" ? "✅" : "❌"} {msg.text}
        </div>
      )}

      {/* Tabs */}
      {canApprove && (
        <div style={s.tabRow}>
          <button style={{ ...s.tabBtn, ...(tab === "all" ? s.tabActive : {}) }} onClick={() => setTab("all")}>All Users</button>
          <button style={{ ...s.tabBtn, ...(tab === "pending" ? s.tabActive : {}) }} onClick={() => setTab("pending")}>
            Pending Approvals {pending.length > 0 && <span style={s.badge}>{pending.length}</span>}
          </button>
        </div>
      )}

      {/* Search + Filter (only on all tab) */}
      {tab === "all" && (
        <div style={s.filterRow}>
          <div style={s.searchWrap}>
            <span style={s.searchIcon}>🔍</span>
            <input
              style={s.search}
              placeholder="Search by name, email, or register no..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && <button style={s.clearBtn} onClick={() => setSearch("")}>✕</button>}
          </div>
          <select style={s.roleFilter} value={filterRole} onChange={e => setFilterRole(e.target.value)}>
            <option value="">All Roles</option>
            {roleOptions.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
          </select>
        </div>
      )}

      {/* Table */}
      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              {tab === "pending"
                ? ["#", "Name", "Reg No.", "Department", "Year", "Role", "Action"].map(h => <th key={h} style={s.th}>{h}</th>)
                : ["#", "Name", "Reg No.", "Department", "Year", "Role", "Status", "Action"].map(h => <th key={h} style={s.th}>{h}</th>)
              }
            </tr>
          </thead>
          <tbody>
            {displayList.length === 0 && (
              <tr><td colSpan={8} style={{ ...s.td, textAlign: "center", color: C.text, padding: "40px" }}>
                {tab === "pending" ? "No pending approvals ✅" : "No users found"}
              </td></tr>
            )}
            {displayList.map((u, i) => {
              const rStyle = ROLE_STYLE[u.role] || ROLE_STYLE.member;
              return (
                <tr key={u.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ ...s.td, color: C.text, width: 40 }}>{i + 1}</td>
                  <td style={s.td}>
                    <div style={{ fontWeight: 600, color: C.textBright }}>{u.name}</div>
                    <div style={{ fontSize: 11, color: C.text }}>{u.email}</div>
                  </td>
                  <td style={s.td}><span style={s.mono}>{u.regno || "—"}</span></td>
                  <td style={{ ...s.td, color: C.textLight }}>{u.department || "—"}</td>
                  <td style={{ ...s.td, color: C.textLight }}>{u.year || "—"}</td>
                  <td style={s.td}>
                    <span style={{ ...s.rolePill, background: rStyle.bg, color: rStyle.color }}>{rStyle.label}</span>
                  </td>
                  {tab !== "pending" && (
                    <td style={s.td}>
                      <span style={{ fontSize: 18 }}>{u.is_verified ? "✅" : "❌"}</span>
                    </td>
                  )}
                  <td style={s.td}>
                    {tab === "pending" ? (
                      <button style={s.approveBtn} onClick={() => handleApprove(u.id)}>✅ Approve</button>
                    ) : confirmId === u.id ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button style={s.confirmBtn} onClick={() => handleDelete(u.id)}>Confirm</button>
                        <button style={s.cancelBtn} onClick={() => setConfirmId(null)}>Cancel</button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {u.role !== "faculty" && (
                          <a href="/scan" style={{ ...s.approveBtn, background: "#1e3a5f", color: C.blue, border: "1px solid #1e40af", textDecoration: "none", fontSize: 12 }}>📷 Scan QR</a>
                        )}
                        <button style={s.deleteBtn} onClick={() => { setConfirmId(u.id); setMsg({ text: "", type: "" }); }}>
                          🗑 Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const s = {
  page:        { minHeight: "100vh", background: C.page, padding: "96px 28px 32px", fontFamily: "'Inter','Segoe UI',sans-serif", color: C.textBright },
  pageHeader:  { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 },
  pageTitle:   { fontSize: 26, fontWeight: 800, margin: 0, background: "linear-gradient(90deg,#f9fafb,#9ca3af)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" },
  pageSubtitle:{ color: C.text, fontSize: 14, margin: "6px 0 0" },
  countBadge:  { background: C.card, border: `1px solid ${C.border}`, color: C.blue, padding: "8px 18px", borderRadius: 20, fontWeight: 700, fontSize: 14, alignSelf: "center" },
  msgBox:      { borderRadius: 12, padding: "12px 16px", fontSize: 14, fontWeight: 600, marginBottom: 20 },
  tabRow:      { display: "flex", gap: 8, marginBottom: 20 },
  tabBtn:      { background: C.card, border: `1px solid ${C.border}`, color: C.text, padding: "9px 20px", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 },
  tabActive:   { background: "#1e3a5f", border: "1px solid #1e40af", color: C.blue },
  badge:       { background: "#7f1d1d", color: "#fca5a5", borderRadius: 20, padding: "1px 8px", fontSize: 11, fontWeight: 700 },
  filterRow:   { display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" },
  searchWrap:  { display: "flex", alignItems: "center", flex: 1, minWidth: 200, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "0 14px" },
  searchIcon:  { fontSize: 16, marginRight: 8, color: C.text },
  search:      { flex: 1, background: "none", border: "none", color: C.textBright, padding: "12px 0", fontSize: 14, outline: "none" },
  clearBtn:    { background: "none", border: "none", color: C.text, cursor: "pointer", fontSize: 16, padding: "4px 8px" },
  roleFilter:  { background: C.card, border: `1px solid ${C.border}`, color: C.textBright, padding: "12px 16px", borderRadius: 12, fontSize: 14, outline: "none", minWidth: 140 },
  tableWrap:   { background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "auto" },
  table:       { width: "100%", borderCollapse: "collapse", minWidth: 700 },
  th:          { padding: "14px 18px", background: "#0d1117", color: C.text, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", textAlign: "left", whiteSpace: "nowrap" },
  td:          { padding: "14px 18px", fontSize: 13 },
  mono:        { fontFamily: "monospace", fontSize: 12, color: C.amber, background: "#451a03", padding: "2px 8px", borderRadius: 6 },
  rolePill:    { fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, display: "inline-block" },
  approveBtn:  { background: "#14532d", color: C.green, border: "1px solid #22c55e33", padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 },
  deleteBtn:   { background: C.redBg, color: C.red, border: "1px solid #ef444433", padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 },
  confirmBtn:  { background: C.redBg, color: C.red, border: "1px solid #ef444433", padding: "5px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 },
  cancelBtn:   { background: "#1f2937", color: C.text, border: `1px solid ${C.border}`, padding: "5px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12 },
  spinner:     { width: 40, height: 40, border: "3px solid #1f2937", borderTop: "3px solid #3b82f6", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
};
