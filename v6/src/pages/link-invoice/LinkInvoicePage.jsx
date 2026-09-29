import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  Receipt,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import {
  callInvoiceFlow,
  callInvoiceStatusFlow,
  callBillingFlow,
  callClientFlow,
  callProjectFlow,
  callCurrencyFlow,
  callBillingPeriodFlow,
} from "../../api/flows";
import { ConfirmModal } from "../../components/common/ConfirmModal";
import { EmptyState } from "../../components/common/EmptyState";
import { COLORS, cardStyle } from "../../constants/theme";
import { LinkInvoicePanel } from "./LinkInvoicePanel";
import { logAudit } from "../../utils/audit";
import { toDateInput } from "../../utils/format";

const EMPTY_FORM = {
  guid: "", invoiceNumber: "", clientId: "", projectId: "", billingId: "",
  invoiceDate: "", amount: "", currencyId: "", billingPeriodId: "",
  totalBillableHours: "", dueDate: "", invoiceStatusId: "", financeRemarks: "",
  paymentDate: "", paymentReference: "", active: true,
};

// Now backed by the real dbo.Invoice table via callInvoiceFlow (Power
// Automate "Invoice" entity on the flow2 endpoint) instead of localStorage —
// this is the fix for "timesheet finance module is not connected properly".
export function LinkInvoicePage() {
  const [rows, setRows] = useState([]);
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [billingPeriods, setBillingPeriods] = useState([]);
  const [invoiceStatuses, setInvoiceStatuses] = useState([]);
  const [billingRecords, setBillingRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [search, setSearch] = useState("");
  const [panel, setPanel] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    setListError("");
    callInvoiceFlow("LIST")
      .then((res) => { setRows(res.data); setLoading(false); })
      .catch((e) => { setListError(e.message); setLoading(false); });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { callClientFlow("LIST").then((res) => setClients(res.data)).catch(() => {}); }, []);
  useEffect(() => { callProjectFlow("LIST").then((res) => setProjects(res.data)).catch(() => {}); }, []);
  useEffect(() => { callCurrencyFlow("LIST").then((res) => setCurrencies(res.data)).catch(() => {}); }, []);
  useEffect(() => { callBillingPeriodFlow("LIST").then((res) => setBillingPeriods(res.data)).catch(() => {}); }, []);
  useEffect(() => { callInvoiceStatusFlow("LIST").then((res) => setInvoiceStatuses(res.data)).catch(() => {}); }, []);
  useEffect(() => { callBillingFlow("LIST").then((res) => setBillingRecords(res.data)).catch(() => {}); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2600); return () => clearTimeout(t); }, [toast]);

  const clientName = (id) => clients.find((c) => String(c.id) === String(id))?.name || "—";
  const projectName = (id) => projects.find((p) => String(p.id) === String(id))?.projectName || "—";
  const currencyCode = (id) => currencies.find((c) => String(c.id) === String(id))?.code || "";
  const periodName = (id) => billingPeriods.find((p) => String(p.id) === String(id))?.periodName || "—";
  const statusName = (id) => invoiceStatuses.find((s) => String(s.guid) === String(id) || String(s.id) === String(id))?.name || "—";
  const billingLabel = (id) => {
    if (!id) return "—";
    const b = billingRecords.find((x) => String(x.id) === String(id));
    if (!b) return "—";
    return b.milestoneName || `Billing #${b.id}`;
  };

  const filtered = rows.filter((r) =>
    (r.invoiceNumber || "").toLowerCase().includes(search.toLowerCase()) ||
    clientName(r.clientId).toLowerCase().includes(search.toLowerCase())
  );
  const today = new Date().toISOString().slice(0, 10);
  const overdueCount = rows.filter((r) => r.dueDate && r.dueDate < today).length;
  const in7Days = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const dueSoonCount = rows.filter((r) => r.dueDate && r.dueDate >= today && r.dueDate <= in7Days).length;

  const kpis = [
    { label: "Total Invoices", value: String(rows.length), icon: Receipt, color: COLORS.accent },
    { label: "Overdue", value: String(overdueCount), icon: AlertCircle, color: COLORS.danger },
    { label: "Due Within 7 Days", value: String(dueSoonCount), icon: CheckCircle2, color: COLORS.success },
  ];

  const submitPanel = (form) => {
    if (!form.invoiceNumber?.trim() || !form.clientId) {
      setErr("Invoice Number and Client are required.");
      return;
    }
    setSaving(true); setErr("");
    const action = form.guid ? "EDIT" : "CREATE";
    callInvoiceFlow(action, form)
      .then((res) => {
        setRows(res.data);
        setSaving(false);
        setPanel(null);
        logAudit("Link Invoice", form.guid ? "Update" : "Create", form.invoiceNumber, null, {
          projectId: form.projectId,
        });
        setToast(form.guid ? "Invoice updated." : "Invoice added.");
      })
      .catch((e) => { setSaving(false); setErr(e.message); });
  };

  const confirmDeleteRow = () => {
    if (!confirmDelete) return;
    setDeleting(true);
    callInvoiceFlow("DELETE", confirmDelete)
      .then((res) => {
        setRows(res.data);
        setDeleting(false);
        setConfirmDelete(null);
        logAudit("Link Invoice", "Delete", confirmDelete.invoiceNumber);
        setToast("Invoice deleted.");
      })
      .catch((e) => { setDeleting(false); setToast(`Delete failed: ${e.message}`); });
  };

  // Same full-screen-page convention as Project Dashboard / Billing —
  // Add/Edit takes over the whole content area instead of a side drawer.
  if (panel) {
    return (
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
        <LinkInvoicePanel
          mode={panel.mode}
          data={panel.data}
          clients={clients}
          projects={projects}
          currencies={currencies}
          billingPeriods={billingPeriods}
          invoiceStatuses={invoiceStatuses}
          billingRecords={billingRecords}
          saving={saving}
          error={err}
          layout="page"
          onCancel={() => {
            if (panel?.mode === "add") setPanel({ mode: "add", data: { ...EMPTY_FORM } });
            else setPanel(null);
            setErr("");
          }}
          onClose={() => setPanel(null)}
          onSubmit={submitPanel}
        />
        {toast && (
          <div style={{ position: "absolute", bottom: 22, left: "50%", transform: "translateX(-50%)", background: COLORS.text, color: "#fff", padding: "10px 18px", borderRadius: 9, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 12px 30px rgba(0,0,0,0.2)" }}>
            <CheckCircle2 size={15} color={COLORS.success} /> {toast}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
      <div style={{ flex: 1, padding: 26, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div style={{ fontFamily: "Sora, sans-serif", fontSize: 20, fontWeight: 700, color: COLORS.text }}>Link Invoice</div>
            <div style={{ color: COLORS.textMuted, fontSize: 13.5 }}>Link invoices to projects and clients</div>
          </div>
          <button
            onClick={() => setPanel({ mode: "add", data: { ...EMPTY_FORM } })}
            style={{ display: "flex", alignItems: "center", gap: 7, background: COLORS.accent, color: "#fff", border: "none", borderRadius: 9, padding: "10px 16px", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}
          >
            <Plus size={15} /> Add Invoice
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

        {listError && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", color: COLORS.danger, fontSize: 13, marginBottom: 12 }}>
            <AlertCircle size={14} /> Couldn't load invoices: {listError}
          </div>
        )}

        <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${COLORS.border}` }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: COLORS.text }}>Invoices <span style={{ color: COLORS.textMuted, fontWeight: 500 }}>({filtered.length})</span></div>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "7px 11px", width: 260 }}>
                <Search size={14} color={COLORS.textMuted} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by invoice # or client" style={{ border: "none", outline: "none", fontSize: 13, width: "100%", fontFamily: "Inter, sans-serif" }} />
              </div>
              <button onClick={refresh} style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${COLORS.border}`, background: "#fff", borderRadius: 8, padding: "0 12px", fontSize: 12.5, cursor: "pointer", color: COLORS.text }}>
                <RefreshCw size={13} /> Refresh
              </button>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: COLORS.bg }}>
                {["Invoice #", "Client", "Project", "Billing Record", "Invoice Date", "Amount", "Billing Period", "Due Date", "Status", "Actions"].map((h) => (
                  <th key={h} style={{ textAlign: h === "Actions" ? "center" : "left", padding: "10px 16px", fontSize: 12, color: COLORS.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10}><EmptyState icon={Receipt} message="Loading invoices…" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10}><EmptyState icon={Receipt} message="No invoices available." /></td></tr>
              ) : filtered.map((r, i) => (
                <tr key={r.guid} style={{ borderTop: `1px solid ${COLORS.border}`, background: i % 2 ? "COLORS.tableHead" : "#fff" }}>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text, fontWeight: 600 }}>{r.invoiceNumber}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text }}>{clientName(r.clientId)}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text }}>{projectName(r.projectId)}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13, color: COLORS.textMuted }}>{billingLabel(r.billingId)}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13, color: COLORS.textMuted }}>{r.invoiceDate || "—"}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text }}>{r.amount ? `${currencyCode(r.currencyId) || "INR"} ${r.amount}` : "—"}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13, color: COLORS.textMuted }}>{periodName(r.billingPeriodId)}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text }}>{r.dueDate || "—"}</td>
                  <td style={{ padding: "11px 16px" }}>
                    <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, background: COLORS.accentSoft, color: COLORS.accent }}>{statusName(r.invoiceStatusId)}</span>
                  </td>
                  <td style={{ padding: "11px 16px", textAlign: "center" }}>
                    <div style={{ display: "inline-flex", gap: 8 }}>
                      <button onClick={() => setPanel({ mode: "edit", data: { ...EMPTY_FORM, ...r, invoiceDate: toDateInput(r.invoiceDate), dueDate: toDateInput(r.dueDate), paymentDate: toDateInput(r.paymentDate) } })} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: COLORS.accentSoft, color: COLORS.accent, border: "none", borderRadius: 7, padding: "6px 11px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
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
      </div>

      {confirmDelete && (
        <ConfirmModal title="Delete this invoice?" message={`"${confirmDelete.invoiceNumber}" will be permanently removed. This can't be undone.`} confirmLabel="Delete" busy={deleting} onCancel={() => setConfirmDelete(null)} onConfirm={confirmDeleteRow} />
      )}

      {toast && (
        <div style={{ position: "absolute", bottom: 22, left: "50%", transform: "translateX(-50%)", background: COLORS.text, color: "#fff", padding: "10px 18px", borderRadius: 9, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 12px 30px rgba(0,0,0,0.2)" }}>
          <CheckCircle2 size={15} color={COLORS.success} /> {toast}
        </div>
      )}
    </div>
  );
}