import { useState, useEffect, useCallback } from "react";
import { Search, Plus, Pencil, Trash2, CalendarClock, CheckCircle2, Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { callBillingPeriodFlow, checkReferences } from "../../api/flows";
import { ConfirmModal } from "../../components/common/ConfirmModal";
import { StatusBadge } from "../../components/common/StatusBadge";
import { COLORS, cardStyle } from "../../constants/theme";
import { BillingPeriodPanel } from "./billingPeriodPanel";
import { logAudit } from "../../utils/audit";
import { toDateInput } from "../../utils/format";

const EMPTY_FORM = { guid: "", billingMonth: "", billingYear: new Date().getFullYear(), periodName: "", periodStartDate: "", periodEndDate: "", isClosed: false, active: true };

// Simple master-data screen — same shape as Designation/Currency/Location —
// so Billing and Link Invoice finally have periods to pick from. Nothing
// here needed a flow change: callBillingPeriodFlow (and the flow's own
// BillingPeriod case) already existed and works, this screen was just
// never built to create rows through it.
export function BillingPeriodPage() {
  const [rows, setRows] = useState([]);
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
    callBillingPeriodFlow("LIST").then((res) => {
      setRows(res.data);
      setLoading(false);
    }).catch((e) => {
      setListError(e.message);
      setLoading(false);
    });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2600); return () => clearTimeout(t); }, [toast]);

  const filtered = rows.filter((r) => (r.periodName || "").toLowerCase().includes(search.toLowerCase()));
  const activeCount = rows.filter((r) => r.active).length;
  const closedCount = rows.filter((r) => r.isClosed).length;

  const kpis = [
    { label: "Total Periods", value: String(rows.length), icon: CalendarClock, color: "#6366F1" },
    { label: "Active Periods", value: String(activeCount), icon: CheckCircle2, color: COLORS.success },
    { label: "Closed Periods", value: String(closedCount), icon: AlertCircle, color: COLORS.danger },
  ];

  const submitPanel = (form) => {
    if (!form.billingMonth || !form.billingYear || !form.periodName?.trim() || !form.periodStartDate || !form.periodEndDate) {
      setErr("Month, Year, Period Name, Start Date and End Date are required.");
      return;
    }
    if (rows.some((r) => String(r.billingMonth) === String(form.billingMonth) && String(r.billingYear) === String(form.billingYear) && String(r.guid) !== String(form.guid || ""))) {
      setErr("A billing period already exists for this month and year.");
      return;
    }
    setSaving(true);
    setErr("");
    const action = form.guid ? "EDIT" : "CREATE";
    callBillingPeriodFlow(action, form)
      .then((res) => {
        setRows(res.data);
        setSaving(false);
        setPanel(null);
        logAudit("Billing Period", form.guid ? "Update" : "Create", form.periodName);
        setToast(form.guid ? "Billing period updated." : "Billing period added.");
      })
      .catch((e) => {
        setSaving(false);
        setErr(e.message);
      });
  };

  const confirmDeleteRow = async () => {
    if (!confirmDelete) return;
    const guard = await checkReferences("BillingPeriod", confirmDelete.guid);
    if (guard.blocked) {
      setToast(guard.message);
      setConfirmDelete(null);
      return;
    }
    setDeleting(true);
    callBillingPeriodFlow("DELETE", confirmDelete)
      .then((res) => {
        setRows(res.data);
        setDeleting(false);
        setConfirmDelete(null);
        logAudit("Billing Period", "Delete", confirmDelete.periodName);
        setToast("Billing period deleted.");
      })
      .catch((e) => {
        setDeleting(false);
        setToast(`Delete failed: ${e.message}`);
      });
  };

  // Same full-screen-page convention as Billing / Link Invoice / Project
  // Dashboard — Add/Edit takes over the whole content area.
  if (panel) {
    return (
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
        <BillingPeriodPanel
          mode={panel.mode}
          data={panel.data}
          saving={saving}
          error={err}
          onCancel={() => { if (panel?.mode === "add") setPanel({ mode: "add", data: { ...EMPTY_FORM } }); else setPanel(null); setErr(""); }}
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
            <div style={{ fontFamily: "Sora, sans-serif", fontSize: 20, fontWeight: 700, color: COLORS.text }}>Billing Periods</div>
            <div style={{ color: COLORS.textMuted, fontSize: 13.5 }}>Monthly periods used by Billing and Invoicing</div>
          </div>
          <button onClick={() => setPanel({ mode: "add", data: { ...EMPTY_FORM } })} style={{ display: "flex", alignItems: "center", gap: 7, background: COLORS.accent, color: "#fff", border: "none", borderRadius: 9, padding: "10px 16px", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
            <Plus size={15} /> Add Billing Period
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${COLORS.border}`, flexWrap: "wrap", gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: COLORS.text }}>Periods <span style={{ color: COLORS.textMuted, fontWeight: 500 }}>({filtered.length})</span></div>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "7px 11px", width: 220 }}>
                <Search size={14} color={COLORS.textMuted} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by period name" style={{ border: "none", outline: "none", fontSize: 13, width: "100%", fontFamily: "Inter, sans-serif" }} />
              </div>
              <button onClick={refresh} style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${COLORS.border}`, background: "#fff", borderRadius: 8, padding: "0 12px", fontSize: 12.5, cursor: "pointer", color: COLORS.text }}>
                <RefreshCw size={13} className={loading ? "spin" : ""} /> Refresh
              </button>
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: COLORS.bg }}>
                {["Period", "Start Date", "End Date", "Closed", "Status", "Actions"].map((h) => (
                  <th key={h} style={{ textAlign: h === "Actions" ? "center" : "left", padding: "10px 16px", fontSize: 12, color: COLORS.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: COLORS.textMuted }}><Loader2 size={18} className="spin" style={{ verticalAlign: "middle", marginRight: 8 }} /> Loading billing periods…</td></tr>
              ) : listError ? (
                <tr><td colSpan={6} style={{ padding: 40, textAlign: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                    <div style={{ color: COLORS.textMuted, fontSize: 13.5 }}>{listError}</div>
                    <button onClick={refresh} style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${COLORS.border}`, background: "#fff", borderRadius: 8, padding: "6px 14px", fontSize: 12.5, cursor: "pointer", color: COLORS.text }}><RefreshCw size={13} /> Retry</button>
                  </div>
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: COLORS.textMuted }}>No billing periods yet — add the current month to get started.</td></tr>
              ) : filtered.map((r, i) => (
                <tr key={r.id} style={{ borderTop: `1px solid ${COLORS.border}`, background: i % 2 ? "COLORS.tableHead" : "#fff" }}>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text, fontWeight: 600 }}>{r.periodName}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text }}>{r.periodStartDate}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text }}>{r.periodEndDate}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text }}>{r.isClosed ? "Yes" : "No"}</td>
                  <td style={{ padding: "11px 16px" }}><StatusBadge active={r.active} /></td>
                  <td style={{ padding: "11px 16px", textAlign: "center" }}>
                    <div style={{ display: "inline-flex", gap: 8 }}>
                      <button onClick={() => setPanel({ mode: "edit", data: { ...EMPTY_FORM, ...r, periodStartDate: toDateInput(r.periodStartDate), periodEndDate: toDateInput(r.periodEndDate) } })} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: COLORS.accentSoft, color: COLORS.accent, border: "none", borderRadius: 7, padding: "6px 11px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
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
        <ConfirmModal
          title="Delete this billing period?"
          message={`"${confirmDelete.periodName}" will be permanently removed. This can't be undone.`}
          confirmLabel="Delete"
          busy={deleting}
          onCancel={() => setConfirmDelete(null)}
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