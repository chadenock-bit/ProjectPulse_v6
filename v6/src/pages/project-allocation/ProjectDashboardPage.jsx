// ProjectDashboardPage.jsx (full file)
import { useState } from "react";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  CalendarClock,
  Loader2,
  Users2,
  FolderKanban,
  Clock,
  LayoutGrid,
  List,
} from "lucide-react";
import { callProjectFlow, callProjectResourceFlow, callProjectDocumentFlow } from "../../api/flows";
import { ConfirmModal } from "../../components/common/ConfirmModal";
import { EmptyState } from "../../components/common/EmptyState";
import { StatusBadge } from "../../components/common/StatusBadge";
import { CHART_PALETTE, COLORS, cardStyle } from "../../constants/theme";
import { ProjectDetailPanel } from "./ProjectDetailPanel";
import { ProjectPanel } from "./ProjectPanel";
import { findName, fmtDate, useLookups, useProjectsWithResources, userLabel } from "./hooks";
import { logAudit } from "../../utils/audit";

// FSD-defined lifecycle order. Statuses not in this list (custom/extra ones
// added to master data) are left unrestricted — only skipping forward past a
// known step (e.g. Draft straight to Active) is blocked, and only Draft/
// Pending Finance Approval remain deletable (see isDeletable below).
const STATUS_ORDER = ["draft", "pending finance approval", "active", "on hold", "completed", "closed", "archived"];
const statusOrderIndex = (name) => STATUS_ORDER.indexOf((name || "").trim().toLowerCase());

