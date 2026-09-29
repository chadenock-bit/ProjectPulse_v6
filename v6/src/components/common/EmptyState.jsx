import {
  Inbox,
  RefreshCw,
} from "lucide-react";
import { COLORS } from "../../constants/theme";

export function EmptyState({ icon: Icon = Inbox, message = "No data available.", onRetry }) {
  return (
    <div style={{ padding: 46, textAlign: "center", color: COLORS.textMuted }}>
      <span style={{ width: 52, height: 52, borderRadius: 16, background: COLORS.accentSoft, color: COLORS.accent, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
        <Icon size={24} />
      </span>
      <div style={{ fontSize: 13.5, fontWeight: 500 }}>{message}</div>
      {onRetry && (
        <button onClick={onRetry} style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${COLORS.border}`, background: "#fff", borderRadius: 8, padding: "6px 14px", fontSize: 12.5, cursor: "pointer", color: COLORS.text }}>
          <RefreshCw size={13} /> Retry
        </button>
      )}
    </div>
  );
}
