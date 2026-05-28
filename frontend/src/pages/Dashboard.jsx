import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Doughnut, Bar } from "react-chartjs-2";
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend,
  CategoryScale, LinearScale, BarElement
} from "chart.js";
import { Html5Qrcode } from "html5-qrcode";
import api from "../api";

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

const ROLE_CONFIG = {
  admin:       { label: "Admin",       icon: "🛡️",  accent: "#f72585" },
  domain_lead: { label: "Domain Lead", icon: "🏆",  accent: "#4cc9f0" },
  faculty:     { label: "Faculty",     icon: "🎓",  accent: "#7209b7" },
  member:      { label: "Club Member", icon: "⭐",  accent: "#4ade80" },
};

export default function Dashboard() {
  const { user } = useAuth();
  const [attendance, setAttendance]   = useState([]);
  const [allStats,   setAllStats]     = useState(null);
  const [greeting,   setGreeting]     = useState("");
  const [profile,    setProfile]      = useState(null);

  // Face registration state
  const videoRef   = useRef(null);
  const streamRef  = useRef(null);
  const [showFaceReg,  setShowFaceReg]  = useState(false);
  const [faceLoading,  setFaceLoading]  = useState(false);
  const [faceError,    setFaceError]    = useState('');
  const [faceDone,     setFaceDone]     = useState(false);
  const [cameraReady,  setCameraReady]  = useState(false);

  // Admin self-attendance state
  const qrRef = useRef(null);
  const adminVideoRef = useRef(null);
  const adminStreamRef = useRef(null);
  const [showAdminAttendance, setShowAdminAttendance] = useState(false);
  const [adminDomains, setAdminDomains]       = useState([]);
  const [adminDomainId, setAdminDomainId]     = useState("");
  const [adminScanning, setAdminScanning]     = useState(false);
  const [adminToken, setAdminToken]           = useState(null);
  const [adminCamReady, setAdminCamReady]     = useState(false);
  const [adminSubmitting, setAdminSubmitting] = useState(false);
  const [adminMsg, setAdminMsg]               = useState("");
  const [adminMsgType, setAdminMsgType]       = useState("");

  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? "Good Morning" : h < 17 ? "Good Afternoon" : "Good Evening");
    if (user.role !== "faculty") {
      api.get("/attendance/my").then(r => setAttendance(r.data)).catch(() => {});
    }
    if (user.role === "admin" || user.role === "domain_lead" || user.role === "faculty") {
      api.get("/analytics/summary").then(r => setAllStats(r.data)).catch(() => {});
    }
    api.get("/auth/profile").then(r => setProfile(r.data)).catch(() => {});
    if (user.role === "admin") {
      api.get("/analytics/domains").then(r => {
        setAdminDomains(r.data);
        if (r.data.length > 0) setAdminDomainId(String(r.data[0].id));
      }).catch(() => {});
    }
  }, [user.role]);

  const startAdminQrScan = () => {
    setAdminMsg(""); setAdminMsgType(""); setAdminToken(null);
    const html5QrCode = new Html5Qrcode("admin-qr-reader");
    qrRef.current = html5QrCode;
    setAdminScanning(true);
    html5QrCode.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: 250 },
      async (token) => {
        html5QrCode.stop().catch(() => {});
        qrRef.current = null;
        setAdminScanning(false);
        setAdminToken(token);
        // Start face camera
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          adminStreamRef.current = stream;
          if (adminVideoRef.current) adminVideoRef.current.srcObject = stream;
          setAdminCamReady(true);
        } catch {
          setAdminMsg("Camera access denied."); setAdminMsgType("error");
        }
      },
      () => {}
    );
  };

  const stopAdminFlow = () => {
    qrRef.current?.stop().catch(() => {});
    qrRef.current = null;
    adminStreamRef.current?.getTracks().forEach(t => t.stop());
    adminStreamRef.current = null;
    setAdminScanning(false);
    setAdminToken(null);
    setAdminCamReady(false);
    setAdminMsg("");
  };

  const submitAdminAttendance = async () => {
    if (!adminVideoRef.current || !adminToken || !adminDomainId) return;
    setAdminSubmitting(true); setAdminMsg("");
    const canvas = document.createElement("canvas");
    canvas.width  = adminVideoRef.current.videoWidth;
    canvas.height = adminVideoRef.current.videoHeight;
    canvas.getContext("2d").drawImage(adminVideoRef.current, 0, 0);
    const b64 = canvas.toDataURL("image/jpeg");
    try {
      await api.post("/attendance/mark-admin", { token: adminToken, domain_id: parseInt(adminDomainId), image: b64 });
      adminStreamRef.current?.getTracks().forEach(t => t.stop());
      adminStreamRef.current = null;
      setAdminToken(null); setAdminCamReady(false);
      setAdminMsg("✅ Attendance marked as present!"); setAdminMsgType("success");
      api.get("/attendance/my").then(r => setAttendance(r.data)).catch(() => {});
    } catch (err) {
      setAdminMsg(err.response?.data?.error || "Failed to mark attendance."); setAdminMsgType("error");
    } finally {
      setAdminSubmitting(false);
    }
  };

  const startFaceCamera = async () => {
    setShowFaceReg(true);
    setFaceError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraReady(true);
    } catch {
      setFaceError('Camera access denied.');
    }
  };

  const stopFaceCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraReady(false);
    setShowFaceReg(false);
  };

  const handleCaptureFace = async () => {
    if (!videoRef.current) return;
    setFaceLoading(true);
    setFaceError('');
    try {
      const canvas = document.createElement('canvas');
      canvas.width  = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      canvas.getContext('2d').drawImage(videoRef.current, 0, 0);
      const b64 = canvas.toDataURL('image/jpeg');
      await api.post('/attendance/register-face', { image: b64 });
      stopFaceCamera();
      setFaceDone(true);
      setProfile(p => p ? { ...p, face_registered: true } : p);
    } catch (err) {
      setFaceError(err.response?.data?.error || 'Face registration failed.');
    } finally {
      setFaceLoading(false);
    }
  };

  const present  = attendance.filter(a => a.status === "present").length;
  const absent   = attendance.filter(a => a.status === "absent").length;
  const total    = attendance.length;
  const pct      = total ? ((present / total) * 100).toFixed(1) : 0;
  const role     = ROLE_CONFIG[user.role] || ROLE_CONFIG.member;

  // Last 6 sessions for mini-bar chart
  const recent6  = attendance.slice(0, 6).reverse();
  const barData  = {
    labels: recent6.map(a => a.date),
    datasets: [{
      label: "Status",
      data: recent6.map(a => a.status === "present" ? 1 : 0),
      backgroundColor: recent6.map(a => a.status === "present" ? "rgba(74,222,128,0.8)" : "rgba(248,113,113,0.8)"),
      borderRadius: 6,
      borderSkipped: false,
    }]
  };
  const barOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: {
      callbacks: { label: ctx => ctx.raw === 1 ? "Present" : "Absent" }
    }},
    scales: {
      x: { ticks: { color: "#9ca3af", font: { size: 10 } }, grid: { color: "rgba(255,255,255,0.05)" } },
      y: { display: false, max: 1.5 }
    }
  };

  const donutData = {
    labels: ["Present", "Absent"],
    datasets: [{ data: [present || 1, absent], backgroundColor: ["#4ade80", "#f87171"],
      borderColor: ["#22c55e", "#ef4444"], borderWidth: 2, hoverOffset: 8 }]
  };
  const donutOpts = {
    responsive: true, maintainAspectRatio: false, cutout: "72%",
    plugins: {
      legend: { position: "bottom", labels: { color: "#9ca3af", padding: 16, font: { size: 12 } } },
      tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw}` } }
    }
  };

  return (
    <div style={s.page}>
      {/* ── Face Registration Banner (admin only — not faculty) ── */}
      {profile && !profile.face_registered && !faceDone && user.role !== 'faculty' && (
        <div style={{ background: "#451a03", border: "1px solid #92400e", borderRadius: 14, padding: "16px 20px", marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <p style={{ color: "#fbbf24", fontWeight: 700, margin: 0 }}>⚠️ Face Not Registered</p>
            <p style={{ color: "#d97706", fontSize: 13, margin: "4px 0 0" }}>You must register your face to mark attendance. This can only be done once.</p>
          </div>
          <button style={{ ...s.faceBtn, width: "auto", padding: "10px 20px" }} onClick={startFaceCamera}>
            📸 Register Face Now
          </button>
        </div>
      )}

      {faceDone && (
        <div style={{ background: "#14532d", border: "1px solid #22c55e", borderRadius: 14, padding: "14px 20px", marginBottom: 24, color: "#4ade80", fontWeight: 600 }}>
          ✅ Face registered successfully!
        </div>
      )}

      {/* ── Face Registration Camera Modal ── */}
      {showFaceReg && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 20, padding: 32, width: "100%", maxWidth: 420 }}>
            <h3 style={{ color: "#f9fafb", margin: "0 0 8px" }}>📸 Register Your Face</h3>
            <p style={{ color: "#9ca3af", fontSize: 13, marginBottom: 16 }}>Position your face in the oval and click Capture. This is a one-time action.</p>
            <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: "#0d1117", marginBottom: 16, minHeight: 180 }}>
              <video ref={videoRef} autoPlay playsInline style={{ width: "100%", display: "block" }} />
            </div>
            {faceError && <p style={{ color: "#f87171", fontSize: 13, marginBottom: 12 }}>⚠️ {faceError}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button style={{ ...s.faceBtn, flex: 1, opacity: faceLoading || !cameraReady ? 0.5 : 1 }}
                onClick={handleCaptureFace} disabled={faceLoading || !cameraReady}>
                {faceLoading ? "⏳ Saving..." : "✅ Capture & Save"}
              </button>
              <button style={{ ...s.faceBtn, background: "#1f2937", color: "#9ca3af", flex: "0 0 auto" }}
                onClick={stopFaceCamera}>✕ Cancel</button>
            </div>
          </div>
        </div>
      )}
      {/* ── Admin Self-Attendance ── */}
      {user.role === "admin" && (
        <div style={{ background: "#0d1117", border: "1px solid #1f2937", borderRadius: 14, padding: "16px 20px", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <p style={{ color: "#f9fafb", fontWeight: 700, margin: 0 }}>📷 Mark My Attendance</p>
              <p style={{ color: "#6b7280", fontSize: 13, margin: "4px 0 0" }}>Scan the session QR code, then verify your face to mark yourself present.</p>
            </div>
            <button style={{ ...s.faceBtn, width: "auto", padding: "10px 20px" }}
              onClick={() => { if (showAdminAttendance) stopAdminFlow(); setShowAdminAttendance(v => !v); setAdminMsg(""); }}>
              {showAdminAttendance ? "✕ Close" : "📷 Scan QR"}
            </button>
          </div>
          {showAdminAttendance && (
            <div style={{ marginTop: 16 }}>
              {/* Domain picker */}
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
                <select value={adminDomainId} onChange={e => setAdminDomainId(e.target.value)}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #374151", background: "#1f2937", color: "#f9fafb", fontSize: 13 }}>
                  {adminDomains.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                {!adminScanning && !adminToken && (
                  <button style={{ ...s.faceBtn, width: "auto", padding: "8px 18px" }}
                    onClick={startAdminQrScan} disabled={!adminDomainId}>
                    🔍 Start QR Scanner
                  </button>
                )}
                {(adminScanning || adminToken) && (
                  <button style={{ ...s.faceBtn, background: "#1f2937", color: "#9ca3af", width: "auto", padding: "8px 18px" }}
                    onClick={stopAdminFlow}>
                    ✕ Cancel
                  </button>
                )}
              </div>

              {/* Step 1: QR scanner */}
              {!adminToken && (
                <div id="admin-qr-reader" style={{ width: "100%", maxWidth: 360, borderRadius: 10, overflow: "hidden" }} />
              )}

              {/* Step 2: Face capture */}
              {adminToken && (
                <div>
                  <p style={{ color: "#4ade80", fontSize: 13, marginBottom: 10, fontWeight: 600 }}>✅ QR scanned! Now verify your face.</p>
                  <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: "#0d1117", marginBottom: 12, maxWidth: 360 }}>
                    <video ref={adminVideoRef} autoPlay playsInline style={{ width: "100%", display: "block" }} />
                  </div>
                  <button style={{ ...s.faceBtn, maxWidth: 360, opacity: adminSubmitting || !adminCamReady ? 0.5 : 1 }}
                    onClick={submitAdminAttendance} disabled={adminSubmitting || !adminCamReady}>
                    {adminSubmitting ? "⏳ Verifying..." : "🧠 Verify Face & Mark Present"}
                  </button>
                </div>
              )}

              {adminMsg && (
                <p style={{ marginTop: 10, fontWeight: 600, color: adminMsgType === "success" ? "#4ade80" : "#f87171" }}>
                  {adminMsg}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Header ── */}
      <div style={s.header}>
        <div>
          <p style={s.greeting}>{greeting},</p>
          <h1 style={s.name}>{profile?.name || user.role}</h1>
          <span style={{ ...s.badge, background: role.accent + "22", color: role.accent, border: `1px solid ${role.accent}55` }}>
            {role.icon} {role.label}
          </span>
        </div>
        <div style={s.headerRight}>
          <p style={s.headerSub}>Today</p>
          <p style={s.headerDate}>{new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
        </div>
      </div>

      {/* ── Personal Stat Cards ── */}
      {user.role !== "faculty" && (
        <>
          <div style={s.statsGrid}>
            <StatCard icon="📋" label="Total Sessions" value={total}          accent="#4cc9f0" />
            <StatCard icon="✅" label="Present"         value={present}        accent="#4ade80" />
            <StatCard icon="❌" label="Absent"          value={absent}         accent="#f87171" />
            <StatCard icon="📈" label="Attendance Rate" value={`${pct}%`}      accent="#a78bfa" />
          </div>

          {/* ── Charts Row ── */}
          <div style={s.chartsRow}>
            {/* Donut */}
            <div style={s.chartCard}>
              <h3 style={s.chartTitle}>My Attendance Split</h3>
              <div style={{ height: 240, position: "relative" }}>
                <Doughnut data={donutData} options={donutOpts} />
                <div style={s.donutCenter}>
                  <span style={s.donutPct}>{pct}%</span>
                  <span style={s.donutLabel}>present</span>
                </div>
              </div>
            </div>

            {/* Mini Bar */}
            <div style={{ ...s.chartCard, flex: "1 1 340px" }}>
              <h3 style={s.chartTitle}>Last 6 Sessions</h3>
              <div style={{ height: 200 }}>
                <Bar data={barData} options={barOpts} />
              </div>
              <p style={{ color: "#6b7280", fontSize: 12, marginTop: 12, textAlign: "center" }}>
                Green = Present &nbsp;|&nbsp; Red = Absent
              </p>
            </div>
          </div>
        </>
      )}

      {/* ── System-wide stats for admin/domain_lead ── */}
      {allStats && (
        <>
          <h2 style={s.sectionTitle}>
            {user.role === "faculty" ? "🌐 System-Wide Overview" : user.role === "admin" ? "🌐 System-Wide Overview" : "🏷️ Domain Overview"}
          </h2>
          <div style={s.statsGrid}>
            <StatCard icon="🗃️"  label="Total Records"  value={allStats.total}                           accent="#f59e0b" />
            <StatCard icon="✅"  label="Total Present"  value={allStats.present}                         accent="#4ade80" />
            <StatCard icon="❌"  label="Total Absent"   value={allStats.absent}                          accent="#f87171" />
            <StatCard icon="📊" label="Overall Rate"   value={`${allStats.attendance_percentage}%`}     accent="#a78bfa" />
          </div>
        </>
      )}

      {/* ── Recent Attendance Table ── */}
      {user.role !== "faculty" && attendance.length > 0 && (
        <>
          <h2 style={s.sectionTitle}>📅 Recent Attendance</h2>
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  {["Date", "Domain", "Status", "Marked At"].map(h => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {attendance.slice(0, 8).map((a, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #1f2937" }}>
                    <td style={s.td}>{a.date}</td>
                    <td style={s.td}><span style={s.domainTag}>{a.domain}</span></td>
                    <td style={s.td}>
                      <span style={{
                        ...s.statusBadge,
                        background: a.status === "present" ? "#14532d" : "#450a0a",
                        color:      a.status === "present" ? "#4ade80" : "#f87171",
                        border:     `1px solid ${a.status === "present" ? "#22c55e33" : "#ef444433"}`
                      }}>
                        {a.status === "present" ? "✅ Present" : "❌ Absent"}
                      </span>
                    </td>
                    <td style={{ ...s.td, color: "#6b7280" }}>{a.marked_at ? new Date(a.marked_at).toLocaleTimeString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {user.role !== "faculty" && attendance.length === 0 && (
        <div style={s.emptyState}>
          <p style={{ fontSize: 48 }}>📭</p>
          <p style={{ color: "#6b7280", marginTop: 8 }}>No attendance records yet. Scan a QR code to get started!</p>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, accent }) {
  return (
    <div style={{ ...s.statCard, borderTop: `3px solid ${accent}` }}>
      <div style={{ fontSize: 28 }}>{icon}</div>
      <div style={{ ...s.statValue, color: accent }}>{value}</div>
      <div style={s.statLabel}>{label}</div>
    </div>
  );
}

const s = {
  page:        { minHeight: "100vh", background: "#0f1117", padding: "96px 28px 32px", fontFamily: "'Inter', 'Segoe UI', sans-serif", color: "#f9fafb" },
  header:      { display: "flex", justifyContent: "space-between", alignItems: "flex-start", background: "linear-gradient(135deg, #1f2937 0%, #111827 100%)", borderRadius: 16, padding: "28px 32px", marginBottom: 28, border: "1px solid #1f2937", flexWrap: "wrap", gap: 16 },
  greeting:    { color: "#9ca3af", fontSize: 14, margin: 0 },
  name:        { fontSize: 28, fontWeight: 700, margin: "4px 0 12px", background: "linear-gradient(90deg, #f9fafb, #9ca3af)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" },
  badge:       { fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 20 },
  headerRight: { textAlign: "right" },
  headerSub:   { color: "#4b5563", fontSize: 12, margin: 0 },
  headerDate:  { color: "#9ca3af", fontSize: 14, margin: "4px 0 0" },
  sectionTitle:{ fontSize: 18, fontWeight: 700, color: "#e5e7eb", margin: "32px 0 16px", display: "flex", alignItems: "center", gap: 8 },
  statsGrid:   { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16, marginBottom: 8 },
  statCard:    { background: "#111827", borderRadius: 14, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 6, border: "1px solid #1f2937", transition: "transform 0.2s", cursor: "default" },
  statValue:   { fontSize: 32, fontWeight: 800, lineHeight: 1 },
  statLabel:   { fontSize: 13, color: "#6b7280" },
  chartsRow:   { display: "flex", gap: 20, flexWrap: "wrap", marginTop: 20, marginBottom: 4 },
  chartCard:   { background: "#111827", border: "1px solid #1f2937", borderRadius: 16, padding: "20px 24px", flex: "0 1 280px", position: "relative" },
  chartTitle:  { fontSize: 15, fontWeight: 600, color: "#d1d5db", margin: "0 0 16px" },
  donutCenter: { position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -62%)", textAlign: "center", pointerEvents: "none" },
  donutPct:    { display: "block", fontSize: 28, fontWeight: 800, color: "#f9fafb" },
  donutLabel:  { display: "block", fontSize: 11, color: "#6b7280" },
  tableWrap:   { background: "#111827", border: "1px solid #1f2937", borderRadius: 16, overflow: "hidden", marginBottom: 32 },
  table:       { width: "100%", borderCollapse: "collapse" },
  th:          { padding: "14px 20px", background: "#0d1117", color: "#6b7280", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "left" },
  td:          { padding: "14px 20px", fontSize: 14, color: "#d1d5db" },
  domainTag:   { background: "#1e3a5f", color: "#93c5fd", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 500 },
  statusBadge: { padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600 },
  emptyState:  { textAlign: "center", padding: "60px 20px", background: "#111827", borderRadius: 16, border: "1px solid #1f2937", marginTop: 20 },
  faceBtn:      { width: "100%", padding: "12px", background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" },
};
