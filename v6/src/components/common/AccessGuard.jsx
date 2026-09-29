// AccessGuard — enforces Create / Edit / Delete / Approve rights for the screen
// that is currently open. Mounted ONCE in AppShell; no per-page changes needed.
//
// How it works
//   * A capture-phase click listener looks at what was clicked:
//       - anything tagged data-access="create|edit|delete|approve"
//         (StatusBadge toggle, approve/reject buttons, Permissions controls), or
//       - a button whose icon is Pencil (edit), Trash (delete) or Plus (create).
//   * If the signed-in user lacks that right on this screen, the click is
//     cancelled and "You don't have access to <action>." is shown.
//   * Buttons the user can't use are also dimmed (CSS only, via :has()).
//   * Anything inside [data-access-skip] (e.g. the "Add Resource" rows inside the
//     project form) is ignored — those are part of an Edit/Create already allowed.
// Note: this is UI enforcement, like the rest of the app's permissions.
import { useEffect, useRef, useState } from "react";
import { ShieldOff } from "lucide-react";
import { usePermissions } from "../../context/PermissionContext";
import { COLORS } from "../../constants/theme";

const ICON_ACTIONS = [
  ["svg.lucide-trash-2, svg.lucide-trash", "delete"],
  ["svg.lucide-pencil", "edit"],
  ["svg.lucide-plus", "create"],
];
const VERB = { create: "create", edit: "edit", delete: "delete", approve: "approve or reject" };
const ACTIONS = Object.keys(VERB);
const NOT_SKIPPED = ":not([data-access-skip] *)";
const DIM_SELECTORS = {
  create: [`button:has(svg.lucide-plus)${NOT_SKIPPED}`, `[data-access="create"]${NOT_SKIPPED}`],
  edit: [`button:has(svg.lucide-pencil)${NOT_SKIPPED}`, `[data-access="edit"]${NOT_SKIPPED}`],
  delete: [`button:has(svg.lucide-trash-2)${NOT_SKIPPED}`, `[data-access="delete"]${NOT_SKIPPED}`],
  approve: [`[data-access="approve"]${NOT_SKIPPED}`],
};

function actionFor(target) {
  if (!(target instanceof Element)) return null;
  if (target.closest("[data-access-skip]")) return null;
  const tagged = target.closest("[data-access]");
  if (tagged) return tagged.getAttribute("data-access");
  const btn = target.closest("button");
  if (!btn || btn.disabled) return null;
  for (const [selector, action] of ICON_ACTIONS) {
    if (btn.querySelector(selector)) return action;
  }
  return null;
}

export function AccessGuard({ moduleKey }) {
  const { hasAccess } = usePermissions();
  const [msg, setMsg] = useState("");
  const latest = useRef({ hasAccess, moduleKey });
  useEffect(() => { latest.current = { hasAccess, moduleKey }; });

  useEffect(() => {
    const onClick = (e) => {
      const { hasAccess: can, moduleKey: key } = latest.current;
      if (!key || key === "dashboard") return;
      const action = actionFor(e.target);
      if (!action || !VERB[action] || can(key, action)) return;
      e.preventDefault();
      e.stopPropagation();
      setMsg(`You don't have access to ${VERB[action]}.`);
    };
    document.addEventListener("click", onClick, true); // capture: runs before any React handler
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (!msg) return undefined;
    const t = setTimeout(() => setMsg(""), 2600);
    return () => clearTimeout(t);
  }, [msg]);

  const denied = !moduleKey || moduleKey === "dashboard" ? [] : ACTIONS.filter((a) => !hasAccess(moduleKey, a));
  const css = denied.length
    ? `${denied.flatMap((a) => DIM_SELECTORS[a]).join(",\n")} { opacity: 0.45 !important; cursor: not-allowed !important; }`
    : "";

  return (
    <>
      {css && <style>{css}</style>}
      {msg && (
        <div role="alert" style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 2000,
          background: COLORS.text, color: "#fff", padding: "10px 18px", borderRadius: 9, fontSize: 13, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 8, boxShadow: "0 12px 30px rgba(0,0,0,0.25)",
        }}>
          <ShieldOff size={15} color={COLORS.danger} /> {msg}
        </div>
      )}
    </>
  );
}
