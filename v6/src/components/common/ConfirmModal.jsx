import {
  Loader2,
  AlertCircle,
} from "lucide-react";
import { COLORS } from "../../constants/theme";

export function ConfirmModal({ title, message, confirmLabel, busy, onCancel, onConfirm }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(10,14,32,0.55)", zIndex: 50, padding: 16,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{ width: "min(400px, 100%)", background: COLORS.card, borderRadius: 18, padding: 24, boxShadow: "0 30px 80px rgba(3,6,20,0.5)", border: `1px solid ${COLORS.border}` }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
          <span style={{ width: 40, height: 40, borderRadius: 12, background: COLORS.dangerSoft, color: COLORS.danger, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <AlertCircle size={18} />
          </span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: COLORS.text, marginBottom: 4 }}>{title}</div>
            <div style={{ fontSize: 13, color: COLORS.textMuted, lineHeight: 1.5 }}>{message}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ padding: "10px 18px", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", color: COLORS.text }}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            style={{
              padding: "10px 20px", borderRadius: 10, border: "none", background: COLORS.danger, color: "#fff",
              fontSize: 13, fontWeight: 700, cursor: busy ? "default" : "pointer", opacity: busy ? 0.75 : 1,
              display: "flex", alignItems: "center", gap: 7,
            }}
          >
            {busy && <Loader2 size={13} className="spin" />}
            {busy ? "Deleting…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
