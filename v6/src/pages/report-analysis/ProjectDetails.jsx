import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, PieChart, Pie, Cell, LabelList,
} from "recharts";
import {
  FolderKanban, Landmark, PlayCircle, CheckCircle2, AlarmClock, CalendarClock, Users2, Gauge, Building2, FileWarning,
  FilterX, Download, ChevronRight, ChevronDown, SlidersHorizontal, Search, X, ArrowUpDown,
} from "lucide-react";
import { COLORS, inputStyle, labelStyle } from "../../constants/theme";
import {
  card, ymd, byId, fmtDate, money, compact, initials, downloadExcelCsv, Panel, Kpi, Empty, Badge, MultiSelect,
} from "./reportUi";

const MULTI = ["project", "category", "client", "billing", "status", "zoho", "resource", "pm", "dh", "department", "geography"];
const EMPTY = { q: "", phase: "all", active: "all", startFrom: "", startTo: "", endFrom: "", endTo: "", ...Object.fromEntries(MULTI.map((k) => [k, []])) };
const LABELS = { project: "Project", category: "Category", client: "Client", billing: "Billing Type", status: "Status", zoho: "Zoho ID", resource: "Resource", pm: "Project Manager", dh: "Delivery Head", department: "Department", geography: "Geography" };
const ALL_TEXT = { project: "All projects", category: "All categories", client: "All clients", billing: "All billing types", status: "All statuses", zoho: "All Zoho IDs", resource: "All resources", pm: "All managers", dh: "All delivery heads", department: "All departments", geography: "All geographies" };
const PHASES = [
  { key: "all", label: "All" },
  { key: "ongoing", label: "Ongoing", color: COLORS.accent },
  { key: "upcoming", label: "Upcoming", color: "#8B5CF6" },
  { key: "overdue", label: "Overdue", color: COLORS.danger },
  { key: "completed", label: "Completed", color: COLORS.success },
  { key: "unscheduled", label: "No dates", color: "#6B7280" },
];
const PHASE_COLOR = Object.fromEntries(PHASES.filter((p) => p.color).map((p) => [p.key, p.color]));
const PHASE_LABEL = Object.fromEntries(PHASES.map((p) => [p.key, p.label]));
const PALETTE = ["#3B6FE0", "#8B5CF6", "#0EA5A4", "#F59E0B", "#22A06B", "#E11D48", "#EAB308", "#06B6D4", "#A855F7", "#F43F5E"];
const NONE = "__none__";
const DAY = 86400000;

const statusColor = (name = "") => {
  const n = name.toLowerCase();
  if (/complet|closed|done/.test(n)) return COLORS.success;
  if (/hold|pause/.test(n)) return COLORS.warning;
  if (/cancel|reject|drop/.test(n)) return COLORS.danger;
  if (/draft|new|plan/.test(n)) return "#6B7280";
  return COLORS.accent;
};

const COLS = [
  { key: "name", label: "Project", w: 290 },
  { key: "heads", label: "Resources", w: 110 },
  { key: "client", label: "Client", w: 160 },
  { key: "category", label: "Category", w: 140 },
  { key: "billing", label: "Billing Type", w: 130 },
  { key: "status", label: "Status", w: 130 },
  { key: "pm", label: "Project Manager", w: 160 },
  { key: "dh", label: "Delivery Head", w: 160 },
  { key: "start", label: "Start", w: 112 },
  { key: "end", label: "End", w: 112 },
  { key: "progress", label: "Timeline", w: 170 },
  { key: "fte", label: "FTE", w: 80 },
  { key: "value", label: "Value", w: 140 },
  { key: "zoho", label: "Zoho ID", w: 130 },
];
const GRID_COLS = COLS.map((c) => `${c.w}px`).join(" ");
const RES_COLS = "minmax(200px, 1.6fr) minmax(120px, 1fr) minmax(120px, 1fr) minmax(120px, 1fr) minmax(150px, 1.2fr) 90px 100px 110px 110px";

function Seg({ value, onChange, items }) {
  return (
    <div style={{ display: "flex", background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 3, gap: 2, flexWrap: "wrap" }}>
      {items.map((i) => {
        const on = value === i.key;
        return (
          <button key={i.key} type="button" onClick={() => onChange(i.key)} style={{ border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", background: on ? "#fff" : "transparent", color: on ? (i.color || COLORS.accent) : COLORS.textMuted, boxShadow: on ? "0 1px 3px rgba(15,23,48,.12)" : "none", display: "flex", alignItems: "center", gap: 6 }}>
            {i.color && <span style={{ width: 7, height: 7, borderRadius: "50%", background: i.color }} />}{i.label}
          </button>
        );
      })}
    </div>
  );
}

function DateRange({ label, from, to, onFrom, onTo }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input type="date" value={from} max={to || undefined} onChange={(e) => onFrom(e.target.value)} style={{ ...inputStyle, padding: "10px 8px", fontSize: 13 }} />
        <span style={{ color: COLORS.textMuted, fontSize: 12 }}>to</span>
        <input type="date" value={to} min={from || undefined} onChange={(e) => onTo(e.target.value)} style={{ ...inputStyle, padding: "10px 8px", fontSize: 13 }} />
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: COLORS.text, marginTop: 3, wordBreak: "break-word" }}>{value || "—"}</div>
    </div>
  );
}

