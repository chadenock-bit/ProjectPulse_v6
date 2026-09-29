import { useState, useEffect, useCallback } from "react";
import {
  Search,
  X,
  CheckCircle2,
  AlertCircle,
  ClipboardCheck,
  Loader2,
} from "lucide-react";
import { callUserFlow, callProjectFlow, callTimesheetFlow } from "../../api/flows";
import { EmptyState } from "../../components/common/EmptyState";
import { StatusBadge } from "../../components/common/StatusBadge";
import { COLORS, cardStyle, inputStyle } from "../../constants/theme";
import { logAudit } from "../../utils/audit";

export function TimesheetApprovalPage() {
  const [timesheets, setTimesheets] = useState([]);
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [decidingGuid, setDecidingGuid] = useState(null); // row currently saving
  const [search, setSearch] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [toast, setToast] = useState("");

  const refresh = useCallback(() => {
    setLoading(true);
    setListError("");
    Promise.all([callUserFlow("LIST"), callProjectFlow("LIST"), callTimesheetFlow("LIST")])
      .then(([userRes, projRes, tsRes]) => {
        setUsers(userRes.data);
        setProjects(projRes.data);
        setTimesheets(tsRes.data);
        setLoading(false);
      })
      .catch((e) => { setListError(e.message); setLoading(false); });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2600); return () => clearTimeout(t); }, [toast]);

  const userLabel = (userId) => {
    const u = users.find((x) => String(x.guid) === String(userId));
    return u ? (`${u.firstName || ""} ${u.lastName || ""}`.trim() || u.empId) : "—";
  };
  const projectLabel = (projectId) => {
    const p = projects.find((x) => String(x.guid) === String(projectId));
    return p ? (p.projectCode ? `${p.projectCode} — ${p.projectName}` : p.projectName) : "—";
  };

  const rows = timesheets.map((t) => ({
    ...t,
    employee: userLabel(t.employeeUserId),
    project: projectLabel(t.projectId),
  }));

  const employeeOptions = Array.from(new Set(rows.map((r) => r.employee))).sort();

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    const matchesSearch = (r.employee || "").toLowerCase().includes(q) || (r.project || "").toLowerCase().includes(q);
    const matchesEmployee = !employeeFilter || r.employee === employeeFilter;
    const matchesStatus = !statusFilter || r.status === statusFilter;
    return matchesSearch && matchesEmployee && matchesStatus;
  });

  const kpis = [
    { label: "Pending", value: String(rows.filter((r) => r.status === "Pending").length), icon: ClipboardCheck, color: "#F59E0B" },
    { label: "Approved", value: String(rows.filter((r) => r.status === "Approved").length), icon: CheckCircle2, color: COLORS.success },
    { label: "Rejected", value: String(rows.filter((r) => r.status === "Rejected").length), icon: AlertCircle, color: COLORS.danger },
  ];

  const decide = (row, decision) => {
    setDecidingGuid(row.guid);
    callTimesheetFlow("EDIT", {
      guid: row.guid,
      hours: row.hours,
      status: decision,
      approvedOn: new Date().toISOString(),
    })
      .then((res) => {
        setTimesheets(res.data);
logAudit("Timesheet Approval", decision === "Approved" ? "Approve" : "Reject", `${row.employee} — week of ${row.weekEnding}`, null, {
          userId: row.employeeUserId,
          projectId: row.projectId,
       });        setToast(`Timesheet ${decision.toLowerCase()}.`);
      })
      .catch((e) => setListError(e.message))
      .finally(() => setDecidingGuid(null));
  };

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
      <div style={{ flex: 1, padding: 26, overflowY: "auto" }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: "Sora, sans-serif", fontSize: 20, fontWeight: 700, color: COLORS.text }}>Timesheet Approval</div>
          <div style={{ color: COLORS.textMuted, fontSize: 13.5 }}>Review and approve weekly timesheets</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 16 }}>
          {kpis.map((k) => {
            const Icon = k.icon;
            return (
              <div key={k.label} style={cardStyle}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ color: COLORS.textMuted, fontSize: 12.5, fontWeight: 600 }}>{k.label}</span>
                  <span style={{ width: 30, height: 30, borderRadius: 8, background: `${k.color}1F`, color: k.color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon size={15} />
                  </span>
                </div>
                <div style={{ fontFamily: "Sora, sans-serif", fontSize: 26, fontWeight: 700, color: COLORS.text, marginTop: 10 }}>{k.value}</div>
              </div>
            );
          })}
        </div>

        <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${COLORS.border}`, flexWrap: "wrap", gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: COLORS.text }}>Timesheets <span style={{ color: COLORS.textMuted, fontWeight: 500 }}>({filtered.length})</span></div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "7px 11px", width: 200 }}>
                <Search size={14} color={COLORS.textMuted} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" style={{ border: "none", outline: "none", fontSize: 13, width: "100%", fontFamily: "Inter, sans-serif" }} />
              </div>
              <select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)} style={{ ...inputStyle, width: 170, padding: "7px 11px" }}>
                <option value="">All Employees</option>
                {employeeOptions.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...inputStyle, width: 150, padding: "7px 11px" }}>
                <option value="">All Statuses</option>
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
              </select>
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
                {["Employee", "Project", "Week Ending", "Hours", "Status", "Actions"].map((h) => (
                  <th key={h} style={{ textAlign: h === "Actions" ? "center" : "left", padding: "10px 16px", fontSize: 12, color: COLORS.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: COLORS.textMuted }}>
                  <Loader2 size={18} className="spin" style={{ verticalAlign: "middle", marginRight: 8 }} /> Loading timesheets…
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6}><EmptyState icon={ClipboardCheck} onRetry={refresh} /></td></tr>
              ) : filtered.map((r, i) => (
                <tr key={r.guid} style={{ borderTop: `1px solid ${COLORS.border}`, background: i % 2 ? "COLORS.tableHead" : "#fff" }}>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text, fontWeight: 600 }}>{r.employee}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text }}>{r.project}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text }}>{r.weekEnding}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text }}>{r.hours}</td>
                  <td style={{ padding: "11px 16px" }}><StatusBadge active={r.status === "Approved"} /></td>
                  <td style={{ padding: "11px 16px", textAlign: "center" }}>
                    {r.status === "Pending" ? (
                      <div style={{ display: "inline-flex", gap: 8 }}>
                        <button
                          data-access="approve" onClick={() => decide(r, "Approved")}
                          disabled={decidingGuid === r.guid}
                          style={{ display: "inline-flex", alignItems: "center", gap: 6, background: COLORS.successSoft, color: COLORS.success, border: "none", borderRadius: 7, padding: "6px 11px", fontSize: 12.5, fontWeight: 600, cursor: decidingGuid === r.guid ? "default" : "pointer", opacity: decidingGuid === r.guid ? 0.6 : 1 }}
                        >
                          {decidingGuid === r.guid ? <Loader2 size={12} className="spin" /> : <CheckCircle2 size={12} />} Approve
                        </button>
                        <button
                          data-access="approve" onClick={() => decide(r, "Rejected")}
                          disabled={decidingGuid === r.guid}
                          style={{ display: "inline-flex", alignItems: "center", gap: 6, background: COLORS.dangerSoft, color: COLORS.danger, border: "none", borderRadius: 7, padding: "6px 11px", fontSize: 12.5, fontWeight: 600, cursor: decidingGuid === r.guid ? "default" : "pointer", opacity: decidingGuid === r.guid ? 0.6 : 1 }}
                        >
                          <X size={12} /> Reject
                        </button>
                      </div>
                    ) : <span style={{ fontSize: 12.5, color: COLORS.textMuted }}>{r.status}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {toast && (
        <div style={{ position: "absolute", bottom: 22, left: "50%", transform: "translateX(-50%)", background: COLORS.text, color: "#fff", padding: "10px 18px", borderRadius: 9, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 12px 30px rgba(0,0,0,0.2)" }}>
          <CheckCircle2 size={15} color={COLORS.success} /> {toast}
        </div>
      )}
    </div>
  );
}