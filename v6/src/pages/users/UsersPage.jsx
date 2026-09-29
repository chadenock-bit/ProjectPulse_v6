import { useState, useEffect, useCallback } from "react";
import bcrypt from "bcryptjs";
import {
  Search,
  Plus,
  Pencil,
  User,
  CheckCircle2,
  Loader2,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { callDepartmentFlow, callUserFlow, callLocationFlow, callDesignationFlow, callRoleFlow, callUserRolesFlow, callAuthFlow, checkReferences } from "../../api/flows";
import { StatusBadge } from "../../components/common/StatusBadge";
import { COLORS, cardStyle } from "../../constants/theme";
import { UserPanel } from "./UserPanel";
import { logAudit } from "../../utils/audit";
import { activeRoleIdsFor, syncUserRoles } from "../../utils/permissions";
import { usePermissions } from "../../context/PermissionContext";

const EMPTY_FORM = { guid: "", empId: "", firstName: "", lastName: "", jobTitle: "", departmentId: "", email: "", reportingManagerId: "", locationId: "", roleIds: [], active: true, username: "", password: "" };

// Same base64-of-bcrypt wire format SignUpPage used to send — the
// GET_CREDENTIAL/CREATE_CREDENTIAL flow actions are unchanged, only who
// calls them moved from the self-service sign-up form to this admin screen.
const asciiToBase64 = (str) => btoa(str);
const USERNAME_RE = /^[A-Za-z0-9._@-]{3,50}$/;

export function UsersPage() {
  const [rows, setRows] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [locations, setLocations] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [roles, setRoles] = useState([]);
  const [userRoles, setUserRoles] = useState([]);
  const { refresh: refreshMyPermissions } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [panel, setPanel] = useState(null); // null | { mode: 'add'|'edit', data }
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  const [listError, setListError] = useState("");

  const refresh = useCallback(() => {
    setLoading(true);
    setListError("");
    callUserFlow("LIST").then((res) => {
      setRows(res.data);
      setLoading(false);
    }).catch((e) => {
      setListError(e.message);
      setLoading(false);
    });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { callDepartmentFlow("LIST").then((res) => setDepartments(res.data)); }, []);
  useEffect(() => { callLocationFlow("LIST").then((res) => setLocations(res.data)).catch(() => {}); }, []);
  useEffect(() => { callDesignationFlow("LIST").then((res) => setDesignations(res.data)).catch(() => {}); }, []);
  useEffect(() => { callRoleFlow("LIST").then((res) => setRoles(res.data)).catch(() => {}); }, []);
  const loadUserRoles = useCallback(() => callUserRolesFlow("LIST").then((res) => { setUserRoles(res.data); return res.data; }).catch(() => []), []);
  useEffect(() => { loadUserRoles(); }, [loadUserRoles]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const roleNamesFor = (userGuid) => activeRoleIdsFor(userRoles, userGuid)
    .map((rid) => roles.find((r) => String(r.guid) === rid)?.name)
    .filter(Boolean)
    .join(", ");

  const deptName = (id) => departments.find((d) => String(d.id) === String(id))?.name || "—";

  const filtered = rows
    .filter((r) => {
      const q = search.toLowerCase();
      return (r.empId || "").toLowerCase().includes(q)
        || (r.firstName || "").toLowerCase().includes(q)
        || (r.lastName || "").toLowerCase().includes(q)
        || (r.jobTitle || "").toLowerCase().includes(q);
    })
    .sort((a, b) => Number(b.id) - Number(a.id)); // newest (highest UserID) first
  const activeCount = rows.filter((r) => r.active).length;

  const kpis = [
    { label: "Employees", value: String(rows.length), icon: User, color: "#3B6FE0" },
    { label: "Active Users", value: String(activeCount), icon: CheckCircle2, color: COLORS.success },
    { label: "Inactive Users", value: String(rows.length - activeCount), icon: AlertCircle, color: COLORS.danger },
  ];

  const submitPanel = async (form) => {
    if (!form.empId?.trim() || !form.firstName?.trim() || !form.lastName?.trim()) {
      setErr("Emp ID, First Name and Last Name are required.");
      return;
    }
    // Duplicate Employee ID or Email ID is not allowed (FSD 4.1 User Management).
    const empIdLower = form.empId.trim().toLowerCase();
    const dupEmpId = rows.find((r) => String(r.guid) !== String(form.guid) && (r.empId || "").trim().toLowerCase() === empIdLower);
    if (dupEmpId) {
      setErr("Emp ID already exists. Please enter a unique Emp ID.");
      return;
    }
    const emailLower = (form.email || "").trim().toLowerCase();
    if (emailLower) {
      const dupEmail = rows.find((r) => String(r.guid) !== String(form.guid) && (r.email || "").trim().toLowerCase() === emailLower);
      if (dupEmail) {
        setErr("Email ID already exists. Please enter a unique Email ID.");
        return;
      }
    }

    const isAdd = !form.guid;
    const username = (form.username || "").trim();
    const password = form.password || "";
    // Login is only created on Add — an existing employee's credential isn't
    // touched from here, same as before (Forgot Password is how it changes).
    if (isAdd) {
      if (!username || !password) {
        setErr("Username and Initial Password are required to create the login.");
        return;
      }
      if (!USERNAME_RE.test(username)) {
        setErr("Username must be 3-50 characters: letters, numbers, dot, dash, underscore or @.");
        return;
      }
      if (password.length < 8) {
        setErr("Initial Password must be at least 8 characters.");
        return;
      }
    }

    setSaving(true);
    setErr("");

    if (isAdd) {
      try {
        const existing = await callAuthFlow("GET_CREDENTIAL", { username });
        const exRow = Array.isArray(existing) ? existing[0] : existing;
        if (exRow && exRow.passwordHashB64) {
          setSaving(false);
          setErr("That username is already taken. Choose another.");
          return;
        }
      } catch {
        // GET_CREDENTIAL failing here just means we couldn't pre-check —
        // CREATE_CREDENTIAL below still fails safely if it really is a duplicate.
      }
    }

    const action = isAdd ? "CREATE" : "EDIT";
    let userSaved = false;
    let createdGuid = "";
    callUserFlow(action, form)
      .then((res) => {
        setRows(res.data);
        userSaved = true;
        // A new employee's id only exists after the insert — find it by Emp ID.
        const userRow = isAdd
          ? (res.data || []).find((r) => (r.empId || "").trim().toLowerCase() === form.empId.trim().toLowerCase())
          : (res.data || []).find((r) => String(r.guid) === String(form.guid));
        const userId = form.guid || userRow?.guid;
        if (!userId) throw new Error("User saved, but the new record couldn't be found to assign roles. Open it and set the role again.");
        createdGuid = isAdd ? userId : "";
        const rolesDone = syncUserRoles(userId, form.roleIds || []);
        if (!isAdd) return rolesDone;
        // Create the login right after the employee row, same as sign-up used to.
        return rolesDone.then(() => callAuthFlow("CREATE_CREDENTIAL", {
          userId: userRow.id ?? userId,
          username,
          passwordHashB64: asciiToBase64(bcrypt.hashSync(password, 10)),
        }));
      })
      .then(() => loadUserRoles())
      .then(() => {
        setSaving(false);
        setPanel(null);
        logAudit("User", isAdd ? "Create" : "Update", `${form.firstName || ""} ${form.lastName || ""}`.trim() || form.empId || "record");
        setToast(isAdd ? "User added. Share the username and initial password with them." : "User updated.");
        refreshMyPermissions(); // in case the admin just changed their own role
      })
      .catch((e) => {
        // Don't leave an orphan employee row behind if the login couldn't be created.
        if (isAdd && createdGuid) {
          callUserFlow("DELETE", { guid: createdGuid }).catch(() => {});
          setSaving(false);
          setErr(`Login couldn't be created (${e.message}) — the new employee record was rolled back. Try again.`);
          return;
        }
        setSaving(false);
        setErr(userSaved ? `User saved, but roles could not be updated: ${e.message}` : e.message);
        if (userSaved) loadUserRoles();
      });
  };

  const toggleActive = (u0) => {
    setRows((prev) => prev.map((u) => (u.guid === u0.guid ? { ...u, _toggling: true } : u)));
    callUserFlow("EDIT", { ...u0, active: !u0.active })
      .then((res) => {
        setRows(res.data);
        logAudit("User", "Update", u0.firstName || u0.empId || "record");
        setToast(`Marked ${!u0.active ? "Active" : "Inactive"}.`);
      })
      .catch((e) => {
        setRows((prev) => prev.map((u) => (u.guid === u0.guid ? { ...u, _toggling: false } : u)));
        setToast(`Update failed: ${e.message}`);
      });
  };

  const openEdit = async (u) => {
    const guard = await checkReferences("User", u.guid);
    setPanel({ mode: "edit", data: { ...u, roleIds: activeRoleIdsFor(userRoles, u.guid) }, restricted: guard.blocked });
  };

  // Employees are never hard-deletable from the Admin screen — an
  // employee record can only be deactivated (see toggleActive above).
  // This matches FSD 4.1 User Management: "Users associated with any
  // one of the projects cannot be deleted" — tightened here to a blanket
  // rule so Employee data (timesheets, audit trail, historical resource
  // assignments, etc.) is never lost to an accidental delete.

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
      <div style={{ flex: 1, padding: 26, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div style={{ fontFamily: "Sora, sans-serif", fontSize: 20, fontWeight: 700, color: COLORS.text }}>Employee Details</div>
            <div style={{ color: COLORS.textMuted, fontSize: 13.5 }}>Add, edit and manage Users</div>
          </div>
          <button
            onClick={() => setPanel({ mode: "add", data: EMPTY_FORM })}
            style={{
              display: "flex", alignItems: "center", gap: 7, background: COLORS.accent, color: "#fff", border: "none",
              borderRadius: 9, padding: "10px 16px", fontSize: 13.5, fontWeight: 700, cursor: "pointer",
            }}
          >
            <Plus size={15} /> Add User
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
            <div style={{ fontWeight: 700, fontSize: 14, color: COLORS.text }}>Users <span style={{ color: COLORS.textMuted, fontWeight: 500 }}>({filtered.length})</span></div>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "7px 11px", width: 260 }}>
                <Search size={14} color={COLORS.textMuted} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by emp id, name or designation"
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
                {["Emp ID", "Name", "Designation", "Role", "Department", "Status", "Actions"].map((h) => (
                  <th key={h} style={{ textAlign: h === "Actions" ? "center" : "left", padding: "10px 16px", fontSize: 12, color: COLORS.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: COLORS.textMuted }}>
                  <Loader2 size={18} className="spin" style={{ verticalAlign: "middle", marginRight: 8 }} /> Loading users…
                </td></tr>
              ) : listError ? (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                    <div style={{ color: COLORS.textMuted, fontSize: 13.5 }}>No data available.</div>
                    <button onClick={refresh} style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${COLORS.border}`, background: "#fff", borderRadius: 8, padding: "6px 14px", fontSize: 12.5, cursor: "pointer", color: COLORS.text }}>
                      <RefreshCw size={13} /> Retry
                    </button>
                  </div>
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: COLORS.textMuted }}>No data available.</td></tr>
              ) : filtered.map((u, i) => (
                <tr key={u.id} style={{ borderTop: `1px solid ${COLORS.border}`, background: i % 2 ? "COLORS.tableHead" : "#fff" }}>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text, fontWeight: 600 }}>{u.empId}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text }}>{u.firstName} {u.lastName}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text }}>{u.jobTitle || "—"}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text }}>{roleNamesFor(u.guid) || "—"}</td>
                  <td style={{ padding: "11px 16px", fontSize: 13.5, color: COLORS.text }}>{deptName(u.departmentId)}</td>
                  <td style={{ padding: "11px 16px" }}><StatusBadge active={u.active} busy={u._toggling} onToggle={() => toggleActive(u)} /></td>
                  <td style={{ padding: "11px 16px", textAlign: "center" }}>
                    <div style={{ display: "inline-flex", gap: 8 }}>
                      <button onClick={() => openEdit(u)} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: COLORS.accentSoft, color: COLORS.accent, border: "none", borderRadius: 7, padding: "6px 11px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                        <Pencil size={12} /> Edit
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
        <UserPanel
          mode={panel.mode}
          data={panel.data}
          departments={departments}
          locations={locations}
          designations={designations}
          roles={roles}
          allUsers={rows}
          restricted={panel.restricted}
          saving={saving}
          error={err}
          onCancel={() => {
            if (panel?.mode === "add") {
              setPanel({ mode: "add", data: EMPTY_FORM });
            } else {
              setPanel(null);
            }
            setErr("");
          }}
          onClose={() => setPanel(null)}
          onSubmit={submitPanel}
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