import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../api";

const C = {
  page: "#0f1117", card: "#111827", border: "#1f2937",
  text: "#9ca3af", textLight: "#d1d5db", textBright: "#f9fafb",
  green: "#4ade80", greenBg: "#14532d33", greenBorder: "#22c55e44",
  red: "#f87171", redBg: "#45000033", redBorder: "#ef444444",
  blue: "#60a5fa", blueBg: "#1e3a5f",
  input: "#0d1117",
};

const ROLE_ACCENT = {
  admin:       { bg: "#7f1d1d", color: "#fca5a5", label: "🛡️ Admin" },
  domain_lead: { bg: "#1e3a8a", color: "#93c5fd", label: "🏆 Domain Lead" },
  faculty:     { bg: "#4c1d95", color: "#c4b5fd", label: "🎓 Faculty" },
  member:      { bg: "#14532d", color: "#86efac", label: "⭐ Member" },
};

export default function Profile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [domains, setDomains] = useState([]);
  const [form, setForm] = useState({ name: "", department: "", year: "", regno: "" });
  const [selectedDomains, setSelectedDomains] = useState([]);
  const [msg, setMsg] = useState({ text: "", type: "" });
  const [saving, setSaving] = useState(false);
  const [leadDomainId, setLeadDomainId] = useState(null);
  const [faceCapturing, setFaceCapturing] = useState(false);
  const [faceSubmitting, setFaceSubmitting] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    Promise.all([api.get("/auth/profile"), api.get("/analytics/domains")]).then(([p, d]) => {
      setProfile(p.data);
      setDomains(d.data);
      setForm({
        name: p.data.name || "",
        department: p.data.department || "",
        year: p.data.year || "",
        regno: p.data.regno || "",
      });
      setSelectedDomains(p.data.domains.map(d => d.id));
      if (p.data.lead_domain_id) setLeadDomainId(parseInt(p.data.lead_domain_id));
    });
  }, []);

  const startFaceCamera = async () => {
    setFaceCapturing(true);
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    streamRef.current = stream;
    if (videoRef.current) videoRef.current.srcObject = stream;
  };

  const stopFaceCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    setFaceCapturing(false);
  };

  const registerFace = async () => {
    setFaceSubmitting(true);
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext("2d").drawImage(videoRef.current, 0, 0);
    const b64 = canvas.toDataURL("image/jpeg");
    try {
      await api.post("/attendance/register-face", { image: b64 });
      stopFaceCamera();
      setProfile(p => ({ ...p, face_registered: true }));
      setMsg({ text: "Face registered successfully!", type: "success" });
    } catch (err) {
      setMsg({ text: err.response?.data?.error || "Face registration failed.", type: "error" });
    } finally { setFaceSubmitting(false); }
  };

  const toggleDomain = (id) =>
    setSelectedDomains(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);

  const save = async () => {
    setSaving(true); setMsg({ text: "", type: "" });
    try {
      await api.put("/auth/profile", { ...form, domain_ids: selectedDomains });
      setMsg({ text: "Profile updated successfully!", type: "success" });
    } catch (err) {
      setMsg({ text: err.response?.data?.error || "Failed to update profile.", type: "error" });
    } finally { setSaving(false); }
  };

  if (!profile) return (
    <div style={{ ...s.page, justifyContent: "center", alignItems: "center" }}>
      <div style={s.spinner} />
    </div>
  );

  const rConf = ROLE_ACCENT[profile.role] || ROLE_ACCENT.member;
  const isFaculty = profile.role === "faculty";

  return (
    <div style={s.page}>
      <div style={s.wrap}>

        {/* ── Left: Identity Card ── */}
        <div style={s.idCard}>
          {/* Avatar */}
          <div style={s.avatar}>{(profile.name || "U")[0].toUpperCase()}</div>
          <h2 style={s.userName}>{profile.name}</h2>
          <p style={s.userEmail}>{profile.email}</p>
          <span style={{ ...s.rolePill, background: rConf.bg, color: rConf.color }}>{rConf.label}</span>

          <div style={s.statusList}>
            <div style={{ ...s.statusItem, background: profile.is_verified ? C.greenBg : C.redBg, border: `1px solid ${profile.is_verified ? C.greenBorder : C.redBorder}`, color: profile.is_verified ? C.green : C.red }}>
              {profile.is_verified ? "✅" : "❌"} Email {profile.is_verified ? "Verified" : "Not Verified"}
            </div>
            <div style={{ ...s.statusItem, background: profile.is_approved ? C.greenBg : "#451a0333", border: `1px solid ${profile.is_approved ? C.greenBorder : "#92400e44"}`, color: profile.is_approved ? C.green : "#fbbf24" }}>
              {profile.is_approved ? "✅ Approved" : "⏳ Pending Approval"}
            </div>
            <div style={{ ...s.statusItem, background: profile.face_registered ? C.greenBg : C.redBg, border: `1px solid ${profile.face_registered ? C.greenBorder : C.redBorder}`, color: profile.face_registered ? C.green : C.red }}>
              {profile.face_registered ? "✅" : "❌"} Face {profile.face_registered ? "Registered" : "Not Registered"}
            </div>
          </div>

          {/* Register Face */}
          {!profile.face_registered && (
            <div style={{ marginTop: 16 }}>
              {!faceCapturing ? (
                <button style={s.faceBtn} onClick={startFaceCamera}>📷 Register Face</button>
              ) : (
                <div>
                  <div style={s.videoWrap}>
                    <video ref={videoRef} autoPlay style={s.video} />
                    <div style={s.videoOverlay}><div style={s.faceFrame} /></div>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button style={{ ...s.faceBtn, flex: 1, ...(faceSubmitting ? { opacity: 0.5 } : {}) }} onClick={registerFace} disabled={faceSubmitting}>
                      {faceSubmitting ? "⏳ Saving..." : "✅ Capture & Save"}
                    </button>
                    <button style={{ ...s.faceBtn, background: "#1f2937", color: C.text, flex: "0 0 auto" }} onClick={stopFaceCamera}>✕</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Current Domains */}
          {profile.domains?.length > 0 && (
            <div style={s.currentDomains}>
              <p style={s.subLabel}>Current Domains</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {profile.domains.map(d => (
                  <span key={d.id} style={s.domainTag}>{d.name}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Edit Form ── */}
        <div style={s.formCard}>
          <h3 style={s.formTitle}>Edit Profile</h3>
          <p style={s.formNote}>⚠️ Face data cannot be changed once registered.</p>

          <div style={s.fieldsGrid}>
            <Field label="Full Name"        value={form.name}       onChange={v => setForm({...form, name: v})}       placeholder="Your name" />
            {!isFaculty && <Field label="Register Number" value={form.regno}      onChange={v => setForm({...form, regno: v})}      placeholder="e.g. 22CS001" />}
            <Field label="Department"       value={form.department} onChange={v => setForm({...form, department: v})} placeholder="e.g. Computer Science" />
            {!isFaculty && <Field label="Year"            value={form.year}       onChange={v => setForm({...form, year: v})}       placeholder="e.g. 2nd Year" />}
          </div>

          {/* Domain Selection (not for faculty) */}
          {!isFaculty && (
            <div style={s.domainsSection}>
              <p style={s.subLabel}>Select Your Domains</p>
              <div style={s.domainGrid}>
                {domains.map(d => (
                  <label key={d.id} style={{
                    ...s.domainCheck,
                    ...(selectedDomains.includes(d.id) ? s.domainCheckActive : {})
                  }}>
                    <input
                      type="checkbox"
                      checked={selectedDomains.includes(d.id)}
                      onChange={() => toggleDomain(d.id)}
                      style={{ display: "none" }}
                    />
                    <span>{selectedDomains.includes(d.id) ? "✅" : "⬜"} {d.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Domain Lead Assignment */}
          {profile.role === "domain_lead" && (
            <div style={s.leadSection}>
              <p style={{ ...s.subLabel, marginBottom: 6 }}>👑 Assign Your Lead Domain</p>
              <p style={{ color: C.text, fontSize: 12, marginBottom: 10 }}>This scopes your analytics to your managed domain.</p>
              {leadDomainId ? (
                <div style={{ background: "#14532d33", border: "1px solid #22c55e44", borderRadius: 10, padding: "10px 14px", color: "#4ade80", fontSize: 14, fontWeight: 600 }}>
                  ✅ {domains.find(d => d.id === leadDomainId || d.id == leadDomainId)?.name || "Domain assigned"}
                </div>
              ) : (
                <select style={s.select} onChange={async (e) => {
                  if (e.target.value) {
                    await api.post("/auth/assign-domain-lead", { domain_id: parseInt(e.target.value) });
                    setLeadDomainId(parseInt(e.target.value));
                    setMsg({ text: "Domain assigned successfully!", type: "success" });
                  }
                }}>
                  <option value="">-- Select your domain --</option>
                  {domains.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              )}
            </div>
          )}

          {/* Save Button */}
          <button style={{ ...s.saveBtn, ...(saving ? s.saveBtnDisabled : {}) }} onClick={save} disabled={saving}>
            {saving ? "⏳ Saving..." : "💾 Save Changes"}
          </button>

          {/* Feedback */}
          {msg.text && (
            <div style={{
              ...s.msgBox,
              background: msg.type === "success" ? C.greenBg : "#7f1d1d33",
              border: `1px solid ${msg.type === "success" ? C.greenBorder : C.redBorder}`,
              color: msg.type === "success" ? C.green : C.red,
            }}>
              {msg.type === "success" ? "✅" : "❌"} {msg.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={s.input}
      />
    </div>
  );
}

const s = {
  page:             { minHeight: "100vh", background: C.page, padding: "40px 24px", fontFamily: "'Inter','Segoe UI',sans-serif" },
  wrap:             { maxWidth: 900, margin: "0 auto", display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" },
  idCard:           { background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: "32px 28px", flex: "0 0 260px", textAlign: "center" },
  avatar:           { width: 80, height: 80, borderRadius: "50%", background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "#fff", fontSize: 36, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" },
  userName:         { fontSize: 20, fontWeight: 800, color: C.textBright, margin: "0 0 4px" },
  userEmail:        { fontSize: 13, color: C.text, margin: "0 0 12px", wordBreak: "break-all" },
  rolePill:         { display: "inline-block", fontSize: 12, fontWeight: 700, padding: "4px 14px", borderRadius: 20 },
  statusList:       { display: "flex", flexDirection: "column", gap: 8, marginTop: 20 },
  statusItem:       { borderRadius: 10, padding: "8px 12px", fontSize: 13, fontWeight: 600 },
  currentDomains:   { marginTop: 20, textAlign: "left" },
  subLabel:         { fontSize: 11, fontWeight: 700, color: C.text, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 },
  domainTag:        { background: C.blueBg, color: C.blue, border: "1px solid #1e3a8a", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600 },
  formCard:         { background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: "32px 28px", flex: "1 1 400px" },
  formTitle:        { fontSize: 18, fontWeight: 800, color: C.textBright, margin: "0 0 6px" },
  formNote:         { fontSize: 12, color: "#6b7280", margin: "0 0 24px" },
  fieldsGrid:       { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 },
  input:            { background: C.input, border: `1px solid ${C.border}`, color: C.textBright, padding: "10px 14px", borderRadius: 10, fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box" },
  domainsSection:   { marginBottom: 24 },
  domainGrid:       { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  domainCheck:      { background: "#0d1117", border: `1px solid ${C.border}`, color: C.text, borderRadius: 10, padding: "10px 12px", cursor: "pointer", fontSize: 13, fontWeight: 500, transition: "all 0.2s", display: "flex", alignItems: "center", gap: 6 },
  domainCheckActive:{ background: "#1e3a5f", border: "1px solid #1e40af", color: C.blue },
  leadSection:      { background: "#0d1117", border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px", marginBottom: 24 },
  select:           { width: "100%", background: C.input, border: `1px solid ${C.border}`, color: C.textBright, padding: "10px 12px", borderRadius: 10, fontSize: 14, outline: "none" },
  saveBtn:          { width: "100%", padding: "14px", background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer", transition: "opacity 0.2s" },
  saveBtnDisabled:  { opacity: 0.5, cursor: "not-allowed" },
  msgBox:           { borderRadius: 12, padding: "12px 16px", fontSize: 14, fontWeight: 600, marginTop: 16 },
  spinner:          { width: 40, height: 40, border: "3px solid #1f2937", borderTop: "3px solid #3b82f6", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  faceBtn:          { width: "100%", padding: "10px", background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer" },
  videoWrap:        { position: "relative", borderRadius: 10, overflow: "hidden", border: `2px solid ${C.border}` },
  video:            { width: "100%", display: "block" },
  videoOverlay:     { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" },
  faceFrame:        { width: 100, height: 120, border: "2px solid #3b82f6", borderRadius: "50% 50% 40% 40%", boxShadow: "0 0 0 2000px rgba(0,0,0,0.35)" },
};
