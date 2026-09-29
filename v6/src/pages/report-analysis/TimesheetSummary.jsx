import { Fragment, useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, PieChart, Pie, Cell, LabelList,
} from "recharts";
import {
  Clock, BadgeCheck, Users2, Receipt, FileCheck2, FileWarning, CheckCircle2, Hourglass, FilterX, Download, Info,
} from "lucide-react";
import { COLORS, inputStyle, labelStyle } from "../../constants/theme";
import { card, ymd, fmtDate, Panel, Kpi, Empty, Badge, MultiSelect, downloadExcelCsv } from "./reportUi";

// Timesheet Summary is built from BILLING, exactly like the Billing screen:
//   • one Billing row = one Project + Billing Period (+ approval status)
//   • hours per resource = ProjectResource.weeklyHours (the "Billable Hours" the
//     Billing form shows for each resource on that project)
//   • timesheet file = ProjectDocument with docType "Timesheet Approval" and
//     docName "Timesheet_<userId>_<periodId>" (same convention as billingFormPanel)
const tsDocName = (userId, periodId) => `Timesheet_${userId}_${periodId || "NA"}`;

const MULTI = ["period", "project", "client", "employee", "pm", "status"];
const LABELS = { period: "Billing Period", project: "Project", client: "Client", employee: "Employee", pm: "Project Manager", status: "Billing Status" };
const ALL_TEXT = { period: "All periods", project: "All projects", client: "All clients", employee: "All employees", pm: "All managers", status: "All statuses" };
const EMPTY = { from: "", to: "", billable: "all", sheet: "all", ...Object.fromEntries(MULTI.map((k) => [k, []])) };
const PALETTE = ["#3B6FE0", "#8B5CF6", "#0EA5A4", "#F59E0B", "#22A06B", "#E11D48", "#EAB308", "#06B6D4"];
const short = (n) => { const p = String(n || "").trim().split(/\s+/).filter(Boolean); return p.length > 1 ? `${p[0]} ${p[1][0]}.` : p[0] || ""; };
const statusColor = (n = "") => (/approv/i.test(n) ? COLORS.success : /reject/i.test(n) ? COLORS.danger : /pending|submit|await/i.test(n) ? COLORS.warning : "#6B7280");
const isApproved = (n = "") => /approv/i.test(n) && !/await|pending|not/i.test(n);

function Seg({ label, value, onChange, items }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: "flex", background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 3, gap: 2 }}>
        {items.map((i) => {
          const on = value === i.key;
          return (
            <button key={i.key} type="button" onClick={() => onChange(i.key)} style={{ flex: 1, border: "none", borderRadius: 8, padding: "8px 6px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", background: on ? "#fff" : "transparent", color: on ? COLORS.accent : COLORS.textMuted, boxShadow: on ? "0 1px 3px rgba(15,23,48,.12)" : "none" }}>{i.label}</button>
          );
        })}
      </div>
    </div>
  );
}

