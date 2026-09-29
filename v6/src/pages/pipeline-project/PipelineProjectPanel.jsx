import { useState, useEffect } from "react";
import {
  ArrowLeft, Loader2, AlertCircle, Handshake, Users2, TrendingUp, CalendarRange, Power, Info,
  Building2, Flag, Coins, Percent, CalendarDays, UserCircle2, FileText,
} from "lucide-react";
import { COLORS, SHADOWS, inputStyle, labelStyle } from "../../constants/theme";
import { activeOptions } from "../../utils/validation";

const card = { background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 14, boxShadow: SHADOWS.sm };
// NOTE: keep "auto-fill" — index.css restyles any inline "repeat(auto-fit, minmax(" grid as a stat card.
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: "16px 18px" };
const full = { gridColumn: "1 / -1" };
const PRIORITY_COLOR = { High: COLORS.danger, Medium: COLORS.warning, Low: COLORS.success };

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

function Stat({ icon: Icon, label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 10 }}>
      <Icon size={16} color={COLORS.accent} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, fontSize: 12.5, color: COLORS.textMuted }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, textAlign: "right", maxWidth: "60%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}

const find = (list, id) => (list || []).find((x) => String(x.id) === String(id));
const userName = (users, id) => { const u = find(users, id); return u ? `${u.firstName} ${u.lastName}` : "—"; };

