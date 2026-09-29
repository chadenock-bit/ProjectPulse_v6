import { useMemo } from "react";
import { EmptyState } from "../../components/common/EmptyState";
import { CHART_PALETTE, COLORS, cardStyle } from "../../constants/theme";
import { findName, fmtDate, userLabel } from "./hooks";

export const SORT_FIELDS = {
  user: (a, lookups) => userLabel(lookups.users, a.userId),
  project: (a) => a.projectName,
  allocation: (a) => Number(a.allocationPct) || 0,
  hours: (a) => Number(a.weeklyHours) || 0,
  start: (a) => a.startDate || "",
  end: (a) => a.endDate || "",
};

export function TimelineView({ allocations, lookups }) {
  const { rangeStart, totalDays, months } = useMemo(() => {
    if (allocations.length === 0) return { rangeStart: new Date(), totalDays: 1, months: [] };
    const starts = allocations.map((a) => new Date(a.startDate));
    const ends = allocations.map((a) => new Date(a.endDate));
    const min = new Date(Math.min(...starts));
    const max = new Date(Math.max(...ends));
    const days = Math.max(1, Math.round((max - min) / 86400000));
    const monthList = [];
    let cursor = new Date(min.getFullYear(), min.getMonth(), 1);
    while (cursor <= max) {
      const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      const segStart = cursor < min ? min : cursor;
      const segEnd = nextMonth < max ? nextMonth : max;
      const widthPct = (Math.max(1, (segEnd - segStart) / 86400000) / days) * 100;
      monthList.push({ label: cursor.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }), widthPct });
      cursor = nextMonth;
    }
    return { rangeStart: min, totalDays: days, months: monthList };
  }, [allocations]);

  const barStyle = (a) => {
    const s = new Date(a.startDate), e = new Date(a.endDate);
    const left = ((s - rangeStart) / 86400000 / totalDays) * 100;
    const width = Math.max(1.5, ((e - s) / 86400000 / totalDays) * 100);
    return { left: `${left}%`, width: `${width}%` };
  };

  if (allocations.length === 0) {
    return <div style={cardStyle}><EmptyState message="No data available." /></div>;
  }

  return (
    <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", borderBottom: `1px solid ${COLORS.border}` }}>
        <div style={{ width: 260, flexShrink: 0, padding: "10px 16px", fontSize: 11, fontWeight: 700, color: COLORS.textMuted, textTransform: "uppercase" }}>Resource / Project</div>
        <div style={{ flex: 1, display: "flex" }}>
          {months.map((m, i) => (
            <div key={i} style={{ width: `${m.widthPct}%`, padding: "10px 6px", fontSize: 11, fontWeight: 700, color: COLORS.textMuted, textAlign: "center", borderLeft: i === 0 ? "none" : `1px solid ${COLORS.border}` }}>
              {m.label}
            </div>
          ))}
        </div>
      </div>
      {allocations.map((a, i) => (
        <div key={a.id} style={{ display: "flex", alignItems: "center", borderBottom: `1px solid ${COLORS.border}`, background: i % 2 ? "COLORS.tableHead" : "#fff" }}>
          <div style={{ width: 260, flexShrink: 0, padding: "10px 16px" }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.text }}>{userLabel(lookups.users, a.userId)}</div>
            <div style={{ fontSize: 11, color: COLORS.textMuted }}>{a.projectCode} • {findName(lookups.roles, a.roleId)}</div>
          </div>
          <div style={{ flex: 1, position: "relative", height: 40 }}>
            <div title={`${a.projectName}: ${fmtDate(a.startDate)} → ${fmtDate(a.endDate)}`} style={{
              position: "absolute", top: 8, height: 24, borderRadius: 6, background: CHART_PALETTE[a.projectId % CHART_PALETTE.length],
              color: "#fff", fontSize: 10.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
              overflow: "hidden", whiteSpace: "nowrap", ...barStyle(a),
            }}>
              {a.allocationPct}%
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
