import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { EMAIL_RE, LANDING } from "../lib/format";

const LEGAL = LANDING === "/" ? "" : LANDING;
import { Alert, Button, Check, Field, FormError, Icon, ModalHost, Toasts, spring } from "../ui/kit";

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

  return (
    <div className="auth">
      <div className="auth-form">
        <a href={LANDING} className="brand-link"><span className="logo"><Icon name="send" /></span><span className="brand-name">Reachout</span></a>
        <main>
          <AnimatePresence mode="wait">
            {step === "email" ? (
              <motion.form key="e" className="auth-box" onSubmit={submitEmail} noValidate initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: .25 }}>
                <h1>{signup ? "Create your account" : "Welcome back"}</h1>
                <p className="sub">{signup ? "Free to start. We'll email you a code to confirm it's you." : "Enter your email and we'll send you a 6-digit code. No password needed."}</p>
                <div className="stack">
                  {signup && <Field label="Full name" error={errors.name}><input className="input" value={name} onChange={e => setName(e.target.value)} autoComplete="name" placeholder="Jane Cooper" maxLength={80} /></Field>}
                  <Field label="Email" error={errors.email}><input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" maxLength={254} autoFocus /></Field>
                  {signup && <div><Check checked={agree} onChange={setAgree}>I agree to the <a href={`${LEGAL}/terms`} target="_blank" rel="noopener noreferrer">terms</a> and <a href={`${LEGAL}/privacy`} target="_blank" rel="noopener noreferrer">privacy policy</a>, and I'll only message people who'd expect to hear from me.</Check>{errors.agree && <span className="field-error">{errors.agree}</span>}</div>}
                  <FormError>{formError}</FormError>
                  <Button variant="primary" size="lg" type="submit" busy={busy} busyLabel="Sending code…">{signup ? "Create account" : "Continue with email"}</Button>
                </div>
                {!signup && <p className="help legal-line">By continuing you agree to the <a href={`${LEGAL}/terms`} target="_blank" rel="noopener noreferrer">terms</a> and <a href={`${LEGAL}/privacy`} target="_blank" rel="noopener noreferrer">privacy policy</a>.</p>}
                <p className="switchlink">{signup ? <>Already have an account? <a href="/login">Log in</a></> : <>Don't have an account? <a href="/signup">Sign up</a></>}</p>
              </motion.form>
            ) : (
              <motion.form key="c" className="auth-box" onSubmit={e => { e.preventDefault(); if (digits.every(Boolean)) verify(digits.join("")); }} noValidate
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: .25 }}>
                <Button variant="ghost" size="sm" icon="arrow-left" className="back" onClick={() => { setStep("email"); setFormError(""); }}>Back</Button>
                <motion.div className="mail-ic" initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={spring}><Icon name="mail" /></motion.div>
                <h1>Check your email</h1>
                <p className="sub">We sent a 6-digit code to <b>{email}</b>. It expires in 10 minutes.</p>
                {dev && <Alert style={{ marginBottom: 16 }}>Running locally without email set up, so the code is printed in the Terminal window running the app.</Alert>}
                <motion.div className="otp" key={shake} animate={shake ? { x: [0, -8, 8, -5, 5, 0] } : {}} transition={{ duration: .4 }} role="group" aria-label="6-digit code">
                  {digits.map((d, i) => (
                    <input key={i} ref={el => refs.current[i] = el} className="input" inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"} maxLength={i === 0 ? 6 : 1} value={d} aria-label={`Digit ${i + 1}`}
                      onChange={e => setDigit(i, e.target.value)} onKeyDown={e => { if (e.key === "Backspace" && !d && i) refs.current[i - 1]?.focus(); }} />
                  ))}
                </motion.div>
                <FormError>{formError}</FormError>
                <Button variant="primary" size="lg" type="submit" busy={busy} busyLabel="Verifying…" style={{ width: "100%", marginTop: 16 }}>Verify and continue</Button>
                <p className="resend">Didn't get it? Check spam, or <button type="button" className="link-btn" disabled={left > 0 || busy} onClick={() => request().catch(err => setFormError(err.message))}>{left > 0 ? `resend in ${left}s` : "resend the code"}</button></p>
              </motion.form>
            )}
          </AnimatePresence>
        </main>
        <div className="help">Not affiliated with WhatsApp or Meta.</div>
      </div>
      <aside className="auth-show" aria-hidden="true">
        <div className="orb o1" /><div className="orb o2" />
        <motion.div className="auth-quote" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .15, duration: .5 }}>
          <h2>Your whole job search, in one calm place.</h2>
          <ul>
            {["Personalised WhatsApp and email outreach", "Every application and its status, from your inbox", "Replies read for you, with a suggested answer"].map((t, i) => (
              <motion.li key={t} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: .3 + i * .1 }}><Icon name="check" />{t}</motion.li>
            ))}
          </ul>
          <motion.div className="mini" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .6 }}>
            {[["PN", "Priya Nair", "Interview", "teal"], ["AM", "Arjun Mehta", "Replied", "brand"], ["SK", "Sara Khan", "Offer", "ok"]].map(([a, n, s, t]) => (
              <div className="row" key={n}><span className="av">{a}</span><b>{n}</b><span className={`badge ${t}`}>{s}</span></div>
            ))}
          </motion.div>
        </motion.div>
      </aside>
      <ModalHost /><Toasts />
    </div>
  );
}
