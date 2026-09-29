import {
  Building2,
  Layers,
  Globe2,
  User,
  Handshake,
  CalendarClock,
  Briefcase,
  Shield,
  Receipt,
  Flag,
  Users2,
  FolderKanban,
  MapPin,
  Tags,
  Coins,
  ClipboardCheck,
  FileCheck,
  ScrollText,
  Landmark,
  KeyRound,
  Mail,
  BarChart3,
  CalendarDays,
} from "lucide-react";

export const ADMIN_MODULES = [
  { key: "user", label: "Employee Details", icon: User, color: "#3B6FE0", implemented: true },
  { key: "department", label: "Department", icon: Building2, color: "#3B6FE0", implemented: true },
  { key: "country", label: "Country", icon: Globe2, color: "#0EA5A4", implemented: true },
  { key: "roles", label: "Roles", icon: Shield, color: "#8B5CF6", implemented: true },
  { key: "client", label: "Client", icon: Briefcase, color: "#EAB308", implemented: true },
  { key: "project-category", label: "Project Category", icon: Layers, color: "#8B5CF6", implemented: true },
  { key: "project-status", label: "Project Status", icon: Flag, color: "#E11D48", implemented: true },
  { key: "project-deal-status", label: "Project Deal Status", icon: Handshake, color: "#22A06B", implemented: true },
  { key: "billing-type", label: "Billing Type", icon: CalendarClock, color: "#8B5CF6", implemented: true },
  { key: "location", label: "Location", icon: MapPin, color: "#0EA5A4", implemented: true },
  // Company/location holiday calendar — Billing's Working Days/capacity
  // calculation reads from this, not the other way round (see HolidayPage.jsx).
  { key: "holiday", label: "Holiday Calendar", icon: CalendarDays, color: "#D6483E", implemented: true },
  { key: "designation", label: "Designation", icon: Tags, color: "#F59E0B", implemented: true },
  { key: "currency", label: "Currency", icon: Coins, color: "#22A06B", implemented: true },
  { key: "invoice-status", label: "Invoice Status", icon: Receipt, color: "#3B6FE0", implemented: true },
  { key: "permissions", label: "Permissions", icon: KeyRound, color: "#E11D48", implemented: true },
  // Parked per meeting notes #9, #15 — screens removed from nav, tables/flows left untouched.
  // Re-add UserCog / CheckCircle2 to the lucide import if these are restored:
  // { key: "user-roles", label: "Designation", icon: UserCog, color: "#0EA5A4", implemented: true },
  // { key: "approval-status", label: "Approval Status", icon: CheckCircle2, color: "#F59E0B", implemented: true },
];

export const PROJECT_MODULES = [
  { key: "project-dashboard", label: "Project Dashboard", icon: FolderKanban, color: "#22A06B", implemented: true },
  { key: "resource-allocation", label: "Resource Allocation", icon: Users2, color: "#F59E0B", implemented: true },
  { key: "pipeline-project", label: "Pipeline Project", icon: Handshake, color: "#8B5CF6", implemented: true },
  { key: "project-resources-txn", label: "Project Resources", icon: Users2, color: "#22A06B", implemented: true },
  // Project Document was removed as a standalone screen — documents are
  // uploaded/managed directly on the project record (Create/Edit Project
  // panel), so a separate nav entry was redundant.
];

export const FINANCE_MODULES = [
  { key: "project-approval", label: "Project Approval", icon: FileCheck, color: "#3B6FE0", implemented: true },
  // Billing Periods is now a tab inside Billing (see BillingPage.jsx) rather
  // than its own nav entry — same screen, same flow calls, just reached via
  // the "Billing Periods" tab instead of a separate sidebar item. The
  // "billing-period" page route in AppShell.jsx is left in place (harmless,
  // unreferenced) in case anything still deep-links to it.
  { key: "billing", label: "Timesheet Approval", icon: Landmark, color: "#8B5CF6", implemented: true },
  { key: "link-invoice", label: "Link Invoice", icon: Receipt, color: "#EAB308", implemented: true },
  // Timesheet Approval screen removed — timesheet hours now come from Billing
  // and are summarized in Report Analysis → Timesheet Summary.
];


export const AUDIT_MODULES = [
  { key: "audit-log", label: "Audit Log", icon: ScrollText, color: "#6B7280", implemented: true },
];

// Controls who can trigger the system's outbound notification emails
// (Finance submission/approval mails, billing reminders, approval
// requests, etc. — see utils/audit.js). "Create" access on this module
// = allowed to send Finance and Approval mails.
// Key MUST match dbo.module.ModuleKey exactly ("mail-notification").
export const MAIL_MODULES = [
  { key: "mail-notification", label: "Mail Notification", icon: Mail, color: "#0EA5A4", implemented: true },
];

export const REPORT_MODULES = [
  { key: "report-analysis", label: "Report Analysis", icon: BarChart3, color: "#3B6FE0", implemented: true },
];

export const MODULES = [...ADMIN_MODULES, ...PROJECT_MODULES, ...FINANCE_MODULES, ...AUDIT_MODULES, ...MAIL_MODULES, ...REPORT_MODULES];