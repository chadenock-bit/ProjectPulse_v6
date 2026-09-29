import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  RefreshCw,
  FileCheck,
  Download,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { callProjectFlow, callUserFlow, callProjectDocumentFlow, callProjectDocumentFileFlow } from "../../api/flows";
import { ConfirmModal } from "../../components/common/ConfirmModal";
import { EmptyState } from "../../components/common/EmptyState";
import { COLORS, cardStyle } from "../../constants/theme";
import { ProjectDocumentPanel } from "./ProjectDocumentPanel";
import { logAudit } from "../../utils/audit";
import { toDateInput } from "../../utils/format";

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

// Base64 -> Blob -> a real download, rather than a data: URL — safer for
// anything past a couple MB (a data: URL holds the whole file as a string
// in memory; a Blob + object URL doesn't).
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

const emptyForm = { guid: "", projectId: "", docName: "", docType: "Contract", uploadedByUserId: "", uploadDate: "", fileName: "", fileData: "", active: true };

export function ProjectDocumentPage() {
  const [documents, setDocuments] = useState([]);
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [search, setSearch] = useState("");
  const [panel, setPanel] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [downloadingGuid, setDownloadingGuid] = useState(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setListError("");
    Promise.all([callProjectFlow("LIST"), callUserFlow("LIST"), callProjectDocumentFlow("LIST")])
      .then(([projRes, userRes, docRes]) => {
        setProjects(projRes.data);
        setUsers(userRes.data);
        setDocuments(docRes.data);
        setLoading(false);
      })
      .catch((e) => { setListError(e.message); setLoading(false); });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2600); return () => clearTimeout(t); }, [toast]);

  const projectLabel = (projectId) => {
    const p = projects.find((x) => String(x.guid) === String(projectId));
    return p ? (p.projectCode ? `${p.projectCode} — ${p.projectName}` : p.projectName) : "—";
  };
  const userLabel = (userId) => {
    const u = users.find((x) => String(x.guid) === String(userId));
    return u ? (`${u.firstName || ""} ${u.lastName || ""}`.trim() || u.empId) : "—";
  };

  const rows = documents.map((d) => ({
    ...d,
    projectLabel: projectLabel(d.projectId),
    uploadedByLabel: userLabel(d.uploadedByUserId),
  }));

  const filtered = rows.filter((r) =>
    (r.docName || "").toLowerCase().includes(search.toLowerCase()) ||
    (r.projectLabel || "").toLowerCase().includes(search.toLowerCase())
  );

  const kpis = [
    { label: "Total Documents", value: String(rows.length), icon: FileCheck, color: COLORS.accent },
    { label: "Contracts", value: String(rows.filter((r) => r.docType === "Contract").length), icon: CheckCircle2, color: COLORS.success },
  ];

  const submitPanel = (form) => {
    if (!form.docName?.trim()) {
      setErr("Document Name is required.");
      return;
    }
    if (!form.guid && !form.projectId) {
      setErr("Project is required.");
      return;
    }
    setSaving(true); setErr("");

    const isEdit = !!form.guid;
    const call = isEdit
      ? callProjectDocumentFlow("EDIT", { ...form, active: true })
      : callProjectDocumentFlow("CREATE", { ...form, active: true });

    call
      .then((res) => {
        setDocuments(res.data);
        setSaving(false);
        setPanel(null);
        logAudit("Project Document", isEdit ? "Update" : "Create", form.docName);
        setToast(isEdit ? "Document updated." : "Document added.");
      })
      .catch((e) => { setErr(e.message); setSaving(false); });
  };

  const confirmDeleteRow = () => {
    if (!confirmDelete) return;
    setDeleting(true);
    callProjectDocumentFlow("DELETE", { guid: confirmDelete.guid })
      .then((res) => {
        setDocuments(res.data);
        setDeleting(false);
        setConfirmDelete(null);
        logAudit("Project Document", "Delete", confirmDelete.docName);
        setToast("Document deleted.");
      })
      .catch((e) => { setListError(e.message); setDeleting(false); });
  };

  const handleDownload = (row) => {
    setDownloadingGuid(row.guid);
    callProjectDocumentFileFlow(row.guid)
      .then((file) => {
        if (!file || !file.fileData) throw new Error("No file content stored for this document.");
        downloadBase64File(file.fileName || row.docName, file.fileData);
      })
      .catch((e) => setListError(e.message))
      .finally(() => setDownloadingGuid(null));
  };

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
      <div style={{ flex: 1, padding: 26, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div style={{ fontFamily: "Sora, sans-serif", fontSize: 20, fontWeight: 700, color: COLORS.text }}>Project Document</div>
            <div style={{ color: COLORS.textMuted, fontSize: 13.5 }}>Track project-related documents</div>
          </div>
          {/* Add Document button hidden — documents are now added from the
   Project Dashboard's Edit panel instead. Uncomment to re-enable
   standalone document creation from this screen.
<button
  onClick={() => { setErr(""); setPanel({ mode: "add", data: emptyForm }); }}
  style={{ display: "flex", alignItems: "center", gap: 7, background: COLORS.accent, color: "#fff", border: "none", borderRadius: 9, padding: "10px 16px", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}
>
  <Plus size={15} /> Add Document
</button>
*/}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 16 }}>
          {kpis.map((k) => {
            const Icon = k.icon;
            return (
              <div key={k.label} style={cardStyle}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ color: COLORS.textMuted, fontSize: 12.5, fontWeight: 600 }}>{k.label}</span>
                  <span style={{ width: 30, height: 30, borderRadius: 8, background: `${k.color}1F`, color: k.color, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={15} /></span>
                </div>
                <div style={{ fontFamily: "Sora, sans-serif", fontSize: 26, fontWeight: 700, color: COLORS.text, marginTop: 10 }}>{k.value}</div>
              </div>
            );
          })}
        </div>

        <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${COLORS.border}` }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: COLORS.text }}>Documents <span style={{ color: COLORS.textMuted, fontWeight: 500 }}>({filtered.length})</span></div>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "7px 11px", width: 260 }}>
                <Search size={14} color={COLORS.textMuted} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by document or project" style={{ border: "none", outline: "none", fontSize: 13, width: "100%", fontFamily: "Inter, sans-serif" }} />
              </div>
              <button onClick={refresh} style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${COLORS.border}`, background: "#fff", borderRadius: 8, padding: "0 12px", fontSize: 12.5, cursor: "pointer", color: COLORS.text }}>
                <RefreshCw size={13} /> Refresh
              </button>
            </div>
          </div>

          {listError && (
            <div style={{ padding: "12px 16px", color: COLORS.danger, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
              <AlertCircle size={14} /> {listError}
            </div>
          )}

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: COLORS.bg }}>
                {["Document", "Project", "Type", "Uploaded By", "Upload Date", "File", "Actions"].map((h) => (
                  <th key={h} style={{ textAlign: h === "Actions" ? "center" : "left", padding: "10px 16px", fontSize: 12, color: COLORS.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: COLORS.textMuted }}>
                  <Loader2 size={18} className="spin" style={{ verticalAlign: "middle", marginRight: 8 }} /> Loading documents…
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7}><EmptyState icon={FileCheck} message="No documents available." onRetry={refresh} /></td></tr>
              ) : filtered.map((r, i) => (
                <tr key={r.guid} style={{ borderTop: `1px solid ${COLORS.border}`, background: i % 2 ? "COLORS.tableHead" : "#fff" }}>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text, fontWeight: 600 }}>{r.docName}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text }}>{r.projectLabel}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text }}>{r.docType}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text }}>{r.uploadedByLabel}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text }}>{r.uploadDate}</td>
                  <td style={{ padding: "11px 16px" }}>
                    {r.fileName ? (
                      <button
                        onClick={() => handleDownload(r)}
                        disabled={downloadingGuid === r.guid}
                        style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 600, color: COLORS.accent, background: "none", border: "none", cursor: downloadingGuid === r.guid ? "default" : "pointer", padding: 0 }}
                      >
                        {downloadingGuid === r.guid ? <Loader2 size={12} className="spin" /> : <Download size={12} />} {r.fileName}
                      </button>
                    ) : (
                      <span style={{ fontSize: 12.5, color: COLORS.textMuted }}>No file</span>
                    )}
                  </td>
                  <td style={{ padding: "11px 16px", textAlign: "center" }}>
                    <div style={{ display: "inline-flex", gap: 8 }}>
                      <button onClick={() => { setErr(""); setPanel({ mode: "edit", data: { ...r, uploadDate: toDateInput(r.uploadDate) } }); }} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: COLORS.accentSoft, color: COLORS.accent, border: "none", borderRadius: 7, padding: "6px 11px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                        <Pencil size={12} /> Edit
                      </button>
                      <button onClick={() => setConfirmDelete(r)} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: COLORS.dangerSoft, color: COLORS.danger, border: "none", borderRadius: 7, padding: "6px 11px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                        <Trash2 size={12} /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {panel && (
        <ProjectDocumentPanel
          mode={panel.mode}
          data={panel.data}
          projects={projects}
          users={users}
          saving={saving}
          error={err}
          onCancel={() => {
            setPanel(panel.mode === "add" ? { mode: "add", data: emptyForm } : null);
            setErr("");
          }}
          onClose={() => setPanel(null)}
          onSubmit={submitPanel}
        />
      )}

      {confirmDelete && (
        <ConfirmModal title="Delete this document?" message={`"${confirmDelete.docName}" will be permanently removed. This can't be undone.`} confirmLabel="Delete" busy={deleting} onCancel={() => setConfirmDelete(null)} onConfirm={confirmDeleteRow} />
      )}

      {toast && (
        <div style={{ position: "absolute", bottom: 22, left: "50%", transform: "translateX(-50%)", background: COLORS.text, color: "#fff", padding: "10px 18px", borderRadius: 9, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 12px 30px rgba(0,0,0,0.2)" }}>
          <CheckCircle2 size={15} color={COLORS.success} /> {toast}
        </div>
      )}
    </div>
  );
}