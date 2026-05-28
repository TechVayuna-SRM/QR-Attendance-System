import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../api";

export default function Register() {
  const [form, setForm] = useState({ name: "", department: "", year: "", regno: "" });
  const [selectedDomains, setSelectedDomains] = useState([]);
  const [domains, setDomains] = useState([]);
  const [step, setStep] = useState(1); // 1=profile, 2=face
  const [msg, setMsg] = useState("");
  const { user } = useAuth();
  const isFaculty = user?.role === "faculty";
  const videoRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/analytics/domains").then(r => setDomains(r.data));
  }, []);

  const toggleDomain = (id) => {
    setSelectedDomains(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);
  };

  const saveProfile = async () => {
    if (!form.name || !form.department) return setMsg("All fields are required");
    if (!isFaculty && (!form.year || !form.regno || selectedDomains.length === 0)) {
      return setMsg("All fields and at least one domain are required");
    }
    try {
      await api.put("/auth/profile", { ...form, domain_ids: selectedDomains });
      setStep(2);
      setMsg("");
      startCamera();
    } catch (err) {
      if (err.response?.status === 401) {
        setMsg("Session expired. Please log in again.");
      } else {
        setMsg(err.response?.data?.error || "Failed to save profile. Please try again.");
      }
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setMsg("Camera access denied. Please allow camera permission in your browser and try again.");
      } else if (err.name === "NotFoundError") {
        setMsg("No camera found on this device.");
      } else {
        setMsg("Could not access camera: " + err.message);
      }
      setStep(1);
    }
  };

  const captureAndRegister = async () => {
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext("2d").drawImage(videoRef.current, 0, 0);
    const b64 = canvas.toDataURL("image/jpeg");
    try {
      await api.post("/attendance/register-face", { image: b64 });
      videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      navigate("/dashboard");
    } catch (err) {
      setMsg(err.response?.data?.error || "Face registration failed");
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {step === 1 && (
          <>
            <h2>👤 Complete Your Profile</h2>
            {["name", "department"].map(field => (
              <input key={field} style={styles.input}
                placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
                value={form[field]} onChange={e => setForm({ ...form, [field]: e.target.value })} />
            ))}
            {!isFaculty && (
              <input style={styles.input} placeholder="Register Number (e.g. 22BCE1234)"
                value={form.regno} onChange={e => setForm({ ...form, regno: e.target.value })} />
            )}
            {!isFaculty && (
              <select style={styles.input} value={form.year} onChange={e => setForm({ ...form, year: e.target.value })}>
                <option value="">Select Year</option>
                {["1st Year", "2nd Year", "3rd Year", "4th Year"].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            )}
            {!isFaculty && <p style={{ fontWeight: "bold", marginTop: "12px", color: "#d1d5db" }}>Select Domains <span style={{color:"#f87171"}}>*</span></p>}
            {!isFaculty && <div style={styles.domainGrid}>
              {domains.map(d => {
                const selected = selectedDomains.includes(d.id);
                return (
                  <div
                    key={d.id}
                    onClick={() => toggleDomain(d.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: "8px",
                      padding: "9px 12px", borderRadius: "8px", fontSize: "13px",
                      cursor: "pointer", border: `2px solid ${selected ? "#4cc9f0" : "#374151"}`,
                      background: selected ? "#0d2a3a" : "#1f2937",
                      color: selected ? "#4cc9f0" : "#9ca3af",
                      userSelect: "none", pointerEvents: "auto"
                    }}
                  >
                    <span style={{
                      width: "16px", height: "16px", minWidth: "16px",
                      border: `2px solid ${selected ? "#4cc9f0" : "#6b7280"}`,
                      borderRadius: "3px",
                      background: selected ? "#4cc9f0" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "11px", color: "#0f1117", fontWeight: "bold"
                    }}>
                      {selected ? "✓" : ""}
                    </span>
                    {d.name}
                  </div>
                );
              })}
            </div>}
            <button style={styles.btn} onClick={saveProfile}>Next: Register Face</button>
          </>
        )}
        {step === 2 && (
          <>
            <h2>📸 Register Your Face</h2>
            <p style={{ color: "#666" }}>Face is registered once and cannot be changed</p>
            <video ref={videoRef} autoPlay style={styles.video} />
            <button style={styles.btn} onClick={captureAndRegister}>Capture & Register</button>
          </>
        )}
        {msg && <p style={{ color: "#f87171", marginTop: "12px" }}>{msg}</p>}
      </div>
    </div>
  );
}

const styles = {
  container: { display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#0f1117", fontFamily: "'Inter','Segoe UI',sans-serif" },
  card: { background: "#111827", padding: "40px", borderRadius: "16px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", minWidth: "360px", border: "1px solid #1f2937", color: "#f9fafb" },
  input: { display: "block", width: "100%", padding: "10px 14px", margin: "8px 0", borderRadius: "8px", border: "1px solid #374151", boxSizing: "border-box", fontSize: "14px", background: "#1f2937", color: "#f9fafb", outline: "none" },
  domainGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", margin: "8px 0 16px" },
  domainLabel: { display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", cursor: "pointer", padding: "8px 10px", borderRadius: "8px", border: "1px solid #374151", background: "#1f2937", color: "#9ca3af", pointerEvents: "auto" },
  btn: { background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "#fff", border: "none", padding: "10px 24px", borderRadius: "8px", cursor: "pointer", marginTop: "12px", fontWeight: 600, width: "100%" },
  video: { width: "100%", borderRadius: "8px", marginBottom: "12px" }
};
