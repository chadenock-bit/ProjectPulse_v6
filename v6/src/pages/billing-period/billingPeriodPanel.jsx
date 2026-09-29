import { useState, useEffect } from "react";
import { ArrowLeft, Loader2, AlertCircle, CalendarClock, Info, CalendarDays, Lock, Eye } from "lucide-react";
import { COLORS, SHADOWS, inputStyle, labelStyle } from "../../constants/theme";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Same "Section card + right-hand Summary" layout as Link Invoice's panel
// (see LinkInvoicePanel.jsx) — adopted here for a consistent look across
// Finance's Add/Edit screens. All the underlying form logic (auto Period
// Name/dates from Month+Year, Closed/Active toggles) is unchanged.
const card = { background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 14, boxShadow: SHADOWS.sm };
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: "16px 18px" };

function Section({ icon: Icon, color, title, sub, children }) {
  return (
    <div style={{ ...card, padding: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <span style={{ width: 36, height: 36, borderRadius: 10, background: `${color}18`, color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={18} /></span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: COLORS.text }}>{title}</div>
          <div style={{ fontSize: 12, color: COLORS.textMuted }}>{sub}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

function Stat({ icon: Icon, label, value, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 10 }}>
      <Icon size={16} color={color || COLORS.accent} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, fontSize: 12.5, color: COLORS.textMuted }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: color || COLORS.text, textAlign: "right", maxWidth: "60%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", border: `1px solid ${COLORS.border}`, borderRadius: 10, height: 40, boxSizing: "border-box" }}>
        <span style={{ fontSize: 12.5, color: COLORS.textMuted }}>{hint}</span>
        <div onClick={onChange} style={{ width: 40, height: 22, borderRadius: 999, background: checked ? COLORS.accent : "COLORS.toggleOff", position: "relative", cursor: "pointer", flexShrink: 0, marginLeft: 10 }}>
          <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: checked ? 20 : 2, transition: "left 0.15s" }} />
        </div>
      </div>
    </div>
  );
}

