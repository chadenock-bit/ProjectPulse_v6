import { useState, useEffect } from "react";
import {
  ArrowLeft, Loader2, AlertCircle, Receipt, Link2, Coins, Wallet, Info, Building2, FolderKanban,
  CalendarDays, Clock, CalendarClock, BadgeCheck, Gauge,
} from "lucide-react";
import { COLORS, SHADOWS, inputStyle, labelStyle } from "../../constants/theme";
import { activeOptions } from "../../utils/validation";

const card = { background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 14, boxShadow: SHADOWS.sm };
// NOTE: keep "auto-fill" — index.css restyles any inline "repeat(auto-fit, minmax(" grid as a stat card.
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: "16px 18px" };
const full = { gridColumn: "1 / -1" };

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

const find = (list, id) => (list || []).find((x) => String(x.guid ?? x.id) === String(id) || String(x.id) === String(id));

export function LinkInvoicePanel({ mode, data, clients, projects, currencies, billingPeriods, invoiceStatuses, billingRecords, saving, error, onCancel, onClose, onSubmit }) {
  const [form, setForm] = useState(data);
  useEffect(() => setForm(data), [data]);
  const set = (k, v) => setForm({ ...form, [k]: v });

  const billingLabel = (b) => {
    if (b.milestoneName) return b.milestoneName;
    return `Billing #${b.id}${b.amount ? ` — ${b.amount}` : ""}`;
  };

  const projectsForClient = form.clientId
    ? projects.filter((p) => String(p.clientId) === String(form.clientId))
    : projects;

  const client = find(clients, form.clientId);
  const project = find(projects, form.projectId);
  const period = find(billingPeriods, form.billingPeriodId);
  const status = find(invoiceStatuses, form.invoiceStatusId);
  const code = find(currencies, form.currencyId)?.code || "";
  const amount = Number(form.amount) || 0;
  const hours = Number(form.totalBillableHours) || 0;
  const fmt = (n) => `${code} ${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`.trim();

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const daysToDue = form.dueDate ? Math.round((new Date(form.dueDate) - today) / 86400000) : null;
  const paid = !!form.paymentDate;
  const overdue = !paid && daysToDue !== null && daysToDue < 0;
  const dueBeforeInvoice = form.invoiceDate && form.dueDate && form.dueDate < form.invoiceDate;
  const dueText = paid ? "Paid" : daysToDue === null ? "—" : overdue ? `Overdue by ${-daysToDue} d` : daysToDue === 0 ? "Due today" : `In ${daysToDue} days`;
  const dueColor = paid ? COLORS.success : overdue ? COLORS.danger : daysToDue !== null && daysToDue <= 7 ? COLORS.warning : undefined;

  return (
    <div className="pp-project-page" data-access-skip style={{ flex: 1, background: COLORS.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "18px 28px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", gap: 14, background: COLORS.card }}>
        <button onClick={onClose} title="Back to Link Invoice" aria-label="Back" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: COLORS.text }}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18, color: COLORS.text, fontFamily: "Sora, sans-serif" }}>{mode === "add" ? "Add Invoice" : "Edit Invoice"}</div>
          <div style={{ fontSize: 12, color: COLORS.accent, marginTop: 2 }}>Fill all required fields below</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "22px 28px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
          <div style={{ flex: "3 1 600px", minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>
            <Section icon={Receipt} color={COLORS.accent} title="Invoice Details" sub="Number, client and project">
              <div style={grid}>
                <div>
                  <label style={labelStyle}>Invoice Number*</label>
                  <input value={form.invoiceNumber} onChange={(e) => set("invoiceNumber", e.target.value)} placeholder="e.g. INV-1003" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Client*</label>
                  <select value={form.clientId || ""} onChange={(e) => setForm({ ...form, clientId: e.target.value, projectId: "" })} style={inputStyle}>
                    <option value="">Select client…</option>
                    {activeOptions(clients, form.clientId).map((c) => <option key={c.id} value={c.id}>{c.name || c.clientName}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Project</label>
                  <select value={form.projectId || ""} onChange={(e) => set("projectId", e.target.value)} style={inputStyle}>
                    <option value="">Select project…</option>
                    {activeOptions(projectsForClient, form.projectId).map((p) => <option key={p.id} value={p.id}>{p.projectCode ? `${p.projectCode} — ${p.projectName}` : p.projectName}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Invoice Date</label>
                  <input type="date" value={form.invoiceDate || ""} onChange={(e) => set("invoiceDate", e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Status</label>
                  <select value={form.invoiceStatusId || ""} onChange={(e) => set("invoiceStatusId", e.target.value)} style={inputStyle}>
                    <option value="">Select status…</option>
                    {activeOptions(invoiceStatuses, form.invoiceStatusId).map((s) => <option key={s.guid || s.id} value={s.guid || s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
            </Section>

            <Section icon={Link2} color="#8B5CF6" title="Billing Link & Amount" sub="Linked billing record, period, value and hours">
              <div style={grid}>
                <div>
                  <label style={labelStyle}>Linked Billing Record</label>
                  <select value={form.billingId || ""} onChange={(e) => set("billingId", e.target.value)} style={inputStyle}>
                    <option value="">None — link directly to project/client</option>
                    {activeOptions(billingRecords, form.billingId).map((b) => <option key={b.id} value={b.id}>{billingLabel(b)}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Billing Period</label>
                  <select value={form.billingPeriodId || ""} onChange={(e) => set("billingPeriodId", e.target.value)} style={inputStyle}>
                    <option value="">Select billing period…</option>
                    {activeOptions(billingPeriods, form.billingPeriodId).map((p) => <option key={p.id} value={p.id}>{p.periodName || p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Amount</label>
                  <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="e.g. 450000" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Currency</label>
                  <select value={form.currencyId || ""} onChange={(e) => set("currencyId", e.target.value)} style={inputStyle}>
                    <option value="">—</option>
                    {activeOptions(currencies, form.currencyId).map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Total Billable Hours</label>
                  <input type="number" min="0" step="0.5" value={form.totalBillableHours || ""} onChange={(e) => set("totalBillableHours", e.target.value)} placeholder="e.g. 160" style={inputStyle} />
                </div>
              </div>
            </Section>

            <Section icon={Wallet} color="#22A06B" title="Payment" sub="Due date, payment and Finance notes">
              <div style={grid}>
                <div>
                  <label style={labelStyle}>Due Date</label>
                  <input type="date" min={form.invoiceDate || undefined} value={form.dueDate || ""} onChange={(e) => set("dueDate", e.target.value)} style={{ ...inputStyle, borderColor: dueBeforeInvoice ? COLORS.danger : COLORS.border }} />
                  {dueBeforeInvoice && <div style={{ fontSize: 11.5, color: COLORS.danger, marginTop: 5 }}>Due date is before the invoice date</div>}
                </div>
                <div>
                  <label style={labelStyle}>Payment Date</label>
                  <input type="date" value={form.paymentDate || ""} onChange={(e) => set("paymentDate", e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Payment Reference</label>
                  <input value={form.paymentReference || ""} onChange={(e) => set("paymentReference", e.target.value)} placeholder="e.g. UTR/txn ref" style={inputStyle} />
                </div>
                <div style={full}>
                  <label style={labelStyle}>Finance Remarks</label>
                  <textarea value={form.financeRemarks || ""} onChange={(e) => set("financeRemarks", e.target.value)} placeholder="Notes for Finance…" rows={3} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
                </div>
              </div>
            </Section>

            {error && <div style={{ display: "flex", gap: 8, alignItems: "center", color: COLORS.danger, fontSize: 13, padding: "12px 14px", background: COLORS.dangerSoft, borderRadius: 10 }}><AlertCircle size={15} /> {error}</div>}
          </div>

          <div style={{ flex: "1 1 300px", minWidth: 0, position: "sticky", top: 0 }}>
            <div style={{ ...card, padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: COLORS.text }}>Invoice Summary</div>

              <div style={{ padding: 16, borderRadius: 12, background: `linear-gradient(135deg, ${COLORS.navy}, ${COLORS.navyLift})`, color: "#fff" }}>
                <div style={{ fontSize: 11.5, opacity: 0.7, letterSpacing: "0.04em" }}>{form.invoiceNumber || "INVOICE NUMBER"}</div>
                <div style={{ fontSize: 24, fontWeight: 800, marginTop: 8 }}>{amount ? fmt(amount) : "—"}</div>
                <div style={{ fontSize: 11.5, opacity: 0.7 }}>Invoice amount</div>
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, padding: "4px 10px", borderRadius: 999, background: "rgba(255,255,255,.12)" }}>{status?.name || "No status"}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 600, padding: "4px 10px", borderRadius: 999, background: paid ? "rgba(27,156,110,.3)" : overdue ? "rgba(214,72,62,.35)" : "rgba(255,255,255,.12)" }}>{paid ? "Paid" : overdue ? "Overdue" : "Unpaid"}</span>
                </div>
              </div>

              <Stat icon={Building2} label="Client" value={client?.name || client?.clientName || "—"} />
              <Stat icon={FolderKanban} label="Project" value={project ? (project.projectCode || project.projectName) : "—"} />
              <Stat icon={CalendarClock} label="Billing Period" value={period ? (period.periodName || period.name) : "—"} />
              <Stat icon={Clock} label="Billable Hours" value={hours ? `${hours} h` : "—"} />
              <Stat icon={Gauge} label="Effective Rate" value={amount && hours ? `${fmt(amount / hours)} / h` : "—"} />
              <Stat icon={CalendarDays} label="Due" value={dueText} color={dueColor} />
              <Stat icon={paid ? BadgeCheck : Coins} label="Payment Ref" value={form.paymentReference || "—"} />

              <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: COLORS.accentSoft, fontSize: 12, color: COLORS.textSoft, lineHeight: 1.5 }}>
                <Info size={16} color={COLORS.accent} style={{ flexShrink: 0, marginTop: 1 }} />
                Fields marked * are required. Picking a client filters the project list.
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