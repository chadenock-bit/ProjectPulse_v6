// PermissionsAdminPage.jsx — module x role/user permission grid.
//   By Role : the default rights of a role.
//   By User : per-user OVERRIDES. Modules without an override show (greyed) what
//             the user inherits from their role(s); ticking anything creates an
//             override that replaces the role result for that module only.
//   Hide    : nothing extra is stored — Hide saves ALL flags as 0 (no View = the
//             screen disappears from the nav). Unticking Hide gives View back.
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Loader2, AlertCircle, CheckCircle2, Save, RotateCcw, Shield, User as UserIcon, CheckCheck, Eraser, EyeOff, Info } from "lucide-react";
import { callPermissionFlow, callRoleFlow, callUserFlow } from "../../api/flows";
import { COLORS, cardStyle, inputStyle } from "../../constants/theme";
import { MODULES } from "../../constants/modules";
import { usePermissions } from "../../context/PermissionContext";
import { FLAGS, ZERO, hasAnyFlag, normalizeFlags, fetchModules, fetchRoleGrid, fetchUserOverrides, fetchUserRoleIds, mergeRoleGrids } from "../../utils/permissions";

const COLUMNS = [
  { key: "canView", label: "View" },
  { key: "canCreate", label: "Create" },
  { key: "canEdit", label: "Edit" },
  { key: "canDelete", label: "Delete" },
  { key: "canApprove", label: "Approve" },
];
const BATCH = 3; // saves run a few at a time — the flow's SQL connector chokes on big bursts

const thStyle = { textAlign: "center", padding: "10px 12px", fontSize: 12, color: COLORS.textMuted, fontWeight: 700, textTransform: "uppercase" };
const ghostBtn = (disabled) => ({
  display: "flex", alignItems: "center", gap: 6, background: "#fff", color: COLORS.text,
  border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 600,
  cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1,
});