export function TimesheetSummary({ projects, resources, lookups, designations = [], billings = [], billingPeriods = [], documents = [] }) {
  const [f, setF] = useState(EMPTY);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const activeCount = MULTI.filter((m) => f[m].length).length + ["from", "to"].filter((k) => f[k]).length + (f.billable !== "all") + (f.sheet !== "all");

  // ---------- Build one row per Billing × resource on that project ----------
  const rows = useMemo(() => {
    const find = (list, id) => (list || []).find((x) => String(x.guid ?? x.id) === String(id));
    const uName = (id) => { const u = find(lookups.users, id); return u?.name || (u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() : "") || (id ? `User ${id}` : "—"); };
    const docs = new Set(documents.filter((d) => d.docType === "Timesheet Approval").map((d) => `${d.projectId}|${d.docName}`));
    const resByProject = {};
    resources.forEach((r) => { (resByProject[String(r.projectId)] ||= []).push(r); });

    const out = [];
    billings.filter((b) => b.active !== false && b.projectId).forEach((b) => {
      const p = find(projects, b.projectId) || {};
      const per = find(billingPeriods, b.billingPeriodId) || {};
      const statusName = find(lookups.approvalStatuses, b.approvalStatusId)?.name || "Not set";
      (resByProject[String(b.projectId)] || []).forEach((r) => {
        out.push({
          key: `${b.guid ?? b.id}-${r.id}`,
          billingId: String(b.guid ?? b.id),
          periodId: String(b.billingPeriodId || ""),
          periodName: per.periodName || (b.billingPeriodId ? `Period ${b.billingPeriodId}` : "No period"),
          periodStart: ymd(per.periodStartDate), periodEnd: ymd(per.periodEndDate),
          projectId: String(b.projectId), projectName: p.projectName || `Project ${b.projectId}`, projectCode: p.projectCode || "",
          clientId: String(p.clientId ?? ""), clientName: find(lookups.clients, p.clientId)?.name || "—",
          pmId: String(p.projectManagerUserId ?? ""), pmName: p.projectManagerUserId ? uName(p.projectManagerUserId) : "—",
          statusId: String(b.approvalStatusId || ""), statusName,
          userId: String(r.userId), employee: uName(r.userId),
          designation: find(designations, r.designationId)?.name || "—",
          pct: Number(r.allocationPct) || 0, hours: Number(r.weeklyHours) || 0, billable: !!r.billable,
          uploaded: docs.has(`${b.projectId}|${tsDocName(r.userId, b.billingPeriodId)}`),
        });
      });
    });
    return out;
  }, [billings, billingPeriods, projects, resources, documents, designations, lookups]);

  const opts = useMemo(() => {
    const list = (pairs) => [...new Map(pairs.filter(([id, n]) => id && n && n !== "—").map(([id, n]) => [String(id), { id: String(id), name: n }])).values()].sort((a, b) => a.name.localeCompare(b.name));
    return {
      period: list(rows.map((r) => [r.periodId, r.periodName])),
      project: list(rows.map((r) => [r.projectId, r.projectName])),
      client: list(rows.map((r) => [r.clientId, r.clientName])),
      employee: list(rows.map((r) => [r.userId, r.employee])),
      pm: list(rows.map((r) => [r.pmId, r.pmName])),
      status: list(rows.map((r) => [r.statusId || "none", r.statusName])),
    };
  }, [rows]);

  const filtered = useMemo(() => rows.filter((r) => {
    const has = (arr, v) => !arr.length || arr.includes(String(v));
    if (!has(f.period, r.periodId) || !has(f.project, r.projectId) || !has(f.client, r.clientId) || !has(f.employee, r.userId) || !has(f.pm, r.pmId) || !has(f.status, r.statusId || "none")) return false;
    if (f.billable === "billable" && !r.billable) return false;
    if (f.billable === "non" && r.billable) return false;
    if (f.sheet === "uploaded" && !r.uploaded) return false;
    if (f.sheet === "missing" && r.uploaded) return false;
    if (f.from && r.periodEnd && r.periodEnd < f.from) return false;   // period overlaps range
    if (f.to && r.periodStart && r.periodStart > f.to) return false;
    return true;
  }), [rows, f]);

  // ---------- Aggregates ----------
  const d = useMemo(() => {
    const sum = (arr) => arr.reduce((a, r) => a + r.hours, 0);
    const group = (keyFn, nameFn) => {
      const m = {};
      filtered.forEach((r) => {
        const k = keyFn(r);
        const e = (m[k] ||= { key: k, name: nameFn(r), Billable: 0, "Non-billable": 0, total: 0, sort: r.periodStart || r.periodName });
        e[r.billable ? "Billable" : "Non-billable"] += r.hours; e.total += r.hours;
      });
      return Object.values(m);
    };
    const total = sum(filtered);
    const billable = sum(filtered.filter((r) => r.billable));
    const uploaded = filtered.filter((r) => r.uploaded).length;
    const people = new Set(filtered.map((r) => r.userId)).size;
    const statusMap = {};
    filtered.forEach((r) => { statusMap[r.statusName] = (statusMap[r.statusName] || 0) + r.hours; });
    return {
      total, billable, uploaded, missing: filtered.length - uploaded, people,
      billingsCount: new Set(filtered.map((r) => r.billingId)).size,
      approved: sum(filtered.filter((r) => isApproved(r.statusName))),
      avg: people ? total / people : 0,
      compliance: filtered.length ? Math.round((uploaded / filtered.length) * 100) : 0,
      byPeriod: group((r) => r.periodId, (r) => r.periodName).sort((a, b) => String(a.sort).localeCompare(String(b.sort))),
      byEmployee: group((r) => r.userId, (r) => r.employee).sort((a, b) => b.total - a.total).slice(0, 15).map((e) => ({ ...e, short: short(e.name) })),
      byProject: group((r) => r.projectId, (r) => r.projectName).sort((a, b) => b.total - a.total).slice(0, 10),
      byStatus: Object.entries(statusMap).map(([name, value]) => ({ name, value, color: statusColor(name) })).filter((x) => x.value > 0),
    };
  }, [filtered]);

  // ---------- Employee × Period matrix ----------
  const matrix = useMemo(() => {
    const periods = [...new Map(filtered.map((r) => [r.periodId, { id: r.periodId, name: r.periodName, sort: r.periodStart || r.periodName }])).values()].sort((a, b) => String(a.sort).localeCompare(String(b.sort)));
    const emp = {};
    filtered.forEach((r) => {
      const e = (emp[r.userId] ||= { id: r.userId, name: r.employee, cells: {}, missing: {}, total: 0 });
      e.cells[r.periodId] = (e.cells[r.periodId] || 0) + r.hours;
      if (!r.uploaded) e.missing[r.periodId] = true;
      e.total += r.hours;
    });
    const emps = Object.values(emp).sort((a, b) => b.total - a.total);
    const colTotals = Object.fromEntries(periods.map((p) => [p.id, emps.reduce((a, e) => a + (e.cells[p.id] || 0), 0)]));
    return { periods, emps, colTotals };
  }, [filtered]);

  const register = useMemo(() => [...filtered].sort((a, b) => String(b.periodStart || b.periodName).localeCompare(String(a.periodStart || a.periodName)) || a.projectName.localeCompare(b.projectName) || a.employee.localeCompare(b.employee)), [filtered]);

  const exportMatrix = () => downloadExcelCsv("timesheet-hours-matrix.csv", [
    ["Employee", ...matrix.periods.map((p) => p.name), "Total Hours"],
    ...matrix.emps.map((e) => [e.name, ...matrix.periods.map((p) => e.cells[p.id] || 0), e.total]),
    ["Total", ...matrix.periods.map((p) => matrix.colTotals[p.id]), d.total],
  ]);
  const exportRegister = () => downloadExcelCsv("timesheet-register.csv", [
    ["Billing Period", "Period Start", "Period End", "Project Code", "Project", "Client", "Project Manager", "Employee", "Designation", "Allocation %", "Hours", "Billable", "Billing Status", "Timesheet"],
    ...register.map((r) => [r.periodName, r.periodStart, r.periodEnd, r.projectCode, r.projectName, r.clientName, r.pmName, r.employee, r.designation, r.pct, r.hours, r.billable ? "Yes" : "No", r.statusName, r.uploaded ? "Uploaded" : "Missing"]),
  ]);

  const ms = (key) => <MultiSelect label={LABELS[key]} options={opts[key]} value={f[key]} onChange={(v) => set(key, v)} allText={ALL_TEXT[key]} />;
  const exportBtn = { display: "flex", alignItems: "center", gap: 6, background: COLORS.successSoft, color: COLORS.success, border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" };
  const h = (n) => Number(n.toFixed(1)).toLocaleString("en-IN");
  const matrixCols = `minmax(160px, 1.4fr) repeat(${Math.max(matrix.periods.length, 1)}, minmax(0, 1fr)) minmax(80px, 0.8fr)`;
  const REG_COLS = "minmax(110px,1fr) minmax(140px,1.4fr) minmax(130px,1.2fr) minmax(110px,1fr) 70px 70px 100px minmax(110px,1fr) 100px";
  const heat = (v, max) => (v ? `rgba(59,111,224,${Math.min(0.12 + (v / (max || 1)) * 0.75, 0.87)})` : "transparent");
  const cellMax = Math.max(1, ...matrix.emps.flatMap((e) => Object.values(e.cells)));

  if (billings.length === 0) {
    return <div style={{ ...card, padding: 10 }}><Empty text="No billing records yet — timesheet hours come from the Billing screen." /></div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* ---------- Filters ---------- */}
      <div style={{ ...card, padding: 18, position: "relative", zIndex: 5 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "14px 16px", alignItems: "end" }}>
          {ms("period")}
          {ms("project")}
          {ms("client")}
          {ms("employee")}
          {ms("pm")}
          {ms("status")}
          <Seg label="Billable" value={f.billable} onChange={(v) => set("billable", v)} items={[{ key: "all", label: "All" }, { key: "billable", label: "Billable" }, { key: "non", label: "Non-billable" }]} />
          <Seg label="Timesheet File" value={f.sheet} onChange={(v) => set("sheet", v)} items={[{ key: "all", label: "All" }, { key: "uploaded", label: "Uploaded" }, { key: "missing", label: "Missing" }]} />
          <div>
            <label style={labelStyle}>Period between</label>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="date" value={f.from} max={f.to || undefined} onChange={(e) => set("from", e.target.value)} style={{ ...inputStyle, padding: "10px 8px", fontSize: 13 }} />
              <span style={{ color: COLORS.textMuted, fontSize: 12 }}>to</span>
              <input type="date" value={f.to} min={f.from || undefined} onChange={(e) => set("to", e.target.value)} style={{ ...inputStyle, padding: "10px 8px", fontSize: 13 }} />
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: COLORS.textMuted }}>
            <Info size={13} /> Hours = resource Billable Hours on each Billing record (same as the Billing screen).
          </span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 12.5, color: COLORS.textMuted }}>{filtered.length} of {rows.length} timesheet lines</span>
          <button type="button" onClick={() => setF(EMPTY)} disabled={!activeCount} style={{ display: "flex", alignItems: "center", gap: 6, borderRadius: 9, border: `1px solid ${activeCount ? COLORS.accent : COLORS.border}`, background: activeCount ? COLORS.accentSoft : "#fff", color: activeCount ? COLORS.accent : COLORS.textMuted, fontWeight: 700, fontSize: 12.5, padding: "8px 12px", cursor: activeCount ? "pointer" : "default" }}>
            <FilterX size={14} /> Clear all{activeCount ? ` (${activeCount})` : ""}
          </button>
        </div>
      </div>

      {/* ---------- Cards ---------- */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(215px, 1fr))", gap: 14 }}>
        <Kpi icon={Clock} color={COLORS.accent} label="Total Hours" value={h(d.total)} sub={`${filtered.length} timesheet lines`} />
        <Kpi icon={BadgeCheck} color={COLORS.success} label="Billable Hours" value={h(d.billable)} sub={`${d.total ? Math.round((d.billable / d.total) * 100) : 0}% of total`} />
        <Kpi icon={CheckCircle2} color="#22A06B" label="Approved Hours" value={h(d.approved)} sub="Billing approved" />
        <Kpi icon={Hourglass} color={COLORS.warning} label="Awaiting Approval" value={h(d.total - d.approved)} sub="Hours not yet approved" />
        <Kpi icon={Users2} color="#8B5CF6" label="Resources" value={d.people} sub={`Avg ${h(d.avg)} hrs each`} />
        <Kpi icon={Receipt} color="#EAB308" label="Billing Records" value={d.billingsCount} sub="Project × period" />
        <Kpi icon={FileCheck2} color="#0EA5A4" label="Timesheets Uploaded" value={`${d.compliance}%`} sub={`${d.uploaded} of ${filtered.length} lines`} />
        <Kpi icon={FileWarning} color={COLORS.danger} label="Missing Timesheets" value={d.missing} sub="No approved file attached" />
      </div>

      {filtered.length === 0 ? <div style={{ ...card, padding: 10 }}><Empty /></div> : (
        <>
          {/* ---------- Visual row 1 ---------- */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
            <Panel title="Hours by Billing Period" sub="Billable vs non-billable hours per period" style={{ flex: "2 1 520px" }}>
              <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={d.byPeriod} margin={{ top: 24, right: 10, left: -5, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.border} />
                    <XAxis dataKey="name" interval={0} tick={{ fontSize: 11.5, fill: COLORS.textSoft }} />
                    <YAxis tick={{ fontSize: 11.5, fill: COLORS.textSoft }} />
                    <Tooltip cursor={false} formatter={(v) => `${v} hrs`} />
                    <Legend verticalAlign="top" height={28} />
                    <Bar dataKey="Billable" stackId="a" fill={COLORS.accent} maxBarSize={46} activeBar={false} />
                    <Bar dataKey="Non-billable" stackId="a" fill="#F59E0B" radius={[6, 6, 0, 0]} maxBarSize={46} activeBar={false}>
                      <LabelList dataKey="total" position="top" style={{ fill: COLORS.text, fontSize: 12, fontWeight: 800 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel title="Timesheet Compliance" sub="Approved timesheet file attached per resource line" style={{ flex: "1 1 300px" }}>
              <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={[{ name: "Uploaded", value: d.uploaded }, { name: "Missing", value: d.missing }].filter((x) => x.value)} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={2} label={({ value }) => value} labelLine={false}>
                      {[{ name: "Uploaded", value: d.uploaded }, { name: "Missing", value: d.missing }].filter((x) => x.value).map((x) => <Cell key={x.name} fill={x.name === "Uploaded" ? COLORS.success : COLORS.danger} />)}
                    </Pie>
                    <Tooltip />
                    <Legend verticalAlign="bottom" height={30} />
                    <text x="50%" y="46%" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 22, fontWeight: 800, fill: COLORS.text }}>{d.compliance}%</text>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>

          {/* ---------- Visual row 2 ---------- */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
            <Panel title="Hours by Employee" sub="Top 15 · billable vs non-billable" style={{ flex: "2 1 520px" }}>
              <div style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={d.byEmployee} margin={{ top: 24, right: 10, left: -5, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.border} />
                    <XAxis dataKey="short" interval={0} angle={-30} textAnchor="end" height={55} tick={{ fontSize: 11.5, fill: COLORS.textSoft }} />
                    <YAxis tick={{ fontSize: 11.5, fill: COLORS.textSoft }} />
                    <Tooltip cursor={false} labelFormatter={(_, p) => p?.[0]?.payload?.name || ""} formatter={(v) => `${v} hrs`} />
                    <Legend verticalAlign="top" height={28} />
                    <Bar dataKey="Billable" stackId="a" fill={COLORS.accent} maxBarSize={36} activeBar={false} />
                    <Bar dataKey="Non-billable" stackId="a" fill="#F59E0B" radius={[6, 6, 0, 0]} maxBarSize={36} activeBar={false}>
                      <LabelList dataKey="total" position="top" style={{ fill: COLORS.text, fontSize: 11.5, fontWeight: 800 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel title="Hours by Billing Status" sub="Share of hours per approval status" style={{ flex: "1 1 300px" }}>
              <div style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={d.byStatus} dataKey="value" nameKey="name" innerRadius="52%" outerRadius="80%" paddingAngle={2} label={({ value }) => `${value}h`} labelLine={false}>
                      {d.byStatus.map((s, i) => <Cell key={s.name} fill={s.color === "#6B7280" ? PALETTE[i % PALETTE.length] : s.color} />)}
                    </Pie>
                    <Tooltip formatter={(v) => `${v} hrs`} />
                    <Legend verticalAlign="bottom" height={40} wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>

          <Panel title="Hours by Project" sub="Top 10 projects by timesheet hours">
            <div style={{ height: Math.max(240, d.byProject.length * 36 + 50) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={d.byProject} margin={{ top: 0, right: 44, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={COLORS.border} />
                  <XAxis type="number" tick={{ fontSize: 11.5, fill: COLORS.textSoft }} />
                  <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 11.5, fill: COLORS.textSoft }} />
                  <Tooltip cursor={false} formatter={(v) => `${v} hrs`} />
                  <Legend verticalAlign="top" height={28} />
                  <Bar dataKey="Billable" stackId="a" fill={COLORS.accent} maxBarSize={22} activeBar={false} />
                  <Bar dataKey="Non-billable" stackId="a" fill="#F59E0B" radius={[0, 6, 6, 0]} maxBarSize={22} activeBar={false}>
                    <LabelList dataKey="total" position="right" style={{ fill: COLORS.text, fontSize: 11.5, fontWeight: 800 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          {/* ---------- Employee × Period matrix ---------- */}
          <Panel title="Timesheet Hours Matrix" sub="Employee × Billing Period hours with totals" action={<button type="button" onClick={exportMatrix} style={exportBtn}><Download size={13} /> Export Excel</button>}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 20px", padding: "9px 14px", marginBottom: 12, background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 10, fontSize: 12, color: COLORS.textSoft }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}><b style={{ color: COLORS.text }}>Hours</b> low <span style={{ width: 100, height: 10, borderRadius: 999, background: "linear-gradient(90deg, rgba(59,111,224,.12), rgba(59,111,224,.87))" }} /> high</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.danger }} /> Timesheet file missing</span>
            </div>
            <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: matrixCols, width: "100%" }}>
                <div style={{ background: COLORS.navy, color: "#fff", padding: "11px 14px", fontSize: 12, fontWeight: 700 }}>Employee</div>
                {matrix.periods.map((p) => <div key={p.id} title={p.name} style={{ background: COLORS.navy, color: "#fff", padding: "11px 4px", fontSize: 11.5, fontWeight: 700, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>)}
                <div style={{ background: COLORS.navyLift, color: "#fff", padding: "11px 6px", fontSize: 12, fontWeight: 700, textAlign: "center" }}>Total</div>
                {matrix.emps.map((e, i) => {
                  const bg = i % 2 ? COLORS.surface : "#fff";
                  return (
                    <Fragment key={e.id}>
                      <div title={e.name} style={{ background: bg, padding: "10px 14px", fontSize: 13, fontWeight: 600, color: COLORS.text, borderTop: `1px solid ${COLORS.border}`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</div>
                      {matrix.periods.map((p) => {
                        const v = e.cells[p.id] || 0;
                        return (
                          <div key={p.id} style={{ background: bg, borderTop: `1px solid ${COLORS.border}`, padding: 3 }}>
                            <div title={e.missing[p.id] ? "Timesheet file missing" : undefined} style={{ position: "relative", minHeight: 30, height: "100%", borderRadius: 6, background: heat(v, cellMax), color: v / cellMax > 0.55 ? "#fff" : v ? COLORS.text : COLORS.borderStrong, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: v ? 700 : 400 }}>
                              {v ? h(v) : "0"}
                              {v > 0 && e.missing[p.id] && <span style={{ position: "absolute", top: 4, right: 5, width: 7, height: 7, borderRadius: "50%", background: COLORS.danger, boxShadow: "0 0 0 2px #fff" }} />}
                            </div>
                          </div>
                        );
                      })}
                      <div style={{ background: bg, borderTop: `1px solid ${COLORS.border}`, padding: 3 }}>
                        <div style={{ minHeight: 30, height: "100%", borderRadius: 6, background: COLORS.accentSoft, color: COLORS.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800 }}>{h(e.total)}</div>
                      </div>
                    </Fragment>
                  );
                })}
                <div style={{ background: COLORS.navy, color: "#fff", padding: "10px 14px", fontSize: 12.5, fontWeight: 800 }}>Total</div>
                {matrix.periods.map((p) => <div key={p.id} style={{ background: COLORS.navy, color: "#fff", padding: "10px 4px", fontSize: 12.5, fontWeight: 800, textAlign: "center" }}>{h(matrix.colTotals[p.id])}</div>)}
                <div style={{ background: COLORS.navyLift, color: "#fff", padding: "10px 6px", fontSize: 13, fontWeight: 800, textAlign: "center" }}>{h(d.total)}</div>
              </div>
            </div>
          </Panel>

          {/* ---------- Register ---------- */}
          <Panel title="Timesheet Register" sub="Every resource line on every billing record (latest period first)" action={<button type="button" onClick={exportRegister} style={exportBtn}><Download size={13} /> Export Excel</button>}>
            <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ maxHeight: 520, overflowY: "auto" }}>
                <div style={{ display: "grid", gridTemplateColumns: REG_COLS, width: "100%", fontSize: 13 }}>
                  {["Period", "Project", "Employee", "Designation", "Alloc", "Hours", "Billable", "Billing Status", "Timesheet"].map((c) => (
                    <div key={c} style={{ position: "sticky", top: 0, zIndex: 1, background: COLORS.navy, color: "#fff", padding: "10px 10px", fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", whiteSpace: "nowrap" }}>{c}</div>
                  ))}
                  {register.map((r, i) => {
                    const c = { padding: "9px 10px", borderTop: `1px solid ${COLORS.border}`, background: i % 2 ? COLORS.surface : "#fff", display: "flex", alignItems: "center", minWidth: 0, overflow: "hidden" };
                    const t = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
                    return (
                      <Fragment key={r.key}>
                        <div style={c}><span style={t} title={`${fmtDate(r.periodStart)} → ${fmtDate(r.periodEnd)}`}>{r.periodName}</span></div>
                        <div style={{ ...c, fontWeight: 600, color: COLORS.text }}><span style={t} title={r.projectName}>{r.projectName}</span></div>
                        <div style={{ ...c, fontWeight: 600, color: COLORS.text }}><span style={t} title={r.employee}>{r.employee}</span></div>
                        <div style={{ ...c, color: COLORS.textSoft }}><span style={t}>{r.designation}</span></div>
                        <div style={{ ...c, color: COLORS.textSoft }}>{r.pct}%</div>
                        <div style={{ ...c, fontWeight: 800, color: COLORS.text }}>{h(r.hours)}</div>
                        <div style={c}><Badge color={r.billable ? COLORS.success : COLORS.warning}>{r.billable ? "Billable" : "Non-bill"}</Badge></div>
                        <div style={c}><Badge color={statusColor(r.statusName)}>{r.statusName}</Badge></div>
                        <div style={c}><Badge color={r.uploaded ? COLORS.success : COLORS.danger}>{r.uploaded ? "Uploaded" : "Missing"}</Badge></div>
                      </Fragment>
                    );
                  })}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 18, marginTop: 10, fontSize: 12.5, color: COLORS.textMuted }}>
              <span>Lines <b style={{ color: COLORS.text }}>{register.length}</b></span>
              <span>Total hours <b style={{ color: COLORS.text }}>{h(d.total)}</b></span>
              <span>Billable <b style={{ color: COLORS.text }}>{h(d.billable)}</b></span>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
