import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import api from "../api";

const C = {
  page: "#0f1117", card: "#111827", border: "#1f2937",
  text: "#9ca3af", textLight: "#d1d5db", textBright: "#f9fafb",
  green: "#4ade80", greenBg: "#14532d", greenBorder: "#22c55e",
  red: "#f87171", redBg: "#450a0a", redBorder: "#ef4444",
  blue: "#60a5fa", blueBg: "#1e3a5f",
  accent: "#3b82f6",
};

export default function QRScan() {
  const [userDomains, setUserDomains] = useState([]);
  const [allDomains,  setAllDomains]  = useState([]);
  const [selectedDomainIds, setSelectedDomainIds] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [role, setRole] = useState("");
  const [scannedToken, setScannedToken] = useState(null);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState("");
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const videoRef = useRef(null);
  const qrRef = useRef(null);

  useEffect(() => {
    api.get("/auth/profile").then(r => {
      const uRole = r.data.role;
      const domains = r.data.domains || [];
      setRole(uRole);
      setIsAdmin(uRole === "admin" || uRole === "faculty");
      setUserDomains(domains);
      setSelectedDomainIds(domains.map(d => d.id));
      setLoading(false);
    }).catch(() => setLoading(false));

    // Fetch all domains for admin/faculty domain picker
    api.get("/analytics/domains").then(r => setAllDomains(r.data)).catch(() => {});
  }, []);

  const startScan = () => {
    setMsg(""); setMsgType("");
    const html5QrCode = new Html5Qrcode("qr-reader");
    qrRef.current = html5QrCode;
    setScanning(true);
    html5QrCode.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: 250 },
      (decodedText) => {
        html5QrCode.stop();
        setScanning(false);
        setScannedToken(decodedText);
        startCamera();
      },
      () => {}
    );
  };

  const startCamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    if (videoRef.current) videoRef.current.srcObject = stream;
  };

  const submitAttendance = async () => {
    const domainsToMark = role === "admin"
      ? allDomains
      : userDomains;

    if (domainsToMark.length === 0) {
      setMsg("Select at least one domain to mark attendance."); setMsgType("error"); return;
    }
    setSubmitting(true);
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext("2d").drawImage(videoRef.current, 0, 0);
    const b64 = canvas.toDataURL("image/jpeg");

    let successCount = 0, errors = [];
    for (const domain of domainsToMark) {
      try {
        await api.post("/attendance/scan", { token: scannedToken, image: b64, domain_id: domain.id });
        successCount++;
      } catch (err) {
        errors.push(`${domain.name}: ${err.response?.data?.error || "Failed"}`);
      }
    }

    videoRef.current?.srcObject?.getTracks().forEach(t => t.stop());
    setScannedToken(null); setSubmitting(false);

    if (successCount > 0) {
      setMsg(`Attendance marked as Present for ${successCount} domain(s): ${domainsToMark.map(d => d.name).join(", ")}`);
      setMsgType("success");
    } else {
      setMsg(errors.join(" | ")); setMsgType("error");
    }
  };

  if (loading) return (
    <div style={{ ...s.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={s.spinner} />
    </div>
  );

  const noAttendanceRequired = role === "faculty";
  if (noAttendanceRequired) {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={s.header}>
            <div style={s.iconCircle}>🛡️</div>
            <div>
              <h2 style={s.title}>QR Attendance Scanner</h2>
              <p style={s.subtitle}>
                Role: <span style={{ textTransform: "capitalize", color: C.blue, fontWeight: 700 }}>
                  {role}
                </span>
              </p>
            </div>
          </div>

          <div style={{ ...s.section, textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>ℹ️</div>
            <h3 style={{ color: C.textBright, marginBottom: "8px", fontSize: "18px", fontWeight: 700 }}>No Attendance Required</h3>
            <p style={{ color: C.text, fontSize: "14px", lineHeight: "1.6", margin: 0 }}>
              As a <strong>Faculty</strong>, you do not need to mark attendance. Attendance tracking is required for standard club members, domain leads, and admins only.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const canStartScan = role === "admin" || ((role === "member" || role === "domain_lead") && userDomains.length > 0);

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.header}>
          <div style={s.iconCircle}>📷</div>
          <div>
            <h2 style={s.title}>QR Attendance Scanner</h2>
            <p style={s.subtitle}>Scan the session QR code to mark your presence</p>
          </div>
        </div>

        {(role === "member" || role === "domain_lead") && (
          <div style={s.section}>
            <p style={s.sectionLabel}>Your Registered Domains</p>
            {userDomains.length === 0 ? (
              <div style={s.warnBox}>⚠️ No domains found. Please update your profile first.</div>
            ) : (
              <div style={s.tagRow}>
                {userDomains.map(d => <span key={d.id} style={s.tag}>{d.name}</span>)}
              </div>
            )}
          </div>
        )}

        {role === "admin" && (
          <div style={s.section}>
            <p style={s.sectionLabel}>Marking Attendance As</p>
            <div style={s.tagRow}>
              <span style={{ ...s.tag, background: "#1e3a5f", color: C.blue, border: "1px solid #1e40af" }}>🛡️ Admin (All Domains)</span>
            </div>
          </div>
        )}

        <div style={s.divider} />

        {!scannedToken && (
          <div style={s.section}>
            <div id="qr-reader" style={{ width: "100%", borderRadius: 10, overflow: "hidden" }} />
            {!scanning && (
              <button
                style={{ ...s.btn, ...(!canStartScan ? s.btnDisabled : {}) }}
                onClick={startScan}
                disabled={!canStartScan}
              >
                <span style={{ fontSize: 20 }}>🔍</span> Start QR Scanner
              </button>
            )}
            {scanning && (
              <div style={s.scanningPill}>
                <span style={s.scanDot} /> Scanning for QR code...
              </div>
            )}
          </div>
        )}

        {scannedToken && (
          <div style={s.section}>
            <div style={s.successPill}>✅ QR Code Scanned! Now verify your face below.</div>
            <div style={s.videoWrap}>
              <video ref={videoRef} autoPlay style={s.video} />
              <div style={s.videoOverlay}>
                <div style={s.faceFrame} />
              </div>
            </div>
            <button
              style={{ ...s.btn, ...(submitting ? s.btnDisabled : {}) }}
              onClick={submitAttendance}
              disabled={submitting}
            >
              {submitting ? "⏳ Verifying..." : "🧠 Verify Face & Mark Attendance"}
            </button>
          </div>
        )}

        {msg && (
          <div style={{
            ...s.msgBox,
            background: msgType === "success" ? C.greenBg : C.redBg,
            border: `1px solid ${msgType === "success" ? C.greenBorder : C.redBorder}`,
            color: msgType === "success" ? C.green : C.red,
          }}>
            {msgType === "success" ? "✅" : "❌"} {msg}
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  page:         { minHeight: "100vh", background: C.page, display: "flex", alignItems: "center", justifyContent: "center", padding: "96px 16px 32px", fontFamily: "'Inter','Segoe UI',sans-serif" },
  card:         { background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: "36px 32px", width: "100%", maxWidth: 460 },
  header:       { display: "flex", alignItems: "center", gap: 16, marginBottom: 28 },
  iconCircle:   { fontSize: 32, background: "#1f2937", width: 60, height: 60, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: `1px solid ${C.border}` },
  title:        { fontSize: 20, fontWeight: 800, color: C.textBright, margin: 0 },
  subtitle:     { fontSize: 13, color: C.text, margin: "4px 0 0" },
  section:      { marginBottom: 24 },
  sectionLabel: { fontSize: 12, fontWeight: 700, color: C.text, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 },
  tagRow:       { display: "flex", flexWrap: "wrap", gap: 8 },
  tag:          { background: C.blueBg, color: C.blue, border: "1px solid #1e3a8a", padding: "4px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600 },
  warnBox:      { background: "#451a03", border: "1px solid #92400e", color: "#fbbf24", borderRadius: 10, padding: "12px 16px", fontSize: 13 },
  divider:      { height: 1, background: C.border, marginBottom: 24 },
  btn:          { width: "100%", padding: "14px", background: "linear-gradient(135deg, #2563eb, #7c3aed)", color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16, transition: "opacity 0.2s" },
  btnDisabled:  { opacity: 0.4, cursor: "not-allowed" },
  scanningPill: { display: "flex", alignItems: "center", gap: 8, background: "#1e3a5f", color: C.blue, borderRadius: 20, padding: "8px 16px", fontSize: 13, marginTop: 12, border: "1px solid #1e40af" },
  scanDot:      { width: 8, height: 8, borderRadius: "50%", background: C.blue, display: "inline-block", animation: "pulse 1s infinite" },
  successPill:  { background: C.greenBg, border: `1px solid ${C.greenBorder}`, color: C.green, borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 600, marginBottom: 16 },
  videoWrap:    { position: "relative", borderRadius: 12, overflow: "hidden", border: `2px solid ${C.border}` },
  video:        { width: "100%", display: "block", borderRadius: 12 },
  videoOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" },
  faceFrame:    { width: 140, height: 160, border: "3px solid #3b82f6", borderRadius: "50% 50% 40% 40%", boxShadow: "0 0 0 2000px rgba(0,0,0,0.35)" },
  msgBox:       { borderRadius: 12, padding: "14px 18px", fontSize: 14, fontWeight: 600, marginTop: 8, lineHeight: 1.5 },
  spinner:      { width: 40, height: 40, border: "3px solid #1f2937", borderTop: "3px solid #3b82f6", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
};
