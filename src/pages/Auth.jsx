import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { EMAIL_RE, LANDING } from "../lib/format";

const LEGAL = LANDING === "/" ? "" : LANDING;
import { Alert, Button, Check, Field, FormError, Icon, ModalHost, Toasts } from "../ui/kit";

// Passwordless sign-in: email → 6-digit code.
export default function Auth({ signup }) {
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dev, setDev] = useState(false);
  const [left, setLeft] = useState(0);
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [shake, setShake] = useState(0);
  const refs = useRef([]);

  useEffect(() => { document.title = signup ? "Create account · Reachout" : "Log in · Reachout"; }, [signup]);
  useEffect(() => { if (left <= 0) return; const t = setTimeout(() => setLeft(l => l - 1), 1000); return () => clearTimeout(t); }, [left]);

  const request = async () => {
    const d = await api("/api/auth/request-code", { json: { email, intent: signup ? "signup" : "login", name: name.trim(), agree } });
    setDev(!!d.dev); setLeft(d.resend_in || 60);
  };
  const submitEmail = async e => {
    e.preventDefault(); setErrors({}); setFormError("");
    const errs = {};
    if (signup && name.trim().length < 2) errs.name = "Enter your full name.";
    if (!EMAIL_RE.test(email.trim())) errs.email = "Enter a valid email address, like name@example.com.";
    if (signup && !agree) errs.agree = "Please confirm to continue.";
    if (Object.keys(errs).length) return setErrors(errs);
    setBusy(true);
    try { await request(); setStep("code"); setTimeout(() => refs.current[0]?.focus(), 250); }
    catch (err) { err.field ? setErrors({ [err.field]: err.message }) : setFormError(err.message); }
    setBusy(false);
  };
  const verify = async code => {
    setBusy(true); setFormError("");
    try { await api("/api/auth/verify-code", { json: { email, code } }); location.href = "/app"; }
    catch (err) { setFormError(err.message); setShake(s => s + 1); setDigits(["", "", "", "", "", ""]); setTimeout(() => refs.current[0]?.focus(), 50); setBusy(false); }
  };
  const setDigit = (i, v) => {
    const clean = v.replace(/\D/g, "");
    if (clean.length > 1) { // pasted the whole code
      const d = clean.slice(0, 6).split(""); while (d.length < 6) d.push("");
      setDigits(d); if (clean.length >= 6) verify(clean.slice(0, 6)); else refs.current[clean.length]?.focus();
      return;
    }
    const d = [...digits]; d[i] = clean; setDigits(d);
    if (clean && i < 5) refs.current[i + 1]?.focus();
    if (d.every(Boolean)) verify(d.join(""));
  };

  const tabs = (
    <nav className="auth2-tabs" aria-label="Account">
      <a href="/login" className={signup ? "" : "on"} aria-current={signup ? undefined : "page"}>Log in</a>
      <a href="/signup" className={signup ? "on" : ""} aria-current={signup ? "page" : undefined}>Sign up</a>
    </nav>
  );
  return (
    <div className="auth2">
      <svg className="auth2-mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 20v-9a4 4 0 0 1 4-4h7.5" /><path d="m15 3.5 3.5 3.5-3.5 3.5" /></svg>
      <header className="auth2-top">
        <a href={LANDING} className="brand-link"><span className="logo"><Icon name="logo" /></span><span className="brand-name">Reachout</span></a>
        <a href={LANDING} className="btn btn-sm btn-ghost">Back to site</a>
      </header>
      <main className="auth2-main">
        <AnimatePresence mode="wait">
          {step === "email" ? (
            <motion.form key="e" className="auth2-card" onSubmit={submitEmail} noValidate initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .22 }}>
              {tabs}
              <h1>{signup ? "Create your account" : "Welcome back"}</h1>
              <p className="sub">{signup ? "Free to use. We'll email you a code to confirm it's you." : "We'll email you a 6-digit code. No password to remember."}</p>
              <div className="stack">
                {signup && <Field label="Full name" error={errors.name}><input className="input" value={name} onChange={e => setName(e.target.value)} autoComplete="name" placeholder="Jane Cooper" maxLength={80} /></Field>}
                <Field label="Email" error={errors.email}><input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" maxLength={254} autoFocus /></Field>
                {signup && <div><Check checked={agree} onChange={setAgree}>I agree to the <a href={`${LEGAL}/terms`} target="_blank" rel="noopener noreferrer">terms</a> and <a href={`${LEGAL}/privacy`} target="_blank" rel="noopener noreferrer">privacy policy</a>, and I'll only message people who'd expect to hear from me.</Check>{errors.agree && <span className="field-error">{errors.agree}</span>}</div>}
                <FormError>{formError}</FormError>
                <Button variant="primary" size="lg" type="submit" busy={busy} busyLabel="Sending code…">{signup ? "Create account" : "Email me a code"}</Button>
              </div>
            </motion.form>
          ) : (
            <motion.form key="c" className="auth2-card" onSubmit={e => { e.preventDefault(); if (digits.every(Boolean)) verify(digits.join("")); }} noValidate
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .22 }}>
              <Button variant="ghost" size="sm" icon="arrow-left" className="back" onClick={() => { setStep("email"); setFormError(""); }}>Change email</Button>
              <h1>Check your inbox</h1>
              <p className="sub">Enter the 6-digit code we sent to <b>{email}</b>. It expires in 10 minutes.</p>
              {dev && <Alert style={{ marginBottom: 16 }}>Running locally without email set up, so the code is printed in the Terminal window running the app.</Alert>}
              <motion.div className="otp" key={shake} animate={shake ? { x: [0, -8, 8, -5, 5, 0] } : {}} transition={{ duration: .4 }} role="group" aria-label="6-digit code">
                {digits.map((d, i) => (
                  <input key={i} ref={el => refs.current[i] = el} className="input" inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"} maxLength={i === 0 ? 6 : 1} value={d} aria-label={`Digit ${i + 1}`}
                    onChange={e => setDigit(i, e.target.value)} onKeyDown={e => { if (e.key === "Backspace" && !d && i) refs.current[i - 1]?.focus(); }} />
                ))}
              </motion.div>
              <FormError>{formError}</FormError>
              <Button variant="primary" size="lg" type="submit" busy={busy} busyLabel="Verifying…" style={{ width: "100%", marginTop: 16 }}>Verify and continue</Button>
              <p className="resend">Didn't get it? Check spam, or <button type="button" className="link-btn" disabled={left > 0 || busy} onClick={() => request().catch(err => setFormError(err.message))}>{left > 0 ? `resend in ${left}s` : "send a new code"}</button></p>
            </motion.form>
          )}
        </AnimatePresence>
      </main>
      <footer className="auth2-foot">
        <span>By continuing you agree to the <a href={`${LEGAL}/terms`} target="_blank" rel="noopener noreferrer">terms</a> and <a href={`${LEGAL}/privacy`} target="_blank" rel="noopener noreferrer">privacy policy</a>.</span>
        <span>Not affiliated with WhatsApp or Meta.</span>
      </footer>
      <ModalHost /><Toasts />
    </div>
  );
}