export function BillingPeriodPanel({ mode, data, saving, error, onCancel, onClose, onSubmit }) {
  const [form, setForm] = useState(data);
  useEffect(() => setForm(data), [data]);

  const applyMonthYear = (billingMonth, billingYear) => {
    const m = Number(billingMonth), y = Number(billingYear);
    let periodName = form.periodName, periodStartDate = form.periodStartDate, periodEndDate = form.periodEndDate;
    if (m && y) {
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0);
      periodStartDate = start.toISOString().slice(0, 10);
      periodEndDate = end.toISOString().slice(0, 10);
      if (!form.periodName || form._autoName) periodName = `${MONTHS[m - 1]} ${y} (${String(m).padStart(2, "0")}/${y})`;
    }
    setForm((f) => ({ ...f, billingMonth, billingYear, periodName, periodStartDate, periodEndDate, _autoName: true }));
  };

  const daysInPeriod = form.periodStartDate && form.periodEndDate
    ? Math.round((new Date(form.periodEndDate) - new Date(form.periodStartDate)) / 86400000) + 1
    : null;

  return (
    <div className="pp-project-page" style={{ flex: 1, background: COLORS.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "18px 28px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", gap: 14, background: COLORS.card }}>
        <button onClick={onClose} title="Back to Billing Periods" aria-label="Back to Billing Periods" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: COLORS.text }}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18, color: COLORS.text, fontFamily: "Sora, sans-serif" }}>{mode === "add" ? "Add Billing Period" : "Edit Billing Period"}</div>
          <div style={{ fontSize: 12, color: COLORS.accent, marginTop: 2 }}>One period per calendar month, used by Billing and Invoicing</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "22px 28px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
          <div style={{ flex: "3 1 600px", minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>
            <Section icon={CalendarClock} color={COLORS.accent} title="Period Details" sub="Month, year and the name shown everywhere else">
              <div style={grid}>
                <div>
                  <label style={labelStyle}>Month*</label>
                  <select value={form.billingMonth || ""} onChange={(e) => applyMonthYear(e.target.value, form.billingYear)} style={inputStyle}>
                    <option value="">Select month</option>
                    {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Year*</label>
                  <input type="number" value={form.billingYear || ""} onChange={(e) => applyMonthYear(form.billingMonth, e.target.value)} placeholder="e.g. 2026" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Period Name*</label>
                  <input value={form.periodName || ""} onChange={(e) => setForm({ ...form, periodName: e.target.value, _autoName: false })} placeholder="e.g. Aug 2026 (01–31 Aug)" style={inputStyle} />
                </div>
              </div>
            </Section>

            <Section icon={CalendarDays} color="#8B5CF6" title="Date Range" sub="Start and end date for this period">
              <div style={grid}>
                <div>
                  <label style={labelStyle}>Start Date*</label>
                  <input type="date" value={form.periodStartDate || ""} onChange={(e) => setForm({ ...form, periodStartDate: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>End Date*</label>
                  <input type="date" value={form.periodEndDate || ""} onChange={(e) => setForm({ ...form, periodEndDate: e.target.value })} style={inputStyle} />
                </div>
              </div>
            </Section>

            <Section icon={Lock} color="#22A06B" title="Status" sub="Whether this period can still take new billing">
              <div style={grid}>
                <Toggle label="Closed" hint="Closed periods can still be viewed but shouldn't take new billing" checked={!!form.isClosed} onChange={() => setForm({ ...form, isClosed: !form.isClosed })} />
                <Toggle label="Active" hint="Visible in dropdowns and reports" checked={!!form.active} onChange={() => setForm({ ...form, active: !form.active })} />
              </div>
            </Section>

            {error && <div style={{ display: "flex", gap: 8, alignItems: "center", color: COLORS.danger, fontSize: 13, padding: "12px 14px", background: COLORS.dangerSoft, borderRadius: 10 }}><AlertCircle size={15} /> {error}</div>}
          </div>

          <div style={{ flex: "1 1 300px", minWidth: 0, position: "sticky", top: 0 }}>
            <div style={{ ...card, padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: COLORS.text }}>Period Summary</div>

              <div style={{ padding: 16, borderRadius: 12, background: `linear-gradient(135deg, ${COLORS.navy}, ${COLORS.navyLift})`, color: "#fff" }}>
                <div style={{ fontSize: 11.5, opacity: 0.7, letterSpacing: "0.04em" }}>PERIOD NAME</div>
                <div style={{ fontSize: 20, fontWeight: 800, marginTop: 8 }}>{form.periodName || "—"}</div>
                <div style={{ fontSize: 11.5, opacity: 0.7 }}>{daysInPeriod ? `${daysInPeriod} day${daysInPeriod === 1 ? "" : "s"}` : "Pick a month to auto-fill"}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, padding: "4px 10px", borderRadius: 999, background: form.active ? "rgba(27,156,110,.3)" : "rgba(255,255,255,.12)" }}>{form.active ? "Active" : "Inactive"}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 600, padding: "4px 10px", borderRadius: 999, background: form.isClosed ? "rgba(214,72,62,.35)" : "rgba(255,255,255,.12)" }}>{form.isClosed ? "Closed" : "Open"}</span>
                </div>
              </div>

              <Stat icon={CalendarDays} label="Start Date" value={form.periodStartDate || "—"} />
              <Stat icon={CalendarDays} label="End Date" value={form.periodEndDate || "—"} />
              <Stat icon={Eye} label="Visible In Dropdowns" value={form.active ? "Yes" : "No"} color={form.active ? COLORS.success : COLORS.danger} />
              <Stat icon={Lock} label="Accepting New Billing" value={form.isClosed ? "No" : "Yes"} color={form.isClosed ? COLORS.danger : COLORS.success} />

              <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: COLORS.accentSoft, fontSize: 12, color: COLORS.textSoft, lineHeight: 1.5 }}>
                <Info size={16} color={COLORS.accent} style={{ flexShrink: 0, marginTop: 1 }} />
                Fields marked * are required. Picking Month + Year auto-fills the period name and date range.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "14px 28px", borderTop: `1px solid ${COLORS.border}`, background: COLORS.card, display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={{ padding: "9px 16px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", color: COLORS.text }}>Cancel</button>
        <button onClick={() => onSubmit(form)} disabled={saving} style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: COLORS.accent, color: "#fff", fontSize: 13, fontWeight: 700, cursor: saving ? "default" : "pointer", opacity: saving ? 0.75 : 1, display: "flex", alignItems: "center", gap: 7 }}>
          {saving && <Loader2 size={13} className="spin" />}
          {saving ? "Saving…" : "Submit"}
        </button>
      </div>
    </div>
  );
}