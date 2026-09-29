// SignInPage.jsx — replaces the hardcoded DEMO_USERNAME/DEMO_PASSWORD
// check in LoginScreen.jsx with a real dbo.UserCredential lookup.
// LoginScreen.jsx itself is left untouched (per "don't change existing
// functionality") — AppShell.jsx now renders THIS component instead of
// LoginScreen, which is the only place the swap happens.
import { useState } from "react";
import bcrypt from "bcryptjs";
import { Loader2, AlertCircle } from "lucide-react";
import { Logo } from "../../components/common/Logo";
import { COLORS, inputStyle } from "../../constants/theme";
import { callAuthFlow, callUserFlow } from "../../api/flows";

// The hash column is varbinary, so the flow/connector hands it back base64-encoded —
// and depending on how the flow builds the response (and how the row was written)
// it can be wrapped once, twice or not at all. Unwrap until it's the real bcrypt
// text ("$2a$10$..."), so sign-in works whichever way the flow returns it.
function decodeHash(value) {
  let s = String(value || "").trim();
  for (let i = 0; i < 4; i++) {
    if (/^\$2[abxy]\$\d{2}\$/.test(s)) return s;
    try { s = atob(s); } catch { return ""; }
  }
  return /^\$2[abxy]\$\d{2}\$/.test(s) ? s : "";
}

// "Create an account" is gone — accounts are created by an admin from
// Admin -> Employee Details (username + an initial password set there),
// and a user who forgets that password uses "Forgot password" below.
export function SignInPage({ onLogin, onGoToForgotPassword }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = () => {
    if (!username.trim() || !password.trim()) {
      setError("Enter both username and password to continue.");
      return;
    }
    if (username.includes("'")) { setError("Invalid username or password."); return; }
    setError("");
    setBusy(true);

    callAuthFlow("GET_CREDENTIAL", { username: username.trim() })
      .then((rows) => {
        const row = Array.isArray(rows) ? rows[0] : rows;
        if (!row || !row.passwordHashB64) {
          throw new Error("Invalid username or password.");
        }
        if (row.lockedUntil && new Date(row.lockedUntil) > new Date()) {
          throw new Error("This account is temporarily locked after too many failed attempts. Try again later or reset your password.");
        }
        const hash = decodeHash(row.passwordHashB64);
        const ok = hash && bcrypt.compareSync(password, hash);
        if (!ok) throw new Error("Invalid username or password.");

        // Password is right — now make sure the employee record is still active.
        return callUserFlow("LIST").then((res) => {
          const emp = (res.data || []).find((u) => String(u.id) === String(row.userId));
          if (emp && !emp.active) throw new Error("This account is inactive. Contact an admin.");
          onLogin({
            userId: row.userId,
            username: row.username,
            empId: emp?.empId || row.empId || "",
            mustChangePassword: !!row.mustChangePassword,
          });
        });
      })
      .catch((e) => setError(e.message || "Sign in failed."))
      .finally(() => setBusy(false));
  };

  const handleKeyDown = (e) => { if (e.key === "Enter") submit(); };

  return (
    <div className="pp-auth" style={{
      minHeight: "100vh", width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
      background: `radial-gradient(1100px 600px at 15% 10%, #1E2748 0%, ${COLORS.navy} 55%, #0E1326 100%)`,
      fontFamily: "Inter, sans-serif", padding: 20,
    }}>
      <div className="pp-auth-wrap pp-auth-card" style={{ display: "flex", width: "100%", maxWidth: 880, borderRadius: 20, overflow: "hidden", boxShadow: "0 30px 80px rgba(0,0,0,0.45)" }}>
        <div className="pp-auth-brand" style={{
          flex: "0 0 340px", background: "linear-gradient(160deg,#1E2748,#12172C)",
          padding: "40px 32px", display: "flex", flexDirection: "column", justifyContent: "space-between",
        }}>
          <Logo />
          <div>
            <div style={{ fontFamily: "Sora, sans-serif", color: "#fff", fontSize: 22, fontWeight: 700, lineHeight: 1.3, marginBottom: 10 }}>
              One console for every master record.
            </div>
            <div style={{ color: "#9AA5CC", fontSize: 13.5, lineHeight: 1.6 }}>
              Departments, clients, roles and statuses — kept in sync with Dataverse through your Power Automate flows.
            </div>
          </div>
          <div style={{ color: "#5C6690", fontSize: 12 }}>© {new Date().getFullYear()} Project Pulse</div>
        </div>

        <div className="pp-auth-form" style={{ flex: 1, background: COLORS.card, padding: "48px 44px" }}>
          <div style={{ fontFamily: "Sora, sans-serif", fontSize: 24, fontWeight: 700, color: COLORS.text, marginBottom: 6 }}>Sign in</div>
          <div style={{ color: COLORS.textMuted, fontSize: 14, marginBottom: 28 }}>Use your account credentials to open the console.</div>

          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 6 }}>Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={handleKeyDown} placeholder="e.g. ProjectPulse" style={inputStyle} autoFocus />

            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: COLORS.text, margin: "16px 0 6px" }}>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={handleKeyDown} placeholder="••••••••" style={inputStyle} />

            {error && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", color: COLORS.danger, fontSize: 13, marginTop: 14 }}>
                <AlertCircle size={15} /> {error}
              </div>
            )}

            <button
              type="button" onClick={submit} disabled={busy}
              style={{
                marginTop: 24, width: "100%", padding: "12px 0", borderRadius: 10, border: "none",
                background: COLORS.accent, color: "#fff", fontWeight: 700, fontSize: 14.5,
                cursor: busy ? "default" : "pointer", opacity: busy ? 0.75 : 1,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              {busy && <Loader2 size={16} className="spin" />}
              {busy ? "Signing in…" : "Sign in"}
            </button>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16, fontSize: 12.5 }}>
              <button type="button" onClick={onGoToForgotPassword} style={{ background: "none", border: "none", color: COLORS.accent, cursor: "pointer", fontWeight: 600, padding: 0 }}>
                Forgot password?
              </button>
            </div>
          </div>
        </div>
      </div>
      <style>{`.spin { animation: spin 0.8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}