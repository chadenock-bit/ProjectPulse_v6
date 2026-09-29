// Design tokens — navy / black / white core with a few cool shades layered on top.
// Existing keys keep their names (every screen reads them); values are refined and
// a handful of new tokens are added.
export const COLORS = {
  // navy family
  navyDeep: "#0D1226",
  navy: "#161D34",
  navySoft: "#1E2748",
  navyLift: "#283462",
  navyBorder: "#2A3358",
  // brand accent
  accent: "#3B6FE0",
  accentDark: "#2D5BC8",
  accentLight: "#6F94EE",
  accentSoft: "#EAF0FE",
  // surfaces & lines
  bg: "#F3F5FA",
  surface: "#F8FAFD",
  card: "#FFFFFF",
  border: "#E3E8F2",
  borderStrong: "#CDD5E5",
  // ink
  text: "#0F1730",
  textSoft: "#39445F",
  textMuted: "#66708A",
  // status
  success: "#1B9C6E",
  successSoft: "#E6F6EF",
  danger: "#D6483E",
  dangerSoft: "#FBE9E7",
  warning: "#D98A0B",
  warningSoft: "#FEF3C7",
  // Toggle-switch "off" track color — same value was hardcoded independently
  // in every Add/Edit panel's Active/Inactive switch; named here so it's one
  // source of truth instead of 20+ copies of the same literal.
  toggleOff: "#D7DCE6",
  // Table header row background — same literal was hardcoded independently
  // in every list screen's <thead>; named here for the same reason as
  // toggleOff above.
  tableHead: "#FAFBFD",
};

export const SHADOWS = {
  sm: "0 1px 2px rgba(15,23,48,0.05), 0 1px 3px rgba(15,23,48,0.06)",
  md: "0 4px 12px rgba(15,23,48,0.07), 0 2px 4px rgba(15,23,48,0.05)",
  lg: "0 18px 40px rgba(15,23,48,0.14), 0 4px 10px rgba(15,23,48,0.06)",
};

export const CHART_PALETTE = [
  "#3B6FE0", "#8B5CF6", "#0EA5A4", "#F59E0B", "#22A06B",
  "#E11D48", "#EAB308", "#06B6D4", "#A855F7", "#F43F5E",
];

export const cardStyle = {
  background: COLORS.card, borderRadius: 16, padding: 18,
  border: `1px solid ${COLORS.border}`, boxShadow: SHADOWS.sm,
};

export const inputStyle = {
  width: "100%", padding: "11px 13px", borderRadius: 10, border: `1px solid ${COLORS.border}`,
  fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "Inter, sans-serif",
  color: COLORS.text, background: "#fff", transition: "border-color .15s ease, box-shadow .15s ease",
};

export const labelStyle = { display: "block", fontSize: 12.5, fontWeight: 600, color: COLORS.textSoft, marginBottom: 6, letterSpacing: "0.01em" };
