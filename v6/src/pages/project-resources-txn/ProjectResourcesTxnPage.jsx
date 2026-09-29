import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  Loader2,
  RefreshCw,
  AlertCircle,
  Users2,
} from "lucide-react";
import { callProjectFlow, callProjectResourceTxnFlow, callRoleFlow, callUserFlow } from "../../api/flows";
import { ConfirmModal } from "../../components/common/ConfirmModal";
import { EmptyState } from "../../components/common/EmptyState";
import { StatusBadge } from "../../components/common/StatusBadge";
import { COLORS, cardStyle } from "../../constants/theme";
import { ProjectResourcesTxnPanel } from "./ProjectResourcesTxnPanel";
import { logAudit } from "../../utils/audit";
import { toDateInput } from "../../utils/format";

export function ProjectResourcesTxnPage() {
  const [rows, setRows] = useState([]);
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [panel, setPanel] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [listError, setListError] = useState("");

  const refresh = useCallback(() => {
    setLoading(true);
    setListError("");
    callProjectResourceTxnFlow("LIST").then((res) => {
      setRows(res.data);
      setLoading(false);
    }).catch((e) => {
      setListError(e.message);
      setLoading(false);
    });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { callProjectFlow("LIST").then((res) => setProjects(res.data)); }, []);
  useEffect(() => { callUserFlow("LIST").then((res) => setUsers(res.data)); }, []);
  useEffect(() => { callRoleFlow("LIST").then((res) => setRoles(res.data)); }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const projectName = (id) => projects.find((p) => String(p.id) === String(id))?.projectName || "—";
  const userName = (id) => {
    const u = users.find((x) => String(x.id) === String(id));
    return u ? `${u.firstName} ${u.lastName}` : "—";
  };
  const roleName = (id) => roles.find((r) => String(r.id) === String(id))?.name || "—";

  const filtered = rows.filter((r) =>
    userName(r.userId).toLowerCase().includes(search.toLowerCase()) ||
    projectName(r.projectId).toLowerCase().includes(search.toLowerCase())
  );

  const kpis = [
    { label: "Total Assignments", value: String(rows.length), icon: Users2, color: "#22A06B" },
    { label: "Avg Allocation %", value: rows.length ? String(Math.round(rows.reduce((s, r) => s + Number(r.allocationPct || 0), 0) / rows.length)) : "0", icon: CheckCircle2, color: COLORS.success },
    { label: "Active", value: String(rows.filter((r) => r.active).length), icon: AlertCircle, color: "#F59E0B" },
  ];

  const submitPanel = (form) => {
    if (!form.userId || !form.projectId) {
      setErr("Resource and Project are required.");
      return;
    }
    setSaving(true);
    setErr("");
    const action = form.guid ? "EDIT" : "CREATE";
    callProjectResourceTxnFlow(action, form)
      .then((res) => {
        setRows(res.data);
        setSaving(false);
        setPanel(null);
logAudit("Project Resources", form.guid ? "Update" : "Create", `${userName(form.userId)} — ${projectName(form.projectId)}`, null, {
          userId: form.userId,
          projectId: form.projectId,
        });        setToast(form.guid ? "Resource assignment updated." : "Resource assignment added.");
      })
      .catch((e) => {
        setSaving(false);
        setErr(e.message);
      });
  };

  const toggleActive = (r0) => {
    setRows((prev) => prev.map((r) => (r.guid === r0.guid ? { ...r, _toggling: true } : r)));
    callProjectResourceTxnFlow("EDIT", { ...r0, active: !r0.active })
      .then((res) => {
        setRows(res.data);
logAudit("Project Resources", "Update", `${userName(r0.userId)} — ${projectName(r0.projectId)}`, null, {
          userId: r0.userId,
          projectId: r0.projectId,
        });        setToast(`Marked ${!r0.active ? "Active" : "Inactive"}.`);
      })
      .catch((e) => {
        setRows((prev) => prev.map((r) => (r.guid === r0.guid ? { ...r, _toggling: false } : r)));
        setToast(`Update failed: ${e.message}`);
      });
  };

  const confirmDeleteRow = () => {
    if (!confirmDelete) return;
    setDeleting(true);
    callProjectResourceTxnFlow("DELETE", confirmDelete)
      .then((res) => {
        setRows(res.data);
        setDeleting(false);
        setConfirmDelete(null);
logAudit("Project Resources", "Delete", `${userName(confirmDelete.userId)} — ${projectName(confirmDelete.projectId)}`, null, {
          userId: confirmDelete.userId,
          projectId: confirmDelete.projectId,
        });        setToast("Resource assignment deleted.");
      })
      .catch((e) => {
        setDeleting(false);
        setToast(`Delete failed: ${e.message}`);
      });
  };

  if (panel) {
    return (
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
        <ProjectResourcesTxnPanel mode={panel.mode} data={panel.data} projects={projects} users={users} roles={roles} rows={rows} saving={saving} error={err} onCancel={() => {
            if (panel?.mode === "add") {
              setPanel({ mode: "add", data: { guid: "", projectId: "", userId: "", roleId: "", startDate: "", endDate: "", allocationPct: 100, active: true } });
            } else {
              setPanel(null);
            }
            setErr("");
          }} onClose={() => setPanel(null)}
          onSubmit={submitPanel} />
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
      <div style={{ flex: 1, padding: 26, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div style={{ fontFamily: "Sora, sans-serif", fontSize: 20, fontWeight: 700, color: COLORS.text }}>Project Resources</div>
            <div style={{ color: COLORS.textMuted, fontSize: 13.5 }}>Resource-to-project assignment history</div>
          </div>
          <button
            onClick={() => setPanel({ mode: "add", data: { guid: "", projectId: "", userId: "", roleId: "", startDate: "", endDate: "", allocationPct: 100, active: true } })}
            style={{ display: "flex", alignItems: "center", gap: 7, background: COLORS.accent, color: "#fff", border: "none", borderRadius: 9, padding: "10px 16px", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}
          >
            <Plus size={15} /> Add Assignment
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

        <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${COLORS.border}` }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: COLORS.text }}>Assignments <span style={{ color: COLORS.textMuted, fontWeight: 500 }}>({filtered.length})</span></div>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "7px 11px", width: 260 }}>
                <Search size={14} color={COLORS.textMuted} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by resource or project" style={{ border: "none", outline: "none", fontSize: 13, width: "100%", fontFamily: "Inter, sans-serif" }} />
              </div>
              <button onClick={refresh} style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${COLORS.border}`, background: "#fff", borderRadius: 8, padding: "0 12px", fontSize: 12.5, cursor: "pointer", color: COLORS.text }}>
                <RefreshCw size={13} className={loading ? "spin" : ""} /> Refresh
              </button>
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: COLORS.bg }}>
                {["Resource", "Project", "Role", "Start Date", "End Date", "Allocation %", "Status", "Actions"].map((h) => (
                  <th key={h} style={{ textAlign: h === "Actions" ? "center" : "left", padding: "10px 16px", fontSize: 12, color: COLORS.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: COLORS.textMuted }}>
                  <Loader2 size={18} className="spin" style={{ verticalAlign: "middle", marginRight: 8 }} /> Loading assignments…
                </td></tr>
              ) : listError ? (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                    <div style={{ color: COLORS.textMuted, fontSize: 13.5 }}>No data available.</div>
                    <button onClick={refresh} style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${COLORS.border}`, background: "#fff", borderRadius: 8, padding: "6px 14px", fontSize: 12.5, cursor: "pointer", color: COLORS.text }}>
                      <RefreshCw size={13} /> Retry
                    </button>
                  </div>
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8}><EmptyState icon={Users2} message="No resource assignments available." /></td></tr>
              ) : filtered.map((r, i) => (
                <tr key={r.id} style={{ borderTop: `1px solid ${COLORS.border}`, background: i % 2 ? "COLORS.tableHead" : "#fff" }}>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text, fontWeight: 600 }}>{userName(r.userId)}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text }}>{projectName(r.projectId)}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text }}>{roleName(r.roleId)}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text }}>{r.startDate || "—"}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text }}>{r.endDate || "—"}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text }}>{r.allocationPct}%</td>
                  <td style={{ padding: "11px 16px" }}><StatusBadge active={r.active} busy={r._toggling} onToggle={() => toggleActive(r)} /></td>
                  <td style={{ padding: "11px 16px", textAlign: "center" }}>
                    <div style={{ display: "inline-flex", gap: 8 }}>
                      <button onClick={() => setPanel({ mode: "edit", data: { ...r, startDate: toDateInput(r.startDate), endDate: toDateInput(r.endDate) } })} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: COLORS.accentSoft, color: COLORS.accent, border: "none", borderRadius: 7, padding: "6px 11px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                        <Pencil size={12} /> Edit
                      </button>
                      <button onClick={() => setConfirmDelete(r)} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: COLORS.dangerSoft, color: COLORS.danger, border: "none", borderRadius: 7, padding: "6px 11px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                        <Trash2 size={12} /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {confirmDelete && (
        <ConfirmModal title="Delete this assignment?" message={`"${userName(confirmDelete.userId)}" on "${projectName(confirmDelete.projectId)}" will be permanently removed. This can't be undone.`} confirmLabel="Delete" busy={deleting} onCancel={() => setConfirmDelete(null)} onConfirm={confirmDeleteRow} />
      )}

      {toast && (
        <div style={{ position: "absolute", bottom: 22, left: "50%", transform: "translateX(-50%)", background: COLORS.text, color: "#fff", padding: "10px 18px", borderRadius: 9, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 12px 30px rgba(0,0,0,0.2)" }}>
          <CheckCircle2 size={15} color={COLORS.success} /> {toast}
        </div>
      )}
    </div>
  );
}