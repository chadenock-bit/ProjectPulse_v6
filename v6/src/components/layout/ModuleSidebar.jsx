import { useEffect, useState } from "react";
import { LayoutDashboard, Building2, FolderKanban, DollarSign, ScrollText, ChevronDown, LogOut, BarChart3 } from "lucide-react";
import { Logo } from "../common/Logo";
import { ADMIN_MODULES, AUDIT_MODULES, FINANCE_MODULES, PROJECT_MODULES, REPORT_MODULES } from "../../constants/modules";

const GROUPS = [
  { label: "Admin", icon: Building2, modules: ADMIN_MODULES },
  { label: "Project Management", icon: FolderKanban, modules: PROJECT_MODULES },
  { label: "Finance", icon: DollarSign, modules: FINANCE_MODULES },
  { label: "Audits", icon: ScrollText, modules: AUDIT_MODULES },
  { label: "Reports", icon: BarChart3, modules: REPORT_MODULES },
];

// One navigation rail for the whole app: Dashboard + every module group.
// canOpen is optional: without it every module is listed. Modules the signed-in
// user can't open are REMOVED from the list (no lock icons), and a group with
// nothing openable disappears. Selecting a module calls onSelect(key) exactly like
// the old sidebar / top tabs did; on small screens the rail is a slide-in drawer.
export function ModuleSidebar({ current, onSelect, onNavigateHome, canOpen, user, onLogout, open, onClose }) {
  const visibleGroups = GROUPS
    .map((g) => ({ ...g, modules: g.modules.filter((m) => typeof canOpen !== "function" || canOpen(m.key)) }))
    .filter((g) => g.modules.length > 0);

  const activeGroup = GROUPS.find((g) => g.modules.some((m) => m.key === current))?.label;
  const [openGroups, setOpenGroups] = useState(() => new Set([activeGroup || visibleGroups[0]?.label].filter(Boolean)));
  // Navigating into a module opens its group and folds the others (accordion).
  useEffect(() => {
    if (activeGroup) setOpenGroups(new Set([activeGroup]));
  }, [activeGroup]);

  // Permissions load after the first paint: once groups appear and none is open, open the first.
  const firstVisible = visibleGroups[0]?.label;
  useEffect(() => {
    if (!activeGroup && firstVisible) setOpenGroups((s) => (s.size === 0 ? new Set([firstVisible]) : s));
  }, [firstVisible, activeGroup]);

  const toggleGroup = (label) => setOpenGroups((s) => {
    const next = new Set(s);
    if (next.has(label)) next.delete(label); else next.add(label);
    return next;
  });

  return (
    <>
      <div className={`pp-scrim${open ? " is-open" : ""}`} onClick={onClose} />
      <aside className={`pp-sidebar${open ? " is-open" : ""}`}>
        <div className="pp-side-brand" onClick={onNavigateHome}><Logo /></div>

        <nav className="pp-side-scroll">
          <div className={`pp-side-item${current === "dashboard" ? " is-active" : ""}`} onClick={onNavigateHome}>
            <span className="pp-side-icon" style={{ background: "rgba(111,148,238,.16)", color: "#8FADF2" }}><LayoutDashboard size={14} /></span>
            Dashboard
          </div>

          {visibleGroups.map((g) => {
            const GroupIcon = g.icon;
            const isOpen = openGroups.has(g.label);
            return (
              <div className="pp-side-group" key={g.label}>
                <div className={`pp-side-grouphead${isOpen ? " is-open" : ""}`} onClick={() => toggleGroup(g.label)}>
                  <GroupIcon size={13} />
                  <span>{g.label}</span>
                  <ChevronDown size={14} className="pp-chev" />
                </div>
                {isOpen && g.modules.map((m) => {
                  const Icon = m.icon;
                  const active = current === m.key;
                  return (
                    <div key={m.key} onClick={() => onSelect(m.key)} className={`pp-side-item${active ? " is-active" : ""}${m.sub ? " is-sub" : ""}`}>
                      <span className="pp-side-icon" style={{ background: `${m.color}26`, color: m.color }}><Icon size={14} /></span>
                      {m.label}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="pp-side-foot">
          <div className="pp-usercard">
            <div className="pp-avatar">{user?.[0]?.toUpperCase() || "A"}</div>
            <div className="pp-usercard-text">
              <div className="pp-username">{user || "Administrator"}</div>
              <div className="pp-usersub">Signed in</div>
            </div>
            <button className="pp-signout" onClick={onLogout} title="Sign out" aria-label="Sign out"><LogOut size={15} /></button>
          </div>
        </div>
      </aside>
    </>
  );
}