export function PipelineProjectPanel({ mode, data, clients, dealStatuses, users, departments, billingTypes, currencies, saving, error, onCancel, onClose, onSubmit }) {
  const [form, setForm] = useState(data);
  useEffect(() => setForm(data), [data]);
  const set = (k, v) => setForm({ ...form, [k]: v });

  const prob = Math.max(0, Math.min(100, Number(form.probabilityPct) || 0));
  const currencyCode = find(currencies, form.currencyId)?.code || "";
  const value = Number(form.dealValue) || 0;
  const fmt = (n) => (n ? `${currencyCode} ${Math.round(n).toLocaleString("en-IN")}`.trim() : "—");
  const badDates = form.expectedStartDate && form.expectedCloseDate && form.expectedCloseDate < form.expectedStartDate;
  const probColor = prob >= 70 ? COLORS.success : prob >= 40 ? COLORS.warning : COLORS.danger;

  return (
    <div className="pp-project-page" data-access-skip style={{ flex: 1, background: COLORS.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "18px 28px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", gap: 14, background: COLORS.card }}>
        <button onClick={onClose} title="Back to Pipeline" aria-label="Back to Pipeline" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: COLORS.text }}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18, color: COLORS.text, fontFamily: "Sora, sans-serif" }}>{mode === "add" ? "Add Pipeline Project" : "Edit Pipeline Project"}</div>
          <div style={{ fontSize: 12, color: COLORS.accent, marginTop: 2 }}>Fill all required fields below</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "22px 28px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
          <div style={{ flex: "3 1 640px", minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>
            <Section icon={Handshake} color={COLORS.accent} title="Opportunity" sub="Identity, client and type">
              <div style={grid}>
                <div>
                  <label style={labelStyle}>Pipeline Code</label>
                  <input value={form.pipelineCode || ""} onChange={(e) => set("pipelineCode", e.target.value)} placeholder="e.g. PIPE-1001" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Project / Opportunity Name*</label>
                  <input value={form.projectName} onChange={(e) => set("projectName", e.target.value)} placeholder="e.g. Retail Analytics Suite" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Opportunity Name</label>
                  <input value={form.opportunityName || ""} onChange={(e) => set("opportunityName", e.target.value)} placeholder="Optional — if different from project name" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Client*</label>
                  <select value={form.clientId || ""} onChange={(e) => set("clientId", e.target.value)} style={inputStyle}>
                    <option value="">Select client</option>
                    {activeOptions(clients, form.clientId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Project Type</label>
                  <input value={form.projectType || ""} onChange={(e) => set("projectType", e.target.value)} placeholder="e.g. T&M, Fixed Bid" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Geography</label>
                  <input value={form.geography || ""} onChange={(e) => set("geography", e.target.value)} placeholder="e.g. APAC" style={inputStyle} />
                </div>
              </div>
            </Section>

            <Section icon={Users2} color="#8B5CF6" title="Ownership" sub="People and department responsible">
              <div style={grid}>
                <div>
                  <label style={labelStyle}>Project Manager</label>
                  <select value={form.projectManagerUserId || ""} onChange={(e) => set("projectManagerUserId", e.target.value)} style={inputStyle}>
                    <option value="">Select PM</option>
                    {activeOptions(users, form.projectManagerUserId).map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Delivery Head</label>
                  <select value={form.deliveryHeadUserId || ""} onChange={(e) => set("deliveryHeadUserId", e.target.value)} style={inputStyle}>
                    <option value="">Select Delivery Head</option>
                    {activeOptions(users, form.deliveryHeadUserId).map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Sales Owner</label>
                  <select value={form.ownerUserId || ""} onChange={(e) => set("ownerUserId", e.target.value)} style={inputStyle}>
                    <option value="">Select owner</option>
                    {activeOptions(users, form.ownerUserId).map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Department</label>
                  <select value={form.departmentId || ""} onChange={(e) => set("departmentId", e.target.value)} style={inputStyle}>
                    <option value="">Select department</option>
                    {activeOptions(departments, form.departmentId).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              </div>
            </Section>

            <Section icon={TrendingUp} color="#22A06B" title="Deal & Commercials" sub="Value, stage, probability and priority">
              <div style={grid}>
                <div>
                  <label style={labelStyle}>Billing Type</label>
                  <select value={form.billingTypeId || ""} onChange={(e) => set("billingTypeId", e.target.value)} style={inputStyle}>
                    <option value="">Select</option>
                    {activeOptions(billingTypes, form.billingTypeId).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Currency</label>
                  <select value={form.currencyId || ""} onChange={(e) => set("currencyId", e.target.value)} style={inputStyle}>
                    <option value="">Select</option>
                    {activeOptions(currencies, form.currencyId).map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Deal Value</label>
                  <input type="number" value={form.dealValue} onChange={(e) => set("dealValue", e.target.value)} placeholder="e.g. 3200000" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Stage</label>
                  <select value={form.dealStatusId || ""} onChange={(e) => set("dealStatusId", e.target.value)} style={inputStyle}>
                    <option value="">Select stage</option>
                    {activeOptions(dealStatuses, form.dealStatusId).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Probability %</label>
                  <input type="number" min="0" max="100" value={form.probabilityPct || ""} onChange={(e) => set("probabilityPct", e.target.value)} style={inputStyle} />
                  <input type="range" min={0} max={100} step={5} value={prob} onChange={(e) => set("probabilityPct", e.target.value)} style={{ width: "100%", marginTop: 10, accentColor: probColor }} />
                </div>
                <div>
                  <label style={labelStyle}>Priority</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {["High", "Medium", "Low"].map((p) => {
                      const on = form.priority === p;
                      return (
                        <button key={p} type="button" onClick={() => set("priority", on ? "" : p)} style={{ flex: 1, padding: "11px 0", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", border: `1px solid ${on ? PRIORITY_COLOR[p] : COLORS.border}`, background: on ? `${PRIORITY_COLOR[p]}18` : "#fff", color: on ? PRIORITY_COLOR[p] : COLORS.textSoft }}>{p}</button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Section>

            <Section icon={CalendarRange} color="#0EA5A4" title="Timeline & Notes" sub="Expected dates, duration and remarks">
              <div style={grid}>
                <div>
                  <label style={labelStyle}>Expected Start Date</label>
                  <input type="date" value={form.expectedStartDate || ""} onChange={(e) => set("expectedStartDate", e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Expected Close Date</label>
                  <input type="date" value={form.expectedCloseDate} onChange={(e) => set("expectedCloseDate", e.target.value)} style={{ ...inputStyle, borderColor: badDates ? COLORS.warning : COLORS.border }} />
                  {badDates && <div style={{ fontSize: 11.5, color: COLORS.warning, marginTop: 5 }}>Close date is before the expected start date</div>}
                </div>
                <div>
                  <label style={labelStyle}>Duration (months)</label>
                  <input type="number" min="0" value={form.durationMonths || ""} onChange={(e) => set("durationMonths", e.target.value)} style={inputStyle} />
                </div>
                <div style={full}>
                  <label style={labelStyle}>Remarks</label>
                  <textarea value={form.remarks || ""} onChange={(e) => set("remarks", e.target.value)} rows={3} placeholder="Optional notes" style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
                </div>
                <div style={{ ...full, display: "flex", gap: 10, padding: "12px 14px", background: COLORS.surface, border: `1px dashed ${COLORS.borderStrong}`, borderRadius: 10, fontSize: 12, color: COLORS.textMuted, lineHeight: 1.5 }}>
                  <FileText size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                  Document upload (Proposal, Customer Requirements, Estimation Sheet, Draft SOW) isn't wired up yet — it needs a small backend addition. Flagged separately.
                </div>
                <div onClick={() => set("active", !form.active)} style={{ ...full, display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", border: `1px solid ${form.active ? COLORS.accent : COLORS.border}`, background: form.active ? COLORS.accentSoft : "#fff", borderRadius: 12, cursor: "pointer" }}>
                  <Power size={20} color={form.active ? COLORS.accent : COLORS.textMuted} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>Active</div>
                    <div style={{ fontSize: 12, color: COLORS.textMuted }}>Inactive opportunities are excluded from the pipeline view</div>
                  </div>
                  <div style={{ width: 40, height: 22, borderRadius: 999, background: form.active ? COLORS.accent : "COLORS.toggleOff", position: "relative", flexShrink: 0 }}>
                    <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: form.active ? 20 : 2, transition: "left 0.15s" }} />
                  </div>
                </div>
              </div>
            </Section>

            {error && <div style={{ display: "flex", gap: 8, alignItems: "center", color: COLORS.danger, fontSize: 13, padding: "12px 14px", background: COLORS.dangerSoft, borderRadius: 10 }}><AlertCircle size={15} /> {error}</div>}
          </div>

          <div style={{ flex: "1 1 300px", minWidth: 0, position: "sticky", top: 0 }}>
            <div style={{ ...card, padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: COLORS.text }}>Deal Summary</div>

              <div style={{ padding: 16, borderRadius: 12, background: `linear-gradient(135deg, ${COLORS.navy}, ${COLORS.navyLift})`, color: "#fff" }}>
                <div style={{ fontSize: 11.5, opacity: 0.7, letterSpacing: "0.04em" }}>{form.pipelineCode || "PIPELINE CODE"}</div>
                <div style={{ fontWeight: 700, fontSize: 16, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{form.projectName || "Untitled opportunity"}</div>
                <div style={{ fontSize: 22, fontWeight: 800, marginTop: 10 }}>{fmt(value)}</div>
                <div style={{ fontSize: 11.5, opacity: 0.7 }}>Deal value</div>
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, padding: "4px 10px", borderRadius: 999, background: "rgba(255,255,255,.12)" }}>{find(dealStatuses, form.dealStatusId)?.name || "No stage"}</span>
                  {form.priority && <span style={{ fontSize: 11.5, fontWeight: 600, padding: "4px 10px", borderRadius: 999, background: `${PRIORITY_COLOR[form.priority]}55` }}>{form.priority} priority</span>}
                  <span style={{ fontSize: 11.5, fontWeight: 600, padding: "4px 10px", borderRadius: 999, background: form.active ? "rgba(27,156,110,.25)" : "rgba(255,255,255,.12)" }}>{form.active ? "Active" : "Inactive"}</span>
                </div>
              </div>

              <div style={{ padding: "12px 14px", background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <Percent size={16} color={COLORS.accent} />
                  <div style={{ flex: 1, fontSize: 12.5, color: COLORS.textMuted }}>Win Probability</div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: probColor }}>{prob}%</div>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: COLORS.border, overflow: "hidden" }}>
                  <div style={{ width: `${prob}%`, height: "100%", background: probColor, transition: "width .2s" }} />
                </div>
              </div>

              <Stat icon={Coins} label="Weighted Value" value={fmt((value * prob) / 100)} />
              <Stat icon={Building2} label="Client" value={find(clients, form.clientId)?.name || "—"} />
              <Stat icon={UserCircle2} label="Sales Owner" value={userName(users, form.ownerUserId)} />
              <Stat icon={Flag} label="Billing Type" value={find(billingTypes, form.billingTypeId)?.name || "—"} />
              <Stat icon={CalendarDays} label="Duration" value={form.durationMonths ? `${form.durationMonths} months` : "—"} />

              <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: COLORS.accentSoft, fontSize: 12, color: COLORS.textSoft, lineHeight: 1.5 }}>
                <Info size={16} color={COLORS.accent} style={{ flexShrink: 0, marginTop: 1 }} />
                Weighted value = Deal value × Probability. Fields marked * are required.
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