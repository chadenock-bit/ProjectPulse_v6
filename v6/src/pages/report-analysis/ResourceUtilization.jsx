import { useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ReferenceLine, PieChart, Pie, Cell, LabelList,
} from "recharts";
import { FolderKanban, Users2, Gauge, TriangleAlert, TrendingDown, Clock, FilterX, Download, SearchX, Crown, Star } from "lucide-react";
import { COLORS, SHADOWS, inputStyle, labelStyle } from "../../constants/theme";
import { downloadExcelCsv } from "./reportUi";

const card = { background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, boxShadow: SHADOWS.sm };
// NOTE: "auto-fill" on purpose — index.css restyles inline "repeat(auto-fit, minmax(" grids as stat cards.
const EMPTY = { employee: "", project: "", pm: "", client: "", department: "", status: "", billable: "all", from: "", to: "" };
const BAND_COLORS = [COLORS.warning, "#0EA5A4", COLORS.success, COLORS.danger];
const ymd = (d) => (d ? String(d).slice(0, 10) : "");
const byId = (list) => Object.fromEntries((list || []).map((x) => [String(x.id), x]));
const short = (n) => { const p = String(n || "").trim().split(/\s+/).filter(Boolean); return p.length > 1 ? `${p[0]} ${p[1][0]}.` : p[0] || ""; };
const utilColor = (t) => (t > 100 ? COLORS.danger : t >= 80 ? COLORS.success : t >= 50 ? "#0EA5A4" : COLORS.warning);

