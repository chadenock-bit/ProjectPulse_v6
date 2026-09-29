// userDirectory.js — in-memory, fetch-once directory used to resolve REAL
// recipient emails from the DB (Users / Roles / UserRoles) instead of the
// hardcoded placeholder mailboxes that used to live in constants/Notifications.js.
//
// Fetched once per page session (module-level cache) and reused by every
// notification the recipientResolver sends — per the "fetch once, cache in
// memory" decision. Call invalidateDirectory() after a User/Role/UserRoles
// admin edit if you want the very next notification to see it immediately;
// otherwise it naturally refreshes on the next full page load.
import { callUserFlow, callRoleFlow, callUserRolesFlow } from "../api/flows";

let _cachePromise = null;

function buildDirectory() {
  return Promise.all([callUserFlow("LIST"), callRoleFlow("LIST"), callUserRolesFlow("LIST")]).then(
    ([usersRes, rolesRes, userRolesRes]) => {
      const users = usersRes.data || [];
      const roles = rolesRes.data || [];
      const userRoles = (userRolesRes.data || []).filter((ur) => ur.active !== false);

      const usersById = new Map(users.map((u) => [String(u.guid ?? u.id), u]));

      return { users, roles, userRoles, usersById };
    }
  );
}

// Fetch once, cache the in-flight/resolved promise. Any concurrent callers
// during the first load share the same request instead of double-fetching.
export function loadDirectory() {
  if (!_cachePromise) {
    _cachePromise = buildDirectory().catch((e) => {
      _cachePromise = null; // allow retry on next call if the first fetch failed
      throw e;
    });
  }
  return _cachePromise;
}

// Force a refetch on the next loadDirectory() call — use after bulk User/Role
// admin changes if a session needs to see them without a full page reload.
export function invalidateDirectory() {
  _cachePromise = null;
}

export function getUserEmail(dir, userId) {
  if (!userId) return "";
  const u = dir.usersById.get(String(userId));
  return u?.email ? String(u.email).trim() : "";
}

export function getUserName(dir, userId) {
  if (!userId) return "";
  const u = dir.usersById.get(String(userId));
  if (!u) return "";
  return `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.empId || "";
}

// Reporting manager's email for a given user (Users.ReportingManagerId), used
// for CC/escalation per the FSD's "configured distribution list" language.
export function getManagerEmail(dir, userId) {
  if (!userId) return "";
  const u = dir.usersById.get(String(userId));
  if (!u || !u.reportingManagerId) return "";
  return getUserEmail(dir, u.reportingManagerId);
}

// All active, emailed users holding a role whose name matches the given
// pattern (case-insensitive substring by default — e.g. "finance" matches
// "Finance", "Finance Manager", etc.). This is the DB-driven replacement for
// the old hardcoded RECIPIENTS.finance mailbox.
export function getRoleEmails(dir, roleNamePattern) {
  const re = roleNamePattern instanceof RegExp ? roleNamePattern : new RegExp(roleNamePattern, "i");
  const matchingRoleIds = new Set(dir.roles.filter((r) => re.test(r.name || r.code || "")).map((r) => String(r.guid ?? r.id)));
  if (matchingRoleIds.size === 0) return [];

  const userIds = new Set(dir.userRoles.filter((ur) => matchingRoleIds.has(String(ur.roleId))).map((ur) => String(ur.userId)));

  const emails = [];
  userIds.forEach((uid) => {
    const email = getUserEmail(dir, uid);
    if (email) emails.push(email);
  });
  return Array.from(new Set(emails)); // de-dupe
}

export function getFinanceEmails(dir) {
  return getRoleEmails(dir, "finance");
}

export function getManagementEmails(dir) {
  return getRoleEmails(dir, "management|director|leadership");
}