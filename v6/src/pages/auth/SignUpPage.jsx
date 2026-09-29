// SignUpPage.jsx — self-service sign-up. Creates BOTH the employee record
// (dbo.Users, Emp ID auto-generated) and the login (dbo.UserCredential).
// A new account has no role, so it only sees the Dashboard until an admin
// assigns a role in Admin -> Employee Details (and tunes it in Permissions).
import { useState } from "react";
import bcrypt from "bcryptjs";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Logo } from "../../components/common/Logo";
import { COLORS, inputStyle } from "../../constants/theme";
import { callUserFlow, callAuthFlow } from "../../api/flows";

const asciiToBase64 = (str) => btoa(str);
const USERNAME_RE = /^[A-Za-z0-9._@-]{3,50}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Next Emp ID in the pattern already used by the Users table (e.g. E014 -> E015).
function nextEmpId(users) {
  const stats = {};
  (users || []).forEach((u) => {
    const m = /^([A-Za-z]*)(\d+)$/.exec((u.empId || "").trim());
    if (!m) return;
    const s = stats[m[1]] || (stats[m[1]] = { n: 0, max: 0, width: 0 });
    s.n += 1; s.max = Math.max(s.max, Number(m[2])); s.width = Math.max(s.width, m[2].length);
  });
  const best = Object.entries(stats).sort((a, b) => b[1].n - a[1].n)[0];
  const [prefix, s] = best || ["E", { max: 0, width: 3 }];
  return prefix + String(s.max + 1).padStart(s.width, "0");
}

const label = { display: "block", fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 6 };

export function SignUpPage({ onGoToSignIn }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    const fn = firstName.trim(); const ln = lastName.trim(); const mail = email.trim(); const uname = username.trim();
    if (!fn || !ln || !mail || !uname || !password || !confirmPassword) return setError("Fill in every field to continue.");
    if (!EMAIL_RE.test(mail)) return setError("Enter a valid email address.");
    if (!USERNAME_RE.test(uname)) return setError("Username must be 3-50 characters: letters, numbers, dot, dash, underscore or @.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirmPassword) return setError("Passwords don't match.");

    setError("");
    setBusy(true);
    let createdGuid = "";
    try {
      // 1. username must be free
      const existing = await callAuthFlow("GET_CREDENTIAL", { username: uname });
      const exRow = Array.isArray(existing) ? existing[0] : existing;
      if (exRow && exRow.passwordHashB64) throw new Error("That username is already taken. Choose another.");

      // 2. email must not already belong to an employee
      const usersRes = await callUserFlow("LIST");
      if ((usersRes.data || []).some((u) => (u.email || "").trim().toLowerCase() === mail.toLowerCase())) {
        throw new Error("An account with this email already exists. Use \"Forgot password\" or ask an admin.");
      }

      // 3. create the employee record (Emp ID generated)
      const empId = nextEmpId(usersRes.data);
      const created = await callUserFlow("CREATE", { empId, firstName: fn, lastName: ln, email: mail, active: true });
      const row = (created.data || [])
        .filter((u) => (u.empId || "").toLowerCase() === empId.toLowerCase())
        .sort((a, b) => Number(b.guid) - Number(a.guid))[0];
      if (!row) throw new Error("Couldn't confirm the new user record. Please try again.");
      createdGuid = row.guid;

      // 4. create the login
      await callAuthFlow("CREATE_CREDENTIAL", {
        userId: row.id, username: uname, passwordHashB64: asciiToBase64(bcrypt.hashSync(password, 10)),
      });
      setDone(true);
    } catch (e) {
      // Don't leave an orphan employee row behind if the login couldn't be created.
      if (createdGuid) await callUserFlow("DELETE", { guid: createdGuid }).catch(() => {});
      setError(e.message || "Sign up failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pp-auth" style={{
      minHeight: "100vh", width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
      background: `radial-gradient(1100px 600px at 15% 10%, #1E2748 0%, ${COLORS.navy} 55%, #0E1326 100%)`,
      fontFamily: "Inter, sans-serif", padding: 20,
    }}>
      <div className="pp-auth-card" style={{ width: "100%", maxWidth: 440, borderRadius: 20, overflow: "hidden", boxShadow: "0 30px 80px rgba(0,0,0,0.45)", background: COLORS.card, padding: "40px 36px" }}>
        <div style={{ marginBottom: 20 }}><Logo dark /></div>
        <div style={{ fontFamily: "Sora, sans-serif", fontSize: 22, fontWeight: 700, color: COLORS.text, marginBottom: 6 }}>Create your account</div>
        <div style={{ color: COLORS.textMuted, fontSize: 13.5, marginBottom: 24 }}>Register to get access to Project Pulse.</div>

        {done ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <CheckCircle2 size={36} color={COLORS.success} style={{ marginBottom: 10 }} />
            <div style={{ fontWeight: 700, color: COLORS.text, marginBottom: 6 }}>Account created</div>
            <div style={{ color: COLORS.textMuted, fontSize: 13, marginBottom: 18 }}>
              You can sign in now. An admin still needs to assign your role — until then you'll only see the Dashboard.
            </div>
            <button onClick={onGoToSignIn} style={{ width: "100%", padding: "11px 0", borderRadius: 10, border: "none", background: COLORS.accent, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              Go to sign in
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={label}>First name</label>
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="e.g. Jane" style={inputStyle} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={label}>Last name</label>
                <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="e.g. Doe" style={inputStyle} />
              </div>
            </div>

            <label style={{ ...label, marginTop: 14 }}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e.g. jane.doe@company.com" style={inputStyle} />

            <label style={{ ...label, marginTop: 14 }}>Choose a username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. jane.doe" style={inputStyle} />

            <label style={{ ...label, marginTop: 14 }}>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" style={inputStyle} />

            <label style={{ ...label, marginTop: 14 }}>Confirm password</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} placeholder="••••••••" style={inputStyle} />

            {error && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", color: COLORS.danger, fontSize: 13, marginTop: 14 }}>
                <AlertCircle size={15} /> {error}
              </div>
            )}

            <button
              type="button" onClick={submit} disabled={busy}
              style={{
                marginTop: 20, width: "100%", padding: "12px 0", borderRadius: 10, border: "none",
                background: COLORS.accent, color: "#fff", fontWeight: 700, fontSize: 14.5,
                cursor: busy ? "default" : "pointer", opacity: busy ? 0.75 : 1,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              {busy && <Loader2 size={16} className="spin" />}
              {busy ? "Creating…" : "Create account"}
            </button>

            <button type="button" onClick={onGoToSignIn} style={{ marginTop: 14, width: "100%", background: "none", border: "none", color: COLORS.textMuted, cursor: "pointer", fontSize: 12.5, fontWeight: 600 }}>
              Already have an account? Sign in
            </button>
          </>
        )}
      </div>
      <style>{`.spin { animation: spin 0.8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
