import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Building2,
  CheckCircle2,
  Loader2,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { callDepartmentFlow, checkReferences } from "../../api/flows";
import { ConfirmModal } from "../../components/common/ConfirmModal";
import { StatusBadge } from "../../components/common/StatusBadge";
import { COLORS, cardStyle } from "../../constants/theme";
import { DepartmentPanel } from "./DepartmentPanel";
import { logAudit } from "../../utils/audit";
import { findDuplicateCode, findDuplicateName } from "../../utils/validation";

export function DepartmentsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [panel, setPanel] = useState(null); // null | { mode: 'add'|'edit', data }
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null); // null | department row
  const [deleting, setDeleting] = useState(false);

  const [listError, setListError] = useState("");

  const refresh = useCallback(() => {
    setLoading(true);
    setListError("");
    callDepartmentFlow("LIST").then((res) => {
      setRows(res.data);
      setLoading(false);
    }).catch((e) => {
      setListError(e.message);
      setLoading(false);
    });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const filtered = rows.filter((r) =>
    (r.code || "").toLowerCase().includes(search.toLowerCase()) || (r.name || "").toLowerCase().includes(search.toLowerCase())
  );
  const activeCount = rows.filter((r) => r.active).length;

  const kpis = [
    { label: "Total Departments", value: String(rows.length), icon: Building2, color: "#6366F1" },
    { label: "Active Departments", value: String(activeCount), icon: CheckCircle2, color: COLORS.success },
    { label: "Inactive Departments", value: String(rows.length - activeCount), icon: AlertCircle, color: COLORS.danger },
  ];

  const submitPanel = (form) => {
    if (!form.code?.trim() || !form.name?.trim()) {
      setErr("Department Code and Name are required.");
      return;
    }
    if (findDuplicateCode(rows, form.code, form.guid)) {
      setErr("Department Code already exists.");
      return;
    }
    if (findDuplicateName(rows, form.name, form.guid)) {
      setErr("Department Name already exists. Please enter a unique Department Name.");
      return;
    }
    setSaving(true);
    setErr("");
    const action = form.guid ? "EDIT" : "CREATE";
    callDepartmentFlow(action, form)
      .then((res) => {
        setRows(res.data); // flow returns the refreshed list — reflect it immediately
        setSaving(false);
        setPanel(null);
        logAudit("Department", form.guid ? "Update" : "Create", form.name || form.code || form.empId || form.contactName || "record");
        setToast(form.guid ? "Department updated." : "Department added.");
      })
      .catch((e) => {
        setSaving(false);
        setErr(e.message);
      });
  };

  const toggleActive = (d) => {
    setRows((prev) => prev.map((r) => (r.guid === d.guid ? { ...r, _toggling: true } : r)));
    callDepartmentFlow("EDIT", { ...d, active: !d.active })
      .then((res) => {
        setRows(res.data);
        logAudit("Department", "Update", d.name || d.code || "record");
        setToast(`Marked ${!d.active ? "Active" : "Inactive"}.`);
      })
      .catch((e) => {
        setRows((prev) => prev.map((r) => (r.guid === d.guid ? { ...r, _toggling: false } : r)));
        setToast(`Update failed: ${e.message}`);
      });
  };

  const openEdit = async (d) => {
    // A Department that's assigned to any Users (or Projects/Resources)
    // is not editable at all — not just its Code. See checkReferences'
    // Department rule and FSD 4.1.2: "Departments linked with active
    // users or projects cannot be deleted" — tightened here to also
    // block edits, matching the Country/BillingType/Role/Client pattern.
    const guard = await checkReferences("Department", d.guid);
    if (guard.blocked) {
      setToast(guard.message);
      return;
    }
    setPanel({ mode: "edit", data: { ...d } });
  };

  const confirmDeleteRow = async () => {
    if (!confirmDelete) return;
    const guard = await checkReferences("Department", confirmDelete.guid);
    if (guard.blocked) {
      setToast(guard.message);
      setConfirmDelete(null);
      return;
    }
    setDeleting(true);
    callDepartmentFlow("DELETE", confirmDelete)
      .then((res) => {
        setRows(res.data);
        setDeleting(false);
        setConfirmDelete(null);
        logAudit("Department", "Delete", confirmDelete.name || confirmDelete.code || confirmDelete.empId || confirmDelete.contactName || "record");
        setToast("Department deleted.");
      })
      .catch((e) => {
        setDeleting(false);
        setToast(`Delete failed: ${e.message}`);
      });
  };

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
      <div style={{ flex: 1, padding: 26, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div style={{ fontFamily: "Sora, sans-serif", fontSize: 20, fontWeight: 700, color: COLORS.text }}>Department</div>
            <div style={{ color: COLORS.textMuted, fontSize: 13.5 }}>Add, edit and manage Departments</div>
          </div>
          <button
            onClick={() => setPanel({ mode: "add", data: { guid: "", code: "", name: "", active: true } })}
            style={{
              display: "flex", alignItems: "center", gap: 7, background: COLORS.accent, color: "#fff", border: "none",
              borderRadius: 9, padding: "10px 16px", fontSize: 13.5, fontWeight: 700, cursor: "pointer",
            }}
          >
            <Plus size={15} /> Add Department
          </button>
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${COLORS.border}` }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: COLORS.text }}>Departments <span style={{ color: COLORS.textMuted, fontWeight: 500 }}>({filtered.length})</span></div>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "7px 11px", width: 260 }}>
                <Search size={14} color={COLORS.textMuted} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by code or name"
                  style={{ border: "none", outline: "none", fontSize: 13, width: "100%", fontFamily: "Inter, sans-serif" }}
                />
              </div>
              <button onClick={refresh} style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${COLORS.border}`, background: "#fff", borderRadius: 8, padding: "0 12px", fontSize: 12.5, cursor: "pointer", color: COLORS.text }}>
                <RefreshCw size={13} className={loading ? "spin" : ""} /> Refresh
              </button>
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: COLORS.bg }}>
                {["Department Code", "Department Name", "Status","Actions"].map((h) => (
                  <th key={h} style={{ textAlign: h === "Actions" ? "center" : "left", padding: "10px 16px", fontSize: 12, color: COLORS.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} style={{ padding: 40, textAlign: "center", color: COLORS.textMuted }}>
                  <Loader2 size={18} className="spin" style={{ verticalAlign: "middle", marginRight: 8 }} /> Loading departments…
                </td></tr>
              ) : listError ? (
                <tr><td colSpan={4} style={{ padding: 40, textAlign: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                    <div style={{ color: COLORS.textMuted, fontSize: 13.5 }}>No data available.</div>
                    <button onClick={refresh} style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${COLORS.border}`, background: "#fff", borderRadius: 8, padding: "6px 14px", fontSize: 12.5, cursor: "pointer", color: COLORS.text }}>
                      <RefreshCw size={13} /> Retry
                    </button>
                  </div>
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: 40, textAlign: "center", color: COLORS.textMuted }}>No data available.</td></tr>
              ) : filtered.map((d, i) => (
                <tr key={d.id} style={{ borderTop: `1px solid ${COLORS.border}`, background: i % 2 ? "COLORS.tableHead" : "#fff" }}>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text, fontWeight: 600 }}>{d.code}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text }}>{d.name}</td>
                  <td style={{ padding: "11px 16px" }}><StatusBadge active={d.active} busy={d._toggling} onToggle={() => toggleActive(d)} /></td>
                  <td style={{ padding: "11px 16px", textAlign: "center" }}>
                    <div style={{ display: "inline-flex", gap: 8 }}>
                      <button onClick={() => openEdit(d)} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: COLORS.accentSoft, color: COLORS.accent, border: "none", borderRadius: 7, padding: "6px 11px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                        <Pencil size={12} /> Edit
                      </button>
                      <button onClick={() => setConfirmDelete(d)} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: COLORS.dangerSoft, color: COLORS.danger, border: "none", borderRadius: 7, padding: "6px 11px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
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

      {panel && (
        <DepartmentPanel
          mode={panel.mode}
          data={panel.data}
          saving={saving}
          error={err}
          onCancel={() => {
            if (panel?.mode === "add") {
              setPanel({ mode: "add", data: { guid: "", code: "", name: "", active: true } });
            } else {
              setPanel(null);
            }
            setErr("");
          }}
          onClose={() => setPanel(null)}
          onSubmit={submitPanel}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete this department?"
          message={`"${confirmDelete.name}" (${confirmDelete.code}) will be permanently removed from Dataverse. This can't be undone.`}
          confirmLabel="Delete"
          busy={deleting}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={confirmDeleteRow}
        />
      )}

      {toast && (
        <div style={{
          position: "absolute", bottom: 22, left: "50%", transform: "translateX(-50%)",
          background: COLORS.text, color: "#fff", padding: "10px 18px", borderRadius: 9, fontSize: 13, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 8, boxShadow: "0 12px 30px rgba(0,0,0,0.2)",
        }}>
          <CheckCircle2 size={15} color={COLORS.success} /> {toast}
        </div>
      )}
    </div>
  );
}