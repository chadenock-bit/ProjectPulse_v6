import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Handshake,
  CheckCircle2,
  Loader2,
  RefreshCw,
  DollarSign,
  ArrowRightCircle,
  X,
  AlertCircle,
} from "lucide-react";
import { callClientFlow, callDealStatusFlow, callPipelineProjectFlow, callUserFlow, callProjectFlow, callProjectCategoryFlow, callBillingTypeFlow, callDepartmentFlow, callCurrencyFlow } from "../../api/flows";
import { ConfirmModal } from "../../components/common/ConfirmModal";
import { EmptyState } from "../../components/common/EmptyState";
import { StatusBadge } from "../../components/common/StatusBadge";
import { COLORS, cardStyle, inputStyle, labelStyle } from "../../constants/theme";
import { PipelineProjectPanel } from "./PipelineProjectPanel";
import { logAudit } from "../../utils/audit";
import { formatINR, toDateInput } from "../../utils/format";
import { activeOptions } from "../../utils/validation";

const EMPTY_FORM = {
  guid: "", projectName: "", opportunityName: "", pipelineCode: "", clientId: "",
  dealValue: "", dealStatusId: "", expectedCloseDate: "", expectedStartDate: "",
  ownerUserId: "", projectManagerUserId: "", deliveryHeadUserId: "", departmentId: "",
  projectType: "", billingTypeId: "", currencyId: "", durationMonths: "", probabilityPct: "",
  priority: "", geography: "", remarks: "", active: true,
};