export function PermissionsAdminPage() {
  const { refresh: refreshMine, isAdmin, roleIds: myRoleIds, userId: myUserId } = usePermissions();
  const [tab, setTab] = useState("role");
  const [modules, setModules] = useState([]);
  const [roles, setRoles] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [grid, setGrid] = useState({});           // "<moduleId>" -> flags: own rows (role rows / user overrides)
  const [inherited, setInherited] = useState({}); // user tab: role-derived flags per module
  const [userRoleIds, setUserRoleIds] = useState([]);
  const [roleReadFailed, setRoleReadFailed] = useState(false); // user tab: the role's grid couldn't be read
  const [promptDismissed, setPromptDismissed] = useState(""); // user id whose "role not set" prompt was answered
  const [persisted, setPersisted] = useState([]); // ids that exist in SQL for this selection
  const [touched, setTouched] = useState([]);     // ids changed since load -> only these are saved
  const [cleared, setCleared] = useState([]);     // user tab: overrides to remove on save
  const [loading, setLoading] = useState(true);
  const [loadingGrid, setLoadingGrid] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const loadToken = useRef(0);

  const dirty = touched.length > 0 || cleared.length > 0;

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchModules(), callRoleFlow("LIST"), callUserFlow("LIST")])
      .then(([mods, roleRes, userRes]) => {
        setModules(mods);
        setRoles((roleRes.data || []).filter((r) => r.active));
        setUsers((userRes.data || []).filter((u) => u.active));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2600); return () => clearTimeout(t); }, [toast]);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty) return undefined;
    const h = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const missingModules = useMemo(
    () => (loading ? [] : MODULES.filter((m) => m.implemented && !modules.some((x) => x.moduleKey === m.key))),
    [loading, modules]
  );

  const loadGrid = useCallback(async (id, forTab) => {
    const token = ++loadToken.current;
    if (!id) { setGrid({}); setInherited({}); setUserRoleIds([]); setRoleReadFailed(false); setPersisted([]); setTouched([]); setCleared([]); return; }
    setLoadingGrid(true);
    setError("");
    try {
      let own = {}; let inh = {}; let rIds = []; let roleFailed = false;
      if (forTab === "role") {
        own = await fetchRoleGrid(id);
      } else {
        const [ov, ids] = await Promise.all([fetchUserOverrides(id), fetchUserRoleIds(id)]);
        own = ov; rIds = ids;
        // A role that can't be read must not stop the admin from giving this user their own permissions.
        inh = mergeRoleGrids(await Promise.all(ids.map((rid) => fetchRoleGrid(rid).catch(() => { roleFailed = true; return {}; }))));
      }
      if (token !== loadToken.current) return; // a newer selection won
      setGrid(own); setInherited(inh); setUserRoleIds(rIds); setRoleReadFailed(roleFailed);
      if (roleFailed) setError("Couldn't read this user's role permissions, so only their own overrides are shown.");
      setPersisted(Object.keys(own)); setTouched([]); setCleared([]);
      return own; // what SQL actually holds — save() compares it with what was just sent
    } catch (e) {
      if (token === loadToken.current) setError(e.message);
    } finally {
      if (token === loadToken.current) setLoadingGrid(false);
    }
  }, []);

  const confirmDiscard = () => !dirty || window.confirm("You have unsaved changes. Discard them?");

  const selectEntity = (id) => {
    if (!confirmDiscard()) return;
    setSelectedId(id);
    loadGrid(id, tab);
  };

  const switchTab = (t) => {
    if (t === tab || !confirmDiscard()) return;
    setTab(t); setSelectedId(""); setGrid({}); setInherited({}); setUserRoleIds([]); setRoleReadFailed(false); setPersisted([]); setTouched([]); setCleared([]); setError("");
  };

  // What a module row currently shows: its own row, else (user tab) the inherited role result.
  const displayFor = (id) => {
    if (grid[id]) return { flags: grid[id], source: "own" };
    if (tab === "user" && inherited[id]) return { flags: inherited[id], source: "role" };
    return { flags: ZERO, source: "none" };
  };

  const setRow = (id, next) => {
    setGrid((g) => ({ ...g, [id]: { ...next } }));
    setTouched((t) => (t.includes(id) ? t : [...t, id]));
    setCleared((c) => c.filter((x) => x !== id));
  };

  const toggle = (id, key) => {
    const base = displayFor(id).flags; // on a user tab this starts the override from the inherited values
    if (key === "canView") setRow(id, base.canView ? { ...ZERO } : { ...base, canView: true }); // no View = everything off
    else { const on = !base[key]; setRow(id, { ...base, [key]: on, canView: on ? true : base.canView }); } // any right implies View
  };

  const toggleHide = (id) => {
    const { flags, source } = displayFor(id);
    const hidden = source !== "none" && !hasAnyFlag(flags);
    setRow(id, hidden ? { ...ZERO, canView: true } : { ...ZERO });
  };

  // Select all: the 5 rights ON for every module.
  const selectAll = () => {
    const all = {};
    modules.forEach((m) => { all[String(m.moduleId)] = { canView: true, canCreate: true, canEdit: true, canDelete: true, canApprove: true }; });
    setGrid((g) => ({ ...g, ...all }));
    setTouched(modules.map((m) => String(m.moduleId)));
    setCleared([]);
  };

  // Clear all — role tab: every existing row -> all 0 (hidden). user tab: drop every override (back to role defaults).
  const clearAll = () => {
    if (tab === "role") {
      const ids = Object.keys(grid);
      setGrid(Object.fromEntries(ids.map((id) => [id, { ...ZERO }])));
      setTouched(ids);
    } else {
      setCleared([...persisted]);
      setGrid({});
      setTouched([]);
    }
  };

  const clearOverride = (id) => {
    if (tab !== "user") return;
    setGrid((g) => { const { [id]: _drop, ...rest } = g; return rest; });
    setTouched((t) => t.filter((x) => x !== id));
    if (persisted.includes(id)) setCleared((c) => (c.includes(id) ? c : [...c, id]));
  };

  const moduleName = (id) => modules.find((m) => String(m.moduleId) === String(id))?.moduleName || id;

  const save = async () => {
    if (!selectedId || saving) return;
    const action = tab === "role" ? "SAVE_ROLE_PERMISSION" : "SAVE_USER_PERMISSION";
    const idField = tab === "role" ? "roleId" : "userId";
    const saveIds = touched.filter((id) => grid[id] && !cleared.includes(id));
    if (!saveIds.length && !cleared.length) { setToast("Nothing to save."); return; }

    // Don't let an admin lock themselves out of this screen by accident.
    const permMod = modules.find((m) => m.moduleKey === "permissions");
    if (permMod && !isAdmin) {
      const pid = String(permMod.moduleId);
      const affectsMe = tab === "role" ? myRoleIds.includes(String(selectedId)) : String(selectedId) === String(myUserId);
      const changed = saveIds.includes(pid) || cleared.includes(pid);
      const after = grid[pid] && !cleared.includes(pid) ? grid[pid] : (tab === "user" ? inherited[pid] : null);
      if (affectsMe && changed && !hasAnyFlag(after)) {
        if (!window.confirm("This removes YOUR access to the Permissions screen. Continue?")) return;
      }
    }

    const jobs = [
      ...saveIds.map((id) => ({ id, kind: "save", run: () => callPermissionFlow(action, { [idField]: selectedId, moduleId: id, ...Object.fromEntries(FLAGS.map((k) => [k, !!grid[id][k]])) }) })),
      ...cleared.map((id) => ({ id, kind: "clear", run: () => callPermissionFlow("CLEAR_USER_PERMISSION", { userId: selectedId, moduleId: id }) })),
    ];

    setSaving(true);
    setError("");
    const failed = [];
    for (let i = 0; i < jobs.length; i += BATCH) {
      const chunk = jobs.slice(i, i + BATCH);
      const results = await Promise.allSettled(chunk.map((j) => j.run()));
      results.forEach((r, idx) => { if (r.status === "rejected") failed.push({ job: chunk[idx], msg: r.reason?.message || "failed" }); });
    }
    setSaving(false);

    if (failed.length) {
      const failedIds = new Set(failed.map((f) => f.job.id));
      setTouched((t) => t.filter((id) => failedIds.has(id)));
      setCleared((c) => c.filter((id) => failedIds.has(id)));
      setError(`Couldn't save ${failed.length} of ${jobs.length}: ${failed.map((f) => moduleName(f.job.id)).join(", ")}. Nothing else was lost — press Save again to retry.`);
    } else {
      // Read back from SQL and compare. A flow that answers "OK" without really writing the
      // row must not look like success, so anything missing or different is reported by name.
      const fresh = await loadGrid(selectedId, tab);
      const wrongSave = fresh
        ? saveIds.filter((id) => {
            const row = fresh[id];
            if (!row) return true;
            const want = normalizeFlags(grid[id]);
            return FLAGS.some((k) => !!row[k] !== !!want[k]);
          })
        : [];
      const wrongClear = fresh ? cleared.filter((id) => !!fresh[id]) : [];
      const bad = [...wrongSave, ...wrongClear];
      if (bad.length) {
        console.error("Permission save not persisted:", { action, selectedId, bad, sqlHas: fresh });
        setError(`Sent ${action} for ${idField} ${selectedId}, and the flow answered OK, but reading it back returned ${Object.keys(fresh || {}).length} row(s) with nothing for: ${bad.map(moduleName).join(", ")}. In the flow's run history, compare ${idField} ${selectedId} with the Insert/Update inputs of that ${action} run.`);
      } else {
        setToast("Permissions saved.");
      }
    }
    refreshMine();
  };

  const noSelection = !selectedId || loadingGrid;
  const roleNames = userRoleIds.map((id) => roles.find((r) => String(r.guid) === String(id))?.name).filter(Boolean);

  // User tab: warn BEFORE the admin overrides anything when the user's role gives them nothing yet.
  // User permissions always take priority; the role only fills in modules the user has no override for.
  const userReady = tab === "user" && !!selectedId && !loadingGrid;
  const noRole = userReady && userRoleIds.length === 0;
  const roleNotSet = userReady && !roleReadFailed && userRoleIds.length > 0 && !Object.values(inherited).some(hasAnyFlag);
  const showRolePrompt = (noRole || roleNotSet) && promptDismissed !== String(selectedId);

  const goSetRole = () => {
    if (!userRoleIds.length || !confirmDiscard()) return;
    const rid = String(userRoleIds[0]);
    setTab("role"); setSelectedId(rid); loadGrid(rid, "role");
  };

  return (
    <div style={{ flex: 1, padding: 26, overflowY: "auto", position: "relative" }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontFamily: "Sora, sans-serif", fontSize: 20, fontWeight: 700, color: COLORS.text }}>Permissions</div>
        <div style={{ color: COLORS.textMuted, fontSize: 13.5 }}>Set the default access per role, then override it for individual users. A screen with no View (or Hide ticked) disappears from that user's menu.</div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => switchTab("role")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: tab === "role" ? COLORS.accent : "#fff", color: tab === "role" ? "#fff" : COLORS.text, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
          <Shield size={13} /> By Role
        </button>
        <button onClick={() => switchTab("user")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: tab === "user" ? COLORS.accent : "#fff", color: tab === "user" ? "#fff" : COLORS.text, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
          <UserIcon size={13} /> By User (override)
        </button>
      </div>

      <div style={{ ...cardStyle, marginBottom: 16, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>{tab === "role" ? "Select Role" : "Select User"}</label>
        <select value={selectedId} onChange={(e) => selectEntity(e.target.value)} style={{ ...inputStyle, maxWidth: 320 }} disabled={loading}>
          <option value="">{loading ? "Loading…" : `Select ${tab === "role" ? "a role" : "a user"}`}</option>
          {(tab === "role" ? roles : users).map((r) => (
            <option key={r.id} value={r.id}>{tab === "role" ? r.name : `${r.firstName || ""} ${r.lastName || ""}`.trim() || r.empId}</option>
          ))}
        </select>
        {dirty && <span style={{ fontSize: 12, fontWeight: 700, color: "#B45309", background: "#FEF3C7", borderRadius: 999, padding: "3px 10px" }}>Unsaved changes</span>}
        <div style={{ flex: 1 }} />
        <button data-access="edit" onClick={selectAll} disabled={noSelection || saving} style={ghostBtn(noSelection || saving)} title="Tick View, Create, Edit, Delete and Approve for every module">
          <CheckCheck size={14} /> Select all
        </button>
        <button data-access="edit" onClick={clearAll} disabled={noSelection || saving} style={ghostBtn(noSelection || saving)} title={tab === "role" ? "Set every module to no access (hidden)" : "Remove all overrides — fall back to role defaults"}>
          <Eraser size={14} /> {tab === "role" ? "Clear all" : "Clear all overrides"}
        </button>
        <button data-access="edit" onClick={save} disabled={noSelection || saving || !dirty} style={{ display: "flex", alignItems: "center", gap: 6, background: COLORS.accent, color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: noSelection || saving || !dirty ? "default" : "pointer", opacity: noSelection || saving || !dirty ? 0.6 : 1 }}>
          {saving ? <Loader2 size={13} className="spin" /> : <Save size={13} />} Save Changes
        </button>
      </div>

      {tab === "user" && selectedId && !loadingGrid && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, color: COLORS.textMuted, marginBottom: 12 }}>
          <Info size={14} />
          {roleNames.length
            ? <span>Role: <b style={{ color: COLORS.text }}>{roleNames.join(", ")}</b>. Greyed ticks are inherited from the role; changing a row here overrides the role for that module only. Saved overrides: <b style={{ color: COLORS.text }}>{persisted.length}</b>.</span>
            : <span>This user has <b style={{ color: COLORS.text }}>no active role</b>, so they only get what you tick here. Assign a role under Admin → Employee Details.</span>}
        </div>
      )}

      {showRolePrompt && (
        <div role="alert" style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap", fontSize: 13, color: "#92400E", background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
          <Info size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1, minWidth: 240, lineHeight: 1.5 }}>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>{noRole ? "This user has no role yet" : "Role permissions aren't set yet"}</div>
            {noRole
              ? <>Assign a role under <b>Admin → Employee Details</b>, or give this user direct permissions below. Direct permissions always take priority over a role.</>
              : <>The role <b>{roleNames.join(", ") || "assigned to this user"}</b> has no access configured, so this user gets nothing from it. Set the role's permissions first, or give this user direct permissions below (they always take priority over the role).</>}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {roleNotSet && (
              <button type="button" onClick={goSetRole} style={{ background: COLORS.accent, color: "#fff", border: "none", borderRadius: 8, padding: "8px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                Set role permissions
              </button>
            )}
            <button type="button" onClick={() => setPromptDismissed(String(selectedId))} style={{ background: "#fff", color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
              Give direct permissions
            </button>
          </div>
        </div>
      )}

      {missingModules.length > 0 && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: "#92400E", background: "#FEF3C7", borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>
          <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>These screens have no row in the Module master, so only the super admin can open them: <b>{missingModules.map((m) => m.label).join(", ")}</b>.</span>
        </div>
      )}

      {error && <div style={{ display: "flex", gap: 8, alignItems: "center", color: COLORS.danger, fontSize: 13, marginBottom: 12 }}><AlertCircle size={14} /> {error}</div>}

      {!selectedId ? (
        <div style={{ ...cardStyle, textAlign: "center", color: COLORS.textMuted, padding: 40 }}>
          Pick a {tab === "role" ? "role" : "user"} above to view and edit its module access.
        </div>
      ) : loadingGrid ? (
        <div style={{ ...cardStyle, textAlign: "center", color: COLORS.textMuted, padding: 40 }}>
          <Loader2 size={18} className="spin" style={{ verticalAlign: "middle", marginRight: 8 }} /> Loading permissions…
        </div>
      ) : (
        <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: COLORS.bg }}>
                <th style={{ ...thStyle, textAlign: "left", padding: "10px 16px" }}>Module</th>
                {COLUMNS.map((a) => <th key={a.key} style={thStyle}>{a.label}</th>)}
                <th style={thStyle}>Hide</th>
                {tab === "user" && <th style={thStyle}>Override</th>}
              </tr>
            </thead>
            <tbody>
              {modules.map((m, i) => {
                const id = String(m.moduleId);
                const { flags, source } = displayFor(id);
                const hidden = source !== "none" && !hasAnyFlag(flags);
                const faded = source === "role";
                return (
                  <tr key={id} style={{ borderTop: `1px solid ${COLORS.border}`, background: i % 2 ? "COLORS.tableHead" : "#fff" }}>
                    <td style={{ padding: "10px 16px", fontSize: 13, fontWeight: 600, color: COLORS.text }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        {m.moduleName}
                        {hidden && <EyeOff size={12} color={COLORS.textMuted} />}
                      </span>
                      <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 400 }}>{m.moduleGroup}</div>
                    </td>
                    {COLUMNS.map((a) => (
                      <td key={a.key} style={{ textAlign: "center", padding: "10px 8px" }}>
                        <input
                          data-access="edit"
                          type="checkbox" checked={!!flags[a.key]} onChange={() => toggle(id, a.key)}
                          title={faded ? "Inherited from the role — click to override for this user" : undefined}
                          style={{ width: 16, height: 16, cursor: "pointer", opacity: faded ? 0.5 : 1 }}
                        />
                      </td>
                    ))}
                    <td style={{ textAlign: "center", padding: "10px 8px" }}>
                      <input
                        data-access="edit"
                        type="checkbox" checked={hidden} onChange={() => toggleHide(id)}
                        title={hidden ? "Hidden (all rights off). Untick to give View back." : "Hide this screen (saves all rights as off)"}
                        style={{ width: 16, height: 16, cursor: "pointer", opacity: faded ? 0.5 : 1 }}
                      />
                    </td>
                    {tab === "user" && (
                      <td style={{ textAlign: "center", padding: "10px 8px" }}>
                        {source === "own" && (
                          <button onClick={() => clearOverride(id)} title="Clear override — fall back to role default" style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.textMuted }}>
                            <RotateCcw size={13} />
                          </button>
                        )}
                        {source === "role" && <span style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 600 }}>Role</span>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", background: COLORS.text, color: "#fff", padding: "10px 18px", borderRadius: 9, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 12px 30px rgba(0,0,0,0.2)" }}>
          <CheckCircle2 size={15} color={COLORS.success} /> {toast}
        </div>
      )}
    </div>
  );
}
