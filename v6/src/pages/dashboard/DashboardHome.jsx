import { useState, useEffect } from "react";
import {
  Building2,
  Handshake,
  Briefcase,
  Receipt,
  Loader2,
  Users2,
  FolderKanban,
  ClipboardCheck,
  FileCheck,
  ScrollText,
  ShieldCheck,
  Crown,
  UserRound,
  Gauge,
  Clock,
  Activity,
  PieChart as PieIcon,
  CalendarClock,
  Lock,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LabelList,
} from "recharts";
import {
  callClientFlow, callDealStatusFlow, callDepartmentFlow, callPipelineProjectFlow, callProjectFlow, callUserFlow,
  callProjectApprovalFlow, callApprovalStatusFlow, callProjectDocumentFlow, callAuditLogFlow, callProjectResourceFlow, callProjectStatusFlow,
} from "../../api/flows";
import { getCurrentUserId } from "../../utils/session";
import { LS_LINK_INVOICES } from "../../constants/storage-keys";
import { CHART_PALETTE, COLORS, cardStyle } from "../../constants/theme";
import { formatINR, parseCurrency } from "../../utils/format";
// Invoice has no SQL flow case yet (unlike Timesheet/ProjectApproval/
// ProjectDocument/AuditLog below) — Flow1 was never extended with an
// "Invoice" entity case, so this one module is still seed-backed until
// that flow work happens. Tracked as a known gap, not an oversight.
import { seedLinkInvoices } from "../../utils/seed";
import { lsGet } from "../../utils/storage";
import { usePermissions } from "../../context/PermissionContext";

// Same "resolve by name, don't hardcode the id" approach as
// ProjectApprovalPage — see that file for the full rationale.
function findStatusId(statuses, pattern) {
  const hit = statuses.find((s) => pattern.test(s.name || ""));
  return hit ? Number(hit.guid) : null;
}

// Dashboard scope is decided by the user's DESIGNATION (Users.JobTitle, picked from the
// Designation master on the Employee Details screen). Names must match the Designation
// master exactly (case-insensitive). Anything not listed = Employee view.
const DESIGNATION_SCOPE = {
  admin: ["Admin", "Finance Manager"],
  manager: ["Project Manager", "Delivery Head"],
};
const inList = (list, name) => list.some((x) => x.toLowerCase() === String(name || "").trim().toLowerCase());


// Blurred sample chart + overlay, shown when a visual has no data for this user.
const SAMPLE_BARS = [{ n: "A", v: 70 }, { n: "B", v: 45 }, { n: "C", v: 90 }, { n: "D", v: 30 }, { n: "E", v: 60 }, { n: "F", v: 80 }];
const SAMPLE_PIE = [{ n: "A", v: 45 }, { n: "B", v: 30 }, { n: "C", v: 25 }];
function NoDataVisual({ kind = "bar", height = 230, restricted, text }) {
  return (
    <div style={{ position: "relative", height, borderRadius: 10, overflow: "hidden" }}>
      <div aria-hidden style={{ position: "absolute", inset: 0, filter: "blur(5px)", opacity: 0.55, pointerEvents: "none" }}>
        <ResponsiveContainer width="100%" height="100%">
          {kind === "pie" ? (
            <PieChart>
              <Pie data={SAMPLE_PIE} dataKey="v" nameKey="n" innerRadius="45%" outerRadius="75%" isAnimationActive={false}>
                {SAMPLE_PIE.map((d, i) => <Cell key={d.n} fill={CHART_PALETTE[i]} />)}
              </Pie>
            </PieChart>
          ) : (
            <BarChart data={SAMPLE_BARS} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
              <Bar dataKey="v" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                {SAMPLE_BARS.map((d, i) => <Cell key={d.n} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />)}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "14px 18px", borderRadius: 12, background: "rgba(255,255,255,.88)", border: `1px solid ${COLORS.border}`, boxShadow: "0 8px 24px rgba(15,23,48,.12)", textAlign: "center", maxWidth: 260 }}>
          <span style={{ width: 34, height: 34, borderRadius: "50%", background: restricted ? "#EDE9FE" : COLORS.accentSoft, color: restricted ? "#7C3AED" : COLORS.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Lock size={16} />
          </span>
          <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.text }}>{restricted ? "Data restricted" : "No data yet"}</div>
          <div style={{ fontSize: 12, color: COLORS.textMuted, lineHeight: 1.4 }}>{text}</div>
        </div>
      </div>
    </div>
  );
}

