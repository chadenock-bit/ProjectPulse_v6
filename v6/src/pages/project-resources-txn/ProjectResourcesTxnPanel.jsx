import { useState, useEffect } from "react";
import {
  ArrowLeft, Loader2, AlertCircle, Briefcase, CalendarRange, User, Percent, CalendarDays, Power, Info, Shield, Layers,
} from "lucide-react";
import { COLORS, SHADOWS, inputStyle, labelStyle } from "../../constants/theme";
import { activeOptions } from "../../utils/validation";

const card = { background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 14, boxShadow: SHADOWS.sm };
// NOTE: keep "auto-fill" — index.css restyles any inline "repeat(auto-fit, minmax(" grid as a stat card.
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "16px 18px" };
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

export function ProjectResourcesTxnPanel({ mode, data, projects, users, roles, rows = [], saving, error, onCancel, onClose, onSubmit }) {
  const [form, setForm] = useState(data);
  useEffect(() => setForm(data), [data]);
  const set = (k, v) => setForm({ ...form, [k]: v });

  const user = find(users, form.userId);
  const project = find(projects, form.projectId);
  const role = find(roles, form.roleId);
  const pct = Math.max(0, Math.min(100, Number(form.allocationPct) || 0));
  const days = form.startDate && form.endDate ? Math.round((new Date(form.endDate) - new Date(form.startDate)) / 86400000) + 1 : null;
  const badDates = days !== null && days < 1;
  const initials = user ? `${(user.firstName || "")[0] || ""}${(user.lastName || "")[0] || ""}`.toUpperCase() : "";

  // This user's other active assignments (excluding the row being edited).
  const others = form.userId
    ? rows.filter((r) => String(r.userId) === String(form.userId) && r.active !== false && (!form.guid || String(r.guid) !== String(form.guid)))
    : [];
  const otherPct = others.reduce((s, r) => s + Number(r.allocationPct || 0), 0);
  const total = otherPct + (form.active ? pct : 0);
  const over = total > 100;

  return (
    <div className="pp-project-page" data-access-skip style={{ flex: 1, background: COLORS.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "18px 28px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", gap: 14, background: COLORS.card }}>
        <button onClick={onClose} title="Back to Project Resources" aria-label="Back" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: COLORS.text }}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18, color: COLORS.text, fontFamily: "Sora, sans-serif" }}>{mode === "add" ? "Add Resource Assignment" : "Edit Resource Assignment"}</div>
          <div style={{ fontSize: 12, color: COLORS.accent, marginTop: 2 }}>Fill all required fields below</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "22px 28px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
          <div style={{ flex: "3 1 560px", minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>
            <Section icon={Briefcase} color={COLORS.accent} title="Assignment" sub="Resource, project and role">
              <div style={grid}>
                <div>
                  <label style={labelStyle}>Resource (User)*</label>
                  <select value={form.userId || ""} onChange={(e) => set("userId", e.target.value)} style={inputStyle}>
                    <option value="">Select resource</option>
                    {activeOptions(users, form.userId).map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Project*</label>
                  <select value={form.projectId || ""} onChange={(e) => set("projectId", e.target.value)} style={inputStyle}>
                    <option value="">Select project</option>
                    {activeOptions(projects, form.projectId).map((p) => <option key={p.id} value={p.id}>{p.projectName}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Role</label>
                  <select value={form.roleId || ""} onChange={(e) => set("roleId", e.target.value)} style={inputStyle}>
                    <option value="">Select role</option>
                    {activeOptions(roles, form.roleId).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
              </div>
            </Section>

            <Section icon={CalendarRange} color="#8B5CF6" title="Allocation & Period" sub="Share of time and assignment dates">
              <div style={grid}>
                <div>
                  <label style={labelStyle}>Allocation %</label>
                  <input type="number" min="0" max="100" value={form.allocationPct} onChange={(e) => set("allocationPct", e.target.value)} placeholder="e.g. 80" style={inputStyle} />
                  <input type="range" min={0} max={100} step={5} value={pct} onChange={(e) => set("allocationPct", e.target.value)} style={{ width: "100%", marginTop: 10, accentColor: COLORS.accent }} />
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    {[25, 50, 75, 100].map((v) => (
                      <button key={v} type="button" onClick={() => set("allocationPct", v)} style={{ flex: 1, padding: "5px 0", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1px solid ${pct === v ? COLORS.accent : COLORS.border}`, background: pct === v ? COLORS.accentSoft : "#fff", color: pct === v ? COLORS.accent : COLORS.textSoft }}>{v}%</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Start Date</label>
                  <input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>End Date</label>
                  <input type="date" min={form.startDate || undefined} value={form.endDate} onChange={(e) => set("endDate", e.target.value)} style={{ ...inputStyle, borderColor: badDates ? COLORS.danger : COLORS.border }} />
                  {badDates && <div style={{ fontSize: 11.5, color: COLORS.danger, marginTop: 5 }}>End date must be on or after start date</div>}
                </div>
                <div onClick={() => set("active", !form.active)} style={{ ...full, display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", border: `1px solid ${form.active ? COLORS.accent : COLORS.border}`, background: form.active ? COLORS.accentSoft : "#fff", borderRadius: 12, cursor: "pointer" }}>
                  <Power size={20} color={form.active ? COLORS.accent : COLORS.textMuted} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>Active</div>
                    <div style={{ fontSize: 12, color: COLORS.textMuted }}>Only active assignments count toward the resource's total allocation</div>
                  </div>
                  <div style={{ width: 40, height: 22, borderRadius: 999, background: form.active ? COLORS.accent : "COLORS.toggleOff", position: "relative", flexShrink: 0 }}>
                    <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: form.active ? 20 : 2, transition: "left 0.15s" }} />
                  </div>
                </div>
              </div>
            </Section>

            <Section icon={Layers} color="#F59E0B" title={`Other Active Assignments (${others.length})`} sub={user ? `Where ${user.firstName} is already allocated` : "Select a resource to see existing assignments"}>
              {others.length === 0 ? (
                <div style={{ fontSize: 13, color: COLORS.textMuted, textAlign: "center", padding: "20px 0", border: `1px dashed ${COLORS.borderStrong}`, borderRadius: 10 }}>{user ? "No other active assignments." : "No resource selected."}</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
                  {others.map((r) => (
                    <div key={r.guid} style={{ padding: "12px 14px", border: `1px solid ${COLORS.border}`, borderRadius: 10, background: COLORS.surface }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{find(projects, r.projectId)?.projectName || "—"}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.accent }}>{Number(r.allocationPct || 0)}%</div>
                      </div>
                      <div style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 3 }}>{find(roles, r.roleId)?.name || "No role"} · {r.startDate || "?"} → {r.endDate || "?"}</div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {error && <div style={{ display: "flex", gap: 8, alignItems: "center", color: COLORS.danger, fontSize: 13, padding: "12px 14px", background: COLORS.dangerSoft, borderRadius: 10 }}><AlertCircle size={15} /> {error}</div>}
          </div>

          <div style={{ flex: "1 1 300px", minWidth: 0, position: "sticky", top: 0 }}>
            <div style={{ ...card, padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: COLORS.text }}>Assignment Summary</div>

              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, background: `linear-gradient(135deg, ${COLORS.navy}, ${COLORS.navyLift})`, color: "#fff" }}>
                <span style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15, flexShrink: 0 }}>{user ? initials : <User size={18} />}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user ? `${user.firstName} ${user.lastName}` : "No resource selected"}</div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>{form.active ? "Active assignment" : "Inactive assignment"}</div>
                </div>
              </div>

              <Stat icon={Briefcase} label="Project" value={project ? project.projectName : "—"} />
              <Stat icon={Shield} label="Role" value={role ? role.name : "—"} />
              <Stat icon={CalendarDays} label="Duration" value={days && days > 0 ? `${days} days (~${Math.ceil(days / 7)} wks)` : "—"} />

              <div style={{ padding: "12px 14px", background: over ? COLORS.dangerSoft : COLORS.surface, border: `1px solid ${over ? COLORS.danger : COLORS.border}`, borderRadius: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <Percent size={16} color={over ? COLORS.danger : COLORS.accent} />
                  <div style={{ flex: 1, fontSize: 12.5, color: COLORS.textMuted }}>Total Allocation</div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: over ? COLORS.danger : COLORS.text }}>{total}%</div>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: COLORS.border, overflow: "hidden", display: "flex" }}>
                  <div style={{ width: `${Math.min(otherPct, 100)}%`, background: COLORS.borderStrong }} />
                  <div style={{ width: `${Math.max(0, Math.min(form.active ? pct : 0, 100 - Math.min(otherPct, 100)))}%`, background: over ? COLORS.danger : COLORS.accent, transition: "width .2s" }} />
                </div>
                <div style={{ fontSize: 11.5, color: over ? COLORS.danger : COLORS.textMuted, marginTop: 6 }}>
                  {over ? "Over-allocated — exceeds 100%" : `Other projects ${otherPct}% + this ${form.active ? pct : 0}%`}
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: COLORS.accentSoft, fontSize: 12, color: COLORS.textSoft, lineHeight: 1.5 }}>
                <Info size={16} color={COLORS.accent} style={{ flexShrink: 0, marginTop: 1 }} />
                Fields marked * are required. Total allocation is a live guide only.
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