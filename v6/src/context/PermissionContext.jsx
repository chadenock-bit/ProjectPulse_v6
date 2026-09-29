// PermissionContext — resolves the signed-in user's effective access IN CODE
// (role defaults + user overrides, see utils/permissionLogic.js) and exposes
// hasAccess(moduleKey, action) / canOpen(moduleKey) to the whole app.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { loadEffectivePermissions } from "../utils/permissions";
import { LS_PERMISSIONS_CACHE } from "../constants/storage-keys";
import { lsSet } from "../utils/storage";

const SUPER_ADMIN_USERNAME = "projectpulse";
const REFRESH_MIN_GAP_MS = 60 * 1000;
const ACTION_FIELD = { view: "canView", create: "canCreate", edit: "canEdit", delete: "canDelete", approve: "canApprove" };

const PermissionContext = createContext({
  loading: true, loaded: false, error: "", permissions: {}, roleIds: [], userId: "", isAdmin: false,
  hasAccess: () => false, canOpen: () => false, refresh: () => Promise.resolve(),
});

export function PermissionProvider({ userId, username, children }) {
  const [permissions, setPermissions] = useState({}); // moduleKey -> flags (+ source)
  const [roleIds, setRoleIds] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const reqId = useRef(0);
  const lastLoad = useRef(0);

  const refresh = useCallback(() => {
    if (!userId) { setPermissions({}); setRoleIds([]); setLoaded(true); setLoading(false); return Promise.resolve(); }
    const id = ++reqId.current; // ignore out-of-order responses
    setLoading(true);
    return loadEffectivePermissions(userId)
      .then((res) => {
        if (id !== reqId.current) return;
        setPermissions(res.permissions);
        setRoleIds(res.roleIds);
        setError("");
        lastLoad.current = Date.now();
      })
      .catch((e) => { if (id === reqId.current) setError(e.message || "Couldn't load your permissions."); }) // keep last good permissions, else none (fail closed)
      .finally(() => { if (id === reqId.current) { setLoaded(true); setLoading(false); } });
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Pick up admin changes made while this user is signed in.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastLoad.current > REFRESH_MIN_GAP_MS) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const isAdmin = String(username || "").toLowerCase() === SUPER_ADMIN_USERNAME;

  // Mirror the resolved permissions + admin flag to localStorage so
  // non-React utility code (utils/audit.js) can read them synchronously —
  // used to gate whether this user may trigger Finance/Approval mails.
  useEffect(() => {
    if (!loaded) return;
    lsSet(LS_PERMISSIONS_CACHE, { permissions, isAdmin });
  }, [loaded, permissions, isAdmin]);

  // No View = no access at all (and the screen disappears from the nav).
  const hasAccess = (moduleKey, action = "view") => {
    if (isAdmin) return true;
    const row = permissions[moduleKey];
    if (!row || !row.canView) return false;
    return !!row[ACTION_FIELD[action] || "canView"];
  };
  const canOpen = (moduleKey) => hasAccess(moduleKey, "view");

  return (
    <PermissionContext.Provider value={{ loading, loaded, error, permissions, roleIds, userId, isAdmin, hasAccess, canOpen, refresh }}>
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionContext);
}
