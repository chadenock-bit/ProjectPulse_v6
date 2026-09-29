// permissionLogic.js — PURE permission rules (no network, no React), so they
// can be unit-tested and reused by the context and the admin screen.
//
// Storage model (no SQL/flow change needed):
//   * A permission row = { canView, canCreate, canEdit, canDelete, canApprove }.
//   * "Hide" is NOT stored. A row (or override) where ALL flags are 0 means
//     "no access", and a screen without View is removed from the nav.
//   * View is the prerequisite: any other flag implies View.
//   * Role rows are the defaults; several roles are OR-ed together.
//   * A user override row REPLACES the role result for that module only
//     (even when it denies everything). Modules without an override inherit.
//   * No row anywhere = no access.

export const FLAGS = ["canView", "canCreate", "canEdit", "canDelete", "canApprove"];

// Power Automate's "@{...}" interpolation returns "True"/"False" strings.
export const toBool = (v) => v === true || v === 1 || v === "1" || String(v ?? "").toLowerCase() === "true";

export const ZERO = Object.freeze({ canView: false, canCreate: false, canEdit: false, canDelete: false, canApprove: false });

export const hasAnyFlag = (row) => FLAGS.some((k) => toBool(row?.[k]));

export function normalizeFlags(raw) {
  const f = {};
  FLAGS.forEach((k) => { f[k] = toBool(raw?.[k]); });
  if (FLAGS.some((k) => f[k])) f.canView = true; // any right implies View
  return f;
}

// [{ moduleId, canView, ... }] -> { "<moduleId>": flags }
export function rowsToMap(rows) {
  const map = {};
  (Array.isArray(rows) ? rows : []).forEach((r) => {
    if (r && r.moduleId !== undefined && r.moduleId !== null && r.moduleId !== "") map[String(r.moduleId)] = normalizeFlags(r);
  });
  return map;
}

// Several roles -> OR every flag per module.
export function mergeRoleGrids(maps) {
  const out = {};
  (maps || []).forEach((m) => {
    Object.entries(m || {}).forEach(([id, f]) => {
      const cur = out[id] || { ...ZERO };
      FLAGS.forEach((k) => { cur[k] = cur[k] || !!f[k]; });
      out[id] = cur;
    });
  });
  return out;
}

// -> { "<moduleKey>": { ...flags, source: "user" | "role" | "none" } }
export function resolveEffective(modules, inheritedMap, overrideMap) {
  const out = {};
  (modules || []).forEach((m) => {
    const id = String(m.moduleId);
    const ov = overrideMap?.[id];
    const inh = inheritedMap?.[id];
    out[m.moduleKey] = { ...(ov || inh || ZERO), source: ov ? "user" : inh ? "role" : "none" };
  });
  return out;
}
