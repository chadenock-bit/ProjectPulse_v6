export function Logo({ compact, dark }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: "linear-gradient(135deg,#4E80EC,#7C6BF2)",
        boxShadow: "0 6px 14px rgba(59,111,224,.4), inset 0 1px 0 rgba(255,255,255,.28)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 800, color: "#fff", fontSize: 15, fontFamily: "Sora, sans-serif", letterSpacing: "-0.02em",
      }}>
        PP
      </div>
      {!compact && (
        <div>
          <div style={{ fontFamily: "Sora, sans-serif", fontWeight: 700, fontSize: 16, color: dark ? "#0F1730" : "#fff", lineHeight: 1.1, letterSpacing: "-0.015em", whiteSpace: "nowrap" }}>
            Project Pulse
          </div>
        </div>
      )}
    </div>
  );
}
