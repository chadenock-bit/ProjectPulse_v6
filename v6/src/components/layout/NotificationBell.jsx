// NotificationBell.jsx — top-right bell showing recent NotificationLog rows
// where the logged-in user's own email appears in RecipientEmail or CcEmail
// (both are semicolon-joined lists — see utils/recipientResolver.js). The
// user's email isn't in session (session only carries userId/username), so
// it's resolved once via Users.guid === session.userId, same lookup pattern
// utils/recipientResolver.js itself uses. "Unread" is a client-side concept
// only (last-seen timestamp in localStorage, keyed per user) — there's no
// server-side read state for this log.
import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, CheckCircle2, XCircle, SkipForward, Mail } from "lucide-react";
import { callUserFlow, callNotificationLogFlow } from "../../api/flows";
import { COLORS } from "../../constants/theme";
import { lsGet, lsSet } from "../../utils/storage";

const POLL_MS = 60000;
const MAX_SHOWN = 15;
const seenKey = (userId) => `pp_notif_last_seen_${userId || "anon"}`;

const STATUS_ICON = { Sent: CheckCircle2, Failed: XCircle, Skipped: SkipForward };
const STATUS_COLOR = { Sent: COLORS.success, Failed: COLORS.danger, Skipped: COLORS.warning };

function timeAgo(iso) {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function NotificationBell({ userId, onOpenLog }) {
  const [open, setOpen] = useState(false);
  const [myEmail, setMyEmail] = useState("");
  const [items, setItems] = useState([]);
  const [lastSeen, setLastSeen] = useState(() => lsGet(seenKey(userId), 0));
  const boxRef = useRef(null);

  // Resolve the logged-in user's own email once.
  useEffect(() => {
    if (!userId) return;
    callUserFlow("LIST")
      .then((res) => {
        const u = (res.data || []).find((x) => String(x.guid) === String(userId));
        setMyEmail((u?.email || "").toLowerCase());
      })
      .catch(() => {});
  }, [userId]);

  const load = useCallback(() => {
    if (!myEmail) return;
    callNotificationLogFlow("LIST")
      .then((res) => {
        const mine = (res.data || [])
          .filter((r) => {
            const to = (r.recipientEmail || "").toLowerCase().split(";").map((s) => s.trim());
            const cc = (r.ccEmail || "").toLowerCase().split(";").map((s) => s.trim());
            return to.includes(myEmail) || cc.includes(myEmail);
          })
          .sort((a, b) => new Date(b.sentDate) - new Date(a.sentDate))
          .slice(0, MAX_SHOWN);
        setItems(mine);
      })
      .catch(() => {});
  }, [myEmail]);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  // Close on outside click.
  useEffect(() => {
    const onClick = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const unreadCount = items.filter((r) => new Date(r.sentDate).getTime() > lastSeen).length;

  const toggle = () => {
    setOpen((o) => {
      const next = !o;
      if (next) {
        const now = Date.now();
        setLastSeen(now);
        lsSet(seenKey(userId), now);
      }
      return next;
    });
  };

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <button
        onClick={toggle}
        aria-label="Notifications"
        style={{ position: "relative", width: 36, height: 36, borderRadius: 10, border: `1px solid ${COLORS.border}`, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: COLORS.text }}
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span style={{ position: "absolute", top: -4, right: -4, minWidth: 16, height: 16, padding: "0 3px", borderRadius: 999, background: COLORS.danger, color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{ position: "absolute", top: 44, right: 0, width: 340, maxHeight: 420, overflowY: "auto", background: "#fff", borderRadius: 14, border: `1px solid ${COLORS.border}`, boxShadow: "0 18px 40px rgba(15,23,48,0.14)", zIndex: 60 }}>
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${COLORS.border}`, fontWeight: 700, fontSize: 13.5, color: COLORS.text }}>Notifications</div>
          {items.length === 0 ? (
            <div style={{ padding: 28, textAlign: "center", color: COLORS.textMuted, fontSize: 13 }}>
              <Mail size={20} style={{ marginBottom: 6, opacity: 0.5 }} /><br />Nothing yet.
            </div>
          ) : (
            items.map((r) => {
              const Icon = STATUS_ICON[r.deliveryStatus] || Mail;
              const color = STATUS_COLOR[r.deliveryStatus] || COLORS.textMuted;
              return (
                <div key={r.guid} style={{ display: "flex", gap: 10, padding: "10px 14px", borderBottom: `1px solid ${COLORS.border}` }}>
                  <div style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 8, background: `${color}1A`, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>
                    <Icon size={13} color={color} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>{r.emailType}</div>
                    <div style={{ fontSize: 12, color: COLORS.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.subjectLine}</div>
                    <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>{timeAgo(r.sentDate)}</div>
                  </div>
                </div>
              );
            })
          )}
          {onOpenLog && (
            <button
              onClick={() => { setOpen(false); onOpenLog(); }}
              style={{ width: "100%", padding: "10px 14px", border: "none", background: "transparent", color: COLORS.accent, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
            >
              View all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
