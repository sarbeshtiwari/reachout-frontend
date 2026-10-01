import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { bracesOk } from "../lib/format";
import { useApp } from "../lib/store";
import { Button, Field, Icon, applyError, fail, modal, spring, toast } from "../ui/kit";
import { FieldChips, insertAt } from "../ui/shared";
import { extraCols } from "./Campaign";

export default function Templates() {
  const app = useApp();
  const tpls = app.data.templates;
  const [id, setId] = useState(tpls[0]?.id || "new");
  const cur = tpls.find(t => t.id === id);
  const [v, setV] = useState({ name: "", subject: "", body: "" });
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState("");
  const bodyRef = useRef(null);
  useEffect(() => { const t = tpls.find(x => x.id === id) || { name: "", subject: "", body: "Hi {name},\n\n" }; setV({ name: t.name, subject: t.subject || "", body: t.body }); setDirty(false); setErrors({}); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const leave = async () => !dirty || modal({ title: "Discard changes?", text: "You have unsaved changes to this template.", confirm: "Discard", danger: true });
  const pick = async nid => { if (nid !== id && await leave()) setId(nid); };
  const set = k => e => { setV(x => ({ ...x, [k]: e.target.value })); setDirty(true); setErrors(x => ({ ...x, [k]: "" })); };
  const save = async e => {
    e.preventDefault();
    const d = { name: v.name.trim(), subject: v.subject.trim(), body: v.body };
    if (!d.name) return setErrors({ name: "Template name is required." });
    if (tpls.some(t => t.name.toLowerCase() === d.name.toLowerCase() && t.id !== id)) return setErrors({ name: "You already have a template with this name." });
    if (!bracesOk(d.subject)) return setErrors({ subject: "There's an unmatched { or }. Fields look like {name}." });
    if (!d.body.trim()) return setErrors({ body: "Message is required." });
    if (!bracesOk(d.body)) return setErrors({ body: "There's an unmatched { or }. Fields look like {name}." });
    if (id !== "new") d.id = id;
    setBusy("save");
    try {
      const t = await api("/api/templates", { json: d });
      app.setData(x => ({ ...x, templates: x.templates.some(y => y.id === t.id) ? x.templates.map(y => y.id === t.id ? t : y) : [...x.templates, t] }));
      setId(t.id); setDirty(false); toast("Template saved");
    } catch (err) { applyError(err, setErrors); }
    setBusy("");
  };
  const del = async () => {
    if (!await modal({ title: "Delete this template?", text: "This can't be undone.", confirm: "Delete", danger: true })) return;
    try { await api("/api/templates/" + id, { method: "DELETE" }); const rest = tpls.filter(t => t.id !== id); app.setData(x => ({ ...x, templates: rest })); setId(rest[0]?.id || "new"); toast("Template deleted"); }
    catch (err) { fail(err); }
  };
  const fields = ["name", "company", "phone", "email", ...extraCols(app.data.recipients), "sender_name", "sender_phone", "sender_email"];
  return (
    <div className="master">
      <div className="list-col">
        <div className="list">
          {tpls.map((t, i) => (
            <motion.button key={t.id} className={t.id === id ? "on" : ""} onClick={() => pick(t.id)} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * .04 }}>
              {t.id === id && <motion.span className="list-bg" layoutId="tpl-on" transition={spring} />}
              <span className="list-l"><Icon name="message" /><span className="t"><b>{t.name || "Untitled"}</b><span>{(t.body || "").slice(0, 60)}</span></span></span>
            </motion.button>))}
          {id === "new" && <div className="list-new"><Icon name="plus" /><b>New template</b></div>}
        </div>
        <Button icon="plus" onClick={async () => { if (await leave()) setId("new"); }}>New template</Button>
      </div>
      <AnimatePresence mode="wait">
        <motion.form key={id} className="card card-pad" onSubmit={save} noValidate initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: .2 }}>
          <div className="row-2">
            <Field label="Name" error={errors.name}><input className="input" value={v.name} maxLength={80} onChange={set("name")} autoFocus={id === "new"} /></Field>
            <Field label="Email subject" opt="(optional)" error={errors.subject}><input className="input" value={v.subject} maxLength={200} onChange={set("subject")} /></Field>
          </div>
          <div className="field" style={{ marginTop: 14 }}>
            <div className="label-row"><label htmlFor="tBody">Message</label><span className={`help counter ${v.body.length > 4500 ? "near" : ""}`}>{v.body.length.toLocaleString()} / 5,000</span></div>
            <textarea id="tBody" ref={bodyRef} className="textarea" rows={14} maxLength={5000} value={v.body} onChange={set("body")} aria-invalid={errors.body ? "true" : undefined} />
            {errors.body && <span className="field-error">{errors.body}</span>}
            <FieldChips names={fields} onPick={t => { setV(x => ({ ...x, body: insertAt(bodyRef.current, x.body, t) })); setDirty(true); }} />
          </div>
          <div className="form-actions">
            {id !== "new" && tpls.length > 1 && <Button variant="danger" icon="trash" onClick={del}>Delete</Button>}
            <span className="grow" />{dirty && <span className="help">Unsaved changes</span>}
            <Button type="submit" variant="primary" busy={busy === "save"} busyLabel="Saving…">Save template</Button>
          </div>
        </motion.form>
      </AnimatePresence>
      {cur ? null : null}
    </div>
  );
}
