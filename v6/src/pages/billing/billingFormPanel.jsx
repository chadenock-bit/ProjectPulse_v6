import { useState, useEffect, useMemo } from "react";
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  FileCheck,
  UploadCloud,
  Trash2,
  FileText,
  Receipt,
  Users,
  Paperclip,
  MessageSquare,
  Info,
  Building2,
  FolderKanban,
  CalendarClock,
  Coins,
  Clock,
} from "lucide-react";
import { COLORS, SHADOWS, inputStyle, labelStyle } from "../../constants/theme";
import { callProjectResourceFlow, callDesignationFlow, callProjectDocumentFlow, callHolidayFlow, callBillingResourceFlow, callBillingFlow } from "../../api/flows";
import { getCurrentUserId } from "../../utils/session";
import { activeOptions } from "../../utils/validation";
import { getWorkingDays, getWorkingDaysBreakdown, getMaxCapacity, sumOtherPlannedHours } from "../../utils/capacity";

// The Timesheet table has no attachment column, so an "Approved Timesheet"
// file for a given resource + billing period is stored as a ProjectDocument
// row (same workaround used for Billing's own Supporting Documents), tagged
// docType "Timesheet Approval" and identified by this docName convention so
// it can be looked up per resource/period without a real foreign key.
const timesheetDocName = (userId, periodId) => `Timesheet_${userId}_${periodId || "NA"}`;

// Replaces the earlier NewBillingTMPanel + BillingPanel split. One page,
// one code path, per FSD 4.6 (both T&M and Fixed Bid billing types) —
// the split was the likely source of the submit error, since Add always
// opened the T&M-only panel first and silently swapped components under
// the same form state.
//
// Layout: same "Section card + right-hand Summary" convention as Link
// Invoice's panel (see LinkInvoicePanel.jsx), adopted here for a consistent
// look across Finance's Add/Edit screens. None of the form logic below —
// resource loading, timesheet/document uploads, duplicate-period guard —
// changed, only how it's laid out.
const MAX_FILE_BYTES = 4 * 1024 * 1024;

const card = { background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 14, boxShadow: SHADOWS.sm };
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: "16px 18px" };
const full = { gridColumn: "1 / -1" };

