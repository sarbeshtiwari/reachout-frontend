import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { api, upload } from "../lib/api";
import { ext, kb } from "../lib/format";
import { useApp } from "../lib/store";
import { Button, Empty, FileIcon, FormError, Icon, Spinner, fail, modal, toast } from "../ui/kit";
import { Dropzone } from "../ui/shared";

export default function Files() {
  const app = useApp();
  const { me } = app;
  const docs = app.data.documents;
  const [err, setErr] = useState("");
  const [prog, setProg] = useState(null);
  const used = docs.reduce((a, d) => a + d.size, 0);

  const onFiles = async list => {
    setErr("");
    const allowed = new Set(me.allowed_docs || []), max = (me.max_file_mb || 10) * 1048576;
    const bad = list.find(f => !allowed.has(ext(f.name)));
    if (bad) return setErr(`“${bad.name}” isn't a supported file type. Use PDF, Word, Excel, PowerPoint, text or image files.`);
    const big = list.find(f => f.size > max);
    if (big) return setErr(`“${big.name}” is larger than ${me.max_file_mb} MB.`);
    if (list.find(f => !f.size)) return setErr("One of the files is empty.");
    if (used + list.reduce((a, f) => a + f.size, 0) > (me.max_files_mb || 25) * 1048576) return setErr(`That would go over your ${me.max_files_mb} MB storage. Delete some files first.`);
    const existing = new Set(docs.map(d => d.name));
    const clash = list.filter(f => existing.has(f.name.replace(/[^\w.-]+/g, "_")));
    if (clash.length && !await modal({ title: "Replace existing file?", text: `${clash.map(f => f.name).join(", ")} already exists. Uploading will replace it.`, confirm: "Replace" })) return;
    const fd = new FormData(); list.forEach(f => fd.append("files", f));
    setProg({ p: 0, n: list.length });
    try { await upload("/api/documents", fd, p => setProg(x => ({ ...x, p }))); await app.reload(); toast(`Uploaded ${list.length} file${list.length === 1 ? "" : "s"}`); }
    catch (e) { setErr(e.message); }
    setProg(null);
  };
  const del = async name => {
    if (!await modal({ title: `Delete ${name}?`, text: "It will no longer be attached to new messages.", confirm: "Delete", danger: true })) return;
    try { await api("/api/documents/" + encodeURIComponent(name), { method: "DELETE" }); app.setData(d => ({ ...d, documents: d.documents.filter(x => x.name !== name) })); toast("File deleted"); }
    catch (e) { fail(e); }
  };
  return (
    <div>
      <Dropzone onFiles={onFiles} multiple busy={!!prog}>
        <motion.div className="dz-ic" animate={prog ? { y: [0, -4, 0] } : {}} transition={{ repeat: Infinity, duration: 1 }}><Icon name="upload" /></motion.div>
        <b>{prog ? <><Spinner /> {prog.p >= 1 ? "Encrypting and saving…" : `Uploading ${prog.n} file${prog.n === 1 ? "" : "s"}…`}</> : "Drop files here or click to upload"}</b>
        <span className="help">PDF, Word, Excel, PowerPoint, text or images · up to {me.max_file_mb || 10} MB each · {kb(used)} of {me.max_files_mb || 25} MB used</span>
        <div className="upbar" style={{ visibility: prog ? "visible" : "hidden" }}><div style={{ width: `${(prog?.p || 0) * 100}%` }} /></div>
      </Dropzone>
      <FormError>{err}</FormError>
      <div className="quota"><div className="progress"><motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, 100 * used / ((me.max_files_mb || 25) * 1048576))}%` }} /></div></div>
      <div className="files">
        <AnimatePresence>
          {docs.map((d, i) => (
            <motion.div key={d.name} layout className="card file hover" initial={{ opacity: 0, scale: .95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .9 }} transition={{ delay: i * .03 }}>
              <FileIcon name={d.name} /><div className="n"><b title={d.name}>{d.name}</b><span>{kb(d.size)}</span></div>
              <a className="btn btn-sm btn-ghost btn-icon" target="_blank" rel="noopener" href={`/api/documents/${encodeURIComponent(d.name)}`} title="Open"><Icon name="eye" /></a>
              <Button size="sm" variant="ghost" className="btn-danger" icon="trash" aria-label={`Delete ${d.name}`} onClick={() => del(d.name)} />
            </motion.div>))}
        </AnimatePresence>
        {!docs.length && <div style={{ gridColumn: "1/-1" }}><Empty icon="file" title="No files yet">Upload a file, like a resume or brochure, to attach it to your messages.</Empty></div>}
      </div>
    </div>
  );
}
