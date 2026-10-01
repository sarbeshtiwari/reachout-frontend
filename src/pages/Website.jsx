import { AnimatePresence, Reorder, motion, useDragControls } from "framer-motion";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api, upload } from "../lib/api";
import { ago } from "../lib/format";
import { Button, Empty, Field, Icon, Seg, SkBlock, Switch, fail, modal, toast } from "../ui/kit";

const DEVICES = { desktop: 1280, tablet: 820, mobile: 390 };
const CHOICE_LABELS = {
  card: ["Card style", { flat: "Flat", border: "Outlined", raised: "Shadow", glass: "Glass" }],
  button: ["Buttons", { gradient: "Gradient", solid: "Solid", outline: "Outline", pill: "Pill" }],
  background: ["Background", { plain: "Plain", glow: "Glow", grid: "Grid", dots: "Dots" }],
  spacing: ["Spacing", { compact: "Compact", normal: "Normal", airy: "Airy" }],
  width: ["Page width", { narrow: "Narrow", normal: "Normal", wide: "Wide" }],
  nav: ["Menu bar", { sticky: "Sticky", static: "Scrolls away", hidden: "Hidden" }],
  align: ["Headings", { left: "Left", center: "Centred" }],
};
const COLOR_LABELS = [["bg", "Background"], ["surface", "Cards"], ["text", "Text"], ["muted", "Soft text"], ["accent", "Accent"], ["accent2", "Accent 2"]];
const SOCIAL_LABELS = { email: "Email", github: "GitHub", linkedin: "LinkedIn", x: "X / Twitter", instagram: "Instagram", youtube: "YouTube", dribbble: "Dribbble", website: "Other website", resume: "Résumé link" };
const VARIANT_LABELS = { split: "Photo beside", center: "Centred", minimal: "Minimal", text: "Text only", image: "With image", chips: "Chips", columns: "List", bars: "Bars",
  grid: "Grid", list: "Rows", timeline: "Timeline", cards: "Cards", row: "Row", quote: "Big quote", banner: "Banner", plain: "Plain", card: "Card" };
const HEX = /^#[0-9a-f]{6}$/i;
const uid = () => Math.random().toString(36).slice(2, 10).padEnd(8, "0");
const clone = x => JSON.parse(JSON.stringify(x));