export const cardTitle = { display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, fontWeight: 700, color: COLORS.text, marginBottom: 12 };

export const linkBtn = { background: "none", border: "none", color: COLORS.accent, fontSize: 12.5, fontWeight: 600, cursor: "pointer" };

export function DashboardHome({ onOpenModule, user }) {
  const { canOpen, isAdmin } = usePermissions();
  const myId = String(getCurrentUserId() || "");
  const [loading, setLoading] = useState(true);
  const [allDepartments, setDepartments] = useState([]);
  const [allUsers, setUsers] = useState([]);
  const [allClients, setClients] = useState([]);
  const [allProjects, setProjects] = useState([]);
  const [allPipeline, setPipeline] = useState([]);
  const [dealStatuses, setDealStatuses] = useState([]);
  const [allApprovals, setApprovals] = useState([]);
  const [allInvoices, setInvoices] = useState([]);
  const [allDocuments, setDocuments] = useState([]);
  const [allAuditLog, setAuditLog] = useState([]);

  const [approvalStatuses, setApprovalStatuses] = useState([]);
  const [allResources, setResources] = useState([]);
  const [projectStatuses, setProjectStatuses] = useState([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    // Split into two batches instead of one 10-wide Promise.all. All 10 calls
    // share the same SQL connection (shared_sql-3) across FLOW_URL and
    // NEW_FLOW_URL, and firing them all at once — on top of warmFlowCache's
    // own 17 calls already in flight from AppShell — saturates that
    // connection's concurrency limit. The 3 NEW_FLOW_URL calls (ProjectApproval,
    // ProjectDocument, AuditLog) consistently lost that
    // race and came back 502 NoResponse. Running them only after the first
    // batch settles keeps total in-flight calls low enough to avoid that.
    Promise.all([
      callDepartmentFlow("LIST"), callUserFlow("LIST"), callClientFlow("LIST"), callProjectFlow("LIST"),
      callPipelineProjectFlow("LIST"), callDealStatusFlow("LIST"), callApprovalStatusFlow("LIST"),
      callProjectResourceFlow("LIST"), callProjectStatusFlow("LIST"),
    ])
      .then(([dept, usr, cli, proj, pipe, deals, apprStatus, res, pstat]) => {
        if (cancelled) return;
        setDepartments(dept.data);
        setUsers(usr.data);
        setClients(cli.data);
        setProjects(proj.data);
        setPipeline(pipe.data);
        setDealStatuses(deals.data);
        setApprovalStatuses(apprStatus.data);
        setResources(res.data);
        setProjectStatuses(pstat.data);

        return Promise.all([
          callProjectApprovalFlow("LIST"),
          callProjectDocumentFlow("LIST"), callAuditLogFlow("LIST"),
        ]);
      })
      .then((flow2Results) => {
        if (cancelled || !flow2Results) return;
        const [appr, docs, audit] = flow2Results;
        setApprovals(appr.data);
        setDocuments(docs.data);
        setAuditLog(audit.data);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });

    // Invoice has no SQL flow case yet — see the import comment above.
    setInvoices(lsGet(LS_LINK_INVOICES, null) || seedLinkInvoices());

    return () => { cancelled = true; };
  }, []);

  // ================= USER SCOPE =================
  // Role comes from the user's Designation (see DESIGNATION_SCOPE at the top).
  // Admin    -> everything.
  // Manager  -> projects where they are PM / Delivery Head or allocated, plus every
  //             resource on the projects they manage (their team).
  // Employee -> only the projects they are allocated to, and only themselves.
  const sameId = (a) => String(a ?? "") === myId && myId !== "";
  const me = allUsers.find((u) => sameId(u.id ?? u.guid));
  const pid = (p) => String(p.guid ?? p.id);
  const ledIds = new Set(allProjects.filter((p) => sameId(p.projectManagerUserId) || sameId(p.deliveryHeadUserId)).map(pid));
  const myAlloc = allResources.filter((r) => sameId(r.userId));
  const designation = (me?.jobTitle || "").trim();
  const role = isAdmin || inList(DESIGNATION_SCOPE.admin, designation) ? "admin" : inList(DESIGNATION_SCOPE.manager, designation) ? "manager" : "employee";
  const roleLabel = role === "admin" ? "Administrator" : role === "manager" ? "Manager" : "Employee";

  const myProjectIds = role === "admin" ? null : new Set([...ledIds, ...myAlloc.map((r) => String(r.projectId))]);
  const inMine = (projectId) => !myProjectIds || myProjectIds.has(String(projectId));
  const projects = allProjects.filter((p) => inMine(pid(p)));
  const myProjectNames = new Set(projects.map((p) => (p.projectName || "").toLowerCase()));

  const teamIds = role === "admin" ? null : new Set([
    myId,
    ...(role === "manager" ? allResources.filter((r) => ledIds.has(String(r.projectId))).map((r) => String(r.userId)) : []),
  ]);
  const users = teamIds ? allUsers.filter((u) => teamIds.has(String(u.id ?? u.guid))) : allUsers;
  const departments = role === "admin" ? allDepartments : allDepartments.filter((d) => users.some((u) => String(u.departmentId) === String(d.guid ?? d.id)));
  const clients = role === "admin" ? allClients : allClients.filter((c) => projects.some((p) => String(p.clientId) === String(c.guid ?? c.id)));
  const pipeline = role === "admin" ? allPipeline : allPipeline.filter((d) => [d.ownerUserId, d.projectManagerUserId, d.deliveryHeadUserId].some(sameId) || (d.convertedToProjectId && inMine(d.convertedToProjectId)));
  const approvals = allApprovals.filter((a) => inMine(a.projectId));
  const documents = allDocuments.filter((d) => inMine(d.projectId));
  const invoices = role === "admin" ? allInvoices : allInvoices.filter((i) => myProjectNames.has(String(i.projectName || "").toLowerCase()));
  const myName = (user || "").toLowerCase();
  const auditLog = role === "admin" ? allAuditLog : allAuditLog.filter((r) => String(r.user || "").toLowerCase() === myName || myProjectNames.has(String(r.record || "").toLowerCase()));

  const myPct = myAlloc.reduce((s, r) => s + Number(r.allocationPct || 0), 0);
  const myHrs = myAlloc.reduce((s, r) => s + Number(r.weeklyHours || 0), 0);
  const scopeText = role === "admin" ? "Showing all organisation data" : role === "manager" ? "Showing your projects and your project team" : "Showing only your projects and your information";

  // --- SQL-backed metrics ---
  const activeDepartments = departments.filter((d) => d.active).length;
  const activeProjects = projects.filter((p) => p.active).length;
  const activeUsers = users.filter((u) => u.active).length;
  const activeClients = clients.filter((c) => c.active).length;

  // --- Local-module metrics ---
  const dealStatusName = (id) => dealStatuses.find((d) => String(d.id) === String(id))?.name || "";
  const openPipeline = pipeline.filter((p) => {
    const s = dealStatusName(p.dealStatusId);
    return s !== "Won" && s !== "Lost";
  });
  const pipelineValue = openPipeline.reduce((s, p) => s + Number(p.dealValue || 0), 0);
  const wonValue = pipeline.filter((p) => dealStatusName(p.dealStatusId) === "Won").reduce((s, p) => s + Number(p.dealValue || 0), 0);

  // A project counts as "decided" once it has a ProjectApproval row whose
  // status resolves to Approved or Rejected in the real master data — same
  // logic as ProjectApprovalPage (no persisted "Pending" row; absence of a
  // decision IS pending).
  const approvedStatusId = findStatusId(approvalStatuses, /approv/i);
  const rejectedStatusId = findStatusId(approvalStatuses, /reject/i);
  const decidedProjectIds = new Set(
    approvals
      .filter((a) => (approvedStatusId != null && String(a.approvalStatusId) === String(approvedStatusId))
        || (rejectedStatusId != null && String(a.approvalStatusId) === String(rejectedStatusId)))
      .map((a) => String(a.projectId))
  );
  const pendingProjectApprovals = projects.filter((p) => !decidedProjectIds.has(pid(p))).length;
  const totalPendingApprovals = pendingProjectApprovals;

  const unlinkedInvoices = invoices.filter((i) => i.status === "Unlinked");
  const totalInvoiceValue = invoices.reduce((s, i) => s + parseCurrency(i.amount), 0);

  const kpisRow1 = role === "admin" ? [
    { label: "Active Departments", value: String(activeDepartments), icon: Building2, color: "#3B6FE0" },
    { label: "Open Projects", value: String(activeProjects), icon: FolderKanban, color: "#22A06B" },
    { label: "Active Users", value: String(activeUsers), icon: Users2, color: "#8B5CF6" },
    { label: "Active Clients", value: String(activeClients), icon: Briefcase, color: "#EAB308" },
  ] : role === "manager" ? [
    { label: "Projects I Lead", value: String(ledIds.size), icon: Crown, color: "#7C3AED" },
    { label: "My Open Projects", value: String(activeProjects), icon: FolderKanban, color: "#22A06B" },
    { label: "My Team Members", value: String(users.filter((u) => u.active && !sameId(u.id ?? u.guid)).length), icon: Users2, color: "#8B5CF6" },
    { label: "My Clients", value: String(activeClients), icon: Briefcase, color: "#EAB308" },
  ] : [
    { label: "My Projects", value: String(projects.length), icon: FolderKanban, color: "#22A06B" },
    { label: "My Allocation", value: `${myPct}%`, icon: Gauge, color: myPct > 100 ? "#D6483E" : "#3B6FE0" },
    { label: "My Weekly Hours", value: String(myHrs), icon: Clock, color: "#0EA5A4" },
    { label: "My Clients", value: String(activeClients), icon: Briefcase, color: "#EAB308" },
  ];

  const kpisRow2 = [
    { label: "Open Pipeline Value", value: formatINR(pipelineValue), icon: Handshake, color: "#8B5CF6", sub: `${openPipeline.length} active deals` },
    { label: "Pending Approvals", value: String(totalPendingApprovals), icon: ClipboardCheck, color: "#F59E0B", sub: `${pendingProjectApprovals} projects` },
    { label: "Unlinked Invoices", value: String(unlinkedInvoices.length), icon: Receipt, color: "#D6483E", sub: `${formatINR(totalInvoiceValue)} total tracked` },
    { label: "Documents on File", value: String(documents.length), icon: FileCheck, color: "#0EA5A4", sub: `${projects.length || pipeline.length} projects covered` },
  ];

  // --- Chart data (all scoped to the signed-in user's view) ---
  const resources = allResources.filter((r) => inMine(r.projectId) && (role !== "employee" || sameId(r.userId)));
  const userName = (id) => {
    const u = allUsers.find((x) => String(x.id ?? x.guid) === String(id));
    return u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() || `User ${id}` : `User ${id}`;
  };
  const shortName = (n) => { const p = String(n).trim().split(/\s+/).filter(Boolean); return p.length > 1 ? `${p[0]} ${p[1][0]}.` : p[0] || ""; };

  // 1. Project status mix
  const statusName = (id) => projectStatuses.find((x) => String(x.id ?? x.guid) === String(id))?.name || "Not set";
  const statusCounts = {};
  projects.forEach((p) => { const n = statusName(p.projectStatusId); statusCounts[n] = (statusCounts[n] || 0) + 1; });
  const projectStatusMix = Object.entries(statusCounts).map(([name, value], i) => ({ name, value, color: CHART_PALETTE[i % CHART_PALETTE.length] })).sort((a, b) => b.value - a.value);

  // 2. Resource utilization (top 10 by total allocation)
  const utilMap = {};
  resources.forEach((r) => { utilMap[r.userId] = (utilMap[r.userId] || 0) + Number(r.allocationPct || 0); });
  const utilization = Object.entries(utilMap)
    .map(([id, pct]) => ({ name: shortName(userName(id)), full: userName(id), pct }))
    .sort((a, b) => b.pct - a.pct).slice(0, 10);
  const utilColor = (v) => (v > 100 ? "#D6483E" : v >= 80 ? "#22A06B" : v >= 50 ? "#0EA5A4" : "#F59E0B");

  // 3. Billable vs non-billable effort (FTE)
  const billFte = resources.filter((r) => r.billable).reduce((a, r) => a + Number(r.allocationPct || 0) / 100, 0);
  const nonFte = resources.filter((r) => !r.billable).reduce((a, r) => a + Number(r.allocationPct || 0) / 100, 0);
  const billableSplit = [
    { name: "Billable", value: +billFte.toFixed(2), color: "#3B6FE0" },
    { name: "Non-billable", value: +nonFte.toFixed(2), color: "#F59E0B" },
  ].filter((d) => d.value > 0);

  // 4. Pipeline by stage (count + value)
  const stageCounts = {};
  pipeline.forEach((p) => {
    const st = dealStatusName(p.dealStatusId) || "Unspecified";
    const e = (stageCounts[st] ||= { name: st, value: 0, amount: 0 });
    e.value += 1; e.amount += Number(p.dealValue || 0);
  });
  const pipelineByStage = Object.values(stageCounts).sort((a, b) => b.value - a.value);

  // 5. Audit activity — last 14 days by action
  const DAYS = 14;
  const dayKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
  const actionBucket = (a) => (/create/i.test(a) ? "Create" : /delete/i.test(a) ? "Delete" : /approve|reject/i.test(a) ? "Approval" : "Update");
  const auditTrend = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (DAYS - 1 - i));
    return { key: dayKey(d), name: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }), Create: 0, Update: 0, Delete: 0, Approval: 0 };
  });
  const trendIdx = Object.fromEntries(auditTrend.map((d, i) => [d.key, i]));
  auditLog.forEach((r) => {
    if (!r.timestamp) return;
    const i = trendIdx[dayKey(r.timestamp)];
    if (i !== undefined) auditTrend[i][actionBucket(r.action)] += 1;
  });
  const auditTotal = auditTrend.reduce((a, d) => a + d.Create + d.Update + d.Delete + d.Approval, 0);

  // 6. Deadlines — active projects ending in the next 30 days
  const todayMs = new Date().setHours(0, 0, 0, 0);
  const endingSoon = projects
    .filter((p) => p.active && p.endDate)
    .map((p) => ({ p, days: Math.round((new Date(`${String(p.endDate).slice(0, 10)}T00:00:00`) - todayMs) / 86400000) }))
    .filter((x) => x.days >= 0 && x.days <= 30)
    .sort((a, b) => a.days - b.days);

  // --- Recent activity (audit log) ---
  const recentActivity = [...auditLog]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 7);

  const actionColor = (action) => {
    if (action === "Delete" || action === "Reject") return COLORS.danger;
    if (action === "Create" || action === "Approve") return COLORS.success;
    return COLORS.accent;
  };

  const timeAgo = (ts) => {
    const diffMs = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div style={{ overflowY: "auto", flex: 1 }}>
      <div className="pp-dash-head">
        <div className="pp-dash-row">
          <div className="pp-dash-avatar">{(user || "A")[0].toUpperCase()}</div>
          <div>
            <div className="pp-dash-title">Welcome back, {me ? `${me.firstName || ""} ${me.lastName || ""}`.trim() || user : user || "there"} 👋</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 800, color: "#fff", letterSpacing: ".02em", background: role === "admin" ? "linear-gradient(135deg, #E11D48, #F97316)" : role === "manager" ? "linear-gradient(135deg, #7C3AED, #C026D3)" : "linear-gradient(135deg, #3B6FE0, #0EA5A4)", boxShadow: "0 4px 12px rgba(0,0,0,.25)", border: "1px solid rgba(255,255,255,.35)" }}>
                {role === "admin" ? <ShieldCheck size={13} /> : role === "manager" ? <Crown size={13} /> : <UserRound size={13} />} {roleLabel}
              </span>
              {designation && (
                <span title="Designation" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, color: "#fff", background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.28)" }}>
                  <Briefcase size={13} /> {designation}
                </span>
              )}
            </div>
            <div className="pp-dash-sub">{scopeText}.</div>
          </div>
        </div>
      </div>

      <div className="pp-dash-body">
      <div className="pp-statpanel">
      {/* KPI ROW 1 — SQL master data */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 14 }}>
        {kpisRow1.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} style={cardStyle}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ color: COLORS.textMuted, fontSize: 12.5, fontWeight: 600 }}>{k.label}</span>
                <span style={{ width: 30, height: 30, borderRadius: 8, background: `${k.color}1F`, color: k.color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon size={15} />
                </span>
              </div>
              <div style={{ fontFamily: "Sora, sans-serif", fontSize: 26, fontWeight: 700, color: COLORS.text, marginTop: 10 }}>
                {loading ? <Loader2 size={20} className="spin" /> : k.value}
              </div>
            </div>
          );
        })}
      </div>

      {/* KPI ROW 2 — Finance / Transaction rollups */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 22 }}>
        {kpisRow2.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} style={cardStyle}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ color: COLORS.textMuted, fontSize: 12.5, fontWeight: 600 }}>{k.label}</span>
                <span style={{ width: 30, height: 30, borderRadius: 8, background: `${k.color}1F`, color: k.color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon size={15} />
                </span>
              </div>
              <div style={{ fontFamily: "Sora, sans-serif", fontSize: 22, fontWeight: 700, color: COLORS.text, marginTop: 10 }}>{k.value}</div>
              <div style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 3 }}>{k.sub}</div>
            </div>
          );
        })}
      </div>
      </div>

      {/* CHARTS — row A */}
      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.2fr", gap: 14, marginBottom: 14 }}>
          <div style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={cardTitle}><PieIcon size={14} /> Project Status Mix</div>
              {canOpen("project-dashboard") && <button onClick={() => onOpenModule("project-dashboard")} style={linkBtn}>View →</button>}
            </div>
            {projectStatusMix.length === 0 ? (
              <NoDataVisual kind="pie" restricted={role !== "admin"} text={role !== "admin" ? "No projects fall within your access." : "No projects have been created yet."} />
            ) : (
              <ResponsiveContainer width="100%" height={230}>
                <PieChart>
                  <Pie data={projectStatusMix} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={3} label={({ value }) => value} labelLine={false}>
                    {projectStatusMix.map((s) => <Cell key={s.name} fill={s.color} />)}
                  </Pie>
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div style={cardStyle}>
            <div style={cardTitle}><Gauge size={14} /> Billable vs Non-billable Effort</div>
            {billableSplit.length === 0 ? (
              <NoDataVisual kind="pie" restricted={role !== "admin"} text={role !== "admin" ? "No allocations within your access." : "No allocations yet."} />
            ) : (
              <ResponsiveContainer width="100%" height={230}>
                <PieChart>
                  <Pie data={billableSplit} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={3} label={({ value }) => `${value} FTE`} labelLine={false}>
                    {billableSplit.map((s) => <Cell key={s.name} fill={s.color} />)}
                  </Pie>
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => `${v} FTE`} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={cardTitle}><Handshake size={14} /> Pipeline by Stage</div>
              {canOpen("pipeline-project") && <button onClick={() => onOpenModule("pipeline-project")} style={linkBtn}>View →</button>}
            </div>
            {pipelineByStage.length === 0 ? (
              <NoDataVisual restricted={role !== "admin"} text={role !== "admin" ? "No pipeline deals are linked to you." : "No pipeline deals yet."} />
            ) : (
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={pipelineByStage} layout="vertical" margin={{ right: 30 }}>
                  <CartesianGrid stroke={COLORS.border} horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: COLORS.textMuted }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: COLORS.textMuted }} axisLine={false} tickLine={false} width={90} />
                  <Tooltip cursor={false} formatter={(v, n, p) => [`${v} deals · ${formatINR(p.payload.amount)}`, "Pipeline"]} />
                  <Bar dataKey="value" fill="#8B5CF6" radius={[0, 6, 6, 0]} activeBar={false}>
                    <LabelList dataKey="value" position="right" style={{ fontSize: 11.5, fontWeight: 700, fill: COLORS.text }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* CHARTS — row B */}
      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 14, marginBottom: 14 }}>
          <div style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={cardTitle}><Users2 size={14} /> Resource Utilization {role === "employee" ? "" : "(Top 10)"}</div>
              {canOpen("report-analysis") && <button onClick={() => onOpenModule("report-analysis")} style={linkBtn}>Full report →</button>}
            </div>
            {utilization.length === 0 ? (
              <NoDataVisual height={260} restricted={role !== "admin"} text={role !== "admin" ? "No allocations within your access." : "No allocations yet."} />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={utilization} margin={{ top: 20, right: 10, left: -10, bottom: 20 }}>
                  <CartesianGrid stroke={COLORS.border} vertical={false} />
                  <XAxis dataKey="name" interval={0} angle={-25} textAnchor="end" height={45} tick={{ fontSize: 11, fill: COLORS.textMuted }} axisLine={false} tickLine={false} />
                  <YAxis unit="%" domain={[0, (max) => Math.max(100, Math.ceil(max / 25) * 25)]} tick={{ fontSize: 11, fill: COLORS.textMuted }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={false} labelFormatter={(_, p) => p?.[0]?.payload?.full || ""} formatter={(v) => [`${v}%`, "Allocation"]} />
                  <Bar dataKey="pct" radius={[6, 6, 0, 0]} maxBarSize={36} activeBar={false}>
                    {utilization.map((u) => <Cell key={u.full} fill={utilColor(u.pct)} />)}
                    <LabelList dataKey="pct" position="top" formatter={(v) => `${v}%`} style={{ fontSize: 11.5, fontWeight: 700, fill: COLORS.text }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={cardTitle}><Activity size={14} /> Audit Activity · Last 14 Days</div>
              <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.textMuted }}>{auditTotal} events</span>
            </div>
            {auditTotal === 0 ? (
              <NoDataVisual height={260} restricted={role !== "admin"} text={role !== "admin" ? "No activity on your projects in the last 14 days." : "No activity in the last 14 days."} />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={auditTrend} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <CartesianGrid stroke={COLORS.border} vertical={false} />
                  <XAxis dataKey="name" interval={1} angle={-25} textAnchor="end" height={45} tick={{ fontSize: 10.5, fill: COLORS.textMuted }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: COLORS.textMuted }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={false} />
                  <Legend iconType="circle" verticalAlign="top" height={26} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Create" stackId="a" fill="#22A06B" activeBar={false} />
                  <Bar dataKey="Update" stackId="a" fill="#3B6FE0" activeBar={false} />
                  <Bar dataKey="Approval" stackId="a" fill="#8B5CF6" activeBar={false} />
                  <Bar dataKey="Delete" stackId="a" fill="#D6483E" radius={[4, 4, 0, 0]} activeBar={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* LOWER ROW — Recent Activity + Action Center */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }}>
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={cardTitle}><ScrollText size={14} /> Recent Activity</div>
            {canOpen("audit-log") && <button onClick={() => onOpenModule("audit-log")} style={linkBtn}>View full log →</button>}
          </div>
          {recentActivity.length === 0 ? (
            <div style={{ padding: 30, textAlign: "center", color: COLORS.textMuted, fontSize: 13 }}>No activity recorded yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {recentActivity.map((r) => (
                <div key={r.guid} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 4px", borderBottom: `1px solid ${COLORS.border}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: actionColor(r.action), width: 60, flexShrink: 0 }}>{r.action}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: COLORS.text, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 320 }}>{r.record}</div>
                      <div style={{ fontSize: 11.5, color: COLORS.textMuted }}>{r.screen} · {r.user}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 11.5, color: COLORS.textMuted, flexShrink: 0 }}>{timeAgo(r.timestamp)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={cardTitle}><ClipboardCheck size={14} /> Needs Your Attention</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div
                onClick={() => canOpen("project-approval") && onOpenModule("project-approval")}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: COLORS.bg, borderRadius: 9, cursor: canOpen("project-approval") ? "pointer" : "default" }}
              >
                <span style={{ fontSize: 13, color: COLORS.text, fontWeight: 600 }}>Project approvals pending</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#F59E0B" }}>{pendingProjectApprovals}</span>
              </div>
              <div
                onClick={() => canOpen("link-invoice") && onOpenModule("link-invoice")}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: COLORS.bg, borderRadius: 9, cursor: canOpen("link-invoice") ? "pointer" : "default" }}
              >
                <span style={{ fontSize: 13, color: COLORS.text, fontWeight: 600 }}>Invoices to link</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.danger }}>{unlinkedInvoices.length}</span>
              </div>
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ ...cardTitle, marginBottom: 0 }}><CalendarClock size={14} /> Ending in 30 Days</div>
              <span style={{ fontSize: 12, fontWeight: 800, color: endingSoon.length ? "#D98A0B" : COLORS.textMuted }}>{endingSoon.length}</span>
            </div>
            {endingSoon.length === 0 ? (
              <div style={{ fontSize: 12.5, color: COLORS.textMuted, padding: "6px 0" }}>No active projects ending soon.</div>
            ) : endingSoon.slice(0, 5).map(({ p, days }) => (
              <div key={pid(p)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", marginTop: 6, background: COLORS.bg, borderRadius: 9 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{p.projectName}</span>
                <span style={{ fontSize: 11.5, fontWeight: 800, color: days <= 7 ? COLORS.danger : "#D98A0B", flexShrink: 0, marginLeft: 8 }}>{days === 0 ? "Today" : `${days}d left`}</span>
              </div>
            ))}
          </div>

          <div style={cardStyle}>
            <div style={cardTitle}><Handshake size={14} /> Pipeline Summary</div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12.5, color: COLORS.textMuted }}>Open value</span>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: COLORS.text }}>{formatINR(pipelineValue)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12.5, color: COLORS.textMuted }}>Won value</span>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: COLORS.success }}>{formatINR(wonValue)}</span>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