function Progress({ pct, color }) {
  return (
    <div style={{ height: 7, borderRadius: 999, background: COLORS.border, overflow: "hidden" }}>
      <div style={{ width: `${Math.max(0, Math.min(pct, 100))}%`, height: "100%", background: color, borderRadius: 999 }} />
    </div>
  );
}

function ProjectAccordion({ p, width }) {
  const billable = p.res.filter((r) => r.billable).length;
  return (
    <div style={{ position: "sticky", left: 0, width, padding: "4px 14px 18px", boxSizing: "border-box" }}>
      <div style={{ border: `1px solid ${COLORS.accent}55`, borderRadius: 14, background: "#fff", overflow: "hidden", boxShadow: "0 10px 26px rgba(59,111,224,.10)" }}>
        <div style={{ padding: "16px 18px", background: `linear-gradient(120deg, ${COLORS.navy}, ${COLORS.navyLift})`, color: "#fff", display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: "1 1 240px", minWidth: 0 }}>
            <div style={{ fontSize: 11.5, opacity: 0.7 }}>{p.code || "—"}</div>
            <div style={{ fontSize: 17, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>{p.clientName} · {p.categoryName}</div>
          </div>
          {[
            ["Resources", p.heads],
            ["FTE", p.fte.toFixed(2)],
            ["Weekly hrs", p.hrs],
            ["Billable", `${billable}/${p.res.length}`],
            ["Value", p.value ? `${p.currency} ${compact(p.value)}`.trim() : "—"],
          ].map(([k, v]) => (
            <div key={k} style={{ textAlign: "center", minWidth: 80 }}>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{v}</div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>{k}</div>
            </div>
          ))}
        </div>

        <div style={{ padding: 18, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: "14px 18px", borderBottom: `1px solid ${COLORS.border}` }}>
          <Info label="Zoho Project ID" value={p.zoho} />
          <Info label="PO Number" value={p.raw.poNumber} />
          <Info label="SOW Reference" value={p.raw.sowReference} />
          <Info label="Geography" value={p.raw.geography} />
          <Info label="Department" value={p.deptName} />
          <Info label="Project Manager" value={p.pmName} />
          <Info label="Delivery Head" value={p.dhName} />
          <Info label="Billing Type" value={p.billingName} />
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: COLORS.textMuted, marginBottom: 6 }}>
              <span>{fmtDate(p.start)} → {fmtDate(p.end)}</span>
              <span style={{ fontWeight: 700, color: PHASE_COLOR[p.phase] }}>{PHASE_LABEL[p.phase]}{p.daysLeft != null && p.phase === "ongoing" ? ` · ${p.daysLeft} days left` : ""}{p.phase === "overdue" ? ` · ${-p.daysLeft} days past end` : ""}</span>
            </div>
            <Progress pct={p.progress} color={PHASE_COLOR[p.phase] || COLORS.accent} />
          </div>
          {p.raw.remarks && <div style={{ gridColumn: "1 / -1" }}><Info label="Remarks" value={p.raw.remarks} /></div>}
        </div>

        <div style={{ padding: "14px 18px 6px", fontWeight: 700, fontSize: 14, color: COLORS.text, display: "flex", alignItems: "center", gap: 8 }}>
          <Users2 size={16} color={COLORS.accent} /> Resource Details ({p.res.length})
        </div>
        {p.res.length === 0 ? (
          <div style={{ padding: "18px", fontSize: 13, color: COLORS.textMuted }}>No resources allocated to this project.</div>
        ) : (
          <div style={{ overflowX: "auto", padding: "0 18px 18px" }}>
            <div style={{ display: "grid", gridTemplateColumns: RES_COLS, minWidth: 1100, fontSize: 13 }}>
              {["Employee", "Role", "Designation", "Department", "Allocation", "Weekly Hrs", "Billing", "Start", "End"].map((h) => (
                <div key={h} style={{ padding: "9px 10px", fontSize: 11, fontWeight: 700, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: ".05em", background: COLORS.surface, borderBottom: `1px solid ${COLORS.border}` }}>{h}</div>
              ))}
              {p.res.map((r) => (
                <Fragment key={r.id}>
                  <div style={{ padding: "9px 10px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                    <span style={{ width: 30, height: 30, borderRadius: "50%", background: COLORS.accentSoft, color: COLORS.accent, fontSize: 11.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{initials(r.userName)}</span>
                    <span style={{ fontWeight: 600, color: COLORS.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.userName}</span>
                  </div>
                  <div style={{ padding: "9px 10px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", color: COLORS.textSoft }}>{r.roleName}</div>
                  <div style={{ padding: "9px 10px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", color: COLORS.textSoft }}>{r.designationName}</div>
                  <div style={{ padding: "9px 10px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", color: COLORS.textSoft }}>{r.deptName}</div>
                  <div style={{ padding: "9px 10px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1 }}><Progress pct={r.pct} color={r.pct > 100 ? COLORS.danger : COLORS.accent} /></div>
                    <span style={{ fontWeight: 700, width: 42, textAlign: "right" }}>{r.pct}%</span>
                  </div>
                  <div style={{ padding: "9px 10px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", fontWeight: 600 }}>{r.hrs}</div>
                  <div style={{ padding: "9px 10px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center" }}>
                    <Badge color={r.billable ? COLORS.success : COLORS.warning}>{r.billable ? "Billable" : "Non-billable"}</Badge>
                  </div>
                  <div style={{ padding: "9px 10px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", color: COLORS.textSoft }}>{fmtDate(r.startDate)}</div>
                  <div style={{ padding: "9px 10px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", color: COLORS.textSoft }}>{fmtDate(r.endDate)}</div>
                </Fragment>
              ))}
              <div style={{ gridColumn: "1 / 5", padding: "10px", fontWeight: 800, color: COLORS.text, background: COLORS.surface }}>Total</div>
              <div style={{ padding: "10px", fontWeight: 800, background: COLORS.surface }}>{p.fte.toFixed(2)} FTE</div>
              <div style={{ padding: "10px", fontWeight: 800, background: COLORS.surface }}>{p.hrs}</div>
              <div style={{ gridColumn: "7 / -1", padding: "10px", fontWeight: 700, color: COLORS.textMuted, background: COLORS.surface }}>{billable} billable · {p.res.length - billable} non-billable</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Gantt({ projects }) {
  const rows = projects.filter((p) => p.start).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 18);
  if (rows.length === 0) return <Empty text="No projects with a start date in the current selection." />;
  const t = (d) => new Date(`${d}T00:00:00`).getTime();
  const endOf = (p) => (p.end ? t(p.end) : t(p.start) + 90 * DAY);
  let min = Math.min(...rows.map((p) => t(p.start)));
  let max = Math.max(...rows.map(endOf));
  const minD = new Date(min); minD.setDate(1); min = minD.getTime();
  const maxD = new Date(max); maxD.setMonth(maxD.getMonth() + 1, 1); max = maxD.getTime();
  const span = max - min || DAY;
  const pos = (ms) => ((ms - min) / span) * 100;
  const months = [];
  const cur = new Date(min);
  const totalMonths = Math.round(span / (30.4 * DAY));
  const step = totalMonths > 36 ? 6 : totalMonths > 18 ? 3 : totalMonths > 9 ? 2 : 1;
  while (cur.getTime() < max) {
    months.push({ at: pos(cur.getTime()), label: cur.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }) });
    cur.setMonth(cur.getMonth() + step);
  }
  const today = Date.now();
  const showToday = today >= min && today <= max;

  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ minWidth: 820 }}>
        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", alignItems: "end" }}>
          <div />
          <div style={{ position: "relative", height: 24, borderBottom: `1px solid ${COLORS.border}` }}>
            {months.map((m) => <span key={m.at} style={{ position: "absolute", left: `${m.at}%`, bottom: 5, fontSize: 11, color: COLORS.textMuted, transform: "translateX(2px)", whiteSpace: "nowrap" }}>{m.label}</span>)}
          </div>
        </div>
        {rows.map((p) => {
          const l = pos(t(p.start));
          const w = Math.max(pos(endOf(p)) - l, 0.8);
          const c = PHASE_COLOR[p.phase] || COLORS.accent;
          return (
            <div key={p.id} style={{ display: "grid", gridTemplateColumns: "220px 1fr", alignItems: "center", height: 36 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 12 }} title={p.name}>{p.name}</div>
              <div style={{ position: "relative", height: "100%" }}>
                {months.map((m) => <span key={m.at} style={{ position: "absolute", left: `${m.at}%`, top: 0, bottom: 0, borderLeft: `1px dashed ${COLORS.border}` }} />)}
                {showToday && <span style={{ position: "absolute", left: `${pos(today)}%`, top: 0, bottom: 0, borderLeft: `2px solid ${COLORS.danger}`, zIndex: 2 }} />}
                <div title={`${p.name}\n${fmtDate(p.start)} → ${p.end ? fmtDate(p.end) : "open"}\n${PHASE_LABEL[p.phase]} · ${Math.round(p.progress)}% elapsed`} style={{ position: "absolute", left: `${l}%`, width: `${w}%`, top: 8, height: 20, borderRadius: 6, background: `${c}33`, border: `1px solid ${c}`, overflow: "hidden", borderStyle: p.end ? "solid" : "dashed" }}>
                  <div style={{ width: `${Math.min(p.progress, 100)}%`, height: "100%", background: c }} />
                </div>
              </div>
            </div>
          );
        })}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 10, fontSize: 12, color: COLORS.textMuted }}>
          {PHASES.filter((p) => p.color && p.key !== "unscheduled").map((p) => <span key={p.key} style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: p.color }} />{p.label}</span>)}
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 2, height: 12, background: COLORS.danger }} />Today</span>
          <span>Filled part = time elapsed · dashed = no end date</span>
          {projects.filter((p) => p.start).length > rows.length && <span>Showing first {rows.length} by start date</span>}
        </div>
      </div>
    </div>
  );
}

