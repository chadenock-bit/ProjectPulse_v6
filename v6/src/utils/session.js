// session.js — extends the existing LS_CURRENT_USER shape (previously
// just { username, loginTime }) with the fields real DB-backed auth
// needs: userId (so ProjectPanel/DocumentRow/etc. can stop hardcoding
// "E001" as the uploader) and empId (display fallback). Existing code
// that only reads `session.username`/`session.loginTime` keeps working
// unchanged — this only adds fields, never removes any.
import { LS_CURRENT_USER } from "../constants/storage-keys";
import { lsGet, lsSet } from "./storage";

export function getSession() {
  return lsGet(LS_CURRENT_USER, null);
}

export function setSession({ userId, username, empId }) {
  const session = { userId, username, empId, loginTime: Date.now() };
  lsSet(LS_CURRENT_USER, session);
  return session;
}

export function clearSession() {
  localStorage.removeItem(LS_CURRENT_USER);
}

// Convenience accessor used by pages that need "who is uploading/creating
// this record right now" (ProjectPanel's document uploader default, audit
// log entries, etc.) without importing the full session shape everywhere.
export function getCurrentUserId() {
  const s = getSession();
  return s && typeof s === "object" ? s.userId ?? "" : "";
}
