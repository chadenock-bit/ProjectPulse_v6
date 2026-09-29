export function findDuplicateCode(rows, code, currentGuid) {
  const c = (code || "").trim().toLowerCase();
  if (!c) return null;
  return rows.find((r) => (r.guid || "") !== (currentGuid || "") && (r.code || "").trim().toLowerCase() === c) || null;
}

// Same shape as findDuplicateCode, but compares the Name field instead of
// Code. Master screens must reject duplicate Names as well as duplicate
// Codes (see FSD 4.1.x "Duplicate <X> Names are not allowed").
export function findDuplicateName(rows, name, currentGuid) {
  const n = (name || "").trim().toLowerCase();
  if (!n) return null;
  return rows.find((r) => (r.guid || "") !== (currentGuid || "") && (r.name || "").trim().toLowerCase() === n) || null;
}

/* ============================================================
  ACTIVE-ONLY DROPDOWN OPTIONS — "Only Active <X> shall be
  available throughout the application" (FSD 4.1.x) applies to
  every dropdown sourced from a master-data list: Department,
  Location, Designation, Currency, Country, Project Category,
  Billing Type, Project Status, Invoice Status, Client/Customer,
  Roles, and Users/Employees.

  Inactive rows are filtered out, EXCEPT the row currently
  selected on the form — otherwise editing a record whose linked
  master value has since been deactivated would silently blank
  out that selection. Matches against id, guid, code, or name
  (whichever the caller's <option value> uses) so this one helper
  works for every dropdown in the app regardless of which field
  it keys its <option> values on.
  ============================================================ */
export function activeOptions(list, selectedValue) {
  if (!Array.isArray(list)) return [];
  if (selectedValue === undefined || selectedValue === null || selectedValue === "") {
    return list.filter((item) => item.active !== false);
  }
  const sel = String(selectedValue);
  return list.filter((item) =>
    item.active !== false ||
    String(item.id ?? "") === sel ||
    String(item.guid ?? "") === sel ||
    String(item.code ?? "") === sel ||
    String(item.name ?? "") === sel
  );
}
