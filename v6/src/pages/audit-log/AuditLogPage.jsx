import { useState, useEffect, useCallback } from "react";
import {
  Search,
  RefreshCw,
  ScrollText,
  ArrowUpDown,
  Filter,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { callAuditLogFlow } from "../../api/flows";
import { EmptyState } from "../../components/common/EmptyState";
import { COLORS, cardStyle, inputStyle } from "../../constants/theme";

export function AuditLogPage() {
  // Older audit entries may have stored the full session object
  // { username, loginTime } as `user`. Normalize to a string so
  // React never tries to render an object as a child.
  const normalizeAuditRows = (list) =>
    (Array.isArray(list) ? list : []).map((r) => ({
      ...r,
      user:
        typeof r.user === "object" && r.user !== null
          ? r.user.username || r.user.name || "Administrator"
          : r.user || "Administrator",
    }));

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [search, setSearch] = useState("");
  const [screenFilter, setScreenFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortDir, setSortDir] = useState("desc"); // desc = newest first

  const refresh = useCallback(() => {
    setLoading(true);
    setListError("");
    callAuditLogFlow("LIST")
      .then((res) => {
        setRows(normalizeAuditRows(res.data));
        setLoading(false);
      })
      .catch((e) => { setListError(e.message); setLoading(false); });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const screenOptions = Array.from(new Set(rows.map((r) => r.screen))).sort();
  const actionOptions = Array.from(new Set(rows.map((r) => r.action))).sort();
  const userOptions = Array.from(new Set(rows.map((r) => r.user))).sort();

  const filtered = rows
    .filter((r) => {
      const q = search.toLowerCase();
      const matchesSearch = (r.record || "").toLowerCase().includes(q) || (r.screen || "").toLowerCase().includes(q);
      const matchesScreen = !screenFilter || r.screen === screenFilter;
      const matchesAction = !actionFilter || r.action === actionFilter;
      const matchesUser = !userFilter || r.user === userFilter;
      const t = new Date(r.timestamp).getTime();
      const matchesFrom = !dateFrom || t >= new Date(dateFrom).getTime();
      const matchesTo = !dateTo || t <= new Date(dateTo).getTime() + 86399999;
      return matchesSearch && matchesScreen && matchesAction && matchesUser && matchesFrom && matchesTo;
    })
    .sort((a, b) => {
      const diff = new Date(a.timestamp) - new Date(b.timestamp);
      return sortDir === "desc" ? -diff : diff;
    });

  const actionColor = (action) => {
    if (action === "Delete" || action === "Reject") return COLORS.danger;
    if (action === "Create" || action === "Approve") return COLORS.success;
    return COLORS.accent;
  };

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
      <div style={{ flex: 1, padding: 26, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div style={{ fontFamily: "Sora, sans-serif", fontSize: 20, fontWeight: 700, color: COLORS.text }}>Audit Log</div>
            <div style={{ color: COLORS.textMuted, fontSize: 13.5 }}>Every Create, Update, Delete and Approval across the app</div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={refresh} style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${COLORS.border}`, background: "#fff", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, cursor: "pointer", color: COLORS.text }}>
              <RefreshCw size={13} /> Refresh
            </button>
            {/* "Clear Log" removed — the AuditLog flow deliberately has no
                DELETE branch (append-only log). If pruning is ever needed,
                do it with a scheduled server-side cleanup, not from here. */}
          </div>
        </div>

        <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${COLORS.border}`, flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 14, color: COLORS.text }}>
              <Filter size={14} color={COLORS.textMuted} /> Entries <span style={{ color: COLORS.textMuted, fontWeight: 500 }}>({filtered.length})</span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "7px 11px", width: 180 }}>
                <Search size={14} color={COLORS.textMuted} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search record" style={{ border: "none", outline: "none", fontSize: 13, width: "100%", fontFamily: "Inter, sans-serif" }} />
              </div>
              <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} style={{ ...inputStyle, width: 150, padding: "7px 11px" }}>
                <option value="">All Employees</option>
                {userOptions.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
              <select value={screenFilter} onChange={(e) => setScreenFilter(e.target.value)} style={{ ...inputStyle, width: 160, padding: "7px 11px" }}>
                <option value="">All Screens</option>
                {screenOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} style={{ ...inputStyle, width: 140, padding: "7px 11px" }}>
                <option value="">All Actions</option>
                {actionOptions.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ ...inputStyle, width: 140, padding: "7px 11px" }} />
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ ...inputStyle, width: 140, padding: "7px 11px" }} />
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
                <th
                  onClick={() => setSortDir(sortDir === "desc" ? "asc" : "desc")}
                  style={{ textAlign: "left", padding: "10px 16px", fontSize: 12, color: COLORS.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
                >
                  Timestamp <ArrowUpDown size={11} />
                </th>
                {["Screen", "Action", "Record", "Employee"].map((h) => (
                  <th key={h} style={{ textAlign: h === "Actions" ? "right" : "left", padding: "10px 16px", fontSize: 12, color: COLORS.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: COLORS.textMuted }}>
                  <Loader2 size={18} className="spin" style={{ verticalAlign: "middle", marginRight: 8 }} /> Loading audit log…
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5}><EmptyState icon={ScrollText} onRetry={refresh} /></td></tr>
              ) : filtered.map((r, i) => (
                <tr key={r.guid} style={{ borderTop: `1px solid ${COLORS.border}`, background: i % 2 ? "COLORS.tableHead" : "#fff" }}>
                  <td style={{ padding: "11px 16px", fontSize: 13, color: COLORS.textMuted, whiteSpace: "nowrap" }}>{new Date(r.timestamp).toLocaleString()}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text, fontWeight: 600 }}>{r.screen}</td>
                  <td style={{ padding: "11px 16px" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: actionColor(r.action) }}>{r.action}</span>
                  </td>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text }}>{r.record}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text }}>{r.user}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}