function Panel({ title, sub, action, children, style }) {
  return (
    <div style={{ ...card, padding: 20, minWidth: 0, ...style }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: COLORS.text }}>{title}</div>
          {sub && <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>{sub}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// Premium role badges (Project Manager / Delivery Head).
const TAG_STYLE = {
  PM: { bg: "linear-gradient(135deg, #7C3AED, #C026D3)", glow: "rgba(124,58,237,.45)", icon: Crown },
  DH: { bg: "linear-gradient(135deg, #D97706, #F59E0B)", glow: "rgba(217,119,6,.45)", icon: Star },
};
function Tag({ t }) {
  const st = TAG_STYLE[t];
  const Icon = st.icon;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 6px", borderRadius: 6, fontSize: 10.5, fontWeight: 800, letterSpacing: ".04em", color: "#fff", background: st.bg, boxShadow: `0 2px 6px ${st.glow}`, border: "1px solid rgba(255,255,255,.55)", whiteSpace: "nowrap" }}>
      <Icon size={10} fill="#fff" strokeWidth={2.5} /> {t}
    </span>
  );
}

function Kpi({ icon: Icon, color, label, value, sub }) {
  return (
    <div style={{ ...card, padding: 16, display: "flex", gap: 14, alignItems: "center" }}>
      <span style={{ width: 44, height: 44, borderRadius: 12, background: `${color}18`, color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={20} /></span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: COLORS.text, lineHeight: 1.2 }}>{value}</div>
        {sub && <div style={{ fontSize: 11.5, color: COLORS.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div style={{ padding: "40px 0", textAlign: "center", color: COLORS.textMuted, fontSize: 13 }}>
      <SearchX size={22} /><div style={{ marginTop: 6 }}>No allocations match the selected filters.</div>
    </div>
  );
}

export function ResourceUtilization({ projects, resources, lookups }) {
  const [f, setF] = useState(EMPTY);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const activeCount = Object.keys(EMPTY).filter((k) => f[k] !== EMPTY[k]).length;

  const users = useMemo(() => byId(lookups.users), [lookups.users]);
  const projMap = useMemo(() => byId(projects), [projects]);
  const clients = useMemo(() => byId(lookups.clients), [lookups.clients]);
  const statuses = useMemo(() => byId(lookups.projectStatuses), [lookups.projectStatuses]);

  // Join allocation rows with their project + user once.
  const rows = useMemo(() => resources.map((r) => {
    const p = projMap[String(r.projectId)] || {};
    const u = users[String(r.userId)] || {};
    return {
      ...r,
      pct: Number(r.allocationPct) || 0,
      hrs: Number(r.weeklyHours) || 0,
      userName: u.name || `User ${r.userId}`,
      projectName: p.projectName || `Project ${r.projectId}`,
      projectCode: p.projectCode || "",
      pmId: p.projectManagerUserId,
      clientId: p.clientId,
      statusId: p.projectStatusId,
      deptId: r.departmentId || u.departmentId,
      start: ymd(r.startDate), end: ymd(r.endDate),
    };
  }), [resources, projMap, users]);

  // Filter dropdown options (only values that actually exist in allocations).
  const opts = useMemo(() => {
    const uniq = (arr) => [...new Map(arr.filter((x) => x.id !== "" && x.id != null).map((x) => [String(x.id), x])).values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return {
      employees: uniq([...rows.map((r) => ({ id: r.userId, name: r.userName })), ...(lookups.users || []).filter((u) => u.active !== false).map((u) => ({ id: u.id, name: u.name }))]),
      projects: uniq(rows.map((r) => ({ id: r.projectId, name: r.projectName }))),
      pms: uniq(rows.map((r) => ({ id: r.pmId, name: users[String(r.pmId)]?.name || "" })).filter((x) => x.name)),
      clients: uniq(rows.map((r) => ({ id: r.clientId, name: clients[String(r.clientId)]?.name || "" })).filter((x) => x.name)),
      departments: uniq(rows.map((r) => ({ id: r.deptId, name: (lookups.departments || []).find((d) => String(d.id) === String(r.deptId))?.name || "" })).filter((x) => x.name)),
      statuses: uniq(rows.map((r) => ({ id: r.statusId, name: statuses[String(r.statusId)]?.name || "" })).filter((x) => x.name)),
    };
  }, [rows, users, clients, statuses, lookups.departments, lookups.users]);

  const filtered = useMemo(() => rows.filter((r) => {
    const eq = (a, b) => !b || String(a) === String(b);
    if (!eq(r.userId, f.employee) || !eq(r.projectId, f.project) || !eq(r.pmId, f.pm) || !eq(r.clientId, f.client) || !eq(r.deptId, f.department) || !eq(r.statusId, f.status)) return false;
    if (f.billable === "billable" && !r.billable) return false;
    if (f.billable === "non" && r.billable) return false;
    if (f.to && r.start && r.start > f.to) return false;   // overlaps the date range
    if (f.from && r.end && r.end < f.from) return false;
    return true;
  }), [rows, f]);

  const d = useMemo(() => {
    const emp = {};
    const proj = {};
    filtered.forEach((r) => {
      const e = (emp[r.userId] ||= { id: r.userId, name: r.userName, total: 0, billable: 0, nonBillable: 0, hrs: 0, cells: {} });
      e.total += r.pct; e.hrs += r.hrs;
      if (r.billable) e.billable += r.pct; else e.nonBillable += r.pct;
      e.cells[r.projectId] = (e.cells[r.projectId] || 0) + r.pct;
      const p = (proj[r.projectId] ||= { id: r.projectId, name: r.projectName, code: r.projectCode, fte: 0, heads: new Set(), billable: 0 });
      p.fte += r.pct / 100; p.heads.add(r.userId); if (r.billable) p.billable += r.pct / 100;
    });
    const emps = Object.values(emp).sort((a, b) => b.total - a.total);
    const projs = Object.values(proj).sort((a, b) => b.fte - a.fte);
    const billableHeads = emps.filter((e) => e.billable > 0).length;
    const totalPct = emps.reduce((s, e) => s + e.total, 0);
    const billPct = emps.reduce((s, e) => s + e.billable, 0);
    const bands = [
      { name: "Under 50%", count: emps.filter((e) => e.total < 50).length },
      { name: "50–79%", count: emps.filter((e) => e.total >= 50 && e.total < 80).length },
      { name: "80–100%", count: emps.filter((e) => e.total >= 80 && e.total <= 100).length },
      { name: "Over 100%", count: emps.filter((e) => e.total > 100).length },
    ];
    return {
      emps, projs, billableHeads, nonBillableHeads: emps.length - billableHeads,
      avg: emps.length ? Math.round(totalPct / emps.length) : 0,
      over: bands[3].count, under: bands[0].count,
      hrs: emps.reduce((s, e) => s + e.hrs, 0),
      billShare: totalPct ? Math.round((billPct / totalPct) * 100) : 0,
      fteBill: +(billPct / 100).toFixed(1), fteNon: +((totalPct - billPct) / 100).toFixed(1),
      bands,
    };
  }, [filtered]);

  // Matrix columns: ALL projects that match the project-level filters (even with
  // no allocation). Allocated projects first (by FTE), then the rest A–Z.
  const matrixProjs = useMemo(() => {
    const eq = (a, b) => !b || String(a) === String(b);
    const fte = Object.fromEntries(d.projs.map((p) => [String(p.id), p.fte]));
    return projects
      .filter((p) => eq(p.id, f.project) && eq(p.projectManagerUserId, f.pm) && eq(p.clientId, f.client) && eq(p.projectStatusId, f.status))
      .map((p) => ({ id: p.id, name: p.projectName || `Project ${p.id}`, fte: fte[String(p.id)] || 0 }))
      .sort((a, b) => b.fte - a.fte || a.name.localeCompare(b.name));
  }, [projects, d.projs, f.project, f.pm, f.client, f.status]);

  // Matrix rows: ALL employees (allocated ones first, then everyone else A–Z),
  // narrowed only by the Employee / Department filters.
  const matrixEmps = useMemo(() => {
    const eq = (a, b) => !b || String(a) === String(b);
    const seen = new Set(d.emps.map((e) => String(e.id)));
    const rest = (lookups.users || [])
      .filter((u) => u.active !== false && !seen.has(String(u.id)) && eq(u.id, f.employee) && eq(u.departmentId, f.department))
      .map((u) => ({ id: u.id, name: u.name || `User ${u.id}`, total: 0, billable: 0, nonBillable: 0, hrs: 0, cells: {} }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return [...d.emps, ...rest];
  }, [d.emps, lookups.users, f.employee, f.department]);

  // "userId|projectId" -> ["PM", "DH"]
  const roleTags = useMemo(() => {
    const m = {};
    const add = (u, p, t) => { if (u) (m[`${u}|${p}`] ||= []).push(t); };
    projects.forEach((p) => { add(p.projectManagerUserId, p.id, "PM"); add(p.deliveryHeadUserId, p.id, "DH"); });
    return m;
  }, [projects]);
  const tagsOf = (e, p) => roleTags[`${e.id}|${p.id}`] || [];

  const exportExcel = () => downloadExcelCsv("resource-utilization-matrix.csv", [
    ["Employee", ...matrixProjs.map((p) => p.name), "Total %"],
    ...matrixEmps.map((e) => [e.name, ...matrixProjs.map((p) => {
      const t = tagsOf(e, p);
      return `${e.cells[p.id] || 0}%${t.length ? ` (${t.join(", ")})` : ""}`;
    }), `${e.total}%`]),
  ]);

  const sel = (key, label, list, all) => (
    <div>
      <label style={labelStyle}>{label}</label>
      <select value={f[key]} onChange={(e) => set(key, e.target.value)} style={inputStyle}>
        <option value="">{all}</option>
        {list.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </div>
  );

  const chartW = Math.max(600, d.emps.length * 56);
  // Fits the card width — no scrollbars; project columns share the space equally.
  const matrixCols = `minmax(150px, 1.3fr) repeat(${Math.max(matrixProjs.length, 1)}, minmax(0, 1fr)) minmax(70px, 0.8fr)`;
  const cellBg = (v) => (v ? `rgba(59,111,224,${Math.min(0.12 + (v / 100) * 0.78, 0.9)})` : "transparent");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Filters */}
      <div style={{ ...card, padding: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: "14px 16px", alignItems: "end" }}>
          {sel("employee", "Employee", opts.employees, "All employees")}
          {sel("project", "Project", opts.projects, "All projects")}
          {sel("pm", "Project Manager", opts.pms, "All managers")}
          {sel("client", "Client", opts.clients, "All clients")}
          {sel("department", "Department", opts.departments, "All departments")}
          {sel("status", "Project Status", opts.statuses, "All statuses")}
          <div>
            <label style={labelStyle}>Billing</label>
            <select value={f.billable} onChange={(e) => set("billable", e.target.value)} style={inputStyle}>
              <option value="all">Billable + Non-billable</option>
              <option value="billable">Billable only</option>
              <option value="non">Non-billable only</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>From Date</label>
            <input type="date" value={f.from} max={f.to || undefined} onChange={(e) => set("from", e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>To Date</label>
            <input type="date" value={f.to} min={f.from || undefined} onChange={(e) => set("to", e.target.value)} style={inputStyle} />
          </div>
          <button onClick={() => setF(EMPTY)} disabled={!activeCount} style={{ height: 43, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 10, border: `1px solid ${activeCount ? COLORS.accent : COLORS.border}`, background: activeCount ? COLORS.accentSoft : "#fff", color: activeCount ? COLORS.accent : COLORS.textMuted, fontWeight: 700, fontSize: 13, cursor: activeCount ? "pointer" : "default" }}>
            <FilterX size={15} /> Clear filters{activeCount ? ` (${activeCount})` : ""}
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 14 }}>
        <Kpi icon={FolderKanban} color={COLORS.accent} label="Projects" value={d.projs.length} sub={`${filtered.length} allocation rows`} />
        <Kpi icon={Users2} color="#8B5CF6" label="Employees on Projects" value={d.emps.length} sub={`${d.billableHeads} billable · ${d.nonBillableHeads} non-billable`} />
        <Kpi icon={Gauge} color={COLORS.success} label="Avg Allocation" value={`${d.avg}%`} sub={`Billable share ${d.billShare}%`} />
        <Kpi icon={TriangleAlert} color={COLORS.danger} label="Over-allocated" value={d.over} sub="Employees above 100%" />
        <Kpi icon={TrendingDown} color={COLORS.warning} label="Under-utilized" value={d.under} sub="Employees below 50%" />
        <Kpi icon={Clock} color="#0EA5A4" label="Weekly Hours" value={d.hrs.toLocaleString("en-IN")} sub={`FTE ${d.fteBill} billable · ${d.fteNon} non-billable`} />
      </div>

      {/* Column chart */}
      <Panel title="Resource Utilization by Employee" sub="Total allocation % split into billable and non-billable · dashed line = 100%">
        {d.emps.length === 0 ? <Empty /> : (
          <div style={{ overflowX: "auto" }}>
            <div style={{ width: chartW, minWidth: "100%", height: 340 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.emps.map((e) => ({ name: short(e.name), full: e.name, Billable: e.billable, "Non-billable": e.nonBillable, total: e.total }))} margin={{ top: 24, right: 16, left: 0, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.border} />
                  <XAxis dataKey="name" interval={0} angle={-35} textAnchor="end" tick={{ fontSize: 11.5, fill: COLORS.textSoft }} height={60} />
                  <YAxis unit="%" domain={[0, (max) => Math.max(100, Math.ceil(max / 25) * 25)]} tick={{ fontSize: 11.5, fill: COLORS.textSoft }} />
                  <Tooltip cursor={false} labelFormatter={(_, p) => p?.[0]?.payload?.full || ""} formatter={(v) => `${v}%`} />
                  <Legend verticalAlign="top" height={28} />
                  <ReferenceLine y={100} stroke={COLORS.danger} strokeDasharray="6 4" />
                  <Bar dataKey="Billable" stackId="a" fill={COLORS.accent} maxBarSize={38} activeBar={false}>
                    <LabelList dataKey="Billable" position="center" formatter={(v) => (v >= 15 ? `${v}%` : "")} style={{ fill: "#fff", fontSize: 11, fontWeight: 700 }} />
                  </Bar>
                  <Bar dataKey="Non-billable" stackId="a" fill="#F59E0B" radius={[5, 5, 0, 0]} maxBarSize={38} activeBar={false}>
                    <LabelList dataKey="Non-billable" position="center" formatter={(v) => (v >= 15 ? `${v}%` : "")} style={{ fill: "#fff", fontSize: 11, fontWeight: 700 }} />
                    <LabelList dataKey="total" position="top" formatter={(v) => `${v}%`} style={{ fill: COLORS.text, fontSize: 12, fontWeight: 800 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </Panel>

      {/* Matrix */}
      <Panel
        title="Allocation Matrix"
        sub="All employees × all projects · allocation %, project roles and employee-wise total"
        action={matrixEmps.length > 0 && (
          <button onClick={exportExcel} style={{ display: "flex", alignItems: "center", gap: 6, background: COLORS.successSoft, color: COLORS.success, border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
            <Download size={13} /> Export Excel
          </button>
        )}
      >
        {matrixEmps.length === 0 ? <Empty /> : (
          <>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 22px", padding: "10px 14px", marginBottom: 12, background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 10, fontSize: 12, color: COLORS.textSoft }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <b style={{ color: COLORS.text }}>Allocation</b> 0%
              <span style={{ width: 110, height: 10, borderRadius: 999, background: "linear-gradient(90deg, rgba(59,111,224,.12), rgba(59,111,224,.9))" }} /> 100%
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 10px", borderRadius: 999, background: "linear-gradient(135deg, #FEF7E0, #FDF2FF)", boxShadow: "inset 0 0 0 1.5px #E9B949" }}>
              <b style={{ color: "#92400E" }}>Key roles</b>
              <span style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 700, color: "#6D28D9" }}><Tag t="PM" /> Project Manager</span>
              <span style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 700, color: "#B45309" }}><Tag t="DH" /> Delivery Head</span>
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <b style={{ color: COLORS.text }}>Total</b>
              {[["< 50%", COLORS.warning], ["50–79%", "#0EA5A4"], ["80–100%", COLORS.success], ["> 100%", COLORS.danger]].map(([l, c]) => (
                <span key={l} style={{ padding: "2px 8px", borderRadius: 6, background: `${c}1f`, color: c, fontWeight: 700 }}>{l}</span>
              ))}
            </span>
          </div>
          <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: matrixCols, width: "100%" }}>
              <div style={{ background: COLORS.navy, color: "#fff", padding: "11px 14px", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center" }}>Employee</div>
              {matrixProjs.map((p) => (
                <div key={p.id} title={p.name} style={{ background: COLORS.navy, color: "#fff", padding: "8px 4px", fontSize: 11, fontWeight: 700, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", minWidth: 0 }}>
                  <span style={{ lineHeight: 1.25, wordBreak: "break-word", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{p.name}</span>
                </div>
              ))}
              <div style={{ background: COLORS.navyLift, color: "#fff", padding: "11px 6px", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>Total</div>

              {matrixEmps.map((e, i) => {
                const rowBg = i % 2 ? COLORS.surface : "#fff";
                return [
                  <div key={`n${e.id}`} title={e.name} style={{ background: rowBg, padding: "10px 14px", minWidth: 0, fontSize: 13, fontWeight: 600, color: COLORS.text, borderTop: `1px solid ${COLORS.border}`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</div>,
                  ...matrixProjs.map((p) => {
                    const v = e.cells[p.id] || 0;
                    const tags = tagsOf(e, p);
                    return (
                      <div key={`${e.id}-${p.id}`} style={{ background: rowBg, borderTop: `1px solid ${COLORS.border}`, padding: 3, minWidth: 0 }}>
                        <div title={tags.length ? `${e.name} — ${tags.map((t) => (t === "PM" ? "Project Manager" : "Delivery Head")).join(" & ")} of ${p.name}` : undefined} style={{ height: "100%", minHeight: 30, borderRadius: 6, background: v ? cellBg(v) : tags.length ? "linear-gradient(135deg, #FEF7E0, #FDF2FF)" : "transparent", boxShadow: tags.length ? "inset 0 0 0 1.5px #E9B949" : "none", color: v > 55 ? "#fff" : COLORS.text, display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: 3, padding: "2px 2px", fontSize: 12, fontWeight: v ? 700 : 400, ...(v ? {} : { color: COLORS.borderStrong }) }}>
                          {(v > 0 || tags.length === 0) && <span>{v ? `${v}%` : "0%"}</span>}
                          {tags.map((t) => <Tag key={t} t={t} />)}
                        </div>
                      </div>
                    );
                  }),
                  <div key={`t${e.id}`} style={{ background: rowBg, borderTop: `1px solid ${COLORS.border}`, padding: 4 }}>
                    <div style={{ minHeight: 30, height: "100%", borderRadius: 6, background: `${utilColor(e.total)}1f`, color: utilColor(e.total), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800 }}>{e.total}%</div>
                  </div>,
                ];
              })}
            </div>
          </div>
          </>
        )}
      </Panel>

      {/* Management visuals */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
        <Panel title="Utilization Bands" sub="Number of employees per total-allocation band" style={{ flex: "1 1 340px" }}>
          {d.emps.length === 0 ? <Empty /> : (
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.bands} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.border} />
                  <XAxis dataKey="name" tick={{ fontSize: 11.5, fill: COLORS.textSoft }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11.5, fill: COLORS.textSoft }} />
                  <Tooltip cursor={false} formatter={(v) => [v, "Employees"]} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={56}>
                    {d.bands.map((b, i) => <Cell key={b.name} fill={BAND_COLORS[i]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel title="Billable vs Non-billable" sub="Share of total allocation, in FTE" style={{ flex: "1 1 300px" }}>
          {d.emps.length === 0 ? <Empty /> : (
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={[{ name: "Billable", value: d.fteBill }, { name: "Non-billable", value: d.fteNon }]} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={2}>
                    <Cell fill={COLORS.accent} />
                    <Cell fill="#F59E0B" />
                  </Pie>
                  <Tooltip formatter={(v) => `${v} FTE`} />
                  <Legend verticalAlign="bottom" height={28} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel title="Top Projects by FTE" sub="Allocated effort per project (100% = 1 FTE)" style={{ flex: "2 1 420px" }}>
          {d.projs.length === 0 ? <Empty /> : (
            <div style={{ height: Math.max(260, Math.min(d.projs.length, 10) * 34 + 40) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={d.projs.slice(0, 10).map((p) => ({ name: p.name, full: p.name, FTE: +p.fte.toFixed(2), Heads: p.heads.size }))} margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={COLORS.border} />
                  <XAxis type="number" tick={{ fontSize: 11.5, fill: COLORS.textSoft }} />
                  <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11.5, fill: COLORS.textSoft }} />
                  <Tooltip cursor={false} labelFormatter={(_, p) => p?.[0]?.payload?.full || ""} formatter={(v, n, p) => (n === "FTE" ? [`${v} FTE · ${p.payload.Heads} people`, "Effort"] : [v, n])} />
                  <Bar dataKey="FTE" fill="#8B5CF6" radius={[0, 6, 6, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}