function Section({ icon: Icon, color, title, sub, children }) {
  return (
    <div style={{ ...card, padding: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <span style={{ width: 36, height: 36, borderRadius: 10, background: `${color}18`, color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={18} /></span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: COLORS.text }}>{title}</div>
          <div style={{ fontSize: 12, color: COLORS.textMuted }}>{sub}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

function Stat({ icon: Icon, label, value, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 10 }}>
      <Icon size={16} color={color || COLORS.accent} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, fontSize: 12.5, color: COLORS.textMuted }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: color || COLORS.text, textAlign: "right", maxWidth: "60%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}

export function BillingFormPanel({
  mode,
  data,
  projects,
  clients,
  billingTypes,
  billingPeriods,
  currencies,
  users,
  approvalStatuses,
  existingBillingRows,
  saving,
  error,
  onCancel,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState(data);
  useEffect(() => setForm(data), [data]);

  const [resources, setResources] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [timesheets, setTimesheets] = useState([]);
  const [loadingResources, setLoadingResources] = useState(false);
  const [docs, setDocs] = useState([]);
  const [docError, setDocError] = useState("");

  // Billable Hours is read-only here, straight off ProjectResource.weeklyHours
  // (the same figure shown as "Weekly Hrs" on the Resource Allocation grid) —
  // no Timesheet write from this screen, so no CHECK-constraint risk.
  // Approved Timesheet file is still staged locally and uploaded as a
  // ProjectDocument alongside Supporting Documents when Billing is submitted.
  const [hoursError, setHoursError] = useState("");
  const [timesheetDocs, setTimesheetDocs] = useState([]); // ProjectDocument rows, docType "Timesheet Approval"
  const [stagedTsFiles, setStagedTsFiles] = useState({}); // { [userId]: { fileName, fileData } }

  // Capacity rule state — Working Days is calculated (never hand-entered) from
  // the selected Billing Period's month/year against the Holiday calendar.
  // Hours/Day defaults to 8 but Manager can change it per resource; Actual
  // Hours defaults to the calculated Planned Hours and is editable after.
  const [holidays, setHolidays] = useState([]);
  const [allBillingResources, setAllBillingResources] = useState([]); // every BillingResource row, for the cross-project capacity sum
  const [allBillings, setAllBillings] = useState([]); // every Billing row, to map billingId -> billingPeriodId for that sum
  const [existingBillingResources, setExistingBillingResources] = useState([]); // this record's own rows, when editing
  const [resourceHours, setResourceHours] = useState({}); // { [userId]: { hoursPerDay, actualHours (null = follow planned) } }

  useEffect(() => { callDesignationFlow("LIST").then((res) => setDesignations(res.data)).catch(() => {}); }, []);
  useEffect(() => {
    callHolidayFlow("LIST").then((res) => setHolidays(res.data || [])).catch(() => setHolidays([]));
    callBillingResourceFlow("LIST").then((res) => setAllBillingResources(res.data || [])).catch(() => setAllBillingResources([]));
    callBillingFlow("LIST").then((res) => setAllBillings(res.data || [])).catch(() => setAllBillings([]));
  }, []);
  useEffect(() => {
    if (!form.guid) { setExistingBillingResources([]); return; }
    callBillingResourceFlow("LIST").then((res) => {
      const mine = (res.data || []).filter((r) => String(r.billingId) === String(form.guid));
      setExistingBillingResources(mine);
      setResourceHours((prev) => {
        const next = { ...prev };
        mine.forEach((r) => { next[r.userId] = { hoursPerDay: r.hoursPerDay, actualHours: r.actualHours }; });
        return next;
      });
    }).catch(() => {});
  }, [form.guid]);

  const project = projects.find((p) => String(p.guid ?? p.id) === String(form.projectId));
  const client = project ? clients.find((c) => String(c.id ?? c.guid) === String(project.clientId)) : null;
  const billingTypeName = (id) => billingTypes.find((b) => String(b.id ?? b.guid) === String(id))?.name || "";
  const currencyCode = (id) => currencies.find((c) => String(c.id ?? c.guid) === String(id))?.code || "";
  const period = billingPeriods.find((p) => String(p.id ?? p.guid) === String(form.billingPeriodId));
  const status = approvalStatuses.find((s) => String(s.guid) === String(form.approvalStatusId));

  const typeName = project ? billingTypeName(project.billingTypeId) : billingTypeName(form.billingTypeId);
  const isTM = /time\s*&?\s*material|t\s*&\s*m/i.test(typeName);
  const isFixedBid = /fixed\s*bid/i.test(typeName);

  // Billable Resources reference grid is shown for every billing type now
  // (not just T&M) — fetch runs for any project, regardless of billing type.
  useEffect(() => {
    if (!form.projectId) { setResources([]); setTimesheetDocs([]); return; }
    setLoadingResources(true);
    Promise.all([
      callProjectResourceFlow("LIST"),
      callProjectDocumentFlow("LIST").catch(() => ({ data: [] })),
    ]).then(([resRes, docRes]) => {
      setResources((resRes.data || []).filter((r) => String(r.projectId) === String(form.projectId)));
      setTimesheetDocs((docRes.data || []).filter((d) => String(d.projectId) === String(form.projectId) && d.docType === "Timesheet Approval"));
      setLoadingResources(false);
    }).catch(() => setLoadingResources(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.projectId]);

  const onProjectChange = (projectId) => {
    const p = projects.find((x) => String(x.guid ?? x.id) === String(projectId));
    setForm((f) => ({
      ...f,
      projectId,
      billingTypeId: p ? p.billingTypeId : "",
      currencyId: p ? p.currencyId : "",
      billingPeriodId: "",
    }));
  };

  const duplicatePeriod = useMemo(() => {
    if (!form.projectId || !form.billingPeriodId) return false;
    return (existingBillingRows || []).some((r) =>
      String(r.projectId) === String(form.projectId) &&
      String(r.billingPeriodId) === String(form.billingPeriodId) &&
      String(r.guid) !== String(form.guid || "")
    );
  }, [form.projectId, form.billingPeriodId, form.guid, existingBillingRows]);

  const activePeriods = billingPeriods.filter((p) => p.active !== false);
  const activeProjects = projects.filter((p) => p.active !== false);

  // Working Days is calculated, never stored/entered directly — from the
  // selected Billing Period's month/year against the Holiday calendar.
  // Saturday/Sunday are always excluded regardless of the Holiday calendar.
  const workingDays = period ? getWorkingDays(period.billingMonth, period.billingYear, holidays) : 0;
  const maxCapacity = getMaxCapacity(workingDays);
  const wdBreakdown = period ? getWorkingDaysBreakdown(period.billingMonth, period.billingYear, holidays) : null;

  const billingIdToPeriodId = useMemo(() => {
    const m = {};
    (allBillings || []).forEach((b) => { m[b.guid] = b.billingPeriodId; });
    return m;
  }, [allBillings]);

  const resourceRows = resources.map((r) => {
    const u = users.find((x) => String(x.guid ?? x.id) === String(r.userId));
    const designationName = designations.find((d) => String(d.guid ?? d.id) === String(r.designationId))?.name || "—";
    const docName = timesheetDocName(r.userId, form.billingPeriodId);
    const savedDoc = timesheetDocs.find((d) => d.docName === docName);
    const staged = stagedTsFiles[r.userId];

    const hp = resourceHours[r.userId] || {};
    const hoursPerDay = hp.hoursPerDay !== undefined ? Number(hp.hoursPerDay) : 8;
    const plannedHours = Math.round(workingDays * hoursPerDay * 100) / 100;
    const actualHours = hp.actualHours !== undefined && hp.actualHours !== null && hp.actualHours !== "" ? Number(hp.actualHours) : plannedHours;

    const otherPlanned = period ? sumOtherPlannedHours(allBillingResources, {
      userId: r.userId, billingPeriodId: form.billingPeriodId,
      excludeBillingId: form.guid, billingIdToPeriodId,
    }) : 0;
    const totalWithThis = otherPlanned + plannedHours;
    const overCapacity = maxCapacity > 0 && totalWithThis > maxCapacity;

    return {
      key: r.id,
      userId: r.userId,
      name: u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.empId : "—",
      designation: designationName,
      allocationPct: r.allocationPct,
      weeklyHours: r.weeklyHours,
      savedDoc,
      staged,
      hoursPerDay,
      plannedHours,
      actualHours,
      otherPlanned,
      totalWithThis,
      overCapacity,
    };
  });

  const totalBillableHours = resourceRows.reduce((sum, r) => sum + (Number(r.plannedHours) || 0), 0);
  const anyOverCapacity = resourceRows.some((r) => r.overCapacity);
  // Timesheet attachment is required for submission — every billable
  // resource row needs either an already-saved doc or a freshly staged one.
  const missingTimesheets = resourceRows.filter((r) => !r.savedDoc && !r.staged);

  const setResourceHour = (userId, patch) => setResourceHours((prev) => ({ ...prev, [userId]: { ...prev[userId], ...patch } }));

  const addTimesheetFile = (userId, fileList) => {
    const file = (fileList || [])[0];
    if (!file) return;
    setHoursError("");
    if (file.size > MAX_FILE_BYTES) {
      setHoursError(`"${file.name}" is too large (max ${MAX_FILE_BYTES / (1024 * 1024)}MB).`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result).split(",")[1] || "";
      setStagedTsFiles((s) => ({ ...s, [userId]: { fileName: file.name, fileData: base64 } }));
    };
    reader.readAsDataURL(file);
  };

  const uploadStagedTimesheetDocs = () => {
    const uploaderId = getCurrentUserId();
    return Promise.all(Object.entries(stagedTsFiles).map(([userId, d]) =>
      callProjectDocumentFlow("CREATE", {
        projectId: form.projectId,
        docName: timesheetDocName(userId, form.billingPeriodId),
        docType: "Timesheet Approval",
        uploadedByUserId: uploaderId,
        uploadDate: new Date().toISOString().slice(0, 10),
        fileName: d.fileName,
        fileData: d.fileData,
      }).catch(() => {})
    ));
  };

  const addFiles = (fileList) => {
    const files = Array.from(fileList || []);
    setDocError("");
    files.forEach((file) => {
      if (file.size > MAX_FILE_BYTES) {
        setDocError(`"${file.name}" is too large (max ${MAX_FILE_BYTES / (1024 * 1024)}MB).`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = String(reader.result).split(",")[1] || "";
        setDocs((d) => [...d, { fileName: file.name, sizeLabel: `${(file.size / 1024).toFixed(0)} KB`, fileData: base64 }]);
      };
      reader.readAsDataURL(file);
    });
  };
  const removeDoc = (fileName) => setDocs((d) => d.filter((x) => x.fileName !== fileName));

  const uploadStagedDocs = () => {
    const uploaderId = getCurrentUserId();
    return Promise.all(docs.map((d) =>
      callProjectDocumentFlow("CREATE", {
        projectId: form.projectId,
        docName: d.fileName,
        docType: "Billing Support",
        uploadedByUserId: uploaderId,
        uploadDate: new Date().toISOString().slice(0, 10),
        fileName: d.fileName,
        fileData: d.fileData,
      }).catch(() => {})
    ));
  };

  const submittedByLabel = () => {
    const id = form.submittedByUserId || getCurrentUserId();
    const u = users.find((x) => String(x.guid ?? x.id) === String(id));
    return u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.empId : "—";
  };

  // Saves/updates each resource's BillingResource row — WorkingDays/PlannedHours
  // are written as a SNAPSHOT at this moment (not recalculated later), so
  // editing the Holiday calendar afterwards never changes this record's numbers.
  const saveBillingResources = (billingGuid) => {
    if (!billingGuid) return Promise.resolve();
    return Promise.all(resourceRows.map((r) => {
      const existing = existingBillingResources.find((e) => String(e.userId) === String(r.userId));
      const payload = {
        billingId: billingGuid, userId: r.userId, hoursPerDay: r.hoursPerDay,
        workingDays, plannedHours: r.plannedHours, actualHours: r.actualHours, active: true,
      };
      return callBillingResourceFlow(existing ? "EDIT" : "CREATE", existing ? { ...payload, guid: existing.guid } : payload).catch(() => {});
    }));
  };

  const handleSubmit = () => {
    setHoursError("");
    if (missingTimesheets.length > 0) {
      setHoursError(`Approved Timesheet is required for every billable resource before submitting — missing for: ${missingTimesheets.map((r) => r.name).join(", ")}.`);
      return;
    }
    onSubmit(
      { ...form, submittedByUserId: form.submittedByUserId || getCurrentUserId() },
      (billingGuid) => Promise.all([uploadStagedDocs(), uploadStagedTimesheetDocs(), saveBillingResources(billingGuid || form.guid)])
    );
  };

  const amount = Number(form.amount) || 0;
  const code = project ? currencyCode(project.currencyId) : "";
  const fmt = (n) => `${code} ${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`.trim();

  return (
    <div className="pp-project-page" data-access-skip style={{ flex: 1, background: COLORS.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "18px 28px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", gap: 14, background: COLORS.card }}>
        <button onClick={onClose} title="Back to Billing" aria-label="Back to Billing" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: COLORS.text }}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18, color: COLORS.text, fontFamily: "Sora, sans-serif" }}>
            {mode === "add" ? "Submit Billing" : "Edit Billing"}{typeName ? ` — ${typeName}` : ""}
          </div>
          <div style={{ fontSize: 12, color: COLORS.accent, marginTop: 2 }}>
            {isFixedBid ? "Milestone billing against the milestones defined on the project" : "Monthly billing from approved timesheets of billable resources"}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "22px 28px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
          <div style={{ flex: "3 1 600px", minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>
            <Section icon={Receipt} color={COLORS.accent} title="Billing Details" sub="Project, period, amount and who's submitting it">
              <div style={grid}>
                <div>
                  <label style={labelStyle}>Project*</label>
                  <select value={form.projectId || ""} onChange={(e) => onProjectChange(e.target.value)} style={inputStyle}>
                    <option value="">Select project</option>
                    {activeProjects.map((p) => <option key={p.guid ?? p.id} value={p.guid ?? p.id}>{p.projectCode} — {p.projectName}</option>)}
                  </select>
                  <div style={hint}>Only Active projects are listed</div>
                </div>
                <div>
                  <label style={labelStyle}>Customer</label>
                  <input value={client ? client.name : ""} disabled style={{ ...inputStyle, opacity: 0.7 }} placeholder="Auto" />
                </div>
                <div>
                  <label style={labelStyle}>Billing Type</label>
                  <input value={typeName || "—"} disabled style={{ ...inputStyle, opacity: 0.7 }} />
                  <div style={hint}>From project</div>
                </div>
                <div>
                  <label style={labelStyle}>Currency</label>
                  <input value={project ? currencyCode(project.currencyId) : ""} disabled style={{ ...inputStyle, opacity: 0.7 }} placeholder="Auto" />
                  <div style={hint}>From project</div>
                </div>
                <div>
                  <label style={labelStyle}>Billing Period*</label>
                  <select value={form.billingPeriodId || ""} onChange={(e) => setForm({ ...form, billingPeriodId: e.target.value })} style={inputStyle} disabled={!form.projectId}>
                    <option value="">Select period</option>
                    {activePeriods.map((p) => <option key={p.guid ?? p.id} value={p.guid ?? p.id}>{p.periodName}</option>)}
                  </select>
                  {duplicatePeriod ? (
                    <div style={{ ...hint, color: COLORS.danger, display: "flex", alignItems: "center", gap: 6 }}><AlertCircle size={12} /> Already billed for this period.</div>
                  ) : <div style={hint}>One billing per project + period</div>}
                </div>
                {isFixedBid && (
                  <div>
                    <label style={labelStyle}>Milestone Name{isFixedBid ? "*" : ""}</label>
                    <input value={form.milestoneName || ""} onChange={(e) => setForm({ ...form, milestoneName: e.target.value })} placeholder="e.g. M2 - UAT Sign-off" style={inputStyle} />
                    <div style={hint}>Fixed Bid only — matched against the project's milestone list by name</div>
                  </div>
                )}
                <div>
                  <label style={labelStyle}>Amount*</label>
                  <input type="number" min="0" step="0.01" value={form.amount || ""} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="e.g. 420000" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Submitted By</label>
                  <select value={form.submittedByUserId || ""} onChange={(e) => setForm({ ...form, submittedByUserId: e.target.value })} style={inputStyle}>
                    <option value="">{submittedByLabel()}</option>
                    {activeOptions(users, form.submittedByUserId).map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
                  </select>
                </div>
                {mode === "edit" && (
                  <div>
                    <label style={labelStyle}>Approval Status</label>
                    <select value={form.approvalStatusId || ""} onChange={(e) => setForm({ ...form, approvalStatusId: e.target.value })} style={inputStyle}>
                      <option value="">Select status</option>
                      {activeOptions(approvalStatuses, form.approvalStatusId).map((s) => <option key={s.guid} value={s.guid}>{s.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </Section>

            <Section
              icon={Users}
              color="#8B5CF6"
              title="Billable Resources"
              sub={
                period
                  ? `Working Days ${workingDays} (${wdBreakdown.weekdays} weekdays${wdBreakdown.holidayCount ? ` − ${wdBreakdown.holidayCount} holiday${wdBreakdown.holidayCount > 1 ? "s" : ""}` : ""} = ${wdBreakdown.workingDays}) · Max capacity ${maxCapacity}h/resource this month`
                  : "Select a Billing Period to calculate Working Days"
              }
            >
              {period && wdBreakdown.holidayCount > 0 && (
                <div style={{ fontSize: 11.5, color: COLORS.textMuted, marginBottom: 8 }}>
                  Holidays this month: {wdBreakdown.holidayHits.map((h) => `${h.name} (${h.date})`).join(", ")}
                </div>
              )}
              <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ background: COLORS.bg }}>
                      {["Resource", "Designation", "Hours/Day", "Planned Hours", "Actual Hours", "Capacity", "Approved Timesheet*"].map((h) => (
                        <th key={h} style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, color: COLORS.textMuted, fontWeight: 700, textTransform: "uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {!form.projectId ? (
                      <tr><td colSpan={7} style={{ padding: 16, textAlign: "center", color: COLORS.textMuted }}>Select a project first.</td></tr>
                    ) : loadingResources ? (
                      <tr><td colSpan={7} style={{ padding: 16, textAlign: "center", color: COLORS.textMuted }}><Loader2 size={14} className="spin" style={{ verticalAlign: "middle", marginRight: 6 }} />Loading…</td></tr>
                    ) : resourceRows.length === 0 ? (
                      <tr><td colSpan={7} style={{ padding: 16, textAlign: "center", color: COLORS.textMuted }}>No billable resources allocated to this project.</td></tr>
                    ) : resourceRows.map((r) => (
                      <tr key={r.key} style={{ borderTop: `1px solid ${COLORS.border}`, background: r.overCapacity ? COLORS.warningSoft : "transparent" }}>
                        <td style={{ padding: "8px 10px", fontWeight: 600, color: COLORS.text }}>{r.name}</td>
                        <td style={{ padding: "8px 10px", color: COLORS.text }}>{r.designation}</td>
                        <td style={{ padding: "6px 8px" }}>
                          <input
                            type="number" min="0" max="24" step="0.5" value={r.hoursPerDay}
                            onChange={(e) => setResourceHour(r.userId, { hoursPerDay: e.target.value === "" ? "" : Number(e.target.value) })}
                            style={{ ...inputStyle, padding: "6px 8px", width: 70 }}
                          />
                        </td>
                        <td style={{ padding: "8px 10px", color: COLORS.text }}>{r.plannedHours.toFixed(1)}</td>
                        <td style={{ padding: "6px 8px" }}>
                          <input
                            type="number" min="0" step="0.5" value={r.actualHours}
                            onChange={(e) => setResourceHour(r.userId, { actualHours: e.target.value === "" ? "" : Number(e.target.value) })}
                            style={{ ...inputStyle, padding: "6px 8px", width: 80 }}
                          />
                        </td>
                        <td style={{ padding: "8px 10px" }}>
                          {r.overCapacity ? (
                            <span title={`${r.totalWithThis.toFixed(1)}h planned across all projects this month vs ${maxCapacity}h max`} style={{ display: "inline-flex", alignItems: "center", gap: 5, color: COLORS.warning, fontWeight: 700 }}>
                              <AlertCircle size={13} /> {r.totalWithThis.toFixed(1)}/{maxCapacity}h
                            </span>
                          ) : (
                            <span style={{ color: COLORS.textMuted }}>{r.totalWithThis.toFixed(1)}/{maxCapacity || "—"}h</span>
                          )}
                        </td>
                        <td style={{ padding: "8px 10px" }}>
                          {r.staged ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: COLORS.accent, fontWeight: 600 }}><FileCheck size={12} /> {r.staged.fileName} <span style={{ color: COLORS.textMuted, fontWeight: 400 }}>(pending save)</span></span>
                          ) : r.savedDoc ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: COLORS.text }}><FileText size={12} /> {r.savedDoc.fileName || r.savedDoc.docName}</span>
                          ) : (
                            <label style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", color: COLORS.danger, fontWeight: 600, fontSize: 12, border: `1px solid ${COLORS.dangerSoft}`, borderRadius: 7, padding: "4px 9px" }}>
                              <UploadCloud size={12} /> Required
                              <input type="file" style={{ display: "none" }} onChange={(e) => addTimesheetFile(r.userId, e.target.files)} />
                            </label>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {resourceRows.length > 0 && (
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 20, padding: "8px 12px", borderTop: `1px solid ${COLORS.border}`, background: COLORS.bg, fontSize: 12, color: COLORS.textMuted }}>
                    <span>Billable resources <strong style={{ color: COLORS.text }}>{resourceRows.length}</strong></span>
                    <span>Total Planned Hours <strong style={{ color: COLORS.text }}>{totalBillableHours.toFixed(1)}</strong></span>
                  </div>
                )}
                {anyOverCapacity && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 12px", background: COLORS.warningSoft, color: COLORS.warning, fontSize: 12.5, fontWeight: 600, borderTop: `1px solid ${COLORS.border}` }}>
                    <AlertCircle size={14} /> One or more resources exceed their maximum monthly capacity (Working Days × 8h) once every project they're billed on this period is added up. You can still submit — double-check before you do.
                  </div>
                )}
                {hoursError && <div style={{ ...hint, color: COLORS.danger, padding: "0 10px 8px" }}>{hoursError}</div>}
              </div>
            </Section>

            <Section icon={Paperclip} color="#0EA5A4" title="Supporting Documents" sub="Optional — attached to the project's document list">
              <div style={full}>
                <label
                  htmlFor="billing-doc-input"
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, border: `1.5px dashed ${COLORS.border}`, borderRadius: 10, padding: "18px 12px", cursor: "pointer", color: COLORS.textMuted, textAlign: "center" }}
                >
                  <UploadCloud size={20} />
                  <span style={{ fontSize: 12.5 }}>Drop files or <span style={{ color: COLORS.accent, fontWeight: 600 }}>browse</span></span>
                  <span style={{ fontSize: 11 }}>PDF, DOCX, XLSX, JPG, PNG</span>
                  <input id="billing-doc-input" type="file" multiple onChange={(e) => addFiles(e.target.files)} style={{ display: "none" }} />
                </label>
                {docError && <div style={{ ...hint, color: COLORS.danger, marginTop: 6 }}>{docError}</div>}
                {docs.map((d) => (
                  <div key={d.fileName} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, padding: "8px 12px", background: COLORS.accentSoft, borderRadius: 8, fontSize: 12.5 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, color: COLORS.accent, fontWeight: 600 }}><FileCheck size={13} /> {d.fileName} <span style={{ color: COLORS.textMuted, fontWeight: 400 }}>({d.sizeLabel})</span></span>
                    <button type="button" onClick={() => removeDoc(d.fileName)} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.textMuted }}><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            </Section>

            <Section icon={MessageSquare} color="#F59E0B" title="Remarks" sub="Optional notes for Finance">
              <div style={full}>
                <textarea value={form.remarks || ""} onChange={(e) => setForm({ ...form, remarks: e.target.value })} rows={3} placeholder="Optional notes for Finance" style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
              </div>
            </Section>

            {error && <div style={{ display: "flex", gap: 8, alignItems: "center", color: COLORS.danger, fontSize: 13, padding: "12px 14px", background: COLORS.dangerSoft, borderRadius: 10 }}><AlertCircle size={15} /> {error}</div>}
          </div>

          <div style={{ flex: "1 1 300px", minWidth: 0, position: "sticky", top: 0 }}>
            <div style={{ ...card, padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: COLORS.text }}>Billing Summary</div>

              <div style={{ padding: 16, borderRadius: 12, background: `linear-gradient(135deg, ${COLORS.navy}, ${COLORS.navyLift})`, color: "#fff" }}>
                <div style={{ fontSize: 11.5, opacity: 0.7, letterSpacing: "0.04em" }}>{project ? (project.projectCode || project.projectName) : "PROJECT"}</div>
                <div style={{ fontSize: 24, fontWeight: 800, marginTop: 8 }}>{amount ? fmt(amount) : "—"}</div>
                <div style={{ fontSize: 11.5, opacity: 0.7 }}>Billing amount</div>
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, padding: "4px 10px", borderRadius: 999, background: "rgba(255,255,255,.12)" }}>{status?.name || "Draft"}</span>
                  {typeName && <span style={{ fontSize: 11.5, fontWeight: 600, padding: "4px 10px", borderRadius: 999, background: "rgba(255,255,255,.12)" }}>{typeName}</span>}
                </div>
              </div>

              <Stat icon={Building2} label="Customer" value={client?.name || "—"} />
              <Stat icon={FolderKanban} label="Project" value={project ? (project.projectCode || project.projectName) : "—"} />
              <Stat icon={CalendarClock} label="Billing Period" value={period ? period.periodName : "—"} color={duplicatePeriod ? COLORS.danger : undefined} />
              <Stat icon={Users} label="Billable Resources" value={String(resourceRows.length)} />
              <Stat icon={Clock} label="Total Billable Hours" value={`${totalBillableHours.toFixed(1)} h`} />
              <Stat icon={Coins} label="Submitted By" value={submittedByLabel()} />

              <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: COLORS.accentSoft, fontSize: 12, color: COLORS.textSoft, lineHeight: 1.5 }}>
                <Info size={16} color={COLORS.accent} style={{ flexShrink: 0, marginTop: 1 }} />
                Fields marked * are required. Billing Type, Customer and Currency come from the selected project.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "14px 28px", borderTop: `1px solid ${COLORS.border}`, background: COLORS.card, display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={{ padding: "9px 16px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", color: COLORS.text }}>Cancel</button>
        <button onClick={handleSubmit} disabled={saving || duplicatePeriod || missingTimesheets.length > 0} title={missingTimesheets.length > 0 ? "Approved Timesheet is required for every billable resource" : undefined} style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: COLORS.accent, color: "#fff", fontSize: 13, fontWeight: 700, cursor: (saving || duplicatePeriod || missingTimesheets.length > 0) ? "default" : "pointer", opacity: (saving || duplicatePeriod || missingTimesheets.length > 0) ? 0.6 : 1, display: "flex", alignItems: "center", gap: 7 }}>
          {saving && <Loader2 size={13} className="spin" />}
          {saving ? "Saving…" : "Submit"}
        </button>
      </div>
    </div>
  );
}

const hint = { fontSize: 11, color: COLORS.textMuted, marginTop: 4 };