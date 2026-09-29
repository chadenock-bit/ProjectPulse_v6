// ProjectPanel.jsx (full file)
import { useState } from "react";
import {
  Plus,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Users2,
  FolderKanban,
  Landmark,
  CalendarRange,
  FileText,
  Power,
  Info,
  Building2,
  Layers,
  Receipt,
  CalendarDays,
  Percent,
} from "lucide-react";
import { COLORS, SHADOWS, inputStyle, labelStyle } from "../../constants/theme";
import { ResourceRow } from "./ResourceRow";
import { DocumentRow } from "./DocumentRow";
import { getCurrentUserId } from "../../utils/session";

let nextTempResourceId = -1;
let nextTempDocId = -1;

const card = { background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 14, boxShadow: SHADOWS.sm };
// NOTE: keep "auto-fill" — index.css restyles any inline "repeat(auto-fit, minmax(" grid as a stat card.
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: "16px 18px" };
const rowGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 12 };
const full = { gridColumn: "1 / -1" };
const addBtn = { display: "flex", alignItems: "center", gap: 5, background: COLORS.accentSoft, color: COLORS.accent, border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" };

function Section({ icon: Icon, color, title, sub, action, children }) {
  return (
    <div style={{ ...card, padding: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <span style={{ width: 36, height: 36, borderRadius: 10, background: `${color}18`, color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={18} /></span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: COLORS.text }}>{title}</div>
          <div style={{ fontSize: 12, color: COLORS.textMuted }}>{sub}</div>
        </div>
        {action}
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

const nameOf = (list, id) => (list || []).find((x) => String(x.id) === String(id))?.name || "—";

// Full-screen Add / Edit Project page (used by ProjectDashboardPage).
export function ProjectPanel({ mode, data, saving, error, onCancel, onClose, onSubmit, lookups, onDocumentToast, allResources = [] }) {
  const [form, setForm] = useState(data);

  const addResource = () => {
    setForm({
      ...form,
      resources: [...form.resources, {
        id: nextTempResourceId--, guid: "", userId: "", roleId: "", allocationPct: 100, weeklyHours: 40,
        billable: true, startDate: form.startDate, endDate: form.endDate,
      }],
    });
  };
  const updateResource = (idx, next) => {
    const list = [...form.resources];
    list[idx] = next;
    setForm({ ...form, resources: list });
  };
  const removeResource = (idx) => setForm({ ...form, resources: form.resources.filter((_, i) => i !== idx) });

  const addDocument = () => {
    // Defaults to the real signed-in user (session.js) now that auth is
    // wired up; falls back to empId "E001" only if, for some reason, the
    // session doesn't resolve to a known user.
    const currentUserId = getCurrentUserId();
    const currentUser = (lookups.users || []).find((u) => String(u.id) === String(currentUserId));
    const fallbackUser = (lookups.users || []).find((u) => u.empId === "E001");
    const defaultUser = currentUser || fallbackUser;
    setForm({
      ...form,
      documents: [...(form.documents || []), {
        id: nextTempDocId--, guid: "", docName: "", docType: "Contract",
        uploadedByUserId: defaultUser ? defaultUser.id : "",
        uploadDate: new Date().toISOString().slice(0, 10),
        fileName: "", fileData: "", active: true,
      }],
    });
  };
  const updateDocument = (idx, next) => {
    const list = [...form.documents];
    list[idx] = next;
    setForm({ ...form, documents: list });
  };
  const handleDocumentSaved = (idx, savedDoc) => {
    const list = [...(form.documents || [])];
    list[idx] = savedDoc;
    setForm({ ...form, documents: list });
  };
  const removeDocument = (idx) => setForm({ ...form, documents: (form.documents || []).filter((_, i) => i !== idx) });

  const set = (k, v) => setForm({ ...form, [k]: v });
  const docs = form.documents || [];
  const days = form.startDate && form.endDate ? Math.round((new Date(form.endDate) - new Date(form.startDate)) / 86400000) + 1 : null;
  const badDates = days !== null && days < 1;
  const totalPct = form.resources.reduce((s, r) => s + Number(r.allocationPct || 0), 0);
  const billableCount = form.resources.filter((r) => r.billable).length;
  const valueText = form.projectValue ? `${form.currencyCode && form.currencyCode !== "-" ? form.currencyCode : ""} ${Number(form.projectValue).toLocaleString("en-IN")}`.trim() : "—";

  return (
    <div className="pp-project-page" data-access-skip style={{ flex: 1, background: COLORS.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "18px 28px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", gap: 14, background: COLORS.card }}>
        <button onClick={onClose} title="Back to Projects" aria-label="Back to Projects" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: COLORS.text }}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18, color: COLORS.text, fontFamily: "Sora, sans-serif" }}>{mode === "add" ? "Add New Project" : "Edit Project"}</div>
          <div style={{ fontSize: 12, color: COLORS.accent, marginTop: 2 }}>Fill project details and assign resources</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "22px 28px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
          <div style={{ flex: "3 1 640px", minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>
            <Section icon={FolderKanban} color={COLORS.accent} title="Project Details" sub="Identity, client and classification">
              <div style={grid}>
                <div>
                  <label style={labelStyle}>Project Code <span style={{ fontWeight: 500, color: COLORS.textMuted }}>(auto)</span></label>
                  <input value={form.projectCode} readOnly title="Generated automatically" style={{ ...inputStyle, background: COLORS.surface, color: COLORS.textSoft, fontWeight: 600, cursor: "not-allowed" }} />
                </div>
                <div>
                  <label style={labelStyle}>Project Name*</label>
                  <input value={form.projectName} onChange={(e) => set("projectName", e.target.value)} placeholder="e.g. Mobile App Revamp" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Project Category*</label>
                  <select value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)} style={inputStyle}>
                    <option value="">Select category</option>
                    {lookups.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Client*</label>
                  <select value={form.clientId} onChange={(e) => set("clientId", e.target.value)} style={inputStyle}>
                    <option value="">Select client</option>
                    {lookups.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Billing Type*</label>
                  <select value={form.billingTypeId} onChange={(e) => set("billingTypeId", e.target.value)} style={inputStyle}>
                    <option value="">Select billing type</option>
                    {lookups.billingTypes.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Zoho Project ID</label>
                  <input value={form.zohoProjectId || ""} onChange={(e) => set("zohoProjectId", e.target.value)} placeholder="Required before Finance approval" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Project Status</label>
                  <select value={form.projectStatusId || ""} onChange={(e) => set("projectStatusId", e.target.value)} style={inputStyle}>
                    <option value="">Select status</option>
                    {(lookups.projectStatuses || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
            </Section>

            <Section icon={Landmark} color="#8B5CF6" title="Ownership & Commercials" sub="Owners, value and contract references">
              <div style={grid}>
                <div>
                  <label style={labelStyle}>Project Manager</label>
                  <select value={form.projectManagerUserId || ""} onChange={(e) => set("projectManagerUserId", e.target.value)} style={inputStyle}>
                    <option value="">Select PM</option>
                    {(lookups.users || []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Delivery Head</label>
                  <select value={form.deliveryHeadUserId || ""} onChange={(e) => set("deliveryHeadUserId", e.target.value)} style={inputStyle}>
                    <option value="">Select Delivery Head</option>
                    {(lookups.users || []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Department</label>
                  <select value={form.departmentId || ""} onChange={(e) => set("departmentId", e.target.value)} style={inputStyle}>
                    <option value="">Select department</option>
                    {(lookups.departments || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Currency*</label>
                  {/* Temporary fixed list until the Currency master has its own flow/screen — swap for lookups.currencies once that exists.
                      "-" is a placeholder only — no hidden default currency is applied; the user must explicitly pick one. */}
                  <select value={form.currencyCode || "-"} onChange={(e) => set("currencyCode", e.target.value)} style={inputStyle}>
                    <option value="-">Select currency</option>
                    <option value="INR">INR</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Project Value</label>
                  <input type="number" min="0" step="0.01" value={form.projectValue || ""} onChange={(e) => set("projectValue", e.target.value)} placeholder="e.g. 50000" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Geography</label>
                  <input value={form.geography || ""} onChange={(e) => set("geography", e.target.value)} placeholder="e.g. APAC, EMEA" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>PO Number</label>
                  <input value={form.poNumber || ""} onChange={(e) => set("poNumber", e.target.value)} placeholder="e.g. PO-4021" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>SOW Reference</label>
                  <input value={form.sowReference || ""} onChange={(e) => set("sowReference", e.target.value)} placeholder="e.g. SOW-2026-014" style={inputStyle} />
                </div>
              </div>
            </Section>

            <Section icon={CalendarRange} color="#0EA5A4" title="Timeline & Notes" sub="Project period, remarks and status">
              <div style={grid}>
                <div>
                  <label style={labelStyle}>Start Date*</label>
                  <input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Est. End Date*</label>
                  <input type="date" min={form.startDate || undefined} value={form.endDate} onChange={(e) => set("endDate", e.target.value)} style={{ ...inputStyle, borderColor: badDates ? COLORS.danger : COLORS.border }} />
                  {badDates && <div style={{ fontSize: 11.5, color: COLORS.danger, marginTop: 5 }}>End date must be on or after start date</div>}
                </div>
                <div style={full}>
                  <label style={labelStyle}>Remarks</label>
                  <textarea value={form.remarks || ""} onChange={(e) => set("remarks", e.target.value)} placeholder="Optional notes" rows={3} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
                </div>
                <div onClick={() => set("active", !form.active)} style={{ ...full, display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", border: `1px solid ${form.active ? COLORS.accent : COLORS.border}`, background: form.active ? COLORS.accentSoft : "#fff", borderRadius: 12, cursor: "pointer" }}>
                  <Power size={20} color={form.active ? COLORS.accent : COLORS.textMuted} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>Active</div>
                    <div style={{ fontSize: 12, color: COLORS.textMuted }}>Inactive projects are hidden from allocation lists</div>
                  </div>
                  <div style={{ width: 40, height: 22, borderRadius: 999, background: form.active ? COLORS.accent : "COLORS.toggleOff", position: "relative", flexShrink: 0 }}>
                    <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: form.active ? 20 : 2, transition: "left 0.15s" }} />
                  </div>
                </div>
              </div>
            </Section>

            <Section icon={Users2} color="#F59E0B" title={`Resources (${form.resources.length})`} sub="Team members assigned to this project"
              action={<button type="button" onClick={addResource} style={addBtn}><Plus size={13} /> Add Resource</button>}>
              {form.resources.length === 0 ? (
                <div style={{ fontSize: 13, color: COLORS.textMuted, textAlign: "center", padding: "22px 0", border: `1px dashed ${COLORS.borderStrong}`, borderRadius: 10 }}>No resources assigned yet.</div>
              ) : (
                <div style={rowGrid}>
                  {form.resources.map((res, idx) => (
                    <ResourceRow
                      key={res.id} res={res}
                      onChange={(next) => updateResource(idx, next)}
                      onRemove={() => removeResource(idx)}
                      lookups={lookups}
                      allResources={allResources}
                      currentProjectGuid={form.guid}
                      formResources={form.resources}
                    />
                  ))}
                </div>
              )}
            </Section>

            <Section icon={FileText} color="#22A06B" title={`Documents (${docs.length})`} sub="Contracts, SOWs and supporting files"
              action={<button type="button" onClick={addDocument} style={addBtn}><Plus size={13} /> Add Document</button>}>
              {!form.guid && docs.length > 0 && (
                <div style={{ fontSize: 12, color: COLORS.accent, padding: "8px 12px", marginBottom: 12, background: COLORS.accentSoft, borderRadius: 8 }}>
                  Files chosen here are staged and will upload automatically once you Submit.
                </div>
              )}
              {docs.length === 0 ? (
                <div style={{ fontSize: 13, color: COLORS.textMuted, textAlign: "center", padding: "22px 0", border: `1px dashed ${COLORS.borderStrong}`, borderRadius: 10 }}>No documents added yet.</div>
              ) : (
                <div style={rowGrid}>
                  {docs.map((doc, idx) => (
                    <DocumentRow
                      key={doc.id}
                      doc={doc}
                      projectGuid={form.guid}
                      onChange={(next) => updateDocument(idx, next)}
                      onSaved={(saved) => handleDocumentSaved(idx, saved)}
                      onDeleted={() => removeDocument(idx)}
                      onToast={onDocumentToast}
                    />
                  ))}
                </div>
              )}
            </Section>

            {error && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", color: COLORS.danger, fontSize: 13, padding: "12px 14px", background: COLORS.dangerSoft, borderRadius: 10 }}>
                <AlertCircle size={15} /> {error}
              </div>
            )}
          </div>

          <div style={{ flex: "1 1 300px", minWidth: 0, position: "sticky", top: 0 }}>
            <div style={{ ...card, padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: COLORS.text }}>Project Summary</div>

              <div style={{ padding: 16, borderRadius: 12, background: `linear-gradient(135deg, ${COLORS.navy}, ${COLORS.navyLift})`, color: "#fff" }}>
                <div style={{ fontSize: 11.5, opacity: 0.7, letterSpacing: "0.04em" }}>{form.projectCode || "PROJECT CODE"}</div>
                <div style={{ fontWeight: 700, fontSize: 16, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{form.projectName || "Untitled project"}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, padding: "4px 10px", borderRadius: 999, background: form.active ? "rgba(27,156,110,.25)" : "rgba(255,255,255,.12)" }}>{form.active ? "Active" : "Inactive"}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 600, padding: "4px 10px", borderRadius: 999, background: "rgba(255,255,255,.12)" }}>{nameOf(lookups.projectStatuses, form.projectStatusId)}</span>
                </div>
              </div>

              <Stat icon={Building2} label="Client" value={nameOf(lookups.clients, form.clientId)} />
              <Stat icon={Layers} label="Category" value={nameOf(lookups.categories, form.categoryId)} />
              <Stat icon={Receipt} label="Billing Type" value={nameOf(lookups.billingTypes, form.billingTypeId)} />
              <Stat icon={Landmark} label="Project Value" value={valueText} />
              <Stat icon={CalendarDays} label="Duration" value={days && days > 0 ? `${days} days (~${Math.ceil(days / 7)} wks)` : "—"} />
              <Stat icon={Users2} label="Resources" value={`${form.resources.length} (${billableCount} billable)`} />
              <Stat icon={Percent} label="Total Allocation" value={`${totalPct}%`} />
              <Stat icon={FileText} label="Documents" value={docs.length} />

              <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: COLORS.accentSoft, fontSize: 12, color: COLORS.textSoft, lineHeight: 1.5 }}>
                <Info size={16} color={COLORS.accent} style={{ flexShrink: 0, marginTop: 1 }} />
                Fields marked * are required. Zoho Project ID is needed before Finance approval.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "14px 28px", borderTop: `1px solid ${COLORS.border}`, background: COLORS.card, display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center" }}>
        {error && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, color: COLORS.danger, fontSize: 13, fontWeight: 600, minWidth: 0 }}>
            <AlertCircle size={15} style={{ flexShrink: 0 }} /> <span>{error}</span>
          </div>
        )}
        <button onClick={onCancel} style={{ padding: "9px 16px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", color: COLORS.text }}>Cancel</button>
        <button onClick={() => onSubmit(form)} disabled={saving} style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: COLORS.accent, color: "#fff", fontSize: 13, fontWeight: 700, cursor: saving ? "default" : "pointer", opacity: saving ? 0.75 : 1, display: "flex", alignItems: "center", gap: 7 }}>
          {saving && <Loader2 size={13} className="spin" />}
          {saving ? "Saving…" : "Submit"}
        </button>
      </div>
    </div>
  );
}