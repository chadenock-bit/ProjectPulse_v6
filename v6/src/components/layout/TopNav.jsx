import { Menu, ChevronRight } from "lucide-react";
import { ADMIN_MODULES, AUDIT_MODULES, FINANCE_MODULES, PROJECT_MODULES, MAIL_MODULES, MODULES } from "../../constants/modules";

const GROUP_LABELS = [
  [ADMIN_MODULES, "Admin"],
  [PROJECT_MODULES, "Project Management"],
  [FINANCE_MODULES, "Finance"],
  [AUDIT_MODULES, "Audits"],
  [MAIL_MODULES, "Notifications"],
];

// Slim navy top bar: menu button (small screens) + breadcrumb for the open
// screen. Navigation lives in the left rail. The notification bell (which
// read NotificationLog rows) has been removed — NotificationLog is being
// cleared out in the DB directly (it was FK-blocking Project deletes), so
// a UI element reading from it no longer has anything meaningful to show.
// The Notification Log admin screen itself is untouched — still reachable
// from the left nav under Finance/Audits if you want to look at it directly.
export function TopNav({ current, onToggleNav }) {
  const isDash = current === "dashboard";
  const mod = MODULES.find((m) => m.key === current);
  const group = GROUP_LABELS.find(([mods]) => mods.some((m) => m.key === current))?.[1];

  return (
    <header className={`pp-topbar${isDash ? " is-dash" : ""}`}>
      <button className="pp-menu-btn" onClick={onToggleNav} aria-label="Open menu"><Menu size={18} /></button>
      {!isDash && (
        <div className="pp-crumbs">
          {mod ? (
            <>
              <span className="pp-crumb-group">{group}</span>
              <ChevronRight size={14} className="pp-crumb-sep" />
              <span className="pp-crumb-cur">{mod.label}</span>
            </>
          ) : (
            <span className="pp-crumb-cur">Dashboard</span>
          )}
        </div>
      )}
    </header>
  );
}