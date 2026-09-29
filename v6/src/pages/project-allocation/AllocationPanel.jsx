import { useState } from "react";
import { ArrowLeft, Loader2, AlertCircle, Briefcase, CalendarRange, User, Clock, Percent, CalendarDays, BadgeCheck, Info } from "lucide-react";
import { COLORS, SHADOWS, inputStyle, labelStyle } from "../../constants/theme";

const card = { background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 14, boxShadow: SHADOWS.sm };
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "16px 18px" };

function Section({ icon: Icon, color, title, sub, children }) {
  return (
    <div style={{ ...card, padding: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <span style={{ width: 36, height: 36, borderRadius: 10, background: `${color}18`, color, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={18} /></span>
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
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 10 }}>
      <Icon size={16} color={COLORS.accent} />
      <div style={{ flex: 1, fontSize: 12.5, color: COLORS.textMuted }}>{label}</div>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: COLORS.text }}>{value}</div>
    </div>
  );
}

export function AllocationPanel({ data, saving, error, onCancel, onClose, onSubmit, lookups, projects, designations, departments }) {
  const [form, setForm] = useState(data);
  const set = (k, v) => setForm({ ...form, [k]: v });

  const project = projects.find((p) => String(p.id) === String(form.projectId));
  const user = lookups.users.find((u) => String(u.id) === String(form.userId));
  const role = lookups.roles.find((r) => String(r.id) === String(form.roleId));
  const pct = Math.max(0, Math.min(100, Number(form.allocationPct) || 0));
  const days = form.startDate && form.endDate ? Math.round((new Date(form.endDate) - new Date(form.startDate)) / 86400000) + 1 : null;
  const badDates = days !== null && days < 1;
  const initials = user ? `${(user.firstName || "")[0] || ""}${(user.lastName || "")[0] || ""}`.toUpperCase() : "?";

  return (
    <div className="pp-project-page" data-access-skip style={{ flex: 1, background: COLORS.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "18px 28px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", gap: 14, background: COLORS.card }}>
        <button onClick={onClose} title="Back to Resource Allocation" aria-label="Back" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: COLORS.text }}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18, color: COLORS.text, fontFamily: "Sora, sans-serif" }}>{data.guid ? "Edit Resource Allocation" : "Add Resource Allocation"}</div>
          <div style={{ fontSize: 12, color: COLORS.accent, marginTop: 2 }}>{data.guid ? "Update this assignment" : "Assign a user to a project"}</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "22px 28px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "stretch", minHeight: "100%" }}>
          <div style={{ flex: "3 1 560px", display: "flex", flexDirection: "column", gap: 20 }}>
            <Section icon={Briefcase} color={COLORS.accent} title="Assignment" sub="Who is working on which project, and in what capacity">
              <div style={grid}>
                <div>
                  <label style={labelStyle}>Project*</label>
                  <select value={form.projectId} onChange={(e) => set("projectId", e.target.value)} style={inputStyle}>
                    <option value="">Select project</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.projectName}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Resource (User)*</label>
                  <select value={form.userId} onChange={(e) => set("userId", e.target.value)} style={inputStyle}>
                    <option value="">Select user</option>
                    {lookups.users.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Role*</label>
                  <select value={form.roleId} onChange={(e) => set("roleId", e.target.value)} style={inputStyle}>
                    <option value="">Select role</option>
                    {lookups.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Designation</label>
                  <select value={form.designationId || ""} onChange={(e) => set("designationId", e.target.value)} style={inputStyle}>
                    <option value="">Select designation</option>
                    {(designations || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Department</label>
                  <select value={form.departmentId || ""} onChange={(e) => set("departmentId", e.target.value)} style={inputStyle}>
                    <option value="">Select department</option>
                    {(departments || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              </div>
            </Section>

            <Section icon={CalendarRange} color="#8B5CF6" title="Effort & Schedule" sub="Allocation, weekly hours and assignment period">
              <div style={grid}>
                <div>
                  <label style={labelStyle}>Allocation %</label>
                  <input type="number" min={0} max={100} value={form.allocationPct} onChange={(e) => set("allocationPct", e.target.value)} style={inputStyle} />
                  <input type="range" min={0} max={100} step={5} value={pct} onChange={(e) => set("allocationPct", e.target.value)} style={{ width: "100%", marginTop: 10, accentColor: COLORS.accent }} />
                </div>
                <div>
                  <label style={labelStyle}>Weekly Hours</label>
                  <input type="number" min={0} max={168} value={form.weeklyHours} onChange={(e) => set("weeklyHours", e.target.value)} style={inputStyle} />
                  <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                    {[10, 20, 30, 40].map((h) => (
                      <button key={h} type="button" onClick={() => set("weeklyHours", h)} style={{ flex: 1, padding: "5px 0", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1px solid ${Number(form.weeklyHours) === h ? COLORS.accent : COLORS.border}`, background: Number(form.weeklyHours) === h ? COLORS.accentSoft : "#fff", color: Number(form.weeklyHours) === h ? COLORS.accent : COLORS.textSoft }}>{h}h</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Start Date*</label>
                  <input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>End Date*</label>
                  <input type="date" min={form.startDate || undefined} value={form.endDate} onChange={(e) => set("endDate", e.target.value)} style={{ ...inputStyle, borderColor: badDates ? COLORS.danger : COLORS.border }} />
                  {badDates && <div style={{ fontSize: 11.5, color: COLORS.danger, marginTop: 5 }}>End date must be on or after start date</div>}
                </div>
              </div>

              <div onClick={() => set("billable", !form.billable)} style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", border: `1px solid ${form.billable ? COLORS.accent : COLORS.border}`, background: form.billable ? COLORS.accentSoft : "#fff", borderRadius: 12, cursor: "pointer" }}>
                <BadgeCheck size={20} color={form.billable ? COLORS.accent : COLORS.textMuted} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>Billable</div>
                  <div style={{ fontSize: 12, color: COLORS.textMuted }}>Hours from this assignment are billed to the client</div>
                </div>
                <div style={{ width: 40, height: 22, borderRadius: 999, background: form.billable ? COLORS.accent : "COLORS.toggleOff", position: "relative", flexShrink: 0 }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: form.billable ? 20 : 2, transition: "left 0.15s" }} />
                </div>
              </div>
            </Section>

            {error && <div style={{ display: "flex", gap: 8, alignItems: "center", color: COLORS.danger, fontSize: 13, padding: "12px 14px", background: COLORS.dangerSoft, borderRadius: 10 }}><AlertCircle size={15} /> {error}</div>}
          </div>

          <div style={{ flex: "1 1 300px", display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ ...card, padding: 22, flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: COLORS.text }}>Allocation Summary</div>

              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, background: `linear-gradient(135deg, ${COLORS.navy}, ${COLORS.navyLift})`, color: "#fff" }}>
                <span style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15 }}>{user ? initials : <User size={18} />}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user ? `${user.firstName} ${user.lastName}` : "No resource selected"}</div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>{role ? role.name : "Role not set"}</div>
                </div>
              </div>

              <Stat icon={Briefcase} label="Project" value={project ? project.projectName : "—"} />

              <div style={{ padding: "12px 14px", background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <Percent size={16} color={COLORS.accent} />
                  <div style={{ flex: 1, fontSize: 12.5, color: COLORS.textMuted }}>Allocation</div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: COLORS.text }}>{pct}%</div>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: COLORS.border, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: pct > 80 ? COLORS.warning : COLORS.accent, transition: "width .2s" }} />
                </div>
              </div>

              <Stat icon={Clock} label="Weekly Hours" value={`${Number(form.weeklyHours) || 0} h`} />
              <Stat icon={CalendarDays} label="Duration" value={days && days > 0 ? `${days} days (~${Math.ceil(days / 7)} wks)` : "—"} />
              <Stat icon={BadgeCheck} label="Billing" value={form.billable ? "Billable" : "Non-billable"} />

              <div style={{ marginTop: "auto", display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: COLORS.accentSoft, fontSize: 12, color: COLORS.textSoft, lineHeight: 1.5 }}>
                <Info size={16} color={COLORS.accent} style={{ flexShrink: 0, marginTop: 1 }} />
                Fields marked * are required. The assignment appears on the timeline once submitted.
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