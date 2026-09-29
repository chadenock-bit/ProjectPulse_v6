// mail.js — builds the two HTML mails (Audit team / business-event) and
// sends them through the SAME /auditflow flow via callAuditEmailFlow.
//
// CHANGED: every send now (a) uses REAL resolved recipients (built by
// recipientResolver.js, no more hardcoded mailboxes) and (b) writes a
// NotificationLog row for every attempt — success or failure — per FSD 4.5
// ("Notification logs shall capture email type, recipient email, CC email,
// subject line, related project, sent date, delivery status, and error
// message if delivery fails") and the "log every send" decision.
//
// FLOW EDIT REQUIRED (one-time, on the existing /auditflow flow — unchanged
// from before, still just relays {to, cc, subject, body}):
//   1. Trigger schema -> { "to": "string", "cc": "string", "subject": "string", "body": "string" }
//   2. Send an email (V2) -> To/Cc/Subject/Body = triggerBody()?['to' | 'cc' | 'subject' | 'body']
//
// SEPARATE, NEW flow-side change needed for logging (see flows.js's
// callNotificationLogFlow comment) — flow2 needs a "NotificationLog" Switch
// branch that inserts into dbo.NotificationLog, the same way it already has
// one for "AuditLog".
import { callAuditEmailFlow, callNotificationLogFlow } from "../api/flows";

const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function row(label, value) {
  return `<tr>
      <td style="padding: 12px 14px; background-color: #f5f7fa; border-bottom: 1px solid #d9dee7; font-weight: bold; color: #374151;">${esc(label)}</td>
      <td style="padding: 12px 14px; border-bottom: 1px solid #d9dee7; color: #111827; word-break: break-word;">${esc(value)}</td>
    </tr>`;
}

// Shared shell — only the header color/title/footer line change per audience.
function shell({ accent, title, rows, footer }) {
  return `<div style="font-family: Arial, Helvetica, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; color: #333; background-color: #ffffff;">
  <h2 style="margin: 0 0 4px 0; font-size: 20px; color: ${accent};">${esc(title)}</h2>
  <div style="height:3px;width:56px;background:${accent};border-radius:2px;margin-bottom:18px;"></div>
  <table cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; border: 1px solid #d9dee7; font-size: 14px;">
    <tbody>${rows}</tbody>
  </table>
  <p style="margin: 20px 0 0 0; font-size: 13px; color: #6b7280;">${esc(footer)}</p>
  <p style="margin: 8px 0 0 0; font-size: 13px; color: #6b7280;">Regards,<br><strong>Project Pulse Bot</strong></p>
</div>`;
}

// 1) AUDIT TEAM mail — same content/layout as the original flow template
// (Operation/Entity/Record Details/Performed By/Date & Time), neutral grey.
function auditTemplate({ screen, action, record, user, when }) {
  const rows = [row("Operation", action), row("Entity", screen), row("Record Details", record), row("Performed By", user), row("Date & Time", when)].join("");
  return shell({ accent: "#374151", title: "Audit Log Details", rows, footer: "This is an automated audit notification." });
}

// 2) BUSINESS-EVENT mail — FSD business-event name, distinct accent color
// per audience (see AUDIENCE_META[bucket].theme in constants/Notifications.js).
function fsdTemplate({ event, recipientLabel, accent, screen, action, record, user, when, meta }) {
  const rows = [
    row("Event", event),
    row("Screen", screen),
    row("Action", action),
    row("Record", record),
    meta.fromStatus || meta.toStatus ? row("Status", `${meta.fromStatus || "—"} → ${meta.toStatus || "—"}`) : "",
    row("Performed By", user),
    row("Date & Time", when),
  ].join("");
  return shell({ accent, title: event, rows, footer: `This is an automated notification for the ${recipientLabel}.` });
}

// App-wide date standard: yyyy-MM-dd (date part), with HH:mm alongside since
// this is a "Date & Time" audit field, not a plain date.
function fmtWhen(timestamp) {
  const dt = new Date(timestamp || Date.now());
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  const hm = `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  return `${ymd} ${hm}`;
}

// Sends one mail through /auditflow AND writes the NotificationLog row for
// it (success or failure) — the single choke point both sendAuditMail and
// sendFsdMail go through, so neither has to duplicate the logging.
//
// `fallbackTo` (optional): used ONLY when recipient resolution came back
// completely empty (e.g. a project with no PM/Delivery Head assigned yet,
// or nobody currently holds the Finance role) — i.e. only when nothing
// would otherwise be sent at all. A caller that already has a real "to"
// never touches this path. Currently passed by logAudit() for Project
// Create/Update/Delete only, per the explicit "use this only when there is
// no mail sent for these" requirement — not a general override.
function sendAndLog({ emailType, to, cc, subject, body, sentBy, fallbackTo }) {
  const effectiveTo = to || fallbackTo || "";
  const usedFallback = !to && !!fallbackTo;

  if (!effectiveTo) {
    // Nothing resolvable to send to and no fallback configured for this
    // event — still logged, so gaps in master data show up in the
    // Notification log instead of silently vanishing.
    return callNotificationLogFlow("CREATE", {
      emailType,
      recipientEmail: "",
      ccEmail: cc || "",
      subjectLine: subject,
      deliveryStatus: "Skipped",
      errorMessage: "No recipient could be resolved for this event.",
      sentBy,
    }).catch((e) => console.warn("NotificationLog write failed:", e.message));
  }

  return callAuditEmailFlow({ to: effectiveTo, cc, subject, body })
    .then((result) => {
      const failed = result && result.success === false;
      return callNotificationLogFlow("CREATE", {
        emailType,
        recipientEmail: effectiveTo,
        ccEmail: cc || "",
        subjectLine: subject,
        deliveryStatus: failed ? "Failed" : "Sent",
        errorMessage: failed ? result.error : (usedFallback ? "Sent to default mailbox — no PM/Delivery Head/Finance recipient could be resolved." : ""),
        sentBy,
      });
    })
    .catch((e) => console.warn("NotificationLog write failed:", e.message));
}

// Kept as the ORIGINAL audit mail — same recipients, same content, unchanged
// — now also logged to NotificationLog like every other send.
export function sendAuditMail({ screen, action, record, user, timestamp }, recipients) {
  const when = fmtWhen(timestamp);
  const subject = `[${action}] ${screen} — Audit Alert`;
  const body = auditTemplate({ screen, action, record, user, when });
  sendAndLog({ emailType: "Audit", to: recipients.to, cc: recipients.cc, subject, body, sentBy: user });
}

// Business-event mail — `to`/`cc` are already-resolved, semicolon-joined
// real email strings (see recipientResolver.js), not bucket names.
// `relatedProjectId` is accepted here for backward compatibility with older
// call sites but is deliberately NOT forwarded to sendAndLog/NotificationLog
// any more — that SQL column (and its FK to Project, which was blocking
// Project deletes) has been removed.
export function sendFsdMail({ event, recipientLabel, accent, to, cc, screen, action, record, user, timestamp, meta, fallbackTo }) {
  const when = fmtWhen(timestamp);
  const subject = `[Project Pulse] ${event} — ${record || screen}`;
  const body = fsdTemplate({ event, recipientLabel, accent, screen, action, record, user, when, meta });
  sendAndLog({ emailType: event, to, cc, subject, body, sentBy: user, fallbackTo });
}