// notifications.js — event map + audience metadata (DSS-QMS-PM-FSD-001, 4.5).
//
// CHANGED: recipients are no longer hardcoded mailboxes. Each EVENT_MAP entry
// now names WHICH bucket(s) of real people get the mail ("pm", "deliveryHead",
// "finance", "management", "resource", "manager", "submittedBy", "approvedBy",
// "requestedBy") — recipientResolver.js turns those into actual DB emails
// (Users.Email, via Project.ProjectManagerUserId/DeliveryHeadUserId,
// ProjectResource/Timesheet.UserID, Users.ReportingManagerId, and the
// Finance/Management ROLE via UserRoles/Roles), per FSD 4.5's "Notification
// recipients shall be determined based on Project Manager, Practice Head,
// Delivery Head, resource, Finance user, or configured distribution list."
//
// Both mails (Audit team, business-event) still go through the SAME
// /auditflow flow (see utils/mail.js) — only to/cc/subject/body differ.

// Existing audit-team recipients — unchanged, out of scope for this change.
export const AUDIT_RECIPIENTS = {
  to: "santhoshkumar.saravanan@devoir.co.in",
  cc: "",
};

// Business-event mail (Project Updated, Billing Submitted, etc.) is an FSD
// process obligation per 4.5 ("The system shall use Power Automate to send
// event-based notifications to relevant stakeholders"), not a personal
// privilege — it always fires, unconditionally, regardless of the acting
// user's own module permissions. There used to be a REQUIRE_MAIL_PERMISSION
// toggle gating this in utils/audit.js; it's been removed entirely (not
// just defaulted off) so mail delivery can never be silently blocked by a
// PM/user missing "Mail Notification" access.

// Display label + accent color per PRIMARY audience bucket — used only for
// the HTML template/subject styling, never as an address anymore.
export const AUDIENCE_META = {
  finance: { label: "Finance Team", theme: "#0F766E" },
  pm: { label: "Project Manager", theme: "#B45309" },
  deliveryHead: { label: "Delivery Head", theme: "#B45309" },
  management: { label: "Management Team", theme: "#6D28D9" },
  resource: { label: "Resource", theme: "#2563EB" },
  manager: { label: "Reporting Manager", theme: "#2563EB" },
  submittedBy: { label: "Submitter", theme: "#0F766E" },
  approvedBy: { label: "Approver", theme: "#0F766E" },
  requestedBy: { label: "Requester", theme: "#B45309" },
};

export function audienceMetaFor(toBucket) {
  const primary = Array.isArray(toBucket) ? toBucket[0] : toBucket;
  return AUDIENCE_META[primary] || AUDIENCE_META.finance;
}

// "<Screen>|<Action>" -> { event, to, cc?, fsd }. `to`/`cc` are bucket names
// (or arrays of them) resolved by recipientResolver.js against the ctx the
// calling screen passes into logAudit(). fsd = FSD reference; "CR" = not in
// FSD (change request: notify on every project create/update/delete).
const RES = (event) => ({ event, to: "resource", cc: "pm", fsd: "4.4 (Pg 17)" });
const CR = (event, to = "finance", cc) => ({ event, to, ...(cc ? { cc } : {}), fsd: "CR" });
// Project Create/Update/Delete all keep the PM (and Delivery Head) in the
// loop — Finance stays the primary "to" for Update/Delete per the standing
// CR ("mail Finance whenever project details are created/edited/deleted");
// PM/Delivery Head are cc'd so they see every change to their own project too.
const PM_CC = ["pm", "deliveryHead"];

const EVENT_MAP = {
  "Project|Create": { event: "Project Created", to: "pm", cc: "deliveryHead", fsd: "4.3 (Pg 15)" },
  "Project|Update": CR("Project Updated", "finance", PM_CC),
  "Project|Delete": CR("Project Deleted", "finance", PM_CC),

  "Project Approval|Approve": { event: "Project Approved", to: "pm", cc: "deliveryHead", fsd: "4.3/4.5 (Pg 15,19)" },
  "Project Approval|Reject": { event: "Project Rejected", to: "pm", cc: "deliveryHead", fsd: "4.3/4.5 (Pg 15,19)" },

  "Resource Allocation|Create": RES("Resource Allocated"),
  "Resource Allocation|Update": RES("Allocation Modified"),
  "Resource Allocation|Delete": RES("Resource Removed"),
  "Project Resources|Create": RES("Resource Allocated"),
  "Project Resources|Update": RES("Allocation Modified"),
  "Project Resources|Delete": RES("Resource Removed"),

  // Finance To / PM CC on submit, per explicit request — the "pm" bucket
  // resolves off ctx.projectManagerUserId, which BillingPage's submitPanel
  // already passes through logAudit.
  "Billing|Create": { event: "Billing Submitted", to: "finance", cc: "pm", fsd: "4.6 (Pg 24)" },
  "Billing|Update": CR("Billing Updated"),
  "Billing|Delete": CR("Billing Deleted"),

  "Link Invoice|Create": { event: "Invoice Number Added", to: "management", cc: "finance", fsd: "4.7 (Pg 25)" },
  "Link Invoice|Update": { event: "Invoice Details Updated", to: "management", cc: "finance", fsd: "4.7 (Pg 25)" },
  "Link Invoice|Delete": CR("Invoice Deleted", "management"),

  "Pipeline Project|Create": CR("Pipeline Project Created"),
  "Pipeline Project|Update": CR("Pipeline Project Updated"),
  "Pipeline Project|Delete": CR("Pipeline Project Deleted"),
  "Pipeline Project|Convert to Project": CR("Pipeline Converted to Project"),
};

// Status-driven overrides — Project/Billing saves pass meta.fromStatus/toStatus.
export function resolveEvent(screen, action, meta = {}) {
  const base = EVENT_MAP[`${screen}|${action}`] || null;
  const from = (meta.fromStatus || "").trim().toLowerCase();
  const to = (meta.toStatus || "").trim().toLowerCase();
  const changed = !!to && to !== from;

  if (screen === "Project" && action === "Update") {
    if (changed && to === "pending finance approval") return { event: "Project Submitted for Finance Approval", to: "finance", cc: PM_CC, fsd: "4.3 (Pg 13,15)" };
    if (changed && to === "archived") return { event: "Project Archived", to: "management", cc: PM_CC, fsd: "4.3 (Pg 15)" };
    if (from === "active") return { event: "Active Project Modified - Finance Review Required", to: "finance", cc: PM_CC, fsd: "2.0/4.5 (Pg 4,19)" };
  }
  if (screen === "Billing" && action === "Update" && changed) {
    if (to.includes("approv")) return { event: "Billing Approved", to: "pm", fsd: "4.6 (Pg 24)" };
    if (to.includes("reject")) return { event: "Billing Rejected", to: "pm", fsd: "4.6 (Pg 24)" };
  }
  return base;
}