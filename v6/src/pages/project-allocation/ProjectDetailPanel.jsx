import { useState } from "react";
import {
  Pencil,
  ArrowLeft,
  Users2,
  Clock,
  BadgeCheck,
  FileText,
  Download,
  Loader2,
  CalendarDays,
  Gauge,
  Crown,
  Star,
  Info,
} from "lucide-react";
import { StatusBadge } from "../../components/common/StatusBadge";
import { COLORS, SHADOWS } from "../../constants/theme";
import { findName, fmtDate, userLabel } from "./hooks";
import { callProjectDocumentFileFlow } from "../../api/flows";

function guessMime(fileName) {
  const ext = (fileName || "").split(".").pop()?.toLowerCase();
  const map = {
    pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    gif: "image/gif", webp: "image/webp", txt: "text/plain",
    doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return map[ext] || "application/octet-stream";
}

function downloadBase64File(fileName, base64) {
  const mime = guessMime(fileName);
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  const blob = new Blob([new Uint8Array(byteNumbers)], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName || "document";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function DocumentDownloadRow({ doc }) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = () => {
    setDownloading(true);
    callProjectDocumentFileFlow(doc.guid)
      .then((file) => {
        if (!file || !file.fileData) throw new Error("No file content stored for this document.");
        downloadBase64File(file.fileName || doc.docName, file.fileData);
      })
      .catch((e) => alert(e.message))
      .finally(() => setDownloading(false));
  };

  return (
    <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 14, display: "flex", gap: 12, alignItems: "center", background: "#fff" }}>
      <span style={{ width: 40, height: 40, borderRadius: 10, background: "#22A06B18", color: "#22A06B", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><FileText size={18} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div title={doc.docName} style={{ fontWeight: 700, fontSize: 13, color: COLORS.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.docName}</div>
        <div style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 2 }}>{doc.docType}{doc.uploadDate ? ` · ${fmtDate(doc.uploadDate)}` : ""}</div>
      </div>
      <button
        onClick={handleDownload}
        disabled={downloading}
        style={{ display: "flex", alignItems: "center", gap: 6, background: COLORS.accentSoft, color: COLORS.accent, border: "none", borderRadius: 7, padding: "7px 11px", fontSize: 12.5, fontWeight: 600, cursor: downloading ? "default" : "pointer", flexShrink: 0 }}
      >
        {downloading ? <Loader2 size={13} className="spin" /> : <Download size={13} />} {downloading ? "…" : "Download"}
      </button>
    </div>
  );
}

const card = { background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 14, boxShadow: SHADOWS.sm };
const DAY = 86400000;
const initials = (n) => String(n || "?").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase();

function Section({ icon: Icon, color, title, action, children }) {
  return (
    <div style={{ ...card, padding: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <span style={{ width: 36, height: 36, borderRadius: 10, background: `${color}18`, color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={18} /></span>
        <div style={{ flex: 1, fontWeight: 700, fontSize: 15, color: COLORS.text }}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, marginTop: 4, wordBreak: "break-word" }}>{value || "—"}</div>
    </div>
  );
}

function Stat({ icon: Icon, color, label, value }) {
  return (
    <div style={{ ...card, padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ width: 42, height: 42, borderRadius: 12, background: `${color}18`, color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={19} /></span>
      <div>
        <div style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.text, lineHeight: 1.2 }}>{value}</div>
      </div>
    </div>
  );
}

function RoleTag({ t }) {
  const pm = t === "PM";
  const Icon = pm ? Crown : Star;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 7px", borderRadius: 6, fontSize: 10.5, fontWeight: 800, color: "#fff", background: pm ? "linear-gradient(135deg, #7C3AED, #C026D3)" : "linear-gradient(135deg, #D97706, #F59E0B)", boxShadow: pm ? "0 2px 6px rgba(124,58,237,.4)" : "0 2px 6px rgba(217,119,6,.4)" }}>
      <Icon size={10} fill="#fff" /> {t}
    </span>
  );
}

// Full-screen project view (opened from the Project Dashboard row click).
export function ProjectDetailPanel({ project, onClose, onEdit, lookups }) {
  const res = project.resources || [];
  const docs = project.documents || [];
  const fte = res.reduce((a, r) => a + (Number(r.allocationPct) || 0) / 100, 0);
  const hrs = res.reduce((a, r) => a + (Number(r.weeklyHours) || 0), 0);
  const billable = res.filter((r) => r.billable).length;
  const pmName = project.projectManagerUserId ? userLabel(lookups.users, project.projectManagerUserId) : "—";
  const dhName = project.deliveryHeadUserId ? userLabel(lookups.users, project.deliveryHeadUserId) : "—";

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const s = project.startDate ? new Date(`${String(project.startDate).slice(0, 10)}T00:00:00`).getTime() : null;
  const e = project.endDate ? new Date(`${String(project.endDate).slice(0, 10)}T00:00:00`).getTime() : null;
  const now = today.getTime();
  const totalDays = s != null && e != null ? Math.round((e - s) / DAY) + 1 : null;
  const pct = s != null && e != null ? Math.max(0, Math.min(100, ((now - s) / Math.max(e - s, DAY)) * 100)) : 0;
  const daysLeft = e != null ? Math.round((e - now) / DAY) : null;
  const phase = s == null ? "No dates" : now < s ? "Upcoming" : e != null && now > e ? "Ended" : "In progress";
  const phaseColor = phase === "Upcoming" ? "#8B5CF6" : phase === "Ended" ? COLORS.success : phase === "In progress" ? COLORS.accent : COLORS.textMuted;

  return (
    <div className="pp-project-page" style={{ flex: 1, background: COLORS.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "18px 28px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", gap: 14, background: COLORS.card }}>
        <button onClick={onClose} title="Back to Projects" aria-label="Back to Projects" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: COLORS.text }}>
          <ArrowLeft size={16} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 18, color: COLORS.text, fontFamily: "Sora, sans-serif" }}>Project Details</div>
          <div style={{ fontSize: 12, color: COLORS.accent, marginTop: 2 }}>Complete view of the project, its resources and documents</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "22px 28px", display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Hero */}
        <div style={{ borderRadius: 16, padding: "22px 24px", background: `linear-gradient(120deg, ${COLORS.navy}, ${COLORS.navyLift})`, color: "#fff", display: "flex", flexWrap: "wrap", gap: 20, alignItems: "center", boxShadow: SHADOWS.md }}>
          <div style={{ flex: "1 1 320px", minWidth: 0 }}>
            <div style={{ fontSize: 12, opacity: 0.7, letterSpacing: ".05em" }}>{project.projectCode || "—"}</div>
            <div style={{ fontSize: 24, fontWeight: 800, marginTop: 2, fontFamily: "Sora, sans-serif" }}>{project.projectName}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
              <StatusBadge active={project.active} />
              <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 11px", borderRadius: 999, background: "rgba(255,255,255,.12)" }}>{findName(lookups.categories, project.categoryId)}</span>
              {project.projectStatusId ? <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 11px", borderRadius: 999, background: "rgba(255,255,255,.12)" }}>{findName(lookups.projectStatuses || [], project.projectStatusId)}</span> : null}
              <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 11px", borderRadius: 999, background: `${phaseColor}55` }}>{phase}</span>
            </div>
          </div>
          <div style={{ flex: "1 1 320px", minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, opacity: 0.85, marginBottom: 8 }}>
              <span>{fmtDate(project.startDate)} → {fmtDate(project.endDate)}</span>
              <span style={{ fontWeight: 700 }}>
                {phase === "In progress" && daysLeft != null ? `${daysLeft} days left` : phase === "Upcoming" && s != null ? `Starts in ${Math.round((s - now) / DAY)} days` : phase === "Ended" ? "Completed period" : ""}
              </span>
            </div>
            <div style={{ height: 10, borderRadius: 999, background: "rgba(255,255,255,.15)", overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg, #6F94EE, #22A06B)" }} />
            </div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>{Math.round(pct)}% of timeline elapsed{totalDays ? ` · ${totalDays} days total` : ""}</div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
          <Stat icon={Users2} color={COLORS.accent} label="Resources" value={res.length} />
          <Stat icon={Gauge} color="#8B5CF6" label="Total FTE" value={fte.toFixed(2)} />
          <Stat icon={Clock} color="#0EA5A4" label="Weekly Hours" value={hrs} />
          <Stat icon={BadgeCheck} color={COLORS.success} label="Billable Resources" value={`${billable} / ${res.length}`} />
          <Stat icon={FileText} color="#F59E0B" label="Documents" value={docs.length} />
        </div>

        {/* Info */}
        <Section icon={Info} color={COLORS.accent} title="Project Information">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "18px 22px" }}>
            <Field label="Client" value={findName(lookups.clients, project.clientId)} />
            <Field label="Billing Type" value={findName(lookups.billingTypes, project.billingTypeId)} />
            <Field label="Start Date" value={fmtDate(project.startDate)} />
            <Field label="Est. End Date" value={fmtDate(project.endDate)} />
            <Field label="Project Manager" value={pmName} />
            <Field label="Delivery Head" value={dhName} />
            <Field label="Department" value={project.departmentId ? findName(lookups.departments || [], project.departmentId) : "—"} />
            <Field label="Project Value" value={project.projectValue ? Number(project.projectValue).toLocaleString("en-IN") : "—"} />
            <Field label="Zoho Project ID" value={project.zohoProjectId} />
            <Field label="PO Number" value={project.poNumber} />
            <Field label="SOW Reference" value={project.sowReference} />
            <Field label="Geography" value={project.geography} />
            {project.remarks && <div style={{ gridColumn: "1 / -1" }}><Field label="Remarks" value={project.remarks} /></div>}
          </div>
        </Section>

        {/* Resources */}
        <Section icon={Users2} color="#F59E0B" title={`Resources (${res.length})`}>
          {res.length === 0 ? (
            <div style={{ fontSize: 13, color: COLORS.textMuted, textAlign: "center", padding: "22px 0", border: `1px dashed ${COLORS.borderStrong}`, borderRadius: 10 }}>No resources assigned.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 14 }}>
              {res.map((r) => {
                const name = userLabel(lookups.users, r.userId);
                const p = Number(r.allocationPct) || 0;
                const tags = [String(r.userId) === String(project.projectManagerUserId) && "PM", String(r.userId) === String(project.deliveryHeadUserId) && "DH"].filter(Boolean);
                return (
                  <div key={r.id} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 16, background: "#fff" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ width: 42, height: 42, borderRadius: "50%", background: `linear-gradient(135deg, ${COLORS.accent}, #8B5CF6)`, color: "#fff", fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{initials(name)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, fontSize: 14, color: COLORS.text }}>{name}</span>
                          {tags.map((t) => <RoleTag key={t} t={t} />)}
                        </div>
                        <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>{findName(lookups.roles, r.roleId)}</div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: r.billable ? COLORS.successSoft : COLORS.warningSoft, color: r.billable ? COLORS.success : COLORS.warning, whiteSpace: "nowrap" }}>{r.billable ? "Billable" : "Non-billable"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: COLORS.textMuted, marginTop: 14, marginBottom: 6 }}>
                      <span>Allocation</span>
                      <span style={{ fontWeight: 800, color: p > 100 ? COLORS.danger : COLORS.text }}>{p}%</span>
                    </div>
                    <div style={{ height: 8, borderRadius: 999, background: COLORS.border, overflow: "hidden" }}>
                      <div style={{ width: `${Math.min(p, 100)}%`, height: "100%", borderRadius: 999, background: p > 100 ? COLORS.danger : COLORS.accent }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontSize: 12, color: COLORS.textSoft }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 5 }}><Clock size={13} color={COLORS.textMuted} /> {r.weeklyHours || 0} hrs/wk</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 5 }}><CalendarDays size={13} color={COLORS.textMuted} /> {fmtDate(r.startDate)} → {fmtDate(r.endDate)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* Documents */}
        <Section icon={FileText} color="#22A06B" title={`Documents (${docs.length})`}>
          {docs.length === 0 ? (
            <div style={{ fontSize: 13, color: COLORS.textMuted, textAlign: "center", padding: "22px 0", border: `1px dashed ${COLORS.borderStrong}`, borderRadius: 10 }}>No documents uploaded.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
              {docs.map((doc) => <DocumentDownloadRow key={doc.guid} doc={doc} />)}
            </div>
          )}
        </Section>
      </div>

      <div style={{ padding: "14px 28px", borderTop: `1px solid ${COLORS.border}`, background: COLORS.card, display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={{ padding: "9px 16px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", color: COLORS.text }}>Close</button>
        <button onClick={onEdit} style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 8, border: "none", background: COLORS.accent, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          <Pencil size={13} /> Edit Project
        </button>
      </div>
    </div>
  );
}