const donut = (data, fmt = (v) => v) => (
  <div style={{ height: 270 }}>
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="52%" outerRadius="80%" paddingAngle={2} label={({ value }) => fmt(value)} labelLine={false}>
          {data.map((d, i) => <Cell key={d.name} fill={d.color || PALETTE[i % PALETTE.length]} />)}
        </Pie>
        <Tooltip formatter={(v) => fmt(v)} />
        <Legend verticalAlign="bottom" height={40} wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  </div>
);

export function ProjectDetails({ projects, resources, lookups, designations = [], currencies = [] }) {
  const [f, setF] = useState(EMPTY);
  const [more, setMore] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [sort, setSort] = useState({ key: "name", dir: 1 });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const wrapRef = useRef(null);
  const [wrapW, setWrapW] = useState(900);

  useEffect(() => {
    if (!wrapRef.current || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([e]) => setWrapW(Math.floor(e.contentRect.width)));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  });

  const L = useMemo(() => ({
    users: byId(lookups.users), clients: byId(lookups.clients), cats: byId(lookups.categories), bills: byId(lookups.billingTypes),
    stats: byId(lookups.projectStatuses), depts: byId(lookups.departments), roles: byId(lookups.roles), desig: byId(designations), curr: byId(currencies),
  }), [lookups, designations, currencies]);

  // Enrich every project once with names, resources and timeline figures.
  const all = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const now = today.getTime();
    const resBy = {};
    resources.forEach((r) => { (resBy[String(r.projectId)] ||= []).push(r); });
    const name = (m, id) => m[String(id)]?.name || "";
    return projects.map((p) => {
      const start = ymd(p.startDate); const end = ymd(p.endDate);
      const s = start ? new Date(`${start}T00:00:00`).getTime() : null;
      const e = end ? new Date(`${end}T00:00:00`).getTime() : null;
      const statusName = name(L.stats, p.projectStatusId);
      const closed = /complet|closed|done|cancel/i.test(statusName);
      let phase = "unscheduled";
      if (s != null) {
        if (now < s) phase = "upcoming";
        else if (e != null && now > e) phase = closed || !p.active ? "completed" : "overdue";
        else phase = closed ? "completed" : "ongoing";
      }
      const progress = s == null ? 0 : e == null ? (now >= s ? 50 : 0) : Math.max(0, Math.min(100, ((now - s) / Math.max(e - s, DAY)) * 100));
      const res = (resBy[String(p.id)] || []).map((r) => {
        const u = L.users[String(r.userId)] || {};
        return {
          ...r, pct: Number(r.allocationPct) || 0, hrs: Number(r.weeklyHours) || 0,
          userName: u.name || `User ${r.userId}`, roleName: name(L.roles, r.roleId) || "—",
          designationName: name(L.desig, r.designationId) || "—", deptName: name(L.depts, r.departmentId || u.departmentId) || "—",
        };
      }).sort((a, b) => b.pct - a.pct);
      return {
        id: String(p.id), raw: p, code: p.projectCode || "", name: p.projectName || `Project ${p.id}`,
        clientName: name(L.clients, p.clientId) || "—", categoryName: name(L.cats, p.categoryId) || "—", billingName: name(L.bills, p.billingTypeId) || "—",
        statusName: statusName || "—", pmName: name(L.users, p.projectManagerUserId) || "—", dhName: name(L.users, p.deliveryHeadUserId) || "—",
        deptName: name(L.depts, p.departmentId) || "—", zoho: p.zohoProjectId || "", currency: L.curr[String(p.currencyId)]?.code || "",
        value: Number(p.projectValue) || 0, active: !!p.active, start, end, phase, progress,
        daysLeft: e != null ? Math.round((e - now) / DAY) : null,
        res, heads: new Set(res.map((r) => String(r.userId))).size,
        fte: res.reduce((a, r) => a + r.pct / 100, 0), billFte: res.filter((r) => r.billable).reduce((a, r) => a + r.pct / 100, 0),
        hrs: res.reduce((a, r) => a + r.hrs, 0),
      };
    });
  }, [projects, resources, L]);

  // Filter options (from the data that actually exists).
  const opts = useMemo(() => {
    const list = (pairs) => [...new Map(pairs.filter(([id, n]) => id !== "" && id != null && n && n !== "—").map(([id, n]) => [String(id), { id: String(id), name: n }])).values()].sort((a, b) => a.name.localeCompare(b.name));
    const zoho = list(all.filter((p) => p.zoho).map((p) => [p.zoho, p.zoho]));
    if (all.some((p) => !p.zoho)) zoho.unshift({ id: NONE, name: "(Not set)" });
    return {
      project: list(all.map((p) => [p.id, p.name])),
      category: list(all.map((p) => [p.raw.categoryId, p.categoryName])),
      client: list(all.map((p) => [p.raw.clientId, p.clientName])),
      billing: list(all.map((p) => [p.raw.billingTypeId, p.billingName])),
      status: list(all.map((p) => [p.raw.projectStatusId, p.statusName])),
      zoho,
      resource: list(all.flatMap((p) => p.res.map((r) => [r.userId, r.userName]))),
      pm: list(all.map((p) => [p.raw.projectManagerUserId, p.pmName])),
      dh: list(all.map((p) => [p.raw.deliveryHeadUserId, p.dhName])),
      department: list(all.map((p) => [p.raw.departmentId, p.deptName])),
      geography: list(all.filter((p) => p.raw.geography).map((p) => [p.raw.geography, p.raw.geography])),
    };
  }, [all]);

  const filtered = useMemo(() => {
    const has = (arr, v) => !arr.length || arr.includes(String(v ?? ""));
    const q = f.q.trim().toLowerCase();
    return all.filter((p) => {
      if (q && !`${p.name} ${p.code}`.toLowerCase().includes(q)) return false;
      if (!has(f.project, p.id) || !has(f.category, p.raw.categoryId) || !has(f.client, p.raw.clientId) || !has(f.billing, p.raw.billingTypeId)) return false;
      if (!has(f.status, p.raw.projectStatusId) || !has(f.pm, p.raw.projectManagerUserId) || !has(f.dh, p.raw.deliveryHeadUserId) || !has(f.department, p.raw.departmentId)) return false;
      if (!has(f.geography, p.raw.geography) || !has(f.zoho, p.zoho || NONE)) return false;
      if (f.resource.length && !p.res.some((r) => f.resource.includes(String(r.userId)))) return false;
      if (f.phase !== "all" && p.phase !== f.phase) return false;
      if (f.active === "active" && !p.active) return false;
      if (f.active === "inactive" && p.active) return false;
      if ((f.startFrom || f.startTo) && (!p.start || (f.startFrom && p.start < f.startFrom) || (f.startTo && p.start > f.startTo))) return false;
      if ((f.endFrom || f.endTo) && (!p.end || (f.endFrom && p.end < f.endFrom) || (f.endTo && p.end > f.endTo))) return false;
      return true;
    });
  }, [all, f]);

  const sorted = useMemo(() => {
    const get = {
      name: (p) => p.name, client: (p) => p.clientName, category: (p) => p.categoryName, billing: (p) => p.billingName, status: (p) => p.statusName,
      pm: (p) => p.pmName, dh: (p) => p.dhName, start: (p) => p.start || "9999", end: (p) => p.end || "9999", progress: (p) => p.progress,
      heads: (p) => p.heads, fte: (p) => p.fte, value: (p) => p.value, zoho: (p) => p.zoho,
    }[sort.key];
    return [...filtered].sort((a, b) => {
      const x = get(a); const y = get(b);
      return (typeof x === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir;
    });
  }, [filtered, sort]);

  const k = useMemo(() => {
    const users = new Map();
    filtered.forEach((p) => p.res.forEach((r) => { const u = users.get(String(r.userId)) || { bill: false }; if (r.billable) u.bill = true; users.set(String(r.userId), u); }));
    const bill = [...users.values()].filter((u) => u.bill).length;
    const value = filtered.reduce((a, p) => a + p.value, 0);
    const valued = filtered.filter((p) => p.value > 0).length;
    const fte = filtered.reduce((a, p) => a + p.fte, 0);
    const billFte = filtered.reduce((a, p) => a + p.billFte, 0);
    const cnt = (ph) => filtered.filter((p) => p.phase === ph).length;
    const currs = new Set(filtered.filter((p) => p.value && p.currency).map((p) => p.currency));
    return {
      total: filtered.length, active: filtered.filter((p) => p.active).length, value, avg: valued ? value / valued : 0,
      currency: currs.size === 1 ? [...currs][0] : "", mixed: currs.size > 1,
      ongoing: cnt("ongoing"), upcoming: cnt("upcoming"), completed: cnt("completed"), overdue: cnt("overdue"),
      ending30: filtered.filter((p) => p.phase === "ongoing" && p.daysLeft != null && p.daysLeft <= 30).length,
      people: users.size, bill, fte, billPct: fte ? Math.round((billFte / fte) * 100) : 0,
      clients: new Set(filtered.map((p) => p.raw.clientId).filter(Boolean)).size,
      noZoho: filtered.filter((p) => !p.zoho).length,
    };
  }, [filtered]);

  const charts = useMemo(() => {
    const group = (keyFn, valFn = () => 1) => {
      const m = {};
      filtered.forEach((p) => { const key = keyFn(p) || "—"; m[key] = (m[key] || 0) + valFn(p); });
      return Object.entries(m).map(([name, value]) => ({ name, value: +value.toFixed(2) })).sort((a, b) => b.value - a.value);
    };
    return {
      status: group((p) => p.statusName).map((d) => ({ ...d, color: statusColor(d.name) })),
      phase: PHASES.filter((p) => p.key !== "all").map((p) => ({ name: p.label, value: filtered.filter((x) => x.phase === p.key).length, color: p.color })).filter((d) => d.value),
      billing: group((p) => p.billingName),
      category: group((p) => p.categoryName),
      clientValue: group((p) => p.clientName, (p) => p.value).filter((d) => d.value > 0).slice(0, 10),
    };
  }, [filtered]);

  const activeCount = MULTI.filter((m) => f[m].length).length + ["q", "startFrom", "startTo", "endFrom", "endTo"].filter((x) => f[x]).length + (f.phase !== "all") + (f.active !== "all");
  const moreCount = ["billing", "zoho", "dh", "department", "geography"].filter((m) => f[m].length).length + ["startFrom", "startTo", "endFrom", "endTo"].filter((x) => f[x]).length;

  const chips = [
    ...MULTI.filter((m) => f[m].length).map((m) => {
      const names = f[m].map((id) => opts[m].find((o) => o.id === id)?.name || id);
      return { key: m, text: `${LABELS[m]}: ${names.slice(0, 2).join(", ")}${names.length > 2 ? ` +${names.length - 2}` : ""}`, clear: () => set(m, []) };
    }),
    ...(f.startFrom || f.startTo ? [{ key: "sd", text: `Start: ${f.startFrom ? fmtDate(f.startFrom) : "…"} – ${f.startTo ? fmtDate(f.startTo) : "…"}`, clear: () => setF((s) => ({ ...s, startFrom: "", startTo: "" })) }] : []),
    ...(f.endFrom || f.endTo ? [{ key: "ed", text: `End: ${f.endFrom ? fmtDate(f.endFrom) : "…"} – ${f.endTo ? fmtDate(f.endTo) : "…"}`, clear: () => setF((s) => ({ ...s, endFrom: "", endTo: "" })) }] : []),
  ];

  const exportProjects = () => downloadExcelCsv("project-details.csv", [
    ["Project Code", "Project Name", "Client", "Category", "Billing Type", "Status", "Phase", "Active", "Project Manager", "Delivery Head", "Department", "Start Date", "End Date", "% Elapsed", "Resources", "FTE", "Weekly Hours", "Currency", "Project Value", "Zoho Project ID", "PO Number", "SOW Reference", "Geography", "Remarks"],
    ...sorted.map((p) => [p.code, p.name, p.clientName, p.categoryName, p.billingName, p.statusName, PHASE_LABEL[p.phase], p.active ? "Yes" : "No", p.pmName, p.dhName, p.deptName, p.start, p.end, Math.round(p.progress), p.heads, p.fte.toFixed(2), p.hrs, p.currency, p.value || "", p.zoho, p.raw.poNumber, p.raw.sowReference, p.raw.geography, p.raw.remarks]),
  ]);
  const exportResources = () => downloadExcelCsv("project-resources.csv", [
    ["Project Code", "Project Name", "Client", "Project Manager", "Employee", "Role", "Designation", "Department", "Allocation %", "Weekly Hours", "Billable", "Start Date", "End Date"],
    ...sorted.flatMap((p) => p.res.map((r) => [p.code, p.name, p.clientName, p.pmName, r.userName, r.roleName, r.designationName, r.deptName, r.pct, r.hrs, r.billable ? "Yes" : "No", ymd(r.startDate), ymd(r.endDate)])),
  ]);

  const ms = (key) => <MultiSelect label={LABELS[key]} options={opts[key]} value={f[key]} onChange={(v) => set(key, v)} allText={ALL_TEXT[key]} />;
  const cell = { padding: "10px 12px", display: "flex", alignItems: "center", fontSize: 13, color: COLORS.textSoft, borderTop: `1px solid ${COLORS.border}`, minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" };
  const exportBtn = { display: "flex", alignItems: "center", gap: 6, background: COLORS.successSoft, color: COLORS.success, border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* ---------- Filters ---------- */}
      <div style={{ ...card, padding: 18, position: "relative", zIndex: 5 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
          <div style={{ flex: "1 1 260px", position: "relative" }}>
            <Search size={15} color={COLORS.textMuted} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            <input value={f.q} onChange={(e) => set("q", e.target.value)} placeholder="Search project name or code" style={{ ...inputStyle, paddingLeft: 34 }} />
          </div>
          <Seg value={f.phase} onChange={(v) => set("phase", v)} items={PHASES} />
          <Seg value={f.active} onChange={(v) => set("active", v)} items={[{ key: "all", label: "All" }, { key: "active", label: "Active" }, { key: "inactive", label: "Inactive" }]} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "14px 16px", alignItems: "end" }}>
          {ms("project")}
          {ms("client")}
          {ms("category")}
          {ms("status")}
          {ms("pm")}
          {ms("resource")}
          {more && (
            <>
              {ms("billing")}
              {ms("zoho")}
              {ms("dh")}
              {ms("department")}
              {ms("geography")}
              <DateRange label="Project Start between" from={f.startFrom} to={f.startTo} onFrom={(v) => set("startFrom", v)} onTo={(v) => set("startTo", v)} />
              <DateRange label="Project End between" from={f.endFrom} to={f.endTo} onFrom={(v) => set("endFrom", v)} onTo={(v) => set("endTo", v)} />
            </>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 14 }}>
          <button type="button" onClick={() => setMore((m) => !m)} style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${COLORS.border}`, background: "#fff", borderRadius: 9, padding: "8px 12px", fontSize: 12.5, fontWeight: 700, color: COLORS.textSoft, cursor: "pointer" }}>
            <SlidersHorizontal size={14} /> {more ? "Fewer filters" : "More filters"}{moreCount ? ` (${moreCount})` : ""}
            <ChevronDown size={14} style={{ transform: more ? "rotate(180deg)" : "none" }} />
          </button>
          {chips.map((c) => (
            <span key={c.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 999, background: COLORS.accentSoft, color: COLORS.accent, fontSize: 12, fontWeight: 600, maxWidth: 320 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.text}</span>
              <X size={13} style={{ cursor: "pointer", flexShrink: 0 }} onClick={c.clear} />
            </span>
          ))}
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 12.5, color: COLORS.textMuted }}>{filtered.length} of {all.length} projects</span>
          <button type="button" onClick={() => setF(EMPTY)} disabled={!activeCount} style={{ display: "flex", alignItems: "center", gap: 6, borderRadius: 9, border: `1px solid ${activeCount ? COLORS.accent : COLORS.border}`, background: activeCount ? COLORS.accentSoft : "#fff", color: activeCount ? COLORS.accent : COLORS.textMuted, fontWeight: 700, fontSize: 12.5, padding: "8px 12px", cursor: activeCount ? "pointer" : "default" }}>
            <FilterX size={14} /> Clear all{activeCount ? ` (${activeCount})` : ""}
          </button>
        </div>
      </div>

      {/* ---------- Cards ---------- */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(215px, 1fr))", gap: 14 }}>
        <Kpi icon={FolderKanban} color={COLORS.accent} label="Projects" value={k.total} sub={`${k.active} active · ${k.total - k.active} inactive`} />
        <Kpi icon={Landmark} color="#8B5CF6" label="Portfolio Value" value={`${k.currency} ${compact(k.value)}`.trim()} sub={k.mixed ? "Mixed currencies" : `Avg ${k.currency} ${compact(k.avg)}`.trim()} />
        <Kpi icon={PlayCircle} color={COLORS.accent} label="Ongoing" value={k.ongoing} sub={`${k.upcoming} upcoming`} />
        <Kpi icon={CheckCircle2} color={COLORS.success} label="Completed" value={k.completed} sub="End date passed" />
        <Kpi icon={AlarmClock} color={COLORS.danger} label="Overdue" value={k.overdue} sub="Past end date, still open" />
        <Kpi icon={CalendarClock} color={COLORS.warning} label="Ending in 30 Days" value={k.ending30} sub="Ongoing projects" />
        <Kpi icon={Users2} color="#0EA5A4" label="Resources Deployed" value={k.people} sub={`${k.bill} billable · ${k.people - k.bill} non-billable`} />
        <Kpi icon={Gauge} color={COLORS.success} label="Total FTE" value={k.fte.toFixed(1)} sub={`${k.billPct}% billable effort`} />
        <Kpi icon={Building2} color="#EAB308" label="Clients" value={k.clients} sub="In current selection" />
        <Kpi icon={FileWarning} color="#E11D48" label="Missing Zoho ID" value={k.noZoho} sub="Needed before Finance approval" />
      </div>

      {/* ---------- Project matrix + accordion ---------- */}
      <Panel
        title="Project Details"
        sub="Click a project to expand its complete resource details · click a column to sort"
        action={(
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={exportProjects} disabled={!sorted.length} style={exportBtn}><Download size={13} /> Export Projects (Excel)</button>
            <button type="button" onClick={exportResources} disabled={!sorted.length} style={exportBtn}><Download size={13} /> Export Resources (Excel)</button>
          </div>
        )}
      >
        {sorted.length === 0 ? <Empty /> : (
          <div ref={wrapRef} style={{ overflow: "auto", maxHeight: 620, border: `1px solid ${COLORS.border}`, borderRadius: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: GRID_COLS, width: "max-content", minWidth: "100%" }}>
              {COLS.map((c, i) => (
                <div key={c.key} onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? -s.dir : 1 }))} style={{ position: "sticky", top: 0, left: i === 0 ? 0 : undefined, zIndex: i === 0 ? 4 : 3, background: COLORS.navy, color: "#fff", padding: "11px 12px", fontSize: 11.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, userSelect: "none", whiteSpace: "nowrap" }}>
                  {c.label} <ArrowUpDown size={11} style={{ opacity: sort.key === c.key ? 1 : 0.4 }} />
                </div>
              ))}

              {sorted.map((p, idx) => {
                const open = openId === p.id;
                const bg = open ? COLORS.accentSoft : idx % 2 ? COLORS.surface : "#fff";
                const row = { ...cell, background: bg, cursor: "pointer" };
                const toggle = () => setOpenId(open ? null : p.id);
                return (
                  <Fragment key={p.id}>
                    <div onClick={toggle} style={{ ...row, position: "sticky", left: 0, zIndex: 1, gap: 8, color: COLORS.text, fontWeight: 700, boxShadow: "4px 0 8px -6px rgba(15,23,48,.25)" }}>
                      {open ? <ChevronDown size={16} color={COLORS.accent} style={{ flexShrink: 0 }} /> : <ChevronRight size={16} color={COLORS.textMuted} style={{ flexShrink: 0 }} />}
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                        <span style={{ display: "block", fontSize: 11, color: COLORS.textMuted, fontWeight: 500 }}>{p.code}{!p.active ? " · Inactive" : ""}</span>
                      </span>
                    </div>
                    <div onClick={toggle} style={{ ...row, gap: 8, color: COLORS.text, fontWeight: 700 }}>
                      <Users2 size={14} color={COLORS.accent} /> {p.heads}
                    </div>
                    <div onClick={toggle} style={row}>{p.clientName}</div>
                    <div onClick={toggle} style={row}>{p.categoryName}</div>
                    <div onClick={toggle} style={row}>{p.billingName}</div>
                    <div onClick={toggle} style={row}><Badge color={statusColor(p.statusName)}>{p.statusName}</Badge></div>
                    <div onClick={toggle} style={row}>{p.pmName}</div>
                    <div onClick={toggle} style={row}>{p.dhName}</div>
                    <div onClick={toggle} style={row}>{fmtDate(p.start)}</div>
                    <div onClick={toggle} style={row}>{fmtDate(p.end)}</div>
                    <div onClick={toggle} style={{ ...row, flexDirection: "column", alignItems: "stretch", justifyContent: "center", gap: 5 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                        <span style={{ color: PHASE_COLOR[p.phase], fontWeight: 700 }}>{PHASE_LABEL[p.phase]}</span>
                        <span>{p.start ? `${Math.round(p.progress)}%` : ""}</span>
                      </div>
                      <Progress pct={p.progress} color={PHASE_COLOR[p.phase] || COLORS.accent} />
                    </div>
                    <div onClick={toggle} style={{ ...row, fontWeight: 700, color: COLORS.text }}>{p.fte.toFixed(2)}</div>
                    <div onClick={toggle} style={{ ...row, fontWeight: 700, color: COLORS.text }}>{p.value ? `${p.currency} ${money(p.value)}`.trim() : "—"}</div>
                    <div onClick={toggle} style={row}>{p.zoho || <span style={{ color: COLORS.danger, fontWeight: 600 }}>Not set</span>}</div>
                    {open && (
                      <div style={{ gridColumn: "1 / -1", background: COLORS.accentSoft }}>
                        <ProjectAccordion p={p} width={Math.max(wrapW, 320)} />
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>
          </div>
        )}
      </Panel>

      {/* ---------- Visuals ---------- */}
      {filtered.length > 0 && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
            <Panel title="Projects by Status" sub="Count of projects per status" style={{ flex: "1 1 300px" }}>{donut(charts.status)}</Panel>
            <Panel title="Delivery Phase" sub="Based on start / end dates vs today" style={{ flex: "1 1 300px" }}>{donut(charts.phase)}</Panel>
            <Panel title="Billing Type Mix" sub="Projects per billing type" style={{ flex: "1 1 300px" }}>{donut(charts.billing)}</Panel>
          </div>

          <Panel title="Portfolio Timeline" sub="Project schedule with time elapsed and today marker">
            <Gantt projects={filtered} />
          </Panel>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
            <Panel title="Project Value by Client" sub={`Top 10 clients${k.mixed ? " · mixed currencies" : ""}`} style={{ flex: "1 1 420px" }}>
              {charts.clientValue.length === 0 ? <Empty text="No project values entered." /> : (
                <div style={{ height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={charts.clientValue} margin={{ top: 22, right: 10, left: 0, bottom: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.border} />
                      <XAxis dataKey="name" interval={0} angle={-25} textAnchor="end" height={50} tick={{ fontSize: 11.5, fill: COLORS.textSoft }} />
                      <YAxis tickFormatter={compact} tick={{ fontSize: 11.5, fill: COLORS.textSoft }} />
                      <Tooltip cursor={false} formatter={(v) => [money(v), "Value"]} />
                      <Bar dataKey="value" fill="#8B5CF6" radius={[6, 6, 0, 0]} maxBarSize={48} activeBar={false}>
                        <LabelList dataKey="value" position="top" formatter={compact} style={{ fill: COLORS.text, fontSize: 11.5, fontWeight: 700 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>
            <Panel title="Projects by Category" sub="Count of projects per category" style={{ flex: "1 1 340px" }}>
              <div style={{ height: Math.max(300, charts.category.length * 36 + 30) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={charts.category} margin={{ top: 0, right: 34, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={COLORS.border} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11.5, fill: COLORS.textSoft }} />
                    <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11.5, fill: COLORS.textSoft }} />
                    <Tooltip cursor={false} formatter={(v) => [v, "Projects"]} />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={24} activeBar={false}>
                      {charts.category.map((d, i) => <Cell key={d.name} fill={PALETTE[i % PALETTE.length]} />)}
                      <LabelList dataKey="value" position="right" style={{ fill: COLORS.text, fontSize: 12, fontWeight: 700 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>

        </>
      )}
    </div>
  );
}