export default function Website({ slug, onSlug }) {
  const [s, setS] = useState(null);
  const [err, setErr] = useState("");
  const [draft, setDraftRaw] = useState(null);
  const [tab, setTab] = useState("sections");
  const [open, setOpen] = useState(null);
  const [save, setSave] = useState("saved");
  const [busy, setBusy] = useState("");
  const hist = useRef({ past: [], future: [] });
  const saveTimer = useRef();
  const frameApi = useRef({});

  useEffect(() => { api("/api/site").then(r => { setS(r); setDraftRaw(r.draft); }).catch(e => setErr(e.message)); }, []);

  const persist = useCallback(next => {
    setSave("pending");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSave("saving");
      try { const r = await api("/api/site", { method: "PUT", json: { draft: next } }); setS(x => ({ ...x, dirty: r.dirty })); setSave("saved"); }
      catch (e) { setSave("error"); toast(e.message, true); }
    }, 700);
  }, []);
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  // Every edit goes through here: keeps undo history and autosaves.
  const edit = useCallback(fn => setDraftRaw(cur => {
    const next = clone(cur); fn(next);
    hist.current.past = [...hist.current.past.slice(-60), cur]; hist.current.future = [];
    persist(next);
    return next;
  }), [persist]);
  const undo = () => { const h = hist.current; if (!h.past.length) return; const prev = h.past.pop(); h.future.push(draft); setDraftRaw(prev); persist(prev); };
  const redo = () => { const h = hist.current; if (!h.future.length) return; const nx = h.future.pop(); h.past.push(draft); setDraftRaw(nx); persist(nx); };
  useEffect(() => {
    const k = e => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z" || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
      e.preventDefault(); e.shiftKey ? redo() : undo();
    };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  });

  if (err) return <div className="card"><Empty icon="alert" title="Couldn't load your website">{err}</Empty></div>;
  if (!s || !draft) return <div className="wb"><SkBlock h={620} /><SkBlock h={620} /></div>;
  const meta = s.meta;

  const publish = async () => {
    setBusy("pub");
    try {
      if (save !== "saved") { clearTimeout(saveTimer.current); await api("/api/site", { method: "PUT", json: { draft } }); setSave("saved"); }
      const r = await api("/api/site/publish", { json: {} }); setS(x => ({ ...x, ...r })); if (r.slug && r.slug !== slug) onSlug(r.slug); toast("Your website is live 🎉");
    } catch (e) { if (e.field === "slug") setTab("details"); fail(e); }
    setBusy("");
  };
  const unpublish = async () => {
    if (!await modal({ title: "Unpublish your website?", text: "Visitors will see a “not found” page and the contact form stops taking messages. Your design and content stay here, so you can publish again any time.", confirm: "Unpublish", danger: true })) return;
    setBusy("unpub");
    try { const r = await api("/api/site/unpublish", { json: {} }); setS(x => ({ ...x, ...r })); toast("Your website is unpublished"); } catch (e) { fail(e); }
    setBusy("");
  };
  const resetAll = async () => {
    if (!await modal({ title: "Start over?", text: "Your draft is replaced with a fresh starter site. Your live site doesn't change until you publish.", confirm: "Start over", danger: true })) return;
    try { const r = await api("/api/site/reset", { json: {} }); hist.current.past.push(draft); setDraftRaw(r.draft); setS(x => ({ ...x, ...r })); toast("Fresh starter site loaded. Undo with ⌘Z."); } catch (e) { fail(e); }
  };
  const url = slug ? `${location.origin}/p/${slug}` : "";

  return (
    <div className="wb-page">
      <motion.div className="card wb-status" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="wb-state">
          <span className={`wb-dot ${s.online ? "live" : ""}`} />
          <div>
            <b>{s.online ? "Live" : "Not published"}</b>
            {url ? <a className="wb-url" href={s.online ? url : undefined} target="_blank" rel="noopener noreferrer">{url.replace(/^https?:\/\//, "")}</a> : <span className="help">Pick an address in Details</span>}
          </div>
          {url && <Button size="sm" variant="ghost" icon="copy" aria-label="Copy link" title="Copy link" onClick={() => navigator.clipboard.writeText(url).then(() => toast("Link copied"))} />}
        </div>
        <Spark series={s.views.series} total={s.views.month} />
        <span className="grow" />
        <span className={`wb-save ${save}`}>{{ saved: s.dirty ? (s.published_at ? "Saved · not published" : "Saved as draft") : "All changes live", pending: "Editing…", saving: "Saving…", error: "Couldn't save" }[save]}</span>
        <Button size="sm" variant="ghost" icon="undo" aria-label="Undo" title="Undo (⌘Z)" disabled={!hist.current.past.length} onClick={undo} />
        <Button size="sm" variant="ghost" icon="redo" aria-label="Redo" title="Redo (⇧⌘Z)" disabled={!hist.current.future.length} onClick={redo} />
        {s.online && <Button variant="ghost" className="btn-danger" busy={busy === "unpub"} busyLabel="Unpublishing…" onClick={unpublish}>Unpublish</Button>}
        <Button variant="primary" icon="globe" busy={busy === "pub"} busyLabel="Publishing…" disabled={s.online && !s.dirty && save === "saved"} onClick={publish}>
          {s.published_at ? (s.dirty || save !== "saved" ? "Publish changes" : "Published") : "Publish website"}</Button>
      </motion.div>

      <div className="wb">
        <aside className="card wb-side">
          <Seg value={tab} onChange={setTab} className="wb-tabs" options={[["sections", "Sections", "layers"], ["design", "Design", "palette"], ["details", "Details", "settings"]]} />
          <div className="wb-scroll">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={tab} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: .16 }}>
                {tab === "sections" && <Sections draft={draft} meta={meta} edit={edit} open={open} setOpen={id => { setOpen(id); id && frameApi.current.scrollTo?.(id); }} />}
                {tab === "design" && <Design draft={draft} meta={meta} edit={edit} />}
                {tab === "details" && <Details draft={draft} edit={edit} slug={slug} onSlug={onSlug} s={s} unpublish={unpublish} resetAll={resetAll} langs={meta.langs} />}
              </motion.div>
            </AnimatePresence>
          </div>
        </aside>
        <Preview draft={draft} apiRef={frameApi} url={s.online ? url : ""} />
      </div>
    </div>
  );
}

function Spark({ series, total }) {
  const max = Math.max(1, ...series.map(p => p.views));
  const pts = series.map((p, i) => `${(i / (series.length - 1)) * 100},${30 - (p.views / max) * 26}`).join(" ");
  return (
    <div className="wb-spark" title="Visits in the last 30 days">
      <svg viewBox="0 0 100 32" preserveAspectRatio="none"><polyline points={`0,32 ${pts} 100,32`} className="fill" /><polyline points={pts} className="line" /></svg>
      <div><b>{total}</b><span>visits · 30 days</span></div>
    </div>
  );
}

/* ---------------------------------------------------------------- live preview */

function Preview({ draft, apiRef, url }) {
  const [device, setDevice] = useState("desktop");
  const [src, setSrc] = useState("");
  const [loading, setLoading] = useState(true);
  const [box, setBox] = useState({ w: 800, h: 600 });
  const wrap = useRef(), frame = useRef(), scrollY = useRef(0), timer = useRef();

  useEffect(() => {
    clearTimeout(timer.current);
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch("/api/site/render", { method: "POST", headers: { "X-Requested-With": "fetch", "Content-Type": "application/json" }, body: JSON.stringify({ draft }) });
        if (r.ok) setSrc((await r.json()).url);
        else { const j = await r.json().catch(() => ({})); toast(j.error || "Preview failed", true); setLoading(false); }
      } catch { setLoading(false); }
    }, 380);
    return () => clearTimeout(timer.current);
  }, [draft]);

  useEffect(() => {
    const on = e => {
      if (e.source !== frame.current?.contentWindow) return;
      if (e.data?.type === "site-scroll") scrollY.current = e.data.y;
      if (e.data?.type === "site-ready") { frame.current.contentWindow.postMessage({ type: "restore", y: scrollY.current }, "*"); setLoading(false); }
    };
    addEventListener("message", on); return () => removeEventListener("message", on);
  }, []);
  useEffect(() => { apiRef.current.scrollTo = id => frame.current?.contentWindow?.postMessage({ type: "scrollTo", id }, "*"); }, [apiRef]);

  useLayoutEffect(() => {
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(wrap.current); return () => ro.disconnect();
  }, []);
  const dw = DEVICES[device];
  const scale = Math.min(1, (box.w - (device === "desktop" ? 0 : 32)) / dw);

  return (
    <section className="card wb-preview">
      <div className="lp-bar">
        <span className="dots"><i /><i /><i /></span>
        <span className="lp-url">{url ? url.replace(/^https?:\/\//, "") : "Preview"}</span>
        {loading && <span className="spinner sm" />}
        <Seg size="sm" value={device} onChange={setDevice} options={[["desktop", "", "monitor"], ["tablet", "", "tablet"], ["mobile", "", "phone"]]} name="Device" />
        {url && <a className="btn btn-sm btn-ghost btn-icon" href={url} target="_blank" rel="noopener noreferrer" aria-label="Open live site" title="Open live site"><Icon name="external" /></a>}
      </div>
      <div className={`wb-stage ${device}`} ref={wrap}>
        <div className="wb-device" style={{ width: dw * scale, height: device === "desktop" ? "100%" : Math.min(box.h - 32, 860 * scale) }}>
          <iframe ref={frame} title="Website preview" src={src || undefined} sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
            style={{ width: dw, height: `${100 / scale}%`, transform: `scale(${scale})` }} />
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- sections */

function Sections({ draft, meta, edit, open, setOpen }) {
  const [adding, setAdding] = useState(false);
  const list = draft.sections;
  const add = type => {
    const t = meta.types[type];
    const data = {};
    t.fields.forEach(f => { data[f.k] = f.type === "list" ? [] : f.type === "switch" ? true : f.type === "select" ? f.options[0] : ""; });
    if (t.fields.some(f => f.k === "heading")) data.heading = t.label.split(" /")[0];
    const sec = { id: uid(), type, on: true, nav: t.nav, variant: t.variants[0], data };
    edit(d => { const at = d.sections.findIndex(x => x.type === "contact"); at >= 0 && type !== "contact" ? d.sections.splice(at, 0, sec) : d.sections.push(sec); });
    setAdding(false); setTimeout(() => setOpen(sec.id), 450);
  };
  return <>
    <p className="help wb-tip"><Icon name="menu" /> Drag to reorder. Click a section to edit it.</p>
    <Reorder.Group axis="y" values={list} onReorder={next => edit(d => { d.sections = next.map(n => d.sections.find(x => x.id === n.id)); })} className="wb-secs">
      {list.map(sec => <SectionRow key={sec.id} sec={sec} meta={meta} edit={edit} open={open === sec.id} toggle={() => setOpen(open === sec.id ? null : sec.id)} />)}
    </Reorder.Group>
    <AnimatePresence>
      {adding ? (
        <motion.div className="wb-lib" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
          <div className="wb-lib-head"><b>Add a section</b><Button size="sm" variant="ghost" icon="x" aria-label="Close" onClick={() => setAdding(false)} /></div>
          <div className="wb-lib-grid">
            {Object.entries(meta.types).map(([k, t]) => (
              <button key={k} type="button" onClick={() => add(k)} disabled={k === "hero" && list.some(x => x.type === "hero")}>
                <Icon name={t.icon} /><span>{t.label}</span></button>))}
          </div>
        </motion.div>
      ) : <Button className="wb-add" icon="plus" onClick={() => setAdding(true)}>Add section</Button>}
    </AnimatePresence>
  </>;
}

function SectionRow({ sec, meta, edit, open, toggle }) {
  const drag = useDragControls();
  const t = meta.types[sec.type];
  const set = fn => edit(d => fn(d.sections.find(x => x.id === sec.id)));
  const title = sec.data.heading || sec.data.title || t.label;
  return (
    <Reorder.Item value={sec} dragListener={false} dragControls={drag} className={`wb-sec ${open ? "open" : ""} ${sec.on ? "" : "off"}`} layout="position">
      <div className="wb-sec-head">
        <button className="pf-grip" onPointerDown={e => drag.start(e)} aria-label="Drag to reorder"><Icon name="menu" /></button>
        <button className="wb-sec-title" onClick={toggle}>
          <span className="wb-sec-ic"><Icon name={t.icon} /></span>
          <span className="grow"><b>{title}</b><small>{t.label}{sec.nav ? ` · in menu as “${sec.nav}”` : ""}</small></span>
          <Icon name="chevron-down" className="wb-caret" />
        </button>
        <Switch checked={sec.on} onChange={on => set(x => { x.on = on; })} title={sec.on ? "Shown: click to hide" : "Hidden: click to show"} />
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div className="wb-sec-body" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: .22 }}>
            <div className="wb-sec-pad">
              {t.variants.length > 1 && <Field label="Layout"><Seg size="sm" value={sec.variant} onChange={v => set(x => { x.variant = v; })} options={t.variants.map(v => [v, VARIANT_LABELS[v] || v])} /></Field>}
              {sec.type !== "hero" && <Field label="Menu label" opt="(blank = not in menu)"><input className="input" value={sec.nav} maxLength={24} onChange={e => set(x => { x.nav = e.target.value; })} /></Field>}
              {t.fields.map(f => <FieldEditor key={f.k} f={f} value={sec.data[f.k]} onChange={v => set(x => { x.data[f.k] = v; })} />)}
              <div className="wb-sec-acts">
                <Button size="sm" variant="ghost" icon="copy" disabled={sec.type === "hero"} onClick={() => edit(d => { const i = d.sections.findIndex(x => x.id === sec.id); d.sections.splice(i + 1, 0, { ...clone(sec), id: uid() }); })}>Duplicate</Button>
                <span className="grow" />
                <Button size="sm" variant="ghost" className="btn-danger" icon="trash" onClick={() => { edit(d => { d.sections = d.sections.filter(x => x.id !== sec.id); }); toast("Section removed. Undo with ⌘Z."); }}>Remove</Button>
              </div>
            </div>
          </motion.div>)}
      </AnimatePresence>
    </Reorder.Item>
  );
}

function FieldEditor({ f, value, onChange }) {
  if (f.type === "note") return <p className="help wb-note"><Icon name="info" />{f.text}</p>;
  if (f.type === "switch") return <div className="wb-switch"><Switch checked={!!value} onChange={onChange}>{f.label}</Switch></div>;
  if (f.type === "image") return <ImageField label={f.label} value={value || ""} onChange={onChange} />;
  if (f.type === "list") return <ListField f={f} value={value || []} onChange={onChange} />;
  return (
    <Field label={f.label} hint={f.hint}>
      {f.type === "textarea" ? <textarea className="textarea" rows={f.rows || 3} value={value || ""} placeholder={f.ph} onChange={e => onChange(e.target.value)} />
        : f.type === "select" ? <select className="select" value={value || f.options[0]} onChange={e => onChange(e.target.value)}>{f.options.map(o => <option key={o}>{o}</option>)}</select>
          : <input className="input" value={value || ""} placeholder={f.ph || (f.type === "link" ? "https://… or #contact" : "")} onChange={e => onChange(e.target.value)} />}
    </Field>
  );
}

function ListField({ f, value, onChange }) {
  const [openI, setOpenI] = useState(value.length ? null : -1);
  const upd = (i, k, v) => onChange(value.map((r, j) => j === i ? { ...r, [k]: v } : r));
  const move = (i, dir) => { const n = [...value]; [n[i], n[i + dir]] = [n[i + dir], n[i]]; onChange(n); setOpenI(i + dir); };
  return (
    <div className="wb-list">
      <label className="label">{f.label}</label>
      {value.map((row, i) => {
        const title = row[f.fields[0].k] || row[f.fields[1]?.k] || `Item ${i + 1}`;
        return (
          <div key={i} className={`wb-li ${openI === i ? "open" : ""}`}>
            <div className="wb-li-head">
              <button type="button" className="grow" onClick={() => setOpenI(openI === i ? null : i)}><b>{title}</b></button>
              <Button size="sm" variant="ghost" icon="arrow-up" aria-label="Move up" disabled={!i} onClick={() => move(i, -1)} />
              <Button size="sm" variant="ghost" icon="arrow-down" aria-label="Move down" disabled={i === value.length - 1} onClick={() => move(i, 1)} />
              <Button size="sm" variant="ghost" className="btn-danger" icon="trash" aria-label="Remove" onClick={() => onChange(value.filter((_, j) => j !== i))} />
            </div>
            {openI === i && <div className="wb-li-body">{f.fields.map(sf => <FieldEditor key={sf.k} f={sf} value={row[sf.k]} onChange={v => upd(i, sf.k, v)} />)}</div>}
          </div>
        );
      })}
      <Button size="sm" icon="plus" onClick={() => { onChange([...value, Object.fromEntries(f.fields.map(sf => [sf.k, ""]))]); setOpenI(value.length); }}>{f.add || "Add"}</Button>
    </div>
  );
}

function ImageField({ label, value, onChange }) {
  const [busy, setBusy] = useState(false);
  const input = useRef();
  const pick = async e => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) return toast("Images can be up to 3 MB.", true);
    setBusy(true);
    const fd = new FormData(); fd.append("file", file);
    try { const r = await upload("/api/site/images", fd); onChange(r.url); toast("Image uploaded"); } catch (er) { fail(er); }
    setBusy(false);
  };
  return (
    <Field label={label}>
      <div className="wb-img">
        <div className="wb-img-thumb">{value ? <img src={value} alt="" /> : <Icon name="image" />}</div>
        <div className="grow stack-xs">
          <input className="input" value={value} placeholder="Paste an image link or upload" onChange={e => onChange(e.target.value)} />
          <div className="row-xs">
            <Button size="sm" icon="upload" busy={busy} busyLabel="Uploading…" onClick={() => input.current.click()}>Upload</Button>
            {value && <Button size="sm" variant="ghost" onClick={() => onChange("")}>Remove</Button>}
          </div>
        </div>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={pick} />
      </div>
    </Field>
  );
}

/* ---------------------------------------------------------------- design */

function Design({ draft, meta, edit }) {
  const t = draft.theme;
  const set = (k, v) => edit(d => { d.theme[k] = v; });
  const applyPreset = key => edit(d => { const { label, ...p } = meta.presets[key]; void label; Object.assign(d.theme, p, { preset: key }); });
  return <>
    <h4 className="dr-sub" style={{ marginTop: 4 }}>Theme</h4>
    <div className="wb-presets">
      {Object.entries(meta.presets).map(([k, p]) => (
        <button key={k} type="button" className={`wb-preset ${t.preset === k ? "on" : ""}`} onClick={() => applyPreset(k)} style={{ background: p.bg, color: p.text }}>
          <span className="wb-preset-art"><i style={{ background: `linear-gradient(135deg, ${p.accent}, ${p.accent2})` }} /><em style={{ background: p.surface }} /><em style={{ background: p.surface, width: "60%" }} /></span>
          <span className="wb-preset-name" style={{ fontFamily: `'${p.font_head}', sans-serif` }}>{p.label}</span>
        </button>))}
    </div>

    <h4 className="dr-sub">Colours</h4>
    <div className="wb-colors">{COLOR_LABELS.map(([k, l]) => <ColorInput key={k} label={l} value={t[k]} onChange={v => edit(d => { d.theme[k] = v; d.theme.preset = "custom"; })} />)}</div>

    <h4 className="dr-sub">Fonts</h4>
    <div className="row-2">
      {[["font_head", "Headings"], ["font_body", "Body text"]].map(([k, l]) => (
        <Field key={k} label={l}><select className="select" value={t[k]} onChange={e => set(k, e.target.value)} style={{ fontFamily: `'${t[k]}', sans-serif` }}>
          {meta.fonts.map(f => <option key={f} value={f}>{f}</option>)}</select></Field>))}
    </div>
    <FontSample head={t.font_head} body={t.font_body} />

    <h4 className="dr-sub">Style</h4>
    <Field label={`Corner roundness · ${t.radius}px`}>
      <input type="range" className="range" min={0} max={32} value={t.radius} onChange={e => set("radius", +e.target.value)} />
    </Field>
    {Object.entries(CHOICE_LABELS).map(([k, [label, opts]]) => (
      <Field key={k} label={label} style={{ marginTop: 12 }}><Seg size="sm" value={t[k]} onChange={v => set(k, v)} options={meta.choices[k].map(v => [v, opts[v] || v])} /></Field>))}
    <div className="wb-switch" style={{ marginTop: 14 }}><Switch checked={t.animate} onChange={v => set("animate", v)}>Animate sections as visitors scroll</Switch></div>
  </>;
}

function ColorInput({ label, value, onChange }) {
  const [txt, setTxt] = useState(value);
  useEffect(() => setTxt(value), [value]);
  const bad = !HEX.test(txt);
  return (
    <label className={`wb-color ${bad ? "bad" : ""}`}>
      <span className="wb-swatch" style={{ background: value }}><input type="color" value={value} onChange={e => onChange(e.target.value)} aria-label={label} /></span>
      <span className="grow"><small>{label}</small>
        <input className="wb-hex" value={txt} maxLength={7} spellCheck={false} onChange={e => { const v = e.target.value.startsWith("#") ? e.target.value : "#" + e.target.value; setTxt(v); if (HEX.test(v)) onChange(v.toLowerCase()); }}
          onBlur={() => setTxt(value)} aria-invalid={bad} /></span>
    </label>
  );
}

function FontSample({ head, body }) {
  const href = useMemo(() => `https://fonts.googleapis.com/css2?${[...new Set([head, body])].map(f => "family=" + f.replace(/ /g, "+") + ":wght@400;700").join("&")}&display=swap`, [head, body]);
  return <>
    <link rel="stylesheet" href={href} />
    <div className="wb-fontsample"><b style={{ fontFamily: `'${head}', sans-serif` }}>The quick brown fox</b><span style={{ fontFamily: `'${body}', sans-serif` }}>Jumps over the lazy dog. 0123456789</span></div>
  </>;
}

/* ---------------------------------------------------------------- details */

function Details({ draft, edit, slug, onSlug, s, unpublish, resetAll, langs }) {
  const [addr, setAddr] = useState(slug || "");
  const [addrErr, setAddrErr] = useState("");
  const [busy, setBusy] = useState(false);
  const p = draft.profile, seo = draft.seo;
  const saveSlug = async () => {
    setAddrErr("");
    if (!/^[a-z0-9][a-z0-9-]{1,38}$/.test(addr)) return setAddrErr("Use 2–39 lowercase letters, numbers or dashes.");
    setBusy(true);
    try { await api("/api/portfolio/settings", { method: "PUT", json: { slug: addr } }); onSlug(addr); toast("Address saved"); }
    catch (e) { e.field ? setAddrErr(e.message) : fail(e); }
    setBusy(false);
  };
  return <>
    <h4 className="dr-sub" style={{ marginTop: 4 }}>Website address</h4>
    <Field error={addrErr} hint="Your site's public link. Changing it breaks links you've already shared.">
      <div className="wb-addr"><span>{location.host}/p/</span><input className="input" value={addr} onChange={e => setAddr(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} />
        <Button size="sm" busy={busy} disabled={addr === slug} onClick={saveSlug}>Save</Button></div>
    </Field>
    <div className="wb-pubstate">
      {s.online ? <><span className="wb-dot live" /><span className="grow">Live · published {ago(s.published_at)}</span>
        <Button size="sm" variant="ghost" className="btn-danger" onClick={unpublish}>Unpublish</Button></>
        : <><span className="wb-dot" /><span className="grow help">Not published. Visitors see “not found”.</span></>}
    </div>

    <h4 className="dr-sub">You</h4>
    <Field label="Name shown on the site"><input className="input" value={p.name} maxLength={80} onChange={e => edit(d => { d.profile.name = e.target.value; })} /></Field>
    <div className="wb-socials">
      {Object.entries(SOCIAL_LABELS).map(([k, l]) => (
        <Field key={k} label={l}><input className="input" value={p.socials[k] || ""} placeholder={k === "email" ? "you@example.com" : "https://…"}
          onChange={e => edit(d => { d.profile.socials[k] = e.target.value; })} /></Field>))}
    </div>

    <h4 className="dr-sub">Search & sharing</h4>
    <SeoScore draft={draft} slug={slug} online={s.online} />
    <Field label="Page title" hint={`${(seo.title || "").length}/60 · shown in Google and browser tabs`} style={{ marginTop: 14 }}><input className="input" value={seo.title} maxLength={90} onChange={e => edit(d => { d.seo.title = e.target.value; })} /></Field>
    <Field label="Description" hint={`${(seo.description || "").length}/160 · shown under the title in search results`} style={{ marginTop: 12 }}>
      <textarea className="textarea" rows={3} maxLength={300} value={seo.description} onChange={e => edit(d => { d.seo.description = e.target.value; })} /></Field>
    <div className="wb-serp"><small>{location.host} › p › {slug || "your-name"}</small><b>{seo.title || p.name}</b><span>{seo.description}</span></div>
    <div style={{ marginTop: 12 }}><ImageField label="Share image (shown when your link is posted on LinkedIn, WhatsApp, X…)" value={seo.image || ""} onChange={v => edit(d => { d.seo.image = v; })} /></div>
    <SocialCard seo={seo} name={p.name} draft={draft} />
    <div className="row-2" style={{ marginTop: 12 }}>
      <Field label="Language"><select className="select" value={seo.lang || "en"} onChange={e => edit(d => { d.seo.lang = e.target.value; })}>
        {Object.entries(langs).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      <Field label="Tab icon" opt="(an emoji)"><input className="input" style={{ fontSize: 18, textAlign: "center" }} value={seo.favicon} maxLength={4} onChange={e => edit(d => { d.seo.favicon = e.target.value; })} /></Field>
    </div>
    <div className="wb-switch" style={{ marginTop: 14 }}><Switch checked={seo.index !== false} onChange={v => edit(d => { d.seo.index = v; })}>Show my site in Google and other search engines</Switch></div>
    <Field label="Google Search Console verification" opt="(optional)" style={{ marginTop: 12 }}
      hint={<>In <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer">Search Console</a> add your site URL, choose “HTML tag” and paste it here. Then publish.</>}>
      <input className="input" value={seo.google || ""} placeholder='<meta name="google-site-verification" content="…">' onChange={e => edit(d => { d.seo.google = e.target.value; })} /></Field>

    <h4 className="dr-sub">More</h4>
    <div className="wb-more">
      <Button size="sm" variant="ghost" className="btn-danger" icon="refresh" onClick={resetAll}>Start over</Button>
    </div>
  </>;
}

function seoChecks(draft, slug, online) {
  const { seo, profile, sections } = draft;
  const on = sections.filter(x => x.on);
  const hero = on.find(x => x.type === "hero");
  const words = on.map(x => [x.data.text, x.data.subtitle, ...(x.data.items || []).map(i => Object.values(i).join(" "))].join(" ")).join(" ").split(/\s+/).filter(Boolean).length;
  const tl = (seo.title || "").length, dl = (seo.description || "").length;
  const imgs = on.filter(x => ["hero", "about"].includes(x.type) && x.data.image).length;
  return [
    [!!slug && online, "Site is published", "Publish so search engines can find it."],
    [seo.index !== false, "Search engines allowed", "Turn on “Show my site in Google”."],
    [tl >= 25 && tl <= 60, "Title is 25–60 characters", `Yours is ${tl}. Aim for “Name · Role”.`],
    [(seo.title || "").toLowerCase().includes((profile.name || "").split(" ")[0].toLowerCase()), "Your name is in the title", "People search for your name: include it."],
    [dl >= 70 && dl <= 160, "Description is 70–160 characters", `Yours is ${dl}. Say what you do and what you're looking for.`],
    [!!hero && !!hero.data.title, "Page has a main headline", "Keep the Intro section on, with a headline."],
    [words >= 150, "Enough text to understand you", `About ${words} words so far. Add an About section with 2–3 short paragraphs.`],
    [!!(seo.image || (hero && hero.data.image)), "Has a share image", "Add a photo or share image so links look good when posted."],
    [Object.entries(profile.socials).filter(([k, v]) => v && k !== "email").length >= 2, "Linked to your profiles", "Add GitHub and LinkedIn. It helps Google connect them to you."],
    [on.some(x => x.type === "contact"), "Has a contact section", "Add one so recruiters can reach you."],
    [imgs > 0 || on.some(x => x.type === "projects"), "Shows your work", "Add a Projects section."],
  ];
}

function SeoScore({ draft, slug, online }) {
  const checks = seoChecks(draft, slug, online);
  const passed = checks.filter(c => c[0]).length;
  const pct = Math.round(passed / checks.length * 100);
  const tone = pct >= 85 ? "ok" : pct >= 60 ? "warn" : "bad";
  const [open, setOpen] = useState(pct < 100);
  return (
    <div className={`wb-seo ${tone}`}>
      <button type="button" className="wb-seo-head" onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 36 36" className="wb-ring"><circle cx="18" cy="18" r="15.5" /><motion.circle cx="18" cy="18" r="15.5" initial={false} animate={{ strokeDasharray: `${pct * .974} 100` }} /></svg>
        <span className="grow"><b>SEO score {pct}</b><small>{passed} of {checks.length} checks passed</small></span>
        <Icon name="chevron-down" className={`wb-caret ${open ? "up" : ""}`} />
      </button>
      <AnimatePresence initial={false}>{open && (
        <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
          {checks.map(([ok, label, tip]) => <li key={label} className={ok ? "ok" : ""}><span className="wb-chk">{ok ? <Icon name="check" /> : <Icon name="x" />}</span><span><b>{label}</b>{!ok && <small>{tip}</small>}</span></li>)}
        </motion.ul>)}</AnimatePresence>
    </div>
  );
}

function SocialCard({ seo, name, draft }) {
  const hero = draft.sections.find(x => x.type === "hero" && x.on);
  const img = seo.image || hero?.data.image;
  return (
    <div className="wb-og">
      <small className="help">Link preview</small>
      <div className="wb-og-card">
        {img ? <img src={img} alt="" /> : <div className="wb-og-ph" style={{ background: `linear-gradient(135deg, ${draft.theme.accent}, ${draft.theme.accent2})` }}>{name}</div>}
        <div><small>{location.host}</small><b>{seo.title || name}</b><span>{seo.description}</span></div>
      </div>
    </div>
  );
}
