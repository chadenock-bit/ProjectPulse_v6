import { useState, useMemo, useEffect } from "react";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  User,
  CheckCircle2,
  Loader2,
  Users2,
  ArrowUpDown,
  Filter,
  Clock,
  LayoutGrid,
  CalendarRange,
  BadgeCheck,
  X as XIcon,
} from "lucide-react";
import { callProjectResourceFlow, callDesignationFlow, callDepartmentFlow } from "../../api/flows";
import { ConfirmModal } from "../../components/common/ConfirmModal";
import { EmptyState } from "../../components/common/EmptyState";
import { StatusBadge } from "../../components/common/StatusBadge";
import { COLORS, cardStyle, inputStyle, labelStyle } from "../../constants/theme";
import { AllocationPanel } from "./AllocationPanel";
import { SORT_FIELDS, TimelineView } from "./TimelineView";
import { findName, useLookups, useProjectsWithResources, userLabel } from "./hooks";
import { logAudit } from "../../utils/audit";
import { toDateInput } from "../../utils/format";

export function ResourceAllocationPage() {
  const lookups = useLookups();
  const { projects, loading, error: loadError, refresh } = useProjectsWithResources();
  const [view, setView] = useState("grid"); // 'grid' | 'timeline'
  const [search, setSearch] = useState("");
  const [panel, setPanel] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [designations, setDesignations] = useState([]);
  const [departments, setDepartments] = useState([]);

  useEffect(() => { callDesignationFlow("LIST").then((res) => setDesignations(res.data)).catch(() => {}); }, []);
  useEffect(() => { callDepartmentFlow("LIST").then((res) => setDepartments(res.data)).catch(() => {}); }, []);

  // --- Filters: Employee, Project, Date range ---
  const [showFilters, setShowFilters] = useState(false);
  const [empFilter, setEmpFilter] = useState("");
  const [projFilter, setProjFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  // --- Sort ---
  const [sortBy, setSortBy] = useState("start");
  const [sortDir, setSortDir] = useState("asc"); // 'asc' | 'desc'

  const allocations = useMemo(() => (
    projects.flatMap((p) => p.resources.map((r) => ({ ...r, projectId: p.guid, projectName: p.projectName, projectCode: p.projectCode })))
  ), [projects]);

  const activeFilterCount = [empFilter, projFilter, dateFrom, dateTo].filter(Boolean).length;

  const filtered = useMemo(() => {
    if (loadError) return [];
    const q = search.toLowerCase();
    let list = allocations.filter((a) => {
      if (q && !(userLabel(lookups.users, a.userId).toLowerCase().includes(q) || a.projectName.toLowerCase().includes(q) || a.projectCode.toLowerCase().includes(q))) return false;
      if (empFilter && String(a.userId) !== String(empFilter)) return false;
      if (projFilter && String(a.projectId) !== String(projFilter)) return false;
      if (dateFrom && a.endDate && a.endDate < dateFrom) return false;
      if (dateTo && a.startDate && a.startDate > dateTo) return false;
      return true;
    });
    const getVal = SORT_FIELDS[sortBy] || SORT_FIELDS.start;
    list = [...list].sort((a, b) => {
      const va = getVal(a, lookups), vb = getVal(b, lookups);
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [allocations, search, empFilter, projFilter, dateFrom, dateTo, sortBy, sortDir, lookups, loadError]);

  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("asc");
    }
  };
  const clearFilters = () => { setEmpFilter(""); setProjFilter(""); setDateFrom(""); setDateTo(""); };

  const openAdd = () => setPanel({
    projectId: "", userId: "", roleId: "", designationId: "", departmentId: "", allocationPct: 50, weeklyHours: 20, billable: true, startDate: "", endDate: "",
  });

  // Slice any full ISO timestamp down to plain yyyy-MM-dd before it reaches
  // the date inputs — otherwise <input type="date"> renders those fields
  // blank even though the row actually has a value (see utils/format.js).
  const openEdit = (a) => setPanel({ ...a, startDate: toDateInput(a.startDate), endDate: toDateInput(a.endDate) });

  const submitPanel = (form) => {
    if (!form.projectId || !form.userId || !form.roleId || !form.startDate || !form.endDate) {
      setErr("Project, User, Role and Dates are required.");
      return;
    }

    // 100% allocation cap — sum this user's other active allocations plus the
    // new/edited one; block if it pushes them over 100% total across projects.
    const userTotal = allocations
      .filter((a) => String(a.userId) === String(form.userId) && a.guid !== form.guid)
      .reduce((sum, a) => sum + Number(a.allocationPct || 0), 0) + Number(form.allocationPct || 0);
    if (userTotal > 100) {
      setErr(`This would put ${userLabel(lookups.users, form.userId)} at ${userTotal}% total allocation across active projects — over the 100% limit.`);
      return;
    }

    setSaving(true);
    setErr("");
    const action = form.guid ? "EDIT" : "CREATE";
    callProjectResourceFlow(action, form)
      .then(() => refresh())
      .then(() => {
        setSaving(false);
        setPanel(null);
 logAudit("Resource Allocation", form.guid ? "Update" : "Create", `${userLabel(lookups.users, form.userId)} → ${projects.find((p) => String(p.id) === String(form.projectId))?.projectName || "project"}`, null, {
          userId: form.userId,
          projectId: form.projectId,
          projectManagerUserId: (projects.find((p) => String(p.id) === String(form.projectId)) || {}).projectManagerUserId,
        });        setToast(form.guid ? "Allocation updated." : "Resource allocated.");
      })
      .catch((e) => {
        setSaving(false);
        setErr(e.message);
      });
  };

  // Same one-click pattern as the master screens' Active/Inactive toggle —
  // re-sends the allocation as-is with only `billable` flipped, then a full
  // refresh() picks up the change (this hook doesn't expose a row-level
  // setter, unlike ProjectDashboardPage's setProjects).
  const toggleBillable = (a0) => {
    callProjectResourceFlow("EDIT", { ...a0, billable: !a0.billable })
      .then(() => refresh())
      .then(() => {
 logAudit("Resource Allocation", "Update", `${userLabel(lookups.users, a0.userId)} → ${a0.projectName}`, null, {
          userId: a0.userId,
          projectId: a0.projectId,
          projectManagerUserId: (projects.find((p) => String(p.id) === String(a0.projectId)) || {}).projectManagerUserId,
        });        setToast(`Marked ${!a0.billable ? "Billable" : "Non-billable"}.`);
      })
      .catch((e) => setToast(`Update failed: ${e.message}`));
  };

  const confirmDeleteRow = () => {
    if (!confirmDelete || deleting) return;
    setDeleting(true);
    callProjectResourceFlow("DELETE", { guid: confirmDelete.guid })
      .then(() => refresh())
      .then(() => {
logAudit("Resource Allocation", "Delete", `${userLabel(lookups.users, confirmDelete.userId)} → ${confirmDelete.projectName}`, null, {
          userId: confirmDelete.userId,
          projectId: confirmDelete.projectId,
        });        setToast("Allocation removed.");
        setConfirmDelete(null);
      })
      .catch((e) => setToast(`Remove failed: ${e.message}`))
      .finally(() => setDeleting(false));
  };

  const totalHours = filtered.reduce((s, a) => s + Number(a.weeklyHours || 0), 0);
  const billableCount = filtered.filter((a) => a.billable).length;

  const kpis = [
    { label: "Total Allocations", value: String(allocations.length), icon: Users2, color: COLORS.accent },
    { label: "Billable Assignments", value: String(billableCount), icon: BadgeCheck, color: COLORS.success },
    { label: "Weekly Hours (filtered)", value: String(totalHours), icon: Clock, color: "#F59E0B" },
  ];

  const SortHeader = ({ field, children }) => (
    <th
      onClick={() => toggleSort(field)}
      style={{ textAlign: "left", padding: "10px 16px", fontSize: 12, color: sortBy === field ? COLORS.accent : COLORS.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, cursor: "pointer", userSelect: "none" }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {children} <ArrowUpDown size={11} style={{ opacity: sortBy === field ? 1 : 0.35 }} />
      </span>
    </th>
  );

  if (panel) {
    return (
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
        <AllocationPanel data={panel} saving={saving} error={err} onCancel={() => { panel.guid ? setPanel(null) : openAdd(); setErr(""); }} onClose={() => { setPanel(null); setErr(""); }}
          onSubmit={submitPanel} lookups={lookups} projects={projects} designations={designations} departments={departments} />
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
      <div style={{ flex: 1, minWidth: 0, padding: 26, overflowY: "auto", overflowX: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontFamily: "Sora, sans-serif", fontSize: 20, fontWeight: 700, color: COLORS.text }}>Resource Allocation</div>
            <div style={{ color: COLORS.textMuted, fontSize: 13.5 }}>Assign users to projects and plan capacity</div>
          </div>
          <button onClick={openAdd} style={{ display: "flex", alignItems: "center", gap: 7, background: COLORS.accent, color: "#fff", border: "none", borderRadius: 9, padding: "10px 16px", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
            <Plus size={15} /> Add Allocation
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 16 }}>
          {kpis.map((k) => {
            const Icon = k.icon;
            return (
              <div key={k.label} style={cardStyle}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ color: COLORS.textMuted, fontSize: 12.5, fontWeight: 600 }}>{k.label}</span>
                  <span style={{ width: 30, height: 30, borderRadius: 8, background: `${k.color}1F`, color: k.color, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={15} /></span>
                </div>
                <div style={{ fontFamily: "Sora, sans-serif", fontSize: 26, fontWeight: 700, color: COLORS.text, marginTop: 10 }}>{k.value}</div>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "9px 12px", width: 260, background: COLORS.card }}>
            <Search size={14} color={COLORS.textMuted} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by user or project" style={{ border: "none", outline: "none", fontSize: 13, width: "100%", fontFamily: "Inter, sans-serif" }} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => setShowFilters((v) => !v)} style={{
              display: "flex", alignItems: "center", gap: 6, border: `1px solid ${showFilters ? COLORS.accent : COLORS.border}`,
              background: showFilters ? COLORS.accentSoft : "#fff", color: showFilters ? COLORS.accent : COLORS.text,
              borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
            }}>
              <Filter size={13} /> Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </button>

            <div style={{ display: "flex", border: `1px solid ${COLORS.border}`, borderRadius: 8, overflow: "hidden" }}>
              <button onClick={() => setView("grid")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", border: "none", background: view === "grid" ? COLORS.accent : "#fff", color: view === "grid" ? "#fff" : COLORS.text, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                <LayoutGrid size={13} /> Grid
              </button>
              <button onClick={() => setView("timeline")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", border: "none", background: view === "timeline" ? COLORS.accent : "#fff", color: view === "timeline" ? "#fff" : COLORS.text, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                <CalendarRange size={13} /> Timeline
              </button>
            </div>
          </div>
        </div>

        {showFilters && (
          <div style={{ ...cardStyle, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", marginBottom: 14 }}>
            <div style={{ minWidth: 180 }}>
              <label style={{ ...labelStyle, fontSize: 11.5, marginBottom: 4 }}>Employee</label>
              <select value={empFilter} onChange={(e) => setEmpFilter(e.target.value)} style={inputStyle}>
                <option value="">All employees</option>
                {lookups.users.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
              </select>
            </div>
            <div style={{ minWidth: 180 }}>
              <label style={{ ...labelStyle, fontSize: 11.5, marginBottom: 4 }}>Project</label>
              <select value={projFilter} onChange={(e) => setProjFilter(e.target.value)} style={inputStyle}>
                <option value="">All projects</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.projectName}</option>)}
              </select>
            </div>
            <div style={{ minWidth: 150 }}>
              <label style={{ ...labelStyle, fontSize: 11.5, marginBottom: 4 }}>From</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ minWidth: 150 }}>
              <label style={{ ...labelStyle, fontSize: 11.5, marginBottom: 4 }}>To</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inputStyle} />
            </div>
            {activeFilterCount > 0 && (
              <button onClick={clearFilters} style={{ display: "flex", alignItems: "center", gap: 5, border: "none", background: "none", color: COLORS.danger, fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: "10px 4px" }}>
                <XIcon size={13} /> Clear
              </button>
            )}
          </div>
        )}

        {view === "grid" ? (
          <div style={{ ...cardStyle, padding: 0, overflowX: "auto", overflowY: "hidden" }}>
            <table style={{ width: "100%", minWidth: 1080, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: COLORS.bg }}>
                  <SortHeader field="user">User</SortHeader>
                  <SortHeader field="project">Project</SortHeader>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 12, color: COLORS.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>Role</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 12, color: COLORS.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>Designation</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 12, color: COLORS.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>Department</th>
                  <SortHeader field="allocation">Allocation</SortHeader>
                  <SortHeader field="hours">Weekly Hrs</SortHeader>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 12, color: COLORS.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>Billable</th>
                  <th style={{ textAlign: "center", padding: "10px 12px", fontSize: 12, color: COLORS.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} style={{ padding: 40, textAlign: "center", color: COLORS.textMuted }}>
                    <Loader2 size={18} className="spin" style={{ verticalAlign: "middle", marginRight: 8 }} /> Loading allocations…
                  </td></tr>
                ) : loadError ? (
                  <tr><td colSpan={9}><EmptyState onRetry={refresh} /></td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={9} style={{ padding: 40, textAlign: "center", color: COLORS.textMuted }}>No data available.</td></tr>
                ) : filtered.map((a, i) => (
                  <tr key={a.id} style={{ borderTop: `1px solid ${COLORS.border}`, background: i % 2 ? "COLORS.tableHead" : "#fff" }}>
                    <td style={{ padding: "11px 12px", fontSize: 13.5, color: COLORS.text, fontWeight: 600, whiteSpace: "nowrap" }}>{userLabel(lookups.users, a.userId)}</td>
                    <td style={{ padding: "11px 12px", fontSize: 13.5, color: COLORS.text, whiteSpace: "nowrap" }}>{a.projectName} <span style={{ color: COLORS.textMuted }}>({a.projectCode})</span></td>
                    <td style={{ padding: "11px 12px", fontSize: 13.5, color: COLORS.text, whiteSpace: "nowrap" }}>{findName(lookups.roles, a.roleId)}</td>
                    <td style={{ padding: "11px 12px", fontSize: 13.5, color: COLORS.text, whiteSpace: "nowrap" }}>{findName(designations, a.designationId)}</td>
                    <td style={{ padding: "11px 12px", fontSize: 13.5, color: COLORS.text, whiteSpace: "nowrap" }}>{findName(departments, a.departmentId)}</td>
                    <td style={{ padding: "11px 12px", fontSize: 13.5, color: COLORS.text, whiteSpace: "nowrap" }}>{a.allocationPct}%</td>
                    <td style={{ padding: "11px 12px", fontSize: 13.5, color: COLORS.text, whiteSpace: "nowrap" }}>{a.weeklyHours} hrs</td>
                    <td style={{ padding: "11px 12px", whiteSpace: "nowrap" }}><StatusBadge active={a.billable} onLabel="Billable" offLabel="Non-billable" onToggle={() => toggleBillable(a)} /></td>
                    <td style={{ padding: "11px 12px", textAlign: "center", whiteSpace: "nowrap" }}>
                      <div style={{ display: "inline-flex", gap: 8 }}>
                        <button onClick={() => openEdit(a)} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: COLORS.accentSoft, color: COLORS.accent, border: "none", borderRadius: 7, padding: "6px 11px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                        <Pencil size={12} /> Edit
                      </button>
                        <button onClick={() => setConfirmDelete(a)} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: COLORS.dangerSoft, color: COLORS.danger, border: "none", borderRadius: 7, padding: "6px 11px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                        <Trash2 size={12} /> Delete
                      </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : loadError ? (
          <div style={cardStyle}><EmptyState onRetry={refresh} /></div>
        ) : (
          <TimelineView allocations={filtered} lookups={lookups} />
        )}
      </div>

      {confirmDelete && (
        <ConfirmModal
          title="Remove this allocation?"
          message={`${userLabel(lookups.users, confirmDelete.userId)} will be unassigned from ${confirmDelete.projectName}.`}
          confirmLabel="Remove" busy={deleting}
          onCancel={() => !deleting && setConfirmDelete(null)}
          onConfirm={confirmDeleteRow}
        />
      )}

      {toast && (
        <div style={{ position: "absolute", bottom: 22, left: "50%", transform: "translateX(-50%)", background: COLORS.text, color: "#fff", padding: "10px 18px", borderRadius: 9, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 12px 30px rgba(0,0,0,0.2)" }}>
          <CheckCircle2 size={15} color={COLORS.success} /> {toast}
        </div>
      )}
    </div>
  );
}