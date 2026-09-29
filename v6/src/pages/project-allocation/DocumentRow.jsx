import { useState } from "react";
import { X, FileCheck, Download, Loader2, Upload, AlertCircle } from "lucide-react";
import { COLORS, inputStyle, labelStyle } from "../../constants/theme";
import { callProjectDocumentFlow, callProjectDocumentFileFlow } from "../../api/flows";

const MAX_FILE_BYTES = 4 * 1024 * 1024;

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

// projectGuid: real saved Project guid (documents only work once this exists).
// onSaved(savedDoc): replaces the temp row with the real DB row (has guid), after a successful upload.
// onDeleted(): removes the row from the panel's list after a successful DELETE (or an unsaved row's removal).
// onToast(msg): bubbles a status message up to the Dashboard.
export function DocumentRow({ doc, onChange, projectGuid, onSaved, onDeleted, onToast }) {
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [rowErr, setRowErr] = useState("");

  const isSaved = !!doc.guid;

  const handleDownload = () => {
    setDownloading(true);
    callProjectDocumentFileFlow(doc.guid)
      .then((file) => {
        if (!file || !file.fileData) throw new Error("No file content stored for this document.");
        downloadBase64File(file.fileName || doc.docName, file.fileData);
      })
      .catch((e) => setRowErr(e.message))
      .finally(() => setDownloading(false));
  };

  const handleUpload = () => {
    if (!doc.docName?.trim()) { setRowErr("Document Name is required."); return; }
    if (!doc.fileData) { setRowErr("Choose a file first."); return; }
    setUploading(true);
    setRowErr("");
    // Single isolated CREATE call — this is the only document flow request
    // fired at this moment, so flow2's connector never sees it alongside
    // other documents' requests (that concurrency was the cause of the 502).
    callProjectDocumentFlow("CREATE", { ...doc, projectId: projectGuid })
      .then((res) => {
        const match = [...res.data].reverse().find((d) => d.docName === doc.docName.trim() && d.fileName === doc.fileName);
        if (match) onSaved({ ...doc, guid: match.guid, id: match.guid });
        onToast?.("Document uploaded.");
      })
      .catch((e) => setRowErr(e.message))
      .finally(() => setUploading(false));
  };

  const handleDelete = () => {
    if (!isSaved) { onDeleted(); return; } // never uploaded — just drop the local row
    setDeleting(true);
    callProjectDocumentFlow("DELETE", { guid: doc.guid })
      .then(() => { onDeleted(); onToast?.("Document deleted."); })
      .catch((e) => setRowErr(e.message))
      .finally(() => setDeleting(false));
  };

  return (
    <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 12, marginBottom: 10, position: "relative" }}>
      <button onClick={handleDelete} disabled={deleting} style={{ position: "absolute", top: 8, right: 8, background: "none", border: "none", cursor: deleting ? "default" : "pointer", color: COLORS.textMuted }} title="Remove document">
        {deleting ? <Loader2 size={14} className="spin" /> : <X size={14} />}
      </button>

      <label style={{ ...labelStyle, fontSize: 11, marginBottom: 4 }}>Document Name*</label>
      <input value={doc.docName} disabled={isSaved} onChange={(e) => onChange({ ...doc, docName: e.target.value })} placeholder="e.g. SOW_Client.pdf" style={{ ...inputStyle, opacity: isSaved ? 0.6 : 1 }} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
        <div>
          <label style={{ ...labelStyle, fontSize: 11, marginBottom: 4 }}>Type</label>
          <select value={doc.docType} disabled={isSaved} onChange={(e) => onChange({ ...doc, docType: e.target.value })} style={{ ...inputStyle, opacity: isSaved ? 0.6 : 1 }}>
            <option value="Contract">Contract</option>
            <option value="SOW">SOW</option>
            <option value="Invoice">Invoice</option>
            <option value="NDA">NDA</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div>
          <label style={{ ...labelStyle, fontSize: 11, marginBottom: 4 }}>Upload Date</label>
          <input type="date" value={doc.uploadDate} disabled style={{ ...inputStyle, opacity: 0.6 }} />
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        {isSaved ? (
          <button type="button" onClick={handleDownload} disabled={downloading} style={{ display: "flex", alignItems: "center", gap: 6, background: COLORS.accentSoft, color: COLORS.accent, border: "none", borderRadius: 7, padding: "7px 10px", fontSize: 12.5, fontWeight: 600, cursor: downloading ? "default" : "pointer" }}>
            {downloading ? <Loader2 size={12} className="spin" /> : <Download size={12} />} {doc.fileName || "Download"}
          </button>
        ) : !doc.fileName ? (
          <input
            type="file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > MAX_FILE_BYTES) {
                setRowErr(`File too large (max ${MAX_FILE_BYTES / (1024 * 1024)}MB).`);
                return;
              }
              const reader = new FileReader();
              reader.onload = () => {
                const base64 = String(reader.result).split(",")[1] || "";
                onChange({ ...doc, fileName: file.name, fileData: base64, docName: doc.docName || file.name });
              };
              reader.readAsDataURL(file);
            }}
            style={{ ...inputStyle, padding: "8px 13px" }}
          />
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: COLORS.accentSoft, borderRadius: 8, fontSize: 12.5 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6, color: COLORS.accent, fontWeight: 600 }}>
                <FileCheck size={13} /> {doc.fileName}
              </span>
              <button type="button" onClick={() => onChange({ ...doc, fileName: "", fileData: "" })} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.textMuted }}>
                <X size={13} />
              </button>
            </div>
            {projectGuid ? (
              <button
                type="button"
                onClick={handleUpload}
                disabled={uploading}
                style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, background: COLORS.accent, color: "#fff", border: "none", borderRadius: 7, padding: "8px 12px", fontSize: 12.5, fontWeight: 700, cursor: uploading ? "default" : "pointer", opacity: uploading ? 0.7 : 1, width: "100%", justifyContent: "center" }}
              >
                {uploading ? <Loader2 size={13} className="spin" /> : <Upload size={13} />} {uploading ? "Uploading…" : "Upload Document"}
              </button>
            ) : (
              // No project guid yet (Add mode) — file is staged in form state
              // only; ProjectDashboardPage.submitPanel uploads it via
              // callProjectDocumentFlow("CREATE") once the project itself
              // has been created and its guid is known.
              <div style={{ marginTop: 8, fontSize: 11.5, color: COLORS.textMuted, textAlign: "center" }}>
                Staged — will upload once the project is saved.
              </div>
            )}
          </>
        )}
      </div>

      {rowErr && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", color: COLORS.danger, fontSize: 12, marginTop: 8 }}>
          <AlertCircle size={12} /> {rowErr}
        </div>
      )}
    </div>
  );
}