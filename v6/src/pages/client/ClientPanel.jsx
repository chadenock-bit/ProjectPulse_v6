import { useState, useEffect } from "react";
import {
  X,
  Contact,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { COLORS, inputStyle, labelStyle } from "../../constants/theme";
import { activeOptions } from "../../utils/validation";

export function ClientPanel({ mode, data, countries, saving, error, onCancel, onClose, onSubmit }) {
  const [form, setForm] = useState(data);
  useEffect(() => setForm(data), [data]);

  return (
    <div className="pp-panel" style={{
      width: 380, background: COLORS.card, borderLeft: `1px solid ${COLORS.border}`, flexShrink: 0,
      display: "flex", flexDirection: "column", boxShadow: "-8px 0 30px rgba(15,20,40,0.06)",
    }}>
      <div style={{ padding: "18px 20px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: COLORS.text }}>{mode === "add" ? "Add New Client" : "Edit Client"}</div>
          <div style={{ fontSize: 12, color: COLORS.accent, marginTop: 2 }}>Client and contact details</div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.textMuted }}><X size={18} /></button>
      </div>

      <div style={{ padding: 20, flex: 1, overflowY: "auto" }}>
        <div style={{ fontWeight: 700, fontSize: 12.5, color: COLORS.textMuted, textTransform: "uppercase", marginBottom: 10 }}>Client</div>

        <label style={labelStyle}>Client Code*</label>
        <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. CL04" style={inputStyle} />

        <label style={{ ...labelStyle, marginTop: 14 }}>Client Name*</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Acme Corp" style={inputStyle} />

        <label style={{ ...labelStyle, marginTop: 14 }}>Country</label>
        <select value={form.countryId} onChange={(e) => setForm({ ...form, countryId: e.target.value })} style={inputStyle}>
          <option value="">Select country</option>
          {activeOptions(countries, form.countryId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <label style={{ ...labelStyle, marginTop: 14 }}>Default Currency</label>
        {/* Temporary fixed list until the Currency master has its own flow/screen */}
        <select value={form.defaultCurrencyCode || "INR"} onChange={(e) => setForm({ ...form, defaultCurrencyCode: e.target.value })} style={inputStyle}>
          <option value="INR">INR</option>
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
          <option value="GBP">GBP</option>
        </select>

        <div style={{ fontWeight: 700, fontSize: 12.5, color: COLORS.textMuted, textTransform: "uppercase", margin: "20px 0 10px" }}>Contact</div>

        <label style={labelStyle}>Contact Name*</label>
        <input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} placeholder="e.g. Priya Sharma" style={inputStyle} />

        <label style={{ ...labelStyle, marginTop: 14 }}>Email</label>
        <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="e.g. priya@acme.com" style={inputStyle} />

        <label style={{ ...labelStyle, marginTop: 14 }}>Phone</label>
        <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="e.g. +91 98765 43210" style={inputStyle} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 20, padding: "12px 14px", border: `1px solid ${COLORS.border}`, borderRadius: 10 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: COLORS.text }}>Active</span>
          <div
            onClick={() => setForm({ ...form, active: !form.active })}
            style={{
              width: 40, height: 22, borderRadius: 999, background: form.active ? COLORS.accent : "COLORS.toggleOff",
              position: "relative", cursor: "pointer", transition: "background 0.15s",
            }}
          >
            <div style={{
              width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 2,
              left: form.active ? 20 : 2, transition: "left 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
            }} />
          </div>
        </div>

        {error && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", color: COLORS.danger, fontSize: 12.5, marginTop: 16 }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}
      </div>

      <div style={{ padding: 16, borderTop: `1px solid ${COLORS.border}`, display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={() => setForm(data)} style={{ padding: "9px 16px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", color: COLORS.text }}>
          Cancel
        </button>
        <button
          onClick={() => onSubmit(form)}
          disabled={saving}
          style={{
            padding: "9px 18px", borderRadius: 8, border: "none", background: COLORS.accent, color: "#fff",
            fontSize: 13, fontWeight: 700, cursor: saving ? "default" : "pointer", opacity: saving ? 0.75 : 1,
            display: "flex", alignItems: "center", gap: 7,
          }}
        >
          {saving && <Loader2 size={13} className="spin" />}
          {saving ? "Saving…" : "Submit"}
        </button>
      </div>
    </div>
  );
}