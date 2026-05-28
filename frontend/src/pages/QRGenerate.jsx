import { useState, useEffect } from "react";
import api from "../api";

const C = {
  page: "#0f1117", card: "#111827", border: "#1f2937",
  text: "#9ca3af", textLight: "#d1d5db", textBright: "#f9fafb",
  green: "#4ade80", greenBg: "#14532d", greenBorder: "#22c55e",
  red: "#f87171", redBg: "#7f1d1d",
  amber: "#fbbf24", amberBg: "#451a03",
  blue: "#60a5fa",
};

export default function QRGenerate() {
  const [qrUrl, setQrUrl] = useState(null);
  const [error, setError] = useState("");
  const [alreadyGenerated, setAlreadyGenerated] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get("/attendance/qr-status")
      .then(r => { if (r.data.generated_today) { setAlreadyGenerated(true); } })
      .catch(() => {});
  }, []);

  const generate = async () => {
    setError(""); setQrUrl(null); setLoading(true);
    try {
      const res = await api.post("/attendance/generate-qr", {}, { responseType: "blob" });
      setQrUrl(URL.createObjectURL(res.data));
      setAlreadyGenerated(true);
    } catch (err) {
      const text = await err.response?.data?.text?.();
      try { setError(JSON.parse(text).error); } catch { setError("Failed to generate QR code."); }
    } finally { setLoading(false); }
  };

  return (
    <div style={s.page}>
      <div style={s.card}>
        {/* Header */}
        <div style={s.header}>
          <div style={s.iconCircle}>🔳</div>
          <div>
            <h2 style={s.title}>Generate QR Code</h2>
            <p style={s.subtitle}>Session QR for attendance marking</p>
          </div>
        </div>

        {/* Info Box */}
        <div style={s.infoBox}>
          <div style={s.infoRow}>
            <span style={s.infoIcon}>📅</span>
            <div>
              <p style={s.infoLabel}>Session Window</p>
              <p style={s.infoVal}>Every Wednesday, 12:40 PM – 1:30 PM</p>
            </div>
          </div>
          <div style={s.infoDivider} />
          <div style={s.infoRow}>
            <span style={s.infoIcon}>⏱️</span>
            <div>
              <p style={s.infoLabel}>QR Validity</p>
              <p style={s.infoVal}>10 minutes per QR code</p>
            </div>
          </div>
          <div style={s.infoDivider} />
          <div style={s.infoRow}>
            <span style={s.infoIcon}>🔒</span>
            <div>
              <p style={s.infoLabel}>Limit</p>
              <p style={s.infoVal}>One QR per Wednesday session</p>
            </div>
          </div>
        </div>

        {/* Already generated warning */}
        {alreadyGenerated && !qrUrl && (
          <div style={s.warnBox}>
            ⚠️ A QR code has already been generated for this Wednesday. Only one QR is allowed per week.
          </div>
        )}

        {/* Generate Button */}
        {!qrUrl && (
          <button
            style={{ ...s.btn, ...(alreadyGenerated || loading ? s.btnDisabled : {}) }}
            onClick={generate}
            disabled={alreadyGenerated || loading}
          >
            {loading ? "⏳ Generating..." : "⚡ Generate QR Code"}
          </button>
        )}

        {/* Error */}
        {error && (
          <div style={s.errorBox}>❌ {error}</div>
        )}

        {/* QR Display */}
        {qrUrl && (
          <div style={s.qrWrap}>
            <div style={s.qrCard}>
              <p style={{ ...s.infoLabel, textAlign: "center", marginBottom: 16 }}>SCAN WITH CAMERA</p>
              <img src={qrUrl} alt="QR Code" style={s.qrImg} />
              <div style={s.validPill}>✅ QR Active — Valid for 10 minutes</div>
            </div>
            <a href={qrUrl} download="qr_code.png" style={s.downloadBtn}>
              ⬇ Download QR Code
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  page:        { minHeight: "100vh", background: C.page, display: "flex", alignItems: "center", justifyContent: "center", padding: "96px 16px 32px", fontFamily: "'Inter','Segoe UI',sans-serif" },
  card:        { background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: "36px 32px", width: "100%", maxWidth: 460 },
  header:      { display: "flex", alignItems: "center", gap: 16, marginBottom: 28 },
  iconCircle:  { fontSize: 32, background: "#1f2937", width: 60, height: 60, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: `1px solid ${C.border}` },
  title:       { fontSize: 20, fontWeight: 800, color: C.textBright, margin: 0 },
  subtitle:    { fontSize: 13, color: C.text, margin: "4px 0 0" },
  infoBox:     { background: "#0d1117", border: `1px solid ${C.border}`, borderRadius: 12, padding: "4px 0", marginBottom: 24 },
  infoRow:     { display: "flex", alignItems: "center", gap: 14, padding: "14px 18px" },
  infoIcon:    { fontSize: 22, flexShrink: 0 },
  infoLabel:   { fontSize: 11, fontWeight: 700, color: C.text, textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 2px" },
  infoVal:     { fontSize: 14, fontWeight: 600, color: C.textLight, margin: 0 },
  infoDivider: { height: 1, background: C.border, margin: "0 18px" },
  warnBox:     { background: C.amberBg, border: "1px solid #92400e", color: C.amber, borderRadius: 12, padding: "12px 16px", fontSize: 13, marginBottom: 20, lineHeight: 1.5 },
  btn:         { width: "100%", padding: "15px", background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer", transition: "opacity 0.2s" },
  btnDisabled: { opacity: 0.4, cursor: "not-allowed" },
  errorBox:    { background: C.redBg, border: "1px solid #ef444444", color: C.red, borderRadius: 12, padding: "12px 16px", fontSize: 13, marginTop: 16 },
  qrWrap:      { marginTop: 24, textAlign: "center" },
  qrCard:      { background: "#fff", borderRadius: 16, padding: "24px", display: "inline-block", boxShadow: "0 0 0 4px #1f2937, 0 0 40px rgba(59,130,246,0.3)" },
  qrImg:       { width: 220, height: 220, display: "block" },
  validPill:   { background: "#14532d", color: "#4ade80", borderRadius: 20, padding: "6px 16px", fontSize: 12, fontWeight: 600, marginTop: 16, border: "1px solid #22c55e44" },
  downloadBtn: { display: "inline-flex", alignItems: "center", gap: 8, marginTop: 18, background: "#1f2937", color: C.blue, border: "1px solid #1e3a8a", padding: "10px 24px", borderRadius: 10, fontWeight: 600, fontSize: 14, textDecoration: "none" },
};