export function PipelineProjectPage() {
  const [rows, setRows] = useState([]);
  const [clients, setClients] = useState([]);
  const [dealStatuses, setDealStatuses] = useState([]);
  const [users, setUsers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [billingTypes, setBillingTypes] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [panel, setPanel] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [listError, setListError] = useState("");
  const [convertRow, setConvertRow] = useState(null); // pipeline row being converted
  const [convertForm, setConvertForm] = useState(null);
  const [converting, setConverting] = useState(false);
  const [convertErr, setConvertErr] = useState("");

  const refresh = useCallback(() => {
    setLoading(true);
    setListError("");
    callPipelineProjectFlow("LIST").then((res) => {
      setRows(res.data);
      setLoading(false);
    }).catch((e) => {
      setListError(e.message);
      setLoading(false);
    });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { callClientFlow("LIST").then((res) => setClients(res.data)); }, []);
  useEffect(() => { callDealStatusFlow("LIST").then((res) => setDealStatuses(res.data)); }, []);
  useEffect(() => { callUserFlow("LIST").then((res) => setUsers(res.data)); }, []);
  useEffect(() => { callProjectCategoryFlow("LIST").then((res) => setCategories(res.data)); }, []);
  useEffect(() => { callBillingTypeFlow("LIST").then((res) => setBillingTypes(res.data)); }, []);
  useEffect(() => { callDepartmentFlow("LIST").then((res) => setDepartments(res.data)); }, []);
  useEffect(() => { callCurrencyFlow("LIST").then((res) => setCurrencies(res.data)).catch(() => {}); }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const clientName = (id) => clients.find((c) => String(c.id) === String(id))?.name || "—";
  const stageName = (id) => dealStatuses.find((d) => String(d.id) === String(id))?.name || "—";
  const isWon = (id) => stageName(id).trim().toLowerCase() === "won";

  const openConvert = (r) => {
    setConvertRow(r);
    setConvertErr("");
    setConvertForm({
      projectCode: "", projectName: r.projectName || "", categoryId: "",
      clientId: r.clientId || "", billingTypeId: r.billingTypeId || "", startDate: "", endDate: "",
    });
  };

  const confirmConvert = () => {
    if (!convertForm.projectCode?.trim() || !convertForm.projectName?.trim() || !convertForm.categoryId || !convertForm.startDate || !convertForm.endDate) {
      setConvertErr("Project Code, Name, Category and Dates are required to create the project.");
      return;
    }
    setConverting(true);
    setConvertErr("");
    callProjectFlow("CREATE", { ...convertForm, active: true })
      .then(() => callPipelineProjectFlow("EDIT", { ...convertRow, active: false }))
      .then(() => refresh())
      .then(() => {
        setConverting(false);
        setConvertRow(null);
        logAudit("Pipeline Project", "Convert to Project", convertRow.projectName);
        setToast(`"${convertForm.projectName}" converted to a project.`);
      })
      .catch((e) => {
        setConverting(false);
        setConvertErr(e.message);
      });
  };

  const ownerName = (id) => {
    const u = users.find((x) => String(x.id) === String(id));
    return u ? `${u.firstName} ${u.lastName}` : "—";
  };

  const filtered = rows.filter((r) =>
    (r.projectName || "").toLowerCase().includes(search.toLowerCase()) ||
    clientName(r.clientId).toLowerCase().includes(search.toLowerCase())
  );

  const kpis = [
    { label: "Pipeline Projects", value: String(rows.length), icon: Handshake, color: "#8B5CF6" },
    { label: "Total Deal Value", value: formatINR(rows.reduce((s, r) => s + Number(r.dealValue || 0), 0)), icon: DollarSign, color: COLORS.success },
    { label: "Active", value: String(rows.filter((r) => r.active).length), icon: CheckCircle2, color: "#F59E0B" },
  ];

  const submitPanel = (form) => {
    if (!form.projectName?.trim() || !form.clientId) {
      setErr("Project Name and Client are required.");
      return;
    }
    setSaving(true);
    setErr("");
    const action = form.guid ? "EDIT" : "CREATE";
    callPipelineProjectFlow(action, form)
      .then((res) => {
        setRows(res.data);
        setSaving(false);
        setPanel(null);
        logAudit("Pipeline Project", form.guid ? "Update" : "Create", form.projectName);
        setToast(form.guid ? "Pipeline project updated." : "Pipeline project added.");
      })
      .catch((e) => {
        setSaving(false);
        setErr(e.message);
      });
  };

  const toggleActive = (r0) => {
    setRows((prev) => prev.map((r) => (r.guid === r0.guid ? { ...r, _toggling: true } : r)));
    callPipelineProjectFlow("EDIT", { ...r0, active: !r0.active })
      .then((res) => {
        setRows(res.data);
        logAudit("Pipeline Project", "Update", r0.projectName);
        setToast(`Marked ${!r0.active ? "Active" : "Inactive"}.`);
      })
      .catch((e) => {
        setRows((prev) => prev.map((r) => (r.guid === r0.guid ? { ...r, _toggling: false } : r)));
        setToast(`Update failed: ${e.message}`);
      });
  };

  const confirmDeleteRow = () => {
    if (!confirmDelete) return;
    setDeleting(true);
    callPipelineProjectFlow("DELETE", confirmDelete)
      .then((res) => {
        setRows(res.data);
        setDeleting(false);
        setConfirmDelete(null);
        logAudit("Pipeline Project", "Delete", confirmDelete.projectName);
        setToast("Pipeline project deleted.");
      })
      .catch((e) => {
        setDeleting(false);
        setToast(`Delete failed: ${e.message}`);
      });
  };

  if (panel) {
    return (
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
        <PipelineProjectPanel
          mode={panel.mode}
          data={panel.data}
          clients={clients}
          dealStatuses={dealStatuses}
          users={users}
          departments={departments}
          billingTypes={billingTypes}
          currencies={currencies}
          saving={saving}
          error={err}
          onCancel={() => {
            if (panel?.mode === "add") {
              setPanel({ mode: "add", data: { ...EMPTY_FORM } });
            } else {
              setPanel(null);
            }
            setErr("");
          }}
          onClose={() => setPanel(null)}
          onSubmit={submitPanel}
        />
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
      <div style={{ flex: 1, padding: 26, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div style={{ fontFamily: "Sora, sans-serif", fontSize: 20, fontWeight: 700, color: COLORS.text }}>Pipeline Project</div>
            <div style={{ color: COLORS.textMuted, fontSize: 13.5 }}>Track deals in the sales pipeline</div>
          </div>
          <button
            onClick={() => setPanel({ mode: "add", data: { ...EMPTY_FORM } })}
            style={{ display: "flex", alignItems: "center", gap: 7, background: COLORS.accent, color: "#fff", border: "none", borderRadius: 9, padding: "10px 16px", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}
          >
            <Plus size={15} /> Add Pipeline Project
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
            <div style={{ fontWeight: 700, fontSize: 14, color: COLORS.text }}>Pipeline <span style={{ color: COLORS.textMuted, fontWeight: 500 }}>({filtered.length})</span></div>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "7px 11px", width: 260 }}>
                <Search size={14} color={COLORS.textMuted} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by project or client" style={{ border: "none", outline: "none", fontSize: 13, width: "100%", fontFamily: "Inter, sans-serif" }} />
              </div>
              <button onClick={refresh} style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${COLORS.border}`, background: "#fff", borderRadius: 8, padding: "0 12px", fontSize: 12.5, cursor: "pointer", color: COLORS.text }}>
                <RefreshCw size={13} className={loading ? "spin" : ""} /> Refresh
              </button>
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: COLORS.bg }}>
                {["Project", "Client", "Deal Value", "Stage", "Expected Close", "Owner", "Status", "Actions"].map((h) => (
                  <th key={h} style={{ textAlign: h === "Actions" ? "center" : "left", padding: "10px 16px", fontSize: 12, color: COLORS.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: COLORS.textMuted }}>
                  <Loader2 size={18} className="spin" style={{ verticalAlign: "middle", marginRight: 8 }} /> Loading pipeline…
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
                <tr><td colSpan={8}><EmptyState icon={Handshake} message="No pipeline projects available." /></td></tr>
              ) : filtered.map((r, i) => (
                <tr key={r.id} style={{ borderTop: `1px solid ${COLORS.border}`, background: i % 2 ? "COLORS.tableHead" : "#fff" }}>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text, fontWeight: 600 }}>{r.projectName}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text }}>{clientName(r.clientId)}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text }}>{formatINR(r.dealValue)}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text }}>{stageName(r.dealStatusId)}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text }}>{r.expectedCloseDate || "—"}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text }}>{ownerName(r.ownerUserId)}</td>
                  <td style={{ padding: "11px 16px" }}><StatusBadge active={r.active} busy={r._toggling} onToggle={() => toggleActive(r)} /></td>
                  <td style={{ padding: "11px 16px", textAlign: "center" }}>
                    <div style={{ display: "inline-flex", gap: 8 }}>
                      {isWon(r.dealStatusId) && r.active && (
                        <button onClick={() => openConvert(r)} title="Convert to Project" style={{ display: "inline-flex", alignItems: "center", gap: 6, background: COLORS.successSoft, color: COLORS.success, border: "none", borderRadius: 7, padding: "6px 11px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                          <ArrowRightCircle size={12} /> Convert
                        </button>
                      )}
                      <button onClick={() => setPanel({ mode: "edit", data: { ...EMPTY_FORM, ...r, expectedStartDate: toDateInput(r.expectedStartDate), expectedCloseDate: toDateInput(r.expectedCloseDate) } })} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: COLORS.accentSoft, color: COLORS.accent, border: "none", borderRadius: 7, padding: "6px 11px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
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
        <ConfirmModal title="Delete this pipeline project?" message={`"${confirmDelete.projectName}" will be permanently removed. This can't be undone.`} confirmLabel="Delete" busy={deleting} onCancel={() => setConfirmDelete(null)} onConfirm={confirmDeleteRow} />
      )}

      {convertRow && convertForm && (
        <div className="pp-panel" style={{ width: 360, background: COLORS.card, borderLeft: `1px solid ${COLORS.border}`, flexShrink: 0, display: "flex", flexDirection: "column", boxShadow: "-8px 0 30px rgba(15,20,40,0.06)" }}>
          <div style={{ padding: "18px 20px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: COLORS.text }}>Convert to Project</div>
              <div style={{ fontSize: 12, color: COLORS.accent, marginTop: 2 }}>From pipeline deal: {convertRow.projectName}</div>
            </div>
            <button onClick={() => setConvertRow(null)} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.textMuted }}><X size={18} /></button>
          </div>
          <div style={{ padding: 20, flex: 1, overflowY: "auto" }}>
            <label style={labelStyle}>Project Code*</label>
            <input value={convertForm.projectCode} onChange={(e) => setConvertForm({ ...convertForm, projectCode: e.target.value })} placeholder="e.g. PRJ1004" style={inputStyle} />
            <label style={{ ...labelStyle, marginTop: 16 }}>Project Name*</label>
            <input value={convertForm.projectName} onChange={(e) => setConvertForm({ ...convertForm, projectName: e.target.value })} style={inputStyle} />
            <label style={{ ...labelStyle, marginTop: 16 }}>Client</label>
            <input value={clientName(convertForm.clientId)} disabled style={{ ...inputStyle, background: COLORS.bg, color: COLORS.textMuted }} />
            <label style={{ ...labelStyle, marginTop: 16 }}>Project Category*</label>
            <select value={convertForm.categoryId} onChange={(e) => setConvertForm({ ...convertForm, categoryId: e.target.value })} style={inputStyle}>
              <option value="">Select category…</option>
              {activeOptions(categories, convertForm.categoryId).map((c) => <option key={c.guid} value={c.guid}>{c.name}</option>)}
            </select>
            <label style={{ ...labelStyle, marginTop: 16 }}>Billing Type</label>
            <select value={convertForm.billingTypeId} onChange={(e) => setConvertForm({ ...convertForm, billingTypeId: e.target.value })} style={inputStyle}>
              <option value="">Select billing type…</option>
              {activeOptions(billingTypes, convertForm.billingTypeId).map((b) => <option key={b.guid} value={b.guid}>{b.name}</option>)}
            </select>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Start Date*</label>
                <input type="date" value={convertForm.startDate} onChange={(e) => setConvertForm({ ...convertForm, startDate: e.target.value })} style={inputStyle} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>End Date*</label>
                <input type="date" value={convertForm.endDate} onChange={(e) => setConvertForm({ ...convertForm, endDate: e.target.value })} style={inputStyle} />
              </div>
            </div>
            {convertErr && <div style={{ display: "flex", gap: 8, alignItems: "center", color: COLORS.danger, fontSize: 12.5, marginTop: 16 }}><AlertCircle size={14} /> {convertErr}</div>}
          </div>
          <div style={{ padding: 16, borderTop: `1px solid ${COLORS.border}`, display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => setConvertRow(null)} style={{ padding: "9px 16px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", color: COLORS.text }}>Cancel</button>
            <button onClick={confirmConvert} disabled={converting} style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: COLORS.success, color: "#fff", fontSize: 13, fontWeight: 700, cursor: converting ? "default" : "pointer", opacity: converting ? 0.75 : 1, display: "flex", alignItems: "center", gap: 7 }}>
              {converting && <Loader2 size={13} className="spin" />}
              {converting ? "Converting…" : "Create Project"}
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: "absolute", bottom: 22, left: "50%", transform: "translateX(-50%)", background: COLORS.text, color: "#fff", padding: "10px 18px", borderRadius: 9, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 12px 30px rgba(0,0,0,0.2)" }}>
          <CheckCircle2 size={15} color={COLORS.success} /> {toast}
        </div>
      )}
    </div>
  );
}