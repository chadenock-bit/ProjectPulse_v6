import { COLORS } from "../../constants/theme";

/**
 * active-only mode: <StatusBadge active={x} />  — plain read-only pill (unchanged behavior).
 * toggle mode: <StatusBadge active={x} onToggle={fn} busy={bool} /> — renders as a clickable
 * switch that calls onToggle() immediately, no edit panel needed. Per meeting note #1.
 */
export function StatusBadge({ active, onLabel = "Active", offLabel = "Inactive", onToggle, busy }) {
  if (!onToggle) {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px",
        borderRadius: 999, fontSize: 12.5, fontWeight: 600,
        background: active ? COLORS.successSoft : COLORS.dangerSoft,
        color: active ? COLORS.success : COLORS.danger,
        border: `1px solid ${active ? "rgba(27,156,110,0.18)" : "rgba(214,72,62,0.16)"}`,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: active ? COLORS.success : COLORS.danger }} />
        {active ? onLabel : offLabel}
      </span>
    );
  }

  return (
    <div
      data-access="edit"
      onClick={() => !busy && onToggle(!active)}
      title="Click to toggle status"
      style={{
        display: "inline-flex", alignItems: "center", gap: 8, cursor: busy ? "default" : "pointer",
        opacity: busy ? 0.6 : 1,
      }}
    >
      <div style={{
        width: 36, height: 20, borderRadius: 999,
        background: active ? "linear-gradient(180deg,#22B07F,#1B9C6E)" : "#D3D9E6",
        boxShadow: active ? "0 2px 8px rgba(27,156,110,0.35), inset 0 1px 1px rgba(0,0,0,0.08)" : "inset 0 1px 2px rgba(15,23,48,0.12)",
        position: "relative", transition: "background 0.18s ease, box-shadow 0.18s ease", flexShrink: 0,
      }}>
        <div style={{
          width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 2,
          left: active ? 18 : 2, transition: "left 0.18s cubic-bezier(.2,.7,.2,1)", boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
        }} />
      </div>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: active ? COLORS.success : COLORS.danger }}>
        {active ? onLabel : offLabel}
      </span>
    </div>
  );
}