// ForgotPasswordPage.jsx — email OTP reset.
// Step 1: enter the registered email -> flow (REQUEST_RESET) generates a 6-digit code and emails it.
// Step 2: enter the code + new password -> flow (CONFIRM_RESET) verifies the code and updates the password.
// The code is generated and checked only inside the flow; the browser never sees it.
import { useEffect, useRef, useState } from "react";
import bcrypt from "bcryptjs";
import { Loader2, AlertCircle, CheckCircle2, Mail, MailCheck, Eye, EyeOff } from "lucide-react";
import { Logo } from "../../components/common/Logo";
import { COLORS, inputStyle, labelStyle } from "../../constants/theme";
import { callAuthFlow } from "../../api/flows";

const asciiToBase64 = (str) => btoa(str);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;
const EXPIRY_MINUTES = 5; // keep in sync with addMinutes(utcNow(), 5) in the flow

function maskEmail(mail) {
  const [name, domain] = String(mail).split("@");
  if (!domain) return mail;
  const head = name.slice(0, Math.min(2, name.length));
  return `${head}${"•".repeat(Math.max(name.length - head.length, 2))}@${domain}`;
}

function friendlyConfirmError(e) {
  const m = String((e && e.message) || "");
  if (/returned (400|404)|invalid or expired/i.test(m)) {
    return "That code is invalid or has expired. Check the code, or request a new one.";
  }
  return m || "Something went wrong. Please try again.";
}

const primaryBtn = (busy) => ({
  marginTop: 20, width: "100%", padding: "12px 0", borderRadius: 10, border: "none",
  background: COLORS.accent, color: "#fff", fontWeight: 700, fontSize: 14.5,
  cursor: busy ? "default" : "pointer", opacity: busy ? 0.75 : 1,
  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
});
const linkBtn = {
  background: "none", border: "none", padding: 0, color: COLORS.textMuted,
  cursor: "pointer", fontSize: 12.5, fontWeight: 600,
};
const title = { fontFamily: "Sora, sans-serif", fontSize: 22, fontWeight: 700, color: COLORS.text, marginBottom: 6 };
const subtitle = { color: COLORS.textMuted, fontSize: 13.5, marginBottom: 22, lineHeight: 1.5 };

/* ---------- small pieces (module level so inputs never lose focus on re-render) ---------- */

function StepBar({ current }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 22 }} aria-hidden="true">
      {[1, 2].map((n) => (
        <div key={n} style={{ flex: 1, height: 4, borderRadius: 4, background: n <= current ? COLORS.accent : COLORS.border, transition: "background .2s ease" }} />
      ))}
    </div>
  );
}

function ErrorLine({ message }) {
  if (!message) return null;
  return (
    <div role="alert" style={{ display: "flex", gap: 8, alignItems: "flex-start", color: COLORS.danger, fontSize: 13, marginTop: 14 }}>
      <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} /> <span>{message}</span>
    </div>
  );
}

function PasswordField({ value, onChange, placeholder, show, onToggle, onEnter, autoComplete }) {
  return (
    <div style={{ position: "relative" }}>
      <input
        type={show ? "text" : "password"} value={value} placeholder={placeholder} autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && onEnter) onEnter(); }}
        style={{ ...inputStyle, paddingRight: 42 }}
      />
      <button
        type="button" onClick={onToggle} aria-label={show ? "Hide password" : "Show password"}
        style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: COLORS.textMuted, padding: 8, display: "flex" }}
      >
        {show ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}

// Six single-digit boxes. `value` is always a contiguous digit string (0-6 chars).
function OtpInput({ value, onChange, disabled }) {
  const refs = useRef([]);
  const digits = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] || "");

  useEffect(() => { if (refs.current[0]) refs.current[0].focus(); }, []);

  const focusAt = (i) => {
    const el = refs.current[Math.max(0, Math.min(OTP_LENGTH - 1, i))];
    if (el) { el.focus(); el.select(); }
  };

  const handleChange = (i, e) => {
    const ch = e.target.value.replace(/\D/g, "");
    if (!ch) { onChange(value.slice(0, i) + value.slice(i + 1)); return; }
    if (ch.length > 1) { // autofill / one-time-code suggestion delivers the whole code at once
      const full = ch.slice(0, OTP_LENGTH);
      onChange(full);
      focusAt(full.length >= OTP_LENGTH ? OTP_LENGTH - 1 : full.length);
      return;
    }
    onChange((value.slice(0, i) + ch + value.slice(i + 1)).slice(0, OTP_LENGTH));
    focusAt(i + 1);
  };

  const handleKeyDown = (i, e) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      e.preventDefault();
      onChange(value.slice(0, i - 1) + value.slice(i));
      focusAt(i - 1);
    } else if (e.key === "ArrowLeft") { e.preventDefault(); focusAt(i - 1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); focusAt(i + 1); }
  };

  const handleFocus = (i, e) => {
    if (i > value.length) focusAt(value.length); // always land on the next empty box
    else e.target.select();
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    focusAt(pasted.length >= OTP_LENGTH ? OTP_LENGTH - 1 : pasted.length);
  };

  return (
    <div style={{ display: "flex", gap: 8 }} onPaste={handlePaste} role="group" aria-label="6-digit code">
      {digits.map((d, i) => (
        <input
          key={i} ref={(el) => { refs.current[i] = el; }}
          className={`pp-otp${d ? " is-filled" : ""}`}
          value={d} inputMode="numeric" disabled={disabled}
          autoComplete={i === 0 ? "one-time-code" : "off"} aria-label={`Digit ${i + 1}`}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => handleFocus(i, e)}
        />
      ))}
    </div>
  );
}

/* ---------- page ---------- */

