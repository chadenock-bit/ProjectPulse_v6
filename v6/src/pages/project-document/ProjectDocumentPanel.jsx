import { useState, useEffect } from "react";
import {
  X,
  Loader2,
  AlertCircle,
  FileCheck,
} from "lucide-react";
import { COLORS, inputStyle, labelStyle } from "../../constants/theme";

// Max size for the SELECTED file, before it's base64-encoded (base64
// inflates size by ~33%). Kept modest since FileData lives inline in a
// SQL varbinary(max) column, not blob storage — see flows.js note.
const MAX_FILE_BYTES = 4 * 1024 * 1024;

export function ProjectDocumentPanel({ mode, data, projects, users, saving, error, onCancel, onClose, onSubmit }) {
  const [form, setForm] = useState(data);
  useEffect(() => setForm(data), [data]);

  // Only DocName/DocType/IsActive can change on an existing document —
  // the flow's Update action doesn't accept project/uploader/date/file.
  const locked = mode === "edit";

  return (
    <div className="pp-panel" style={{ width: 340, background: COLORS.card, borderLeft: `1px solid ${COLORS.border}`, flexShrink: 0, display: "flex", flexDirection: "column", boxShadow: "-8px 0 30px rgba(15,20,40,0.06)" }}>
      <div style={{ padding: "18px 20px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: COLORS.text }}>{mode === "add" ? "Add Document" : "Edit Document"}</div>
          <div style={{ fontSize: 12, color: COLORS.accent, marginTop: 2 }}>
            {locked ? "Only name and type can be changed after upload" : "Fill all required fields below"}
          </div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.textMuted }}><X size={18} /></button>
      </div>
      <div style={{ padding: 20, flex: 1, overflowY: "auto" }}>
        <label style={labelStyle}>Document Name*</label>
        <input value={form.docName} onChange={(e) => setForm({ ...form, docName: e.target.value })} placeholder="e.g. SOW_Client.pdf" style={inputStyle} />

        <label style={{ ...labelStyle, marginTop: 16 }}>Project*</label>
        <select
          value={form.projectId || ""}
          onChange={(e) => setForm({ ...form, projectId: e.target.value })}
          disabled={locked}
          style={{ ...inputStyle, opacity: locked ? 0.6 : 1 }}
        >
          <option value="">Select a project…</option>
          {projects.map((p) => (
            <option key={p.guid} value={p.guid}>{p.projectCode} — {p.projectName}</option>
          ))}
        </select>

        <label style={{ ...labelStyle, marginTop: 16 }}>Document Type</label>
        <select value={form.docType} onChange={(e) => setForm({ ...form, docType: e.target.value })} style={inputStyle}>
          <option value="Contract">Contract</option>
          <option value="SOW">SOW</option>
          <option value="Invoice">Invoice</option>
          <option value="NDA">NDA</option>
          <option value="Other">Other</option>
        </select>

        <label style={{ ...labelStyle, marginTop: 16 }}>Uploaded By</label>
        <select
          value={form.uploadedByUserId || ""}
          onChange={(e) => setForm({ ...form, uploadedByUserId: e.target.value })}
          disabled={locked}
          style={{ ...inputStyle, opacity: locked ? 0.6 : 1 }}
        >
          <option value="">Select an employee…</option>
          {users.map((u) => (
            <option key={u.guid} value={u.guid}>{`${u.firstName || ""} ${u.lastName || ""}`.trim() || u.empId}</option>
          ))}
        </select>

        <label style={{ ...labelStyle, marginTop: 16 }}>Upload Date</label>
        <input type="date" value={form.uploadDate} onChange={(e) => setForm({ ...form, uploadDate: e.target.value })} disabled={locked} style={{ ...inputStyle, opacity: locked ? 0.6 : 1 }} />

        {error && <div style={{ display: "flex", gap: 8, alignItems: "center", color: COLORS.danger, fontSize: 12.5, marginTop: 16 }}><AlertCircle size={14} /> {error}</div>}

        {!locked && (
          <>
            <label style={{ ...labelStyle, marginTop: 16 }}>Upload File</label>
            <input
              type="file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > MAX_FILE_BYTES) {
                  alert(`File too large (max ${MAX_FILE_BYTES / (1024 * 1024)}MB) — documents are stored inline in SQL, not blob storage. Choose a smaller file.`);
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                  // reader.result is "data:<mime>;base64,<payload>" — strip
                  // the prefix, the flow writes the base64 payload straight
                  // into a varbinary(max) column and expects no prefix.
                  const base64 = String(reader.result).split(",")[1] || "";
                  setForm((f) => ({ ...f, fileName: file.name, fileData: base64 }));
                };
                reader.readAsDataURL(file);
              }}
              style={{ ...inputStyle, padding: "8px 13px" }}
            />
            {form.fileName && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, padding: "8px 12px", background: COLORS.accentSoft, borderRadius: 8, fontSize: 12.5 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, color: COLORS.accent, fontWeight: 600 }}>
                  <FileCheck size={13} /> {form.fileName}
                </span>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, fileName: "", fileData: "" }))}
                  style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.textMuted }}
                >
                  <X size={13} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
      <div style={{ padding: 16, borderTop: `1px solid ${COLORS.border}`, display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={() => setForm(data)} style={{ padding: "9px 16px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", color: COLORS.text }}>Cancel</button>
        <button onClick={() => onSubmit(form)} disabled={saving} style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: COLORS.accent, color: "#fff", fontSize: 13, fontWeight: 700, cursor: saving ? "default" : "pointer", opacity: saving ? 0.75 : 1, display: "flex", alignItems: "center", gap: 7 }}>
          {saving && <Loader2 size={13} className="spin" />}
          {saving ? "Saving…" : "Submit"}
        </button>
      </div>
    </div>
  );
}