import { useState, useEffect, useCallback } from "react";
import {
  Search,
  X,
  CheckCircle2,
  AlertCircle,
  FileCheck,
  Loader2,
} from "lucide-react";
import {
  callProjectFlow,
  callClientFlow,
  callBillingTypeFlow,
  callProjectResourceFlow,
  callApprovalStatusFlow,
  callProjectApprovalFlow,
  callCurrencyFlow,
} from "../../api/flows";
import { EmptyState } from "../../components/common/EmptyState";
import { COLORS, cardStyle, inputStyle, labelStyle } from "../../constants/theme";
import { logAudit } from "../../utils/audit";

// Approved/Rejected are resolved from the real ApprovalStatus master table
// by name (case-insensitive "approv"/"reject" match) rather than hardcoded
// IDs, since that master data is admin-editable. A project with no
// ProjectApproval row yet reads as "Pending" — there's no persisted
// "Pending" row; absence of a decision IS pending.
function findStatusId(statuses, pattern) {
  const hit = statuses.find((s) => pattern.test(s.name || ""));
  return hit ? Number(hit.guid) : null;
}

export function ProjectApprovalPage() {
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [billingTypes, setBillingTypes] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [resourceCounts, setResourceCounts] = useState({}); // projectGuid -> count
  const [approvalStatuses, setApprovalStatuses] = useState([]);
  const [approvalRows, setApprovalRows] = useState([]); // raw ProjectApproval rows from SQL
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [decisionRow, setDecisionRow] = useState(null); // { project, action: 'Approved'|'Rejected', ... }
  const [comment, setComment] = useState("");
  const [decisionErr, setDecisionErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  const refresh = useCallback(() => {
    setLoading(true);
    setListError("");
    Promise.all([
      callProjectFlow("LIST"),
      callClientFlow("LIST"),
      callBillingTypeFlow("LIST"),
      callProjectResourceFlow("LIST"),
      callApprovalStatusFlow("LIST"),
      callProjectApprovalFlow("LIST"),
      callCurrencyFlow("LIST"),
    ])
      .then(([projRes, clientRes, billingRes, resRes, statusRes, approvalRes, currencyRes]) => {
        setProjects(projRes.data);
        setClients(clientRes.data);
        setBillingTypes(billingRes.data);
        const counts = {};
        resRes.data.forEach((r) => { counts[r.projectId] = (counts[r.projectId] || 0) + 1; });
        setResourceCounts(counts);
        setApprovalStatuses(statusRes.data);
        setApprovalRows(approvalRes.data);
        setCurrencies(currencyRes.data);
        setLoading(false);
      })
      .catch((e) => { setListError(e.message); setLoading(false); });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2600); return () => clearTimeout(t); }, [toast]);

  const findName = (list, guid) => list.find((x) => String(x.guid) === String(guid))?.name || "—";
  const currencyCode = (id) => currencies.find((c) => String(c.id) === String(id))?.code || "";

  const approvedStatusId = findStatusId(approvalStatuses, /approv/i);
  const rejectedStatusId = findStatusId(approvalStatuses, /reject/i);

  // Latest ProjectApproval row per project (highest guid = most recent,
  // since these are auto-increment identity ints and there should only
  // ever be one live row per project in normal use anyway).
  const latestApprovalFor = (projectGuid) =>
    approvalRows
      .filter((a) => String(a.projectId) === String(projectGuid))
      .sort((a, b) => Number(b.guid) - Number(a.guid))[0] || null;

  const rows = projects.map((p) => {
    const a = latestApprovalFor(p.guid);
    let status = "Pending";
    if (a) {
      if (approvedStatusId != null && String(a.approvalStatusId) === String(approvedStatusId)) status = "Approved";
      else if (rejectedStatusId != null && String(a.approvalStatusId) === String(rejectedStatusId)) status = "Rejected";
    }
    return {
      project: p,
      approvalGuid: a?.guid ?? "",
      status,
      cpPercent: a?.cpPercent ?? "",
      comment: a?.comments ?? "",
      customer: findName(clients, p.clientId),
      billingType: findName(billingTypes, p.billingTypeId),
      resourceCount: resourceCounts[p.guid] || 0,
    };
  });

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    const matchesSearch = (r.project.projectName || "").toLowerCase().includes(q) || (r.project.projectCode || "").toLowerCase().includes(q);
    const matchesStatus = !statusFilter || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const kpis = [
    { label: "Pending", value: String(rows.filter((r) => r.status === "Pending").length), icon: FileCheck, color: "#F59E0B" },
    { label: "Approved", value: String(rows.filter((r) => r.status === "Approved").length), icon: CheckCircle2, color: COLORS.success },
    { label: "Rejected", value: String(rows.filter((r) => r.status === "Rejected").length), icon: AlertCircle, color: COLORS.danger },
  ];

  const openDecision = (row, action) => {
    if (action === "Approved" && !row.project.zohoProjectId) {
      setToast("Zoho Project ID is required before this project can be approved. Add it via Project Management first.");
      return;
    }
    setComment("");
    setDecisionErr("");
    setDecisionRow({ ...row, action });
  };

  const confirmDecision = () => {
    if (!decisionRow) return;
    if (!comment.trim()) {
      setDecisionErr("A comment is required to approve or reject a project.");
      return;
    }
    const statusId = decisionRow.action === "Approved" ? approvedStatusId : rejectedStatusId;
    if (statusId == null) {
      setDecisionErr(`Approval status master data doesn't have an "${decisionRow.action}" entry configured yet — add it under Admin first.`);
      return;
    }

    setSaving(true);
    setDecisionErr("");

    const decidedOn = new Date().toISOString();
    const projectGuid = decisionRow.project.guid;
    const cpPercent = decisionRow.cpPercent !== "" ? decisionRow.cpPercent : null;

    const finish = () => {
       logAudit("Project Approval", decisionRow.action === "Approved" ? "Approve" : "Reject", decisionRow.project.projectName, null, {
        projectId: decisionRow.project.guid,
        projectManagerUserId: decisionRow.project.projectManagerUserId,
        deliveryHeadUserId: decisionRow.project.deliveryHeadUserId,
        requestedByUserId: decisionRow.requestedByUserId,
      });
      setToast(`Project ${decisionRow.action.toLowerCase()}.`);
      setDecisionRow(null);
      setSaving(false);
      refresh();
    };
    const fail = (e) => {
      setDecisionErr(e.message);
      setSaving(false);
    };

    if (decisionRow.approvalGuid) {
      // Already has a decision row (re-deciding) — EDIT branch handles
      // approvalStatusId/comments/decidedOn/decidedByUserId.
      callProjectApprovalFlow("EDIT", {
        guid: decisionRow.approvalGuid,
        approvalStatusId: statusId,
        comments: comment,
        decidedOn,
        active: true,
      }).then(finish).catch(fail);
    } else {
      // First decision on this project — CREATE only accepts
      // projectId/approvalStatusId/cpPercent/requestedByUserId (no
      // comments/decidedOn column on that branch), so immediately follow
      // with an EDIT on the row it just made to record the comment.
      callProjectApprovalFlow("CREATE", {
        projectId: projectGuid,
        approvalStatusId: statusId,
        cpPercent,
        active: true,
      })
        .then((createRes) => {
          const newRow = createRes.data
            .filter((r) => String(r.projectId) === String(projectGuid))
            .sort((a, b) => Number(b.guid) - Number(a.guid))[0];
          if (!newRow) throw new Error("Couldn't find the approval record just created — please try again.");
          return callProjectApprovalFlow("EDIT", {
            guid: newRow.guid,
            approvalStatusId: statusId,
            comments: comment,
            decidedOn,
            active: true,
          });
        })
        .then(finish)
        .catch(fail);
    }
  };

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
      <div style={{ flex: 1, padding: 26, overflowY: "auto" }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: "Sora, sans-serif", fontSize: 20, fontWeight: 700, color: COLORS.text }}>Project Approval</div>
          <div style={{ color: COLORS.textMuted, fontSize: 13.5 }}>Approve or reject projects — real Project list, real approval decisions</div>
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${COLORS.border}`, flexWrap: "wrap", gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: COLORS.text }}>Requests <span style={{ color: COLORS.textMuted, fontWeight: 500 }}>({filtered.length})</span></div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "7px 11px", width: 220 }}>
                <Search size={14} color={COLORS.textMuted} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by project code or name" style={{ border: "none", outline: "none", fontSize: 13, width: "100%", fontFamily: "Inter, sans-serif" }} />
              </div>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...inputStyle, width: 150, padding: "7px 11px" }}>
                <option value="">All Statuses</option>
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>
          </div>

          {listError && (
            <div style={{ padding: "12px 16px", color: COLORS.danger, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
              <AlertCircle size={14} /> {listError}
            </div>
          )}

          <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: COLORS.bg }}>
                {["Project", "Customer", "Billing Type", "Value", "Currency", "PO / SOW", "Zoho ID", "Duration", "Resources", "CP%", "Status", "Actions"].map((h) => (
                  <th key={h} style={{ textAlign: h === "Actions" ? "center" : "left", padding: "10px 16px", fontSize: 12, color: COLORS.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} style={{ padding: 40, textAlign: "center", color: COLORS.textMuted }}>
                  <Loader2 size={18} className="spin" style={{ verticalAlign: "middle", marginRight: 8 }} /> Loading projects…
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={12}><EmptyState icon={FileCheck} onRetry={refresh} /></td></tr>
              ) : filtered.map((r, i) => (
                <tr key={r.project.guid} style={{ borderTop: `1px solid ${COLORS.border}`, background: i % 2 ? "COLORS.tableHead" : "#fff" }}>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text, fontWeight: 600, whiteSpace: "nowrap" }}>{r.project.projectCode} — {r.project.projectName}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text }}>{r.customer}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text }}>{r.billingType}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text, whiteSpace: "nowrap" }}>{r.project.projectValue ? Number(r.project.projectValue).toLocaleString() : "—"}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text }}>{currencyCode(r.project.currencyId) || "—"}</td>
                  <td style={{ padding: "11px 16px", fontSize: 12.5, color: COLORS.textMuted, whiteSpace: "nowrap" }}>{r.project.poNumber || "—"} / {r.project.sowReference || "—"}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13, color: r.project.zohoProjectId ? COLORS.text : COLORS.danger, fontWeight: r.project.zohoProjectId ? 400 : 600 }}>
                    {r.project.zohoProjectId || "Missing"}
                  </td>
                  <td style={{ padding: "11px 16px", fontSize: 12, color: COLORS.textMuted, whiteSpace: "nowrap" }}>{r.project.startDate} → {r.project.endDate}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text }}>{r.resourceCount}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13, color: COLORS.textMuted }}>{r.cpPercent !== "" ? `${r.cpPercent}%` : "—"}</td>
                  <td style={{ padding: "11px 16px" }}>
                    <span style={{
                      padding: "3px 10px", borderRadius: 999, fontSize: 12.5, fontWeight: 600,
                      background: r.status === "Approved" ? COLORS.successSoft : r.status === "Rejected" ? COLORS.dangerSoft : "#FEF3C7",
                      color: r.status === "Approved" ? COLORS.success : r.status === "Rejected" ? COLORS.danger : "#B45309",
                    }}>{r.status}</span>
                  </td>
                  <td style={{ padding: "11px 16px", textAlign: "center" }}>
                    {r.status === "Pending" ? (
                      <div style={{ display: "inline-flex", gap: 8 }}>
                        <button
                          data-access="approve" onClick={() => openDecision(r, "Approved")}
                          title={!r.project.zohoProjectId ? "Zoho Project ID required before approval" : undefined}
                          style={{ display: "inline-flex", alignItems: "center", gap: 6, background: COLORS.successSoft, color: COLORS.success, border: "none", borderRadius: 7, padding: "6px 11px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", opacity: r.project.zohoProjectId ? 1 : 0.55 }}
                        >
                          <CheckCircle2 size={12} /> Approve
                        </button>
                        <button data-access="approve" onClick={() => openDecision(r, "Rejected")} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: COLORS.dangerSoft, color: COLORS.danger, border: "none", borderRadius: 7, padding: "6px 11px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                          <X size={12} /> Reject
                        </button>
                      </div>
                    ) : <span style={{ fontSize: 12.5, color: COLORS.textMuted }}>{r.status}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      {decisionRow && (
        <div className="pp-panel" style={{
          width: 360, background: COLORS.card, borderLeft: `1px solid ${COLORS.border}`, flexShrink: 0,
          display: "flex", flexDirection: "column", boxShadow: "-8px 0 30px rgba(15,20,40,0.06)",
        }}>
          <div style={{ padding: "18px 20px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: COLORS.text }}>{decisionRow.action} Project</div>
              <div style={{ fontSize: 12, color: COLORS.accent, marginTop: 2 }}>{decisionRow.project.projectCode} — {decisionRow.project.projectName}</div>
            </div>
            <button onClick={() => setDecisionRow(null)} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.textMuted }}><X size={18} /></button>
          </div>
          <div style={{ padding: 20, flex: 1, overflowY: "auto" }}>
            <label style={labelStyle}>CP% (Contribution Percentage)</label>
            <input type="number" min="0" max="100" value={decisionRow.cpPercent} onChange={(e) => setDecisionRow({ ...decisionRow, cpPercent: e.target.value })} placeholder="e.g. 25" style={inputStyle} />

            <label style={{ ...labelStyle, marginTop: 16 }}>Comment*</label>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={`Reason for ${decisionRow.action === "Approved" ? "approval" : "rejection"}…`} rows={4} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />

            {decisionErr && <div style={{ display: "flex", gap: 8, alignItems: "center", color: COLORS.danger, fontSize: 12.5, marginTop: 16 }}><AlertCircle size={14} /> {decisionErr}</div>}
          </div>
          <div style={{ padding: 16, borderTop: `1px solid ${COLORS.border}`, display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => setDecisionRow(null)} disabled={saving} style={{ padding: "9px 16px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: "#fff", fontSize: 13, fontWeight: 600, cursor: saving ? "default" : "pointer", color: COLORS.text, opacity: saving ? 0.6 : 1 }}>Cancel</button>
            <button
              onClick={confirmDecision}
              disabled={saving}
              style={{
                padding: "9px 18px", borderRadius: 8, border: "none", cursor: saving ? "default" : "pointer", fontSize: 13, fontWeight: 700, color: "#fff",
                background: decisionRow.action === "Approved" ? COLORS.success : COLORS.danger, opacity: saving ? 0.75 : 1,
                display: "flex", alignItems: "center", gap: 7,
              }}
            >
              {saving && <Loader2 size={13} className="spin" />}
              {saving ? "Saving…" : `Confirm ${decisionRow.action}`}
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