import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "framer-motion";
import { cloneElement, forwardRef, isValidElement, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createStore, useStore } from "../lib/bus";
import { ext, hue, initials } from "../lib/format";
import { ICONS } from "./icons";

export const spring = { type: "spring", stiffness: 420, damping: 34, mass: .8 };
export const ease = [.2, .8, .2, 1];

/* ---------------------------------------------------------------- icon */
export const Icon = ({ name, size, className = "", ...rest }) => (
  <svg className={`i ${className}`} viewBox="0 0 24 24" aria-hidden="true" style={size ? { width: size, height: size } : undefined}
    dangerouslySetInnerHTML={{ __html: ICONS[name] || "" }} {...rest} />
);

/* ---------------------------------------------------------------- button */
export const Spinner = ({ size }) => <span className="spinner" style={size ? { width: size, height: size } : undefined} aria-hidden="true" />;

export const Button = forwardRef(function Button({ variant = "", size = "", icon, iconRight, busy, busyLabel, children, className = "", as = "button", ...rest }, ref) {
  const Tag = as === "a" ? motion.a : motion.button;
  const cls = ["btn", variant && `btn-${variant}`, size && `btn-${size}`, !children && icon && "btn-icon", className].filter(Boolean).join(" ");
  return (
    <Tag ref={ref} className={cls} whileTap={{ scale: .97 }} disabled={as === "a" ? undefined : (busy || rest.disabled)} aria-busy={busy || undefined}
      type={as === "a" ? undefined : (rest.type || "button")} {...rest}>
      {busy ? <><Spinner />{busyLabel && <span>{busyLabel}</span>}</> : <>{icon && <Icon name={icon} />}{children}{iconRight && <Icon name={iconRight} />}</>}
    </Tag>
  );
});

// Runs an async click handler with a busy state on the button.
export function useBusy() {
  const [busy, setBusy] = useState(false);
  const run = fn => async (...a) => { if (busy) return; setBusy(true); try { return await fn(...a); } finally { setBusy(false); } };
  return [busy, run];
}

/* ---------------------------------------------------------------- toasts */
const toasts = createStore([]);
let tid = 0;
export function toast(msg, err = false) {
  const id = ++tid;
  toasts.set(t => [...t, { id, msg, err }].slice(-4));
  setTimeout(() => toasts.set(t => t.filter(x => x.id !== id)), err ? 5500 : 3200);
}
export const fail = e => toast(e?.message || "Something went wrong. Please try again.", true);
export function Toasts() {
  const list = useStore(toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      <AnimatePresence initial={false}>
        {list.map(t => (
          <motion.div key={t.id} layout className={`toast ${t.err ? "err" : ""}`}
            initial={{ opacity: 0, y: 20, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 40, transition: { duration: .18 } }}
            transition={spring} onClick={() => toasts.set(x => x.filter(y => y.id !== t.id))}>
            <Icon name={t.err ? "alert" : "check"} /><span>{t.msg}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ---------------------------------------------------------------- modal (promise-based confirm / prompt) */
const modals = createStore(null);
export function modal(opts) {
  return new Promise(resolve => modals.set({ ...opts, resolve }));
}
export function ModalHost() {
  const m = useStore(modals);
  const [value, setValue] = useState("");
  const inputRef = useRef(null), okRef = useRef(null);
  useEffect(() => {
    if (!m) return;
    setValue(m.input ?? "");
    setTimeout(() => (inputRef.current || okRef.current)?.focus(), 30);
    if (inputRef.current) setTimeout(() => inputRef.current?.select(), 40);
  }, [m]);
  const done = ok => {
    if (!m) return;
    m.resolve(ok ? (m.input !== undefined ? value : true) : (m.input !== undefined ? null : false));
    modals.set(null);
  };
  useEffect(() => {
    if (!m) return;
    const k = e => { if (e.key === "Escape") done(false); if (e.key === "Enter" && !(e.target.tagName === "TEXTAREA")) done(true); };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  });
  return (
    <AnimatePresence>
      {m && (
        <motion.div className="modal-backdrop" key="m" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={e => e.target === e.currentTarget && done(false)}>
          <motion.div className="modal" role="dialog" aria-modal="true" initial={{ opacity: 0, scale: .94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .96, y: 8 }} transition={spring}>
            {m.danger && <div className="modal-ic danger"><Icon name="alert" /></div>}
            <h3>{m.title}</h3>
            {m.text && (typeof m.text === "string" ? <p>{m.text}</p> : <div className="modal-text">{m.text}</div>)}
            {m.input !== undefined && (m.multiline
              ? <textarea ref={inputRef} className="textarea" rows={8} value={value} onChange={e => setValue(e.target.value)} />
              : <input ref={inputRef} className="input" type={m.type || "text"} value={value} onChange={e => setValue(e.target.value)} />)}
            <div className="actions">
              <Button onClick={() => done(false)}>{m.cancel || "Cancel"}</Button>
              <Button ref={okRef} variant={m.danger ? "danger-solid" : "primary"} onClick={() => done(true)}>{m.confirm || "OK"}</Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ---------------------------------------------------------------- drawer */
export function Drawer({ open, onClose, children, wide, label }) {
  useEffect(() => {
    if (!open) return;
    document.body.classList.add("drawer-open");
    const k = e => { if (e.key === "Escape" && !modals.get()) onClose(); };
    addEventListener("keydown", k);
    return () => { removeEventListener("keydown", k); document.body.classList.remove("drawer-open"); };
  }, [open, onClose]);
  // Portalled to <body>: the animated page wrapper uses transforms, which would trap position:fixed.
  return createPortal(
    <AnimatePresence>
      {open && <>
        <motion.div className="drawer-scrim" key="s" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
        <motion.aside className={`drawer ${wide ? "wide" : ""}`} key="d" aria-label={label} role="dialog"
          initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 380, damping: 38 }}>
          {children}
        </motion.aside>
      </>}
    </AnimatePresence>,
    document.body,
  );
}
export const DrawerHead = ({ logo, title, sub, onClose, children }) => (
  <div className="dr-head">
    {logo}
    <div className="grow"><h3>{title}</h3>{sub && <p>{sub}</p>}</div>
    {children}
    <Button variant="ghost" size="sm" icon="x" aria-label="Close" onClick={onClose} />
  </div>
);

/* ---------------------------------------------------------------- small pieces */
export const Badge = ({ tone = "", children, title, dot = true }) => <span className={`badge ${tone} ${dot ? "" : "plain"}`} title={title}>{children}</span>;
export const Empty = ({ icon = "inbox", title, children, action }) => (
  <motion.div className="empty" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
    <div className="ei"><Icon name={icon} /></div><b>{title}</b>{children && <span>{children}</span>}{action}
  </motion.div>
);
export const Sk = ({ w = "100%", h = 14, r, style }) => <span className="sk" style={{ width: w, height: h, borderRadius: r, ...style }} />;
export const SkBlock = ({ h = 180 }) => <div className="card sk-block" style={{ height: h }} />;
export const Avatar = ({ name, size = "", logo }) => (
  <span className={`${logo ? "co-logo" : "avatar"} ${size}`} style={logo ? { "--h": hue(name) } : undefined}>{initials(name)}</span>
);
export function FileIcon({ name }) {
  const e = ext(name);
  const cls = e === "pdf" ? "pdf" : ["doc", "docx", "rtf", "odt"].includes(e) ? "doc" : ["png", "jpg", "jpeg", "gif", "webp"].includes(e) ? "img" : "";
  return <span className={`fic ${cls}`}>{(e.slice(0, 4) || "file").toUpperCase()}</span>;
}
export const Alert = ({ tone = "info", icon, children, style }) => (
  <div className={`alert ${tone}`} style={style}><Icon name={icon || (tone === "info" ? "info" : "alert")} /><div>{children}</div></div>
);

/* ---------------------------------------------------------------- form fields */
export function Field({ label, hint, error, opt, children, className = "", style, id: givenId }) {
  const autoId = useId();
  const id = givenId || autoId;
  const child = Array.isArray(children) ? children : [children];
  return (
    <div className={`field ${className}`} style={style}>
      {label && <label htmlFor={id}>{label}{opt && <span className="opt"> {opt}</span>}</label>}
      {child.map((c, i) => i === 0 && isValidElement(c) && typeof c.type === "string"
        ? cloneElement(c, { key: "f", id: c.props.id || id, "aria-invalid": error ? "true" : undefined }) : c)}
      <AnimatePresence initial={false}>
        {error && <motion.span className="field-error" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>{error}</motion.span>}
      </AnimatePresence>
      {hint && !error && <span className="help">{hint}</span>}
    </div>
  );
}
export const FormError = ({ children }) => (
  <AnimatePresence>{children && <motion.div className="form-error" role="alert" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Icon name="alert" />{children}</motion.div>}</AnimatePresence>
);
// Maps an API error onto field errors, or returns it as a form-level message.
export function applyError(err, setErrors, setFormError) {
  if (err.field) { setErrors(e => ({ ...e, [err.field]: err.message })); return; }
  if (setFormError) setFormError(err.message); else fail(err);
}

export const Switch = ({ checked, onChange, children, disabled, title }) => (
  <label className={`switch ${disabled ? "off" : ""}`} title={title}>
    <input type="checkbox" checked={!!checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
    <span className="track"><motion.span className="knob" layout transition={spring} /></span>
    {children && <span className="sw-label">{children}</span>}
  </label>
);
export const Check = ({ checked, onChange, children, disabled }) => (
  <label className="check"><input type="checkbox" checked={!!checked} disabled={disabled} onChange={e => onChange(e.target.checked)} /><span>{children}</span></label>
);

// Segmented control with a sliding highlight.
export function Seg({ value, onChange, options, name, className = "", size = "" }) {
  const id = useId();
  return (
    <div className={`seg ${size} ${className}`} role="radiogroup" aria-label={name}>
      {options.map(o => {
        const [v, label, icon, count] = Array.isArray(o) ? o : [o.value, o.label, o.icon, o.count];
        const on = v === value;
        return (
          <button key={v} type="button" role="radio" aria-checked={on} className={on ? "on" : ""} onClick={() => onChange(v)}>
            {on && <motion.span className="seg-bg" layoutId={`seg-${id}`} transition={spring} />}
            <span className="seg-l">{icon && <Icon name={icon} />}{label}{count !== undefined && <b>{count}</b>}</span>
          </button>
        );
      })}
    </div>
  );
}

// Chip filters (All / In progress / …) with a sliding active pill.
export function Chips({ value, onChange, options }) {
  const id = useId();
  return (
    <div className="chipset" role="tablist">
      {options.map(([v, label, count, color]) => (
        <button key={v} type="button" role="tab" aria-selected={v === value} className={`chip ${v === value ? "on" : ""}`} onClick={() => onChange(v)}>
          {v === value && <motion.span className="chip-bg" layoutId={`chip-${id}`} transition={spring} />}
          <span className="chip-l">{color && <i className="cdot" style={{ background: color }} />}{label}{count !== undefined && <span className="n">{count}</span>}</span>
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- numbers that count up */
export function CountUp({ value, suffix = "" }) {
  const num = typeof value === "number" ? value : parseFloat(value);
  const mv = useMotionValue(0);
  const text = useTransform(mv, v => Math.round(v).toLocaleString() + suffix);
  const [out, setOut] = useState((isNaN(num) ? value : 0) + "");
  useEffect(() => {
    if (isNaN(num)) { setOut(value); return; }
    const c = animate(mv, num, { duration: .9, ease });
    const u = text.on("change", v => setOut(v));
    return () => { c.stop(); u(); };
  }, [num]); // eslint-disable-line react-hooks/exhaustive-deps
  return <>{out}</>;
}

/* ---------------------------------------------------------------- list animation helpers */
export const listItem = {
  initial: { opacity: 0, y: 10 },
  animate: i => ({ opacity: 1, y: 0, transition: { delay: Math.min(i, 12) * .03, duration: .28, ease } }),
  exit: { opacity: 0, scale: .98, transition: { duration: .15 } },
};
export const stagger = { animate: { transition: { staggerChildren: .045 } } };
export const rise = { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0, transition: { duration: .35, ease } } };

// Debounced value (search boxes).
export function useDebounced(value, ms = 150) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/* ---------------------------------------------------------------- pagination */
// Pages a list on the client. `reset` (e.g. the filters) sends you back to page 1 when it changes.
export function usePager(items, reset = "", initialSize = 25) {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(initialSize);
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / size));
  useEffect(() => { setPage(1); }, [reset, size]);
  useEffect(() => { if (page > pages) setPage(pages); }, [page, pages]);
  const start = (page - 1) * size;
  return { page, setPage, size, setSize, pages, total, start, items: items.slice(start, start + size) };
}

function pageList(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach(n => set.add(n));
  if (page >= pages - 2) [pages - 1, pages - 2, pages - 3].forEach(n => set.add(n));
  const out = [];
  [...set].filter(n => n >= 1 && n <= pages).sort((a, b) => a - b).forEach((n, i, a) => { if (i && n - a[i - 1] > 1) out.push("…" + n); out.push(n); });
  return out;
}

export function Pager({ p, label = "items", sizes = [10, 25, 50, 100], scrollTo }) {
  if (!p.total) return null;
  const go = n => { p.setPage(n); if (scrollTo?.current) scrollTo.current.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const end = Math.min(p.start + p.size, p.total);
  return (
    <div className="pager">
      <span className="help">Showing <b>{p.start + 1}–{end}</b> of <b>{p.total.toLocaleString()}</b> {label}</span>
      <span className="grow" />
      <label className="pager-size help">Per page
        <select className="select sm" value={p.size} onChange={e => p.setSize(+e.target.value)}>{sizes.map(s => <option key={s} value={s}>{s}</option>)}</select>
      </label>
      {p.pages > 1 && <nav className="pager-nav" aria-label="Pagination">
        <button className="pg" disabled={p.page === 1} onClick={() => go(p.page - 1)} aria-label="Previous page"><Icon name="arrow-left" /></button>
        {pageList(p.page, p.pages).map(n => typeof n === "string" ? <span key={n} className="pg-gap">…</span> : (
          <button key={n} className={`pg ${n === p.page ? "on" : ""}`} onClick={() => go(n)} aria-current={n === p.page ? "page" : undefined}>
            {n === p.page && <motion.span className="pg-bg" layoutId={`pg-${label}`} transition={spring} />}<span>{n}</span>
          </button>))}
        <button className="pg" disabled={p.page === p.pages} onClick={() => go(p.page + 1)} aria-label="Next page"><Icon name="chevron" /></button>
      </nav>}
    </div>
  );
}