export function ForgotPasswordPage({ onGoToSignIn }) {
  const [step, setStep] = useState("request"); // "request" | "verify" | "done"
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const sendCode = async () => {
    const mail = email.trim();
    if (!EMAIL_RE.test(mail)) { setError("Enter a valid email address."); return; }
    setError(""); setBusy(true);
    try {
      await callAuthFlow("REQUEST_RESET", { email: mail });
      setOtp("");
      setCooldown(RESEND_SECONDS);
      setStep("verify");
    } catch (e) {
      setError(e.message || "Couldn't send the code. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const verifyAndUpdate = async () => {
    if (otp.length !== OTP_LENGTH) { setError("Enter the 6-digit code from your email."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords don't match."); return; }
    setError(""); setBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 30)); // let the spinner paint before the (blocking) hash
      const hash = bcrypt.hashSync(password, 10);
      await callAuthFlow("CONFIRM_RESET", { email: email.trim(), token: otp, passwordHashB64: asciiToBase64(hash) });
      setStep("done");
    } catch (e) {
      setError(friendlyConfirmError(e));
    } finally {
      setBusy(false);
    }
  };

  const changeEmail = () => { setStep("request"); setError(""); setOtp(""); setPassword(""); setConfirmPassword(""); };

  return (
    <div className="pp-auth" style={{
      minHeight: "100vh", width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
      background: `radial-gradient(1100px 600px at 15% 10%, #1E2748 0%, ${COLORS.navy} 55%, #0E1326 100%)`,
      fontFamily: "Inter, sans-serif", padding: 20,
    }}>
      <div className="pp-auth-card" style={{ width: "100%", maxWidth: 440, borderRadius: 20, overflow: "hidden", boxShadow: "0 30px 80px rgba(0,0,0,0.45)", background: COLORS.card, padding: "40px 36px" }}>
        <div style={{ marginBottom: 20 }}><Logo dark /></div>

        {step === "request" && (
          <>
            <StepBar current={1} />
            <div style={title}>Reset your password</div>
            <div style={subtitle}>Enter your registered email. We'll send a 6-digit code to verify it's you.</div>
            <label style={labelStyle}>Registered email</label>
            <div style={{ position: "relative" }}>
              <Mail size={16} color={COLORS.textMuted} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }} />
              <input
                type="email" value={email} autoFocus autoComplete="email"
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") sendCode(); }}
                placeholder="e.g. jane.doe@company.com"
                style={{ ...inputStyle, paddingLeft: 38 }}
              />
            </div>
            <ErrorLine message={error} />
            <button type="button" onClick={sendCode} disabled={busy} style={primaryBtn(busy)}>
              {busy && <Loader2 size={16} className="spin" />} {busy ? "Sending code…" : "Send code"}
            </button>
          </>
        )}

        {step === "verify" && (
          <>
            <StepBar current={2} />
            <div style={title}>Enter the code</div>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", background: COLORS.accentSoft, borderRadius: 10, padding: "11px 13px", marginBottom: 20, fontSize: 12.5, color: COLORS.accentDark, lineHeight: 1.5 }}>
              <MailCheck size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                If <b>{maskEmail(email.trim())}</b> is registered, a code is on its way. It expires in {EXPIRY_MINUTES} minutes.{" "}
                <button type="button" onClick={changeEmail} style={{ ...linkBtn, color: COLORS.accentDark, textDecoration: "underline", fontSize: 12.5 }}>Change email</button>
              </div>
            </div>

            <label style={labelStyle}>6-digit code</label>
            <OtpInput value={otp} onChange={setOtp} disabled={busy} />

            <label style={{ ...labelStyle, marginTop: 18 }}>New password</label>
            <PasswordField value={password} onChange={setPassword} show={showPw} onToggle={() => setShowPw((s) => !s)} placeholder="At least 8 characters" autoComplete="new-password" />

            <label style={{ ...labelStyle, marginTop: 14 }}>Confirm new password</label>
            <PasswordField value={confirmPassword} onChange={setConfirmPassword} show={showPw} onToggle={() => setShowPw((s) => !s)} placeholder="••••••••" onEnter={verifyAndUpdate} autoComplete="new-password" />

            <ErrorLine message={error} />
            <button type="button" onClick={verifyAndUpdate} disabled={busy} style={primaryBtn(busy)}>
              {busy && <Loader2 size={16} className="spin" />} {busy ? "Updating…" : "Verify & update password"}
            </button>

            <div style={{ marginTop: 14, textAlign: "center", fontSize: 12.5, color: COLORS.textMuted }}>
              Didn't get it?{" "}
              <button
                type="button" onClick={sendCode} disabled={busy || cooldown > 0}
                style={{ ...linkBtn, color: cooldown > 0 ? COLORS.textMuted : COLORS.accent, cursor: cooldown > 0 || busy ? "default" : "pointer", opacity: cooldown > 0 ? 0.7 : 1 }}
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
              </button>
            </div>
          </>
        )}

        {step === "done" && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <CheckCircle2 size={36} color={COLORS.success} style={{ marginBottom: 10 }} />
            <div style={{ fontWeight: 700, color: COLORS.text, marginBottom: 6 }}>Password updated</div>
            <div style={{ color: COLORS.textMuted, fontSize: 13, marginBottom: 18 }}>Sign in with your new password.</div>
            <button type="button" onClick={onGoToSignIn} style={{ width: "100%", padding: "11px 0", borderRadius: 10, border: "none", background: COLORS.accent, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              Go to sign in
            </button>
          </div>
        )}

        {step !== "done" && (
          <div style={{ marginTop: 14, textAlign: "center" }}>
            <button type="button" onClick={onGoToSignIn} style={linkBtn}>Back to sign in</button>
          </div>
        )}
      </div>
      <style>{`
        .spin { animation: spin 0.8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }
        .pp-otp {
          flex: 1 1 0; min-width: 0; height: 56px; text-align: center; font-size: 22px; font-weight: 700;
          font-family: Inter, sans-serif; color: ${COLORS.text}; background: #fff; outline: none; box-sizing: border-box; padding: 0;
          border: 1px solid ${COLORS.border}; border-radius: 10px; caret-color: ${COLORS.accent};
          transition: border-color .15s ease, box-shadow .15s ease, background .15s ease;
        }
        .pp-otp.is-filled { border-color: ${COLORS.accentLight}; background: ${COLORS.accentSoft}; }
        .pp-otp:focus { border-color: ${COLORS.accent}; box-shadow: 0 0 0 3px ${COLORS.accentSoft}; }
        .pp-otp:disabled { opacity: 0.6; }
        @media (max-width: 420px) { .pp-otp { height: 50px; font-size: 20px; } }
      `}</style>
    </div>
  );
}
