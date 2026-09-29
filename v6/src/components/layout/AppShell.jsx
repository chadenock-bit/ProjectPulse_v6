import { useState, useEffect } from "react";
import { ShieldOff } from "lucide-react";
import { ModuleStub } from "../common/ModuleStub";
import { ModuleSidebar } from "./ModuleSidebar";
import { AccessGuard } from "../common/AccessGuard";
import { TopNav } from "./TopNav";
import { MODULES } from "../../constants/modules";
import { invalidateFlowCache, warmFlowCache, callUserFlow } from "../../api/flows";
import { COLORS } from "../../constants/theme";
import { SignInPage } from "../../pages/auth/SignInPage";
import { ForgotPasswordPage } from "../../pages/auth/ForgotPasswordPage";
import { PermissionProvider, usePermissions } from "../../context/PermissionContext";
import { ApprovalStatusPage } from "../../pages/approval-status/ApprovalStatusPage";
import { AuditLogPage } from "../../pages/audit-log/AuditLogPage";
import { BillingPage } from "../../pages/billing/BillingPage";
import { BillingPeriodPage } from "../../pages/billing-period/billingPeriodPage";
import { BillingTypePage } from "../../pages/billing-type/BillingTypePage";
import { ClientPage } from "../../pages/client/ClientPage";
import { CountryPage } from "../../pages/country/CountryPage";
import { DashboardHome } from "../../pages/dashboard/DashboardHome";
import { DealStatusPage } from "../../pages/deal-status/DealStatusPage";
import { DepartmentsPage } from "../../pages/department/DepartmentsPage";
import { LocationPage } from "../../pages/location/LocationPage";
import { HolidayPage } from "../../pages/holiday/HolidayPage";
import { DesignationPage } from "../../pages/designation/DesignationPage";
import { CurrencyPage } from "../../pages/currency/CurrencyPage";
import { InvoiceStatusPage } from "../../pages/invoice-status/InvoiceStatusPage";
import { LinkInvoicePage } from "../../pages/link-invoice/LinkInvoicePage";
import { PipelineProjectPage } from "../../pages/pipeline-project/PipelineProjectPage";
import { ProjectDashboardPage } from "../../pages/project-allocation/ProjectDashboardPage";
import { ResourceAllocationPage } from "../../pages/project-allocation/ResourceAllocationPage";
import { ProjectApprovalPage } from "../../pages/project-approval/ProjectApprovalPage";
import { ProjectCategoryPage } from "../../pages/project-category/ProjectCategoryPage";
import { ProjectResourcesTxnPage } from "../../pages/project-resources-txn/ProjectResourcesTxnPage";
import { ProjectStatusPage } from "../../pages/project-status/ProjectStatusPage";
import { RolesPage } from "../../pages/roles/RolesPage";
import { UserRolesPage } from "../../pages/user-roles/UserRolesPage";
import { NotificationLogPage } from "../../pages/notification-log/NotificationLogPage";
import { UsersPage } from "../../pages/users/UsersPage";
import { PermissionsAdminPage } from "../../pages/permissions/PermissionsAdminPage";
import { ReportAnalysisPage } from "../../pages/report-analysis/ReportAnalysisPage";
import { getSession, setSession, clearSession } from "../../utils/session";

const SESSION_DURATION = 60 * 60 * 1000; // 1 hour

function NoAccess() {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: COLORS.textMuted, padding: 24, textAlign: "center" }}>
      <span style={{ width: 64, height: 64, borderRadius: 20, background: COLORS.dangerSoft, color: COLORS.danger, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
        <ShieldOff size={30} />
      </span>
      <div style={{ fontWeight: 700, color: COLORS.text, fontSize: 16 }}>You don't have access to this screen</div>
      <div style={{ fontSize: 13 }}>Ask an admin to grant it under Admin → Permissions.</div>
    </div>
  );
}