export function ProjectDashboardPage() {
  const lookups = useLookups();
  const { projects, setProjects, loading, error: loadError, refresh, allResources } = useProjectsWithResources();
  const [search, setSearch] = useState("");
  const [view, setView] = useState("table"); // 'table' (default) | 'cards'
  const [panel, setPanel] = useState(null); // { mode: 'add'|'edit', data, originalResourceGuids }
  const [detail, setDetail] = useState(null); // selected project for drawer
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingGuid, setTogglingGuid] = useState(null); // project whose Active switch is saving

  const filtered = loadError ? [] : projects.filter((p) =>
    p.projectName.toLowerCase().includes(search.toLowerCase()) || p.projectCode.toLowerCase().includes(search.toLowerCase())
  );

  const totalResources = projects.reduce((sum, p) => sum + p.resources.length, 0);
  const activeCount = projects.filter((p) => p.active).length;
  const totalWeeklyHours = projects.reduce((sum, p) => sum + p.resources.reduce((s, r) => s + Number(r.weeklyHours || 0), 0), 0);

  const kpis = [
    { label: "Total Projects", value: String(projects.length), icon: FolderKanban, color: COLORS.accent },
    { label: "Active Projects", value: String(activeCount), icon: CheckCircle2, color: COLORS.success },
    { label: "Resources Allocated", value: String(totalResources), icon: Users2, color: "#8B5CF6" },
    { label: "Weekly Billable Hrs", value: String(totalWeeklyHours), icon: Clock, color: "#F59E0B" },
  ];

  // FSD: "Active projects cannot be deleted" / "Completed projects shall be
  // archived" — once a project reaches Active or any later lifecycle step
  // (On Hold, Completed, Closed, Archived), it's no longer deletable.
  // ALSO blocked, regardless of status: any project that has a Project
  // Approval record — SQL's FK_ProjApproval_Project constraint rejects the
  // delete outright, so we check this client-side up front instead of
  // letting the flow call fail. Resources and Documents still cascade-delete
  // automatically; Approval records do not — they block deletion instead.
  const isDeletable = (p) => {
    if ((p.approvals || []).length > 0) return false;
    const idx = statusOrderIndex(findName(lookups.projectStatuses, p.projectStatusId));
    const activeIdx = statusOrderIndex("active");
    return idx === -1 || idx < activeIdx;
  };

  const undeletableReason = (p) => {
    if ((p.approvals || []).length > 0) return "This project has a Finance Approval record and cannot be deleted.";
    return `${findName(lookups.projectStatuses, p.projectStatusId)} projects cannot be deleted.`;
  };

  // Finance approval status, derived from the project's most recent
  // ProjectApproval record — separate from projectStatusId. Delete is
  // blocked whenever ANY approval record exists (per FK_ProjApproval_Project,
  // see isDeletable above), so this badge shows why: "No Action" (no
  // record), or the record's own status ("Approved"/"Rejected"/whatever your
  // ApprovalStatus master data names it).
  const financeApprovalLabel = (p) => {
    const list = p.approvals || [];
    if (list.length === 0) return { text: "No Action", color: COLORS.textMuted, bg: COLORS.bg };
    const latest = [...list].sort((a, b) => new Date(b.decidedOn || 0) - new Date(a.decidedOn || 0))[0];
    const statusName = (findName(lookups.approvalStatuses, latest.approvalStatusId) || "").toLowerCase();
    if (statusName.includes("approve")) return { text: "Finance Approved", color: COLORS.success, bg: `${COLORS.success}1F` };
    if (statusName.includes("reject")) return { text: "Finance Rejected", color: COLORS.danger, bg: COLORS.dangerSoft };
    return { text: statusName ? statusName.replace(/\b\w/g, (c) => c.toUpperCase()) : "Pending Review", color: "#F59E0B", bg: "#F59E0B1F" };
  };

  const openAdd = () => {
    // Default new projects to Draft status per the FSD (matched by name,
    // case-insensitive, against your Project Status master data).
    const draftStatus = lookups.projectStatuses.find((s) => (s.name || "").trim().toLowerCase() === "draft");
    // Auto project code: PRJ + (row count + 1), 4-digit padded (e.g. PRJ0012).
    // Bumps past the highest existing PRJ number so a deleted row never causes a duplicate.
    const maxNo = projects.reduce((m, p) => Math.max(m, Number((/^PRJ(\d+)$/i.exec(p.projectCode || "") || [])[1]) || 0), 0);
    const nextCode = `PRJ${String(Math.max(projects.length, maxNo) + 1).padStart(4, "0")}`;
    setPanel({
      mode: "add",
      data: {
        guid: "", projectCode: nextCode, projectName: "", categoryId: "", clientId: "", billingTypeId: "",
        startDate: "", endDate: "", active: true, resources: [], documents: [],
        projectStatusId: draftStatus ? draftStatus.id : "",
        // No hidden default — user must explicitly choose a currency.
        // "-" is a literal placeholder option, not a real currency code.
        currencyCode: "-",
      },
      originalResourceGuids: [],
    });
  };

  const openEdit = (p) => {
    const data = JSON.parse(JSON.stringify(p));
    // SQL rows carry currencyId, not the panel's currencyCode — fall back to
    // the "-" placeholder (never a hidden INR default) so an unselected
    // currency stays visibly unselected and the user has to pick a real one.
    if (!data.currencyCode) data.currencyCode = "-";
    // <input type="date"> needs plain yyyy-mm-dd (SQL may return a time part).
    const d10 = (v) => (v ? String(v).slice(0, 10) : "");
    data.startDate = d10(data.startDate);
    data.endDate = d10(data.endDate);
    data.resources = (data.resources || []).map((r) => ({ ...r, startDate: d10(r.startDate), endDate: d10(r.endDate) }));
    data.documents = (data.documents || []).map((doc) => ({ ...doc, uploadDate: d10(doc.uploadDate) }));
    setErr("");
    setPanel({
      mode: "edit",
      data,
      originalResourceGuids: p.resources.map((r) => r.guid).filter((g) => g !== "" && g !== undefined),
    });
  };

  // Same one-click Active/Inactive switch as the master screens. Re-sends the
  // project as-is with only `active` flipped, then patches just that row in
  // local state from the flow's response (no full re-LIST, so no flicker).
  const toggleActive = (p) => {
    if (togglingGuid) return;
    setTogglingGuid(p.guid);
    callProjectFlow("EDIT", { ...p, active: !p.active })
      .then((res) => {
        const row = (res.data || []).find((x) => String(x.guid) === String(p.guid));
        const next = row ? !!row.active : !p.active;
        setProjects((prev) => prev.map((x) => (String(x.guid) === String(p.guid) ? { ...x, active: next } : x)));
        logAudit("Project", "Update", p.projectName || p.projectCode || "record");
        setToast(`Marked ${next ? "Active" : "Inactive"}.`);
      })
      .catch((e) => setToast(`Update failed: ${e.message}`))
      .finally(() => setTogglingGuid(null));
  };

  const requestDelete = (p) => {
    if (!isDeletable(p)) {
      setToast(`"${p.projectName}" — ${undeletableReason(p)}`);
      return;
    }
    setConfirmDelete(p);
  };

  // Documents added while EDITING an existing project still upload/delete
  // independently via their own DocumentRow (see ProjectPanel) the moment
  // the user clicks Upload — those never touch submitPanel. Documents added
  // during ADD (no project guid yet) are staged in form.documents with a
  // fileData but no guid; submitPanel uploads those here, right after the
  // new Project row's guid is known, alongside the resource sync below.
  const submitPanel = (form, originalResourceGuids = []) => {
    if (!form.projectCode?.trim() || !form.projectName?.trim() || !form.categoryId || !form.startDate || !form.endDate) {
      setErr("Project Code, Name, Category and Dates are required.");
      return;
    }

    // Start Date must not be after End Date.
    if (new Date(form.startDate) > new Date(form.endDate)) {
      setErr("Start Date cannot be after Est. End Date.");
      return;
    }

    // Project Value, if provided, must be greater than zero.
    if (form.projectValue !== undefined && form.projectValue !== "" && Number(form.projectValue) <= 0) {
      setErr("Project Value must be greater than zero.");
      return;
    }

    // Currency must be explicitly selected — "-" is the unselected placeholder,
    // not a real currency, so it's rejected here same as blank/undefined.
    if (!form.currencyCode || form.currencyCode === "-") {
      setErr("Currency is required.");
      return;
    }

    // Status workflow: block skipping forward past a known FSD step (e.g.
    // Draft straight to Active must go through Pending Finance Approval).
    // Only applies on EDIT, where we know the prior status; unknown/custom
    // statuses (not in STATUS_ORDER) are left unrestricted.
    if (form.guid && form.projectStatusId) {
      const original = projects.find((p) => String(p.guid) === String(form.guid));
      if (original) {
        const fromIdx = statusOrderIndex(findName(lookups.projectStatuses, original.projectStatusId));
        const toIdx = statusOrderIndex(findName(lookups.projectStatuses, form.projectStatusId));
        if (fromIdx !== -1 && toIdx !== -1 && toIdx - fromIdx > 1) {
          setErr(`Cannot move status from "${findName(lookups.projectStatuses, original.projectStatusId)}" directly to "${findName(lookups.projectStatuses, form.projectStatusId)}" — it must pass through the steps in between.`);
          return;
        }
      }
    }

    // Resource allocation must not exceed 100% for any user, across ALL
    // active projects — not just this one. Sum this project's form rows
    // per user, add their allocation on every OTHER project (from
    // allResources), and block Submit if the combined total is over 100%.
    const allocByUser = {};
    form.resources.forEach((r) => {
      if (!r.userId) return;
      allocByUser[r.userId] = (allocByUser[r.userId] || 0) + Number(r.allocationPct || 0);
    });
    for (const [userId, pctHere] of Object.entries(allocByUser)) {
      const pctElsewhere = allResources
        .filter((r) => String(r.userId) === String(userId) && String(r.projectId) !== String(form.guid))
        .reduce((sum, r) => sum + Number(r.allocationPct || 0), 0);
      const total = pctElsewhere + pctHere;
      if (total > 100) {
        setErr(`${userLabel(lookups.users, userId)} would be allocated ${total}% across all projects (max 100%). Reduce the allocation here.`);
        return;
      }
    }

    setSaving(true);
    setErr("");
    const wasAdd = !form.guid;
    const projectAction = wasAdd ? "CREATE" : "EDIT";
    callProjectFlow(projectAction, form)
      .then((projRes) => {
        // Resolve the project's guid: already known on EDIT; on CREATE, find
        // the freshly inserted row by its unique projectCode in the refreshed list.
        let projectGuid = form.guid;
        if (!projectGuid) {
          const match = projRes.data.find((p) => p.projectCode === form.projectCode.trim());
          projectGuid = match ? match.guid : "";
        }

        // Sync resources: CREATE new rows (no guid), EDIT existing rows (has guid),
        // DELETE rows that were on the project originally but got removed in the panel.
        const currentResGuids = form.resources.map((r) => r.guid).filter((g) => g !== "" && g !== undefined);
        const removedResGuids = originalResourceGuids.filter((g) => !currentResGuids.includes(g));

        // Staged documents — added during Add (no guid yet), have fileData
        // waiting to upload. Each is a separate, sequential CREATE call (not
        // Promise.all) — concurrent flow2 document uploads previously caused
        // 502s (see DocumentRow's own comment on the same issue for edits).
        const stagedDocs = (form.documents || []).filter((d) => !d.guid && d.fileData);

        return Promise.all([
          ...form.resources.map((r) => callProjectResourceFlow(r.guid ? "EDIT" : "CREATE", { ...r, projectId: projectGuid })),
          ...removedResGuids.map((guid) =>
            callProjectResourceFlow("DELETE", { guid }).catch((e) => {
              console.warn("Resource delete failed (continuing save):", e.message);
            })
          ),
        ])
          .then(() =>
            stagedDocs.reduce(
              (chain, doc) =>
                chain.then(() =>
                  callProjectDocumentFlow("CREATE", { ...doc, projectId: projectGuid }).catch((e) => {
                    console.warn("Staged document upload failed (continuing save):", e.message);
                  })
                ),
              Promise.resolve()
            )
          )
          .then(() => projectGuid);
      })
      .then((projectGuid) => refresh({ skipDocuments: true }).then(() => projectGuid))
      .then((projectGuid) => {
        setSaving(false);
        logAudit("Project", wasAdd ? "Create" : "Update", form.projectName || form.projectCode || "record", {
          fromStatus: wasAdd ? "" : findName(lookups.projectStatuses, (projects.find((p) => String(p.guid) === String(form.guid)) || {}).projectStatusId),
          toStatus: findName(lookups.projectStatuses, form.projectStatusId),
        }, {
          projectId: projectGuid || form.guid,
          projectManagerUserId: form.projectManagerUserId,
          deliveryHeadUserId: form.deliveryHeadUserId,
        });
        if (wasAdd && projectGuid) {
          setToast("Project added.");
          openEdit({ ...form, guid: projectGuid, resources: form.resources, documents: [] });
        } else {
          setToast("Project updated.");
          setPanel(null);
        }
      })
      .catch((e) => {
        setSaving(false);
        setErr(e.message);
      });
  };

  const confirmDeleteRow = () => {
    if (!confirmDelete || deleting) return;
    // Safety net: re-check deletability against the latest known state in
    // case something changed between opening the confirm dialog and
    // clicking Confirm (status changed, or an approval got recorded).
    if (!isDeletable(confirmDelete)) {
      setToast(`"${confirmDelete.projectName}" — ${undeletableReason(confirmDelete)}`);
      setConfirmDelete(null);
      return;
    }
    setDeleting(true);
    // Resources and documents both carry the FK to Project, so they must be
    // removed first. Both run ONE AT A TIME (not Promise.all) — deleting
    // several rows concurrently was saturating the flow's SQL connector and
    // producing 502 NoResponse. If one's already gone (stale guid, deleted
    // out-of-band, etc.) don't let that block deleting the rest or the
    // Project itself. Project Approval records are NOT cascaded here — a
    // project with any approval record is blocked from deletion entirely
    // (see isDeletable), matching the flow's own FK_ProjApproval_Project
    // constraint.
    const deleteResources = confirmDelete.resources.reduce(
      (chain, r) => chain.then(() =>
        callProjectResourceFlow("DELETE", { guid: r.guid }).catch((e) => {
          console.warn("Resource delete failed (continuing to delete project):", e.message);
        })
      ),
      Promise.resolve()
    );
    const deleteDocuments = confirmDelete.documents.reduce(
      (chain, d) => chain.then(() =>
        callProjectDocumentFlow("DELETE", { guid: d.guid }).catch((e) => {
          console.warn("Document delete failed (continuing to delete project):", e.message);
        })
      ),
      Promise.resolve()
    );
    // Resources and documents are on different flows (flow1 vs flow2), so
    // running these two chains in parallel with each other is fine — only
    // deletes WITHIN each type are serialized.
    Promise.all([deleteResources, deleteDocuments])
      .then(() => callProjectFlow("DELETE", { guid: confirmDelete.guid }))
      .then(() => refresh())
      .then(() => {
        logAudit("Project", "Delete", confirmDelete.projectName || confirmDelete.projectCode || "record", null, {
          projectId: confirmDelete.guid,
          projectManagerUserId: confirmDelete.projectManagerUserId,
          deliveryHeadUserId: confirmDelete.deliveryHeadUserId,
        });
        setToast("Project deleted.");
        setConfirmDelete(null);
      })
      .catch((e) => setToast(`Delete failed: ${e.message}`))
      .finally(() => setDeleting(false));
  };

  // Add New Project and Edit Project both take over the whole content area
  // as a dedicated page — the form (project details + resources + documents)
  // is too long for the narrow right-hand drawer. Saving/cancelling returns
  // to the project dashboard, same as Add.
  if (panel && (panel.mode === "add" || panel.mode === "edit")) {
    return (
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
        <ProjectPanel
          mode={panel.mode}
          data={panel.data}
          saving={saving}
          error={err}
          layout="page"
          onCancel={() => { panel.mode === "add" ? openAdd() : setPanel(null); setErr(""); }}
          onClose={() => setPanel(null)}
          onSubmit={(form) => submitPanel(form, panel.originalResourceGuids)}
          lookups={lookups}
          onDocumentToast={setToast}
          allResources={allResources}
        />
        {toast && (
          <div style={{ position: "absolute", bottom: 22, left: "50%", transform: "translateX(-50%)", background: COLORS.text, color: "#fff", padding: "10px 18px", borderRadius: 9, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 12px 30px rgba(0,0,0,0.2)" }}>
            <CheckCircle2 size={15} color={COLORS.success} /> {toast}
          </div>
        )}
      </div>
    );
  }

  // Clicking a project opens its details as a full page (same pattern as Add/Edit).
  if (detail && !panel) {
    return (
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
        <ProjectDetailPanel project={detail} onClose={() => setDetail(null)} onEdit={() => { openEdit(detail); setDetail(null); }} lookups={lookups} />
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
      <div style={{ flex: 1, padding: 26, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div style={{ fontFamily: "Sora, sans-serif", fontSize: 20, fontWeight: 700, color: COLORS.text }}>Project Dashboard</div>
            <div style={{ color: COLORS.textMuted, fontSize: 13.5 }}>Overview of all projects and their resource allocation</div>
          </div>
          <button onClick={openAdd} style={{ display: "flex", alignItems: "center", gap: 7, background: COLORS.accent, color: "#fff", border: "none", borderRadius: 9, padding: "10px 16px", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
            <Plus size={15} /> Add Project
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 18 }}>
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

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "9px 12px", width: 300, background: COLORS.card }}>
            <Search size={14} color={COLORS.textMuted} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by project code or name" style={{ border: "none", outline: "none", fontSize: 13, width: "100%", fontFamily: "Inter, sans-serif" }} />
          </div>
          <div style={{ display: "flex", border: `1px solid ${COLORS.border}`, borderRadius: 8, overflow: "hidden" }}>
            <button onClick={() => setView("table")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", border: "none", background: view === "table" ? COLORS.accent : "#fff", color: view === "table" ? "#fff" : COLORS.text, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              <List size={13} /> Table
            </button>
            <button onClick={() => setView("cards")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", border: "none", background: view === "cards" ? COLORS.accent : "#fff", color: view === "cards" ? "#fff" : COLORS.text, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              <LayoutGrid size={13} /> Cards
            </button>
          </div>
        </div>

        {view === "table" ? (
          <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: COLORS.bg }}>
                  {["Project Code", "Project Name", "Category", "Client", "Billing Type", "Duration", "Resources", "Status", "Actions"].map((h) => (
                    <th key={h} style={{ textAlign: h === "Actions" ? "center" : "left", padding: "10px 10px", fontSize: 12, color: COLORS.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} style={{ padding: 40, textAlign: "center", color: COLORS.textMuted }}>
                    <Loader2 size={18} className="spin" style={{ verticalAlign: "middle", marginRight: 8 }} /> Loading projects…
                  </td></tr>
                ) : loadError ? (
                  <tr><td colSpan={9}><EmptyState onRetry={refresh} /></td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={9} style={{ padding: 40, textAlign: "center", color: COLORS.textMuted }}>No data available.</td></tr>
                ) : filtered.map((p, i) => (
                  <tr key={p.id} style={{ borderTop: `1px solid ${COLORS.border}`, background: i % 2 ? "COLORS.tableHead" : "#fff", cursor: "pointer" }} onClick={() => setDetail(p)}>
                    <td style={{ padding: "11px 10px", fontSize: 13.5, color: COLORS.text, fontWeight: 600 }}>{p.projectCode}</td>
                    <td style={{ padding: "11px 10px", fontSize: 13.5, color: COLORS.text }}>{p.projectName}</td>
                    <td style={{ padding: "11px 10px", fontSize: 13, color: COLORS.text }}>{findName(lookups.categories, p.categoryId)}</td>
                    <td style={{ padding: "11px 10px", fontSize: 13, color: COLORS.text }}>{findName(lookups.clients, p.clientId)}</td>
                    <td style={{ padding: "11px 10px", fontSize: 13, color: COLORS.text }}>{findName(lookups.billingTypes, p.billingTypeId)}</td>
                    <td style={{ padding: "11px 10px", fontSize: 12, color: COLORS.textMuted, whiteSpace: "nowrap", lineHeight: 1.45 }}>
                      <div>{fmtDate(p.startDate)}</div>
                      <div>→ {fmtDate(p.endDate)}</div>
                    </td>
                    <td style={{ padding: "11px 10px", fontSize: 13, color: COLORS.text }}>{p.resources.length}</td>
                    <td style={{ padding: "11px 10px" }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <StatusBadge active={p.active} busy={String(togglingGuid) === String(p.guid)} onToggle={() => toggleActive(p)} />
                        {p.projectStatusId && (
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: COLORS.accent, background: COLORS.accentSoft, padding: "2px 8px", borderRadius: 999, width: "fit-content" }}>
                            {findName(lookups.projectStatuses, p.projectStatusId)}
                          </span>
                        )}
                        {(() => {
                          const fa = financeApprovalLabel(p);
                          return (
                            <span style={{ fontSize: 10.5, fontWeight: 700, color: fa.color, background: fa.bg, padding: "2px 8px", borderRadius: 999, width: "fit-content" }}>
                              {fa.text}
                            </span>
                          );
                        })()}
                      </div>
                    </td>
                    <td style={{ padding: "11px 10px", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: "inline-flex", gap: 8 }}>
                        <button onClick={() => openEdit(p)} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: COLORS.accentSoft, color: COLORS.accent, border: "none", borderRadius: 7, padding: "6px 11px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                          <Pencil size={12} /> Edit
                        </button>
                        <button
                          onClick={() => requestDelete(p)}
                          disabled={!isDeletable(p)}
                          title={isDeletable(p) ? undefined : undeletableReason(p)}
                          style={{ display: "inline-flex", alignItems: "center", gap: 6, background: COLORS.dangerSoft, color: COLORS.danger, border: "none", borderRadius: 7, padding: "6px 11px", fontSize: 12.5, fontWeight: 600, cursor: isDeletable(p) ? "pointer" : "not-allowed", opacity: isDeletable(p) ? 1 : 0.5 }}
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
          {loading ? (
            <div style={{ ...cardStyle, gridColumn: "1/-1", textAlign: "center", color: COLORS.textMuted, padding: 40 }}>
              <Loader2 size={18} className="spin" style={{ verticalAlign: "middle", marginRight: 8 }} /> Loading projects…
            </div>
          ) : loadError ? (
            <div style={{ ...cardStyle, gridColumn: "1/-1" }}><EmptyState onRetry={refresh} /></div>
          ) : filtered.length === 0 ? (
            <div style={{ ...cardStyle, gridColumn: "1/-1", textAlign: "center", color: COLORS.textMuted, padding: 40 }}>No data available.</div>
          ) : filtered.map((p) => (
            <div key={p.id} style={{ ...cardStyle, cursor: "pointer", display: "flex", flexDirection: "column", gap: 10 }} onClick={() => setDetail(p)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14.5, color: COLORS.text }}>{p.projectName}</div>
                  <div style={{ fontSize: 12, color: COLORS.textMuted }}>{p.projectCode}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                  <StatusBadge active={p.active} busy={String(togglingGuid) === String(p.guid)} onToggle={() => toggleActive(p)} />
                  {p.projectStatusId && (
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: COLORS.accent, background: COLORS.accentSoft, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap" }}>
                      {findName(lookups.projectStatuses, p.projectStatusId)}
                    </span>
                  )}
                  {(() => {
                    const fa = financeApprovalLabel(p);
                    return (
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: fa.color, background: fa.bg, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap" }}>
                        {fa.text}
                      </span>
                    );
                  })()}
                </div>
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: COLORS.accent, background: COLORS.accentSoft, padding: "3px 9px", borderRadius: 999 }}>
                  {findName(lookups.categories, p.categoryId)}
                </span>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: COLORS.textMuted, background: COLORS.bg, padding: "3px 9px", borderRadius: 999 }}>
                  {findName(lookups.clients, p.clientId)}
                </span>
              </div>

              <div style={{ fontSize: 12, color: COLORS.textMuted, display: "flex", alignItems: "center", gap: 5 }}>
                <CalendarClock size={12} /> {fmtDate(p.startDate)} → {fmtDate(p.endDate)}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4, paddingTop: 10, borderTop: `1px solid ${COLORS.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: -6 }}>
                  {p.resources.slice(0, 4).map((r, i) => (
                    <span key={r.id} title={userLabel(lookups.users, r.userId)} style={{
                      width: 26, height: 26, borderRadius: "50%", background: CHART_PALETTE[i % CHART_PALETTE.length],
                      color: "#fff", fontSize: 10.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
                      border: "2px solid #fff", marginLeft: i === 0 ? 0 : -8,
                    }}>
                      {userLabel(lookups.users, r.userId).split(" ").map((w) => w[0]).join("")}
                    </span>
                  ))}
                  {p.resources.length === 0 && <span style={{ fontSize: 11.5, color: COLORS.textMuted }}>No resources</span>}
                </div>
                <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => openEdit(p)} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: COLORS.accentSoft, color: COLORS.accent, border: "none", borderRadius: 7, padding: "6px 11px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                    <Pencil size={12} /> Edit
                  </button>
                  <button
                    onClick={() => requestDelete(p)}
                    disabled={!isDeletable(p)}
                    title={!isDeletable(p) ? undeletableReason(p) : undefined}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, background: COLORS.dangerSoft, color: COLORS.danger, border: "none", borderRadius: 7, padding: "6px 11px", fontSize: 12.5, fontWeight: 600, cursor: isDeletable(p) ? "pointer" : "not-allowed", opacity: isDeletable(p) ? 1 : 0.5 }}
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        )}
      </div>

      {confirmDelete && (
        <ConfirmModal
          title="Delete this project?"
          message={`"${confirmDelete.projectName}" (${confirmDelete.projectCode}) and its ${confirmDelete.resources.length} resource allocation(s) and ${confirmDelete.documents.length} document(s) will be removed. This can't be undone.`}
          confirmLabel="Delete" busy={deleting}
          onCancel={() => !deleting && setConfirmDelete(null)}
          onConfirm={confirmDeleteRow}
        />
      )}

      {toast && (
        <div style={{ position: "absolute", bottom: 22, left: "50%", transform: "translateX(-50%)", background: COLORS.text, color: "#fff", padding: "10px 18px", borderRadius: 9, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 12px 30px rgba(0,0,0,0.2)" }}
          onAnimationEnd={() => {}}>
          <CheckCircle2 size={15} color={COLORS.success} /> {toast}
        </div>
      )}
    </div>
  );
}