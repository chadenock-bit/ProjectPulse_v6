// recipientResolver.js — turns a notification's "who" bucket (as declared in
// constants/Notifications.js's EVENT_MAP) into REAL email addresses pulled
// from the DB (Users/Roles/UserRoles), using the loaded userDirectory.
//
// This is the piece that replaces the old hardcoded RECIPIENTS = { finance:
// "one-mailbox@...", pm: "one-mailbox@...", management: "one-mailbox@..." }.
//
// ctx is whatever the calling screen already has in hand at the moment it
// calls logAudit(...) — see audit.js and the updated call sites (Project,
// Billing, Project Approval, Resource Allocation, Timesheet Approval, Link
// Invoice). Nothing here makes a network call beyond loadDirectory() itself,
// which is cached (see userDirectory.js).
import { loadDirectory, getUserEmail, getManagerEmail, getFinanceEmails, getManagementEmails } from "./userDirectory";

// Resolves ONE bucket name to an array of emails for the given ctx.
// Unknown/empty lookups resolve to [] rather than throwing — a mail with no
// resolvable recipient is simply not sent (and logged as such by mail.js).
function resolveBucket(dir, bucket, ctx) {
  switch (bucket) {
    case "finance":
      return getFinanceEmails(dir);
    case "management":
      return getManagementEmails(dir);
    case "pm": {
      const id = ctx.projectManagerUserId ?? ctx.project?.projectManagerUserId;
      const email = getUserEmail(dir, id);
      return email ? [email] : [];
    }
    case "deliveryHead": {
      const id = ctx.deliveryHeadUserId ?? ctx.project?.deliveryHeadUserId;
      const email = getUserEmail(dir, id);
      return email ? [email] : [];
    }
    // The employee/resource the event is actually about (allocation,
    // timesheet). ctx.userId is the generic name every relevant call site
    // already uses locally (form.userId / row.employeeUserId, etc.).
    case "resource": {
      const id = ctx.userId ?? ctx.employeeUserId;
      const email = getUserEmail(dir, id);
      return email ? [email] : [];
    }
    // Reporting manager of the resource/employee the event is about.
    case "manager": {
      const id = ctx.userId ?? ctx.employeeUserId;
      const email = getManagerEmail(dir, id);
      return email ? [email] : [];
    }
    case "submittedBy": {
      const email = getUserEmail(dir, ctx.submittedByUserId);
      return email ? [email] : [];
    }
    case "approvedBy": {
      const email = getUserEmail(dir, ctx.approvedByUserId);
      return email ? [email] : [];
    }
    case "requestedBy": {
      const email = getUserEmail(dir, ctx.requestedByUserId);
      return email ? [email] : [];
    }
    default:
      return [];
  }
}

function resolveBuckets(dir, buckets, ctx) {
  const list = Array.isArray(buckets) ? buckets : [buckets];
  const emails = list.flatMap((b) => resolveBucket(dir, b, ctx));
  return Array.from(new Set(emails.filter(Boolean)));
}

// Main entry point used by utils/audit.js. `ev` is the EVENT_MAP entry
// ({ event, to, cc, fsd }) resolved by resolveEvent(); ctx is the record
// context passed through from the screen's logAudit(...) call.
// Returns a Promise<{ to: string, cc: string }> — semicolon-joined, ready
// to hand straight to callAuditEmailFlow/sendFsdMail.
export function resolveRecipients(ev, ctx = {}) {
  return loadDirectory().then((dir) => {
    const toEmails = resolveBuckets(dir, ev.to, ctx);
    const ccEmails = ev.cc ? resolveBuckets(dir, ev.cc, ctx) : [];
    return {
      to: toEmails.join(";"),
      cc: ccEmails.filter((e) => !toEmails.includes(e)).join(";"),
    };
  });
}