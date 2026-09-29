// permissions.js — loads role / override / role-assignment data through the
// EXISTING flows only (no SQL or flow change) and resolves effective access
// in code with the rules in permissionLogic.js.
import { callPermissionFlow, callRoleFlow, callUserRolesFlow, invalidateFlowCache } from "../api/flows";
import { mergeRoleGrids, resolveEffective, rowsToMap } from "./permissionLogic";

export * from "./permissionLogic";

export const fetchModules = () => callPermissionFlow("LIST_MODULES").then((a) => (Array.isArray(a) ? a : []));
export const fetchRoleGrid = (roleId) => callPermissionFlow("LIST_ROLE_PERMISSIONS", { roleId }).then(rowsToMap);
export const fetchUserOverrides = (userId) => callPermissionFlow("LIST_USER_PERMISSIONS", { userId }).then(rowsToMap);

// Active role ids for a user — the assignment AND the role itself must be active.
export async function fetchUserRoleIds(userId) {
  invalidateFlowCache("UserRoles"); // never trust a stale cached list for access decisions
  invalidateFlowCache("Role");
  const [ur, roles] = await Promise.all([callUserRolesFlow("LIST"), callRoleFlow("LIST")]);
  const activeRoles = new Set((roles.data || []).filter((r) => r.active).map((r) => String(r.guid)));
  const ids = (ur.data || [])
    .filter((x) => String(x.userId) === String(userId) && x.active && activeRoles.has(String(x.roleId)))
    .map((x) => String(x.roleId));
  return [...new Set(ids)];
}

export async function loadEffectivePermissions(userId) {
  const [modules, roleIds, overrides] = await Promise.all([fetchModules(), fetchUserRoleIds(userId), fetchUserOverrides(userId)]);
  const grids = await Promise.all(roleIds.map(fetchRoleGrid));
  return { permissions: resolveEffective(modules, mergeRoleGrids(grids), overrides), roleIds };
}

// Active role ids for a user from an already-loaded UserRoles list (used by Employee Details).
export const activeRoleIdsFor = (userRoles, userId) =>
  [...new Set((userRoles || []).filter((x) => String(x.userId) === String(userId) && x.active).map((x) => String(x.roleId)))];

// Make the UserRoles table match `roleIds` for one user: add missing, re-activate
// inactive, delete unselected and duplicate rows. Sequential on purpose (flow concurrency).
export async function syncUserRoles(userId, roleIds) {
  invalidateFlowCache("UserRoles");
  const res = await callUserRolesFlow("LIST");
  const mine = (res.data || []).filter((x) => String(x.userId) === String(userId));
  const wanted = new Set((roleIds || []).map(String));
  const seen = new Set();
  for (const row of mine) {
    const rid = String(row.roleId);
    if (wanted.has(rid) && !seen.has(rid)) {
      seen.add(rid);
      if (!row.active) await callUserRolesFlow("EDIT", { guid: row.guid, userId, roleId: rid, active: true });
    } else {
      await callUserRolesFlow("DELETE", { guid: row.guid });
    }
  }
  for (const rid of wanted) {
    if (!seen.has(rid)) await callUserRolesFlow("CREATE", { userId, roleId: rid, active: true });
  }
}