// Everything that used to render directly inside ProjectPulseApp once a
// user was signed in now lives here, wrapped by PermissionProvider so it
// can call usePermissions(). Behavior for an already-implemented screen
// is UNCHANGED once access is granted — this only adds a gate in front.
function AuthenticatedShell({ session, onLogout }) {
  const [page, setPage] = useState("dashboard");
  const [navOpen, setNavOpen] = useState(false); // small screens: the left rail is a slide-in drawer
  const { canOpen, isAdmin, loaded: permsLoaded, permissions, error: permError, refresh: refreshPerms } = usePermissions();

  useEffect(() => { warmFlowCache(); }, []);

  // The sidebar used to show the raw login string (e.g. the shared demo
  // login "ProjectPulse"), while the Dashboard greeting resolves the real
  // signed-in employee's name from dbo.Users by session.userId — so the two
  // disagreed on who's "signed in". Resolve the same real name here once and
  // use it everywhere a person's name is shown, falling back to the login
  // username only if that lookup comes back empty.
  const [displayName, setDisplayName] = useState(session.username);
  useEffect(() => {
    if (!session.userId) return;
    callUserFlow("LIST")
      .then((list) => {
        const me = (list || []).find((u) => String(u.id ?? u.guid) === String(session.userId));
        const name = me ? `${me.firstName || ""} ${me.lastName || ""}`.trim() : "";
        if (name) setDisplayName(name);
      })
      .catch(() => {}); // keep the login username on failure — never blank the sidebar
  }, [session.userId]);

  useEffect(() => {
    const remaining = SESSION_DURATION - (Date.now() - session.loginTime);
    if (remaining <= 0) { onLogout(); return; }
    const timer = setTimeout(onLogout, remaining);
    return () => clearTimeout(timer);
  }, [session, onLogout]);

  const inModuleShell = MODULES.some((m) => m.key === page);
  const pageAllowed = page === "dashboard" || canOpen(page);

  // If the current screen stops being openable (Hide / no View, or an admin just
  // changed this user's access) go back to the dashboard instead of an error page.
  useEffect(() => {
    if (permsLoaded && page !== "dashboard" && !canOpen(page)) setPage("dashboard");
  }, [permsLoaded, permissions, isAdmin, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const implementedKeys = [
    "department", "country", "user", "project-category", "roles", "billing-type",
    "location", "designation", "currency", "permissions",
    "project-deal-status", "client", "approval-status", "project-status",
    "invoice-status", "user-roles", "project-dashboard", "resource-allocation",
    "project-approval", "audit-log", "billing", "billing-period",
    "link-invoice", "pipeline-project", "project-resources-txn", "mail-notification",
    "report-analysis", "holiday",
  ];

  return (
    <div className="pp-app pp-layout" style={{ height: "100vh", width: "100%", display: "flex", flexDirection: "row", background: COLORS.bg, fontFamily: "Inter, sans-serif" }}>
      <AccessGuard moduleKey={page} />

      <ModuleSidebar
        current={page}
        onSelect={(key) => { setPage(key); setNavOpen(false); }}
        onNavigateHome={() => { setPage("dashboard"); setNavOpen(false); }}
        canOpen={canOpen}
        user={displayName}
        onLogout={onLogout}
        open={navOpen}
        onClose={() => setNavOpen(false)}
      />

      <div className="pp-main">
      <TopNav current={page} onToggleNav={() => setNavOpen((o) => !o)} userId={session.userId} onOpenModule={setPage} />

      {permError && !isAdmin && (
        <div className="pp-alert" style={{ padding: "8px 22px", fontSize: 13, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          Couldn't load your permissions — some screens may be unavailable.
          <button onClick={refreshPerms} style={{ border: `1px solid ${COLORS.danger}`, background: "#fff", color: COLORS.danger, borderRadius: 7, padding: "3px 10px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Retry</button>
        </div>
      )}

      <div className="pp-body" style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {page === "dashboard" && <DashboardHome onOpenModule={setPage} user={displayName} />}

        {!pageAllowed ? (
          <NoAccess />
        ) : (
          <>
            {page === "department" && <DepartmentsPage />}
            {page === "location" && <LocationPage />}
            {page === "holiday" && <HolidayPage />}
            {page === "designation" && <DesignationPage />}
            {page === "currency" && <CurrencyPage />}
            {page === "country" && <CountryPage />}
            {page === "user" && <UsersPage />}
            {page === "project-category" && <ProjectCategoryPage />}
            {page === "roles" && <RolesPage />}
            {page === "billing-type" && <BillingTypePage />}
            {page === "project-deal-status" && <DealStatusPage />}
            {page === "client" && <ClientPage />}
            {page === "approval-status" && <ApprovalStatusPage />}
            {page === "project-status" && <ProjectStatusPage />}
            {page === "invoice-status" && <InvoiceStatusPage />}
            {page === "user-roles" && <UserRolesPage />}
            {page === "permissions" && <PermissionsAdminPage />}
            {page === "project-dashboard" && <ProjectDashboardPage />}
            {page === "resource-allocation" && <ResourceAllocationPage />}
            {page === "project-approval" && <ProjectApprovalPage />}
            {page === "billing" && <BillingPage />}
            {page === "billing-period" && <BillingPeriodPage />}
            {page === "audit-log" && <AuditLogPage />}
            {page === "link-invoice" && <LinkInvoicePage />}
            {page === "pipeline-project" && <PipelineProjectPage />}
            {page === "project-resources-txn" && <ProjectResourcesTxnPage />}
            {page === "mail-notification" && <NotificationLogPage />}
            {page === "report-analysis" && <ReportAnalysisPage />}
            {inModuleShell && !implementedKeys.includes(page) && <ModuleStub moduleKey={page} />}
          </>
        )}
      </div>
      </div>

      <style>{`
        .spin { animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}

export function ProjectPulseApp() {
  const [session, setSessionState] = useState(() => {
    const s = getSession();
    if (!s || typeof s !== "object" || !s.loginTime) return null;
    return Date.now() - s.loginTime < SESSION_DURATION ? s : null;
  });
  const [authView, setAuthView] = useState("signin"); // "signin" | "forgot"

  const handleLogin = ({ userId, username, empId }) => {
    const s = setSession({ userId, username, empId });
    setSessionState(s);
  };

  const handleLogout = () => {
    clearSession();
    invalidateFlowCache();
    setSessionState(null);
    setAuthView("signin");
  };

  if (!session) {
    // Sign-up is gone — accounts are created by an admin under Admin ->
    // Employee Details, with an initial password set there. authView can
    // still be "forgot" (Forgot Password keeps working the same way).
    if (authView === "forgot") return <ForgotPasswordPage onGoToSignIn={() => setAuthView("signin")} />;
    return (
      <SignInPage
        onLogin={handleLogin}
        onGoToForgotPassword={() => setAuthView("forgot")}
      />
    );
  }

  return (
    <PermissionProvider userId={session.userId} username={session.username}>
      <AuthenticatedShell session={session} onLogout={handleLogout} />
    </PermissionProvider>
  );
}