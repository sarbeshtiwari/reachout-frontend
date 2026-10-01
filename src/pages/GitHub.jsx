import Editor, { DiffEditor } from "@monaco-editor/react";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { ago, safeHref } from "../lib/format";
import { go } from "../lib/router";
import { useApp } from "../lib/store";
import { Alert, Avatar, Badge, Button, Check, Chips, Drawer, DrawerHead, Empty, Field, FileIcon, FormError, Icon, Pager, Seg, Sk, SkBlock, applyError, fail, modal, toast, useDebounced, usePager } from "../ui/kit";

const LANG = { js: "javascript", jsx: "javascript", mjs: "javascript", ts: "typescript", tsx: "typescript", py: "python", md: "markdown", markdown: "markdown", json: "json",
  html: "html", htm: "html", css: "css", scss: "scss", less: "less", yml: "yaml", yaml: "yaml", sh: "shell", bash: "shell", java: "java", kt: "kotlin", go: "go", rs: "rust",
  rb: "ruby", php: "php", c: "c", h: "c", cpp: "cpp", hpp: "cpp", cs: "csharp", swift: "swift", dart: "dart", sql: "sql", xml: "xml", toml: "ini", ini: "ini", dockerfile: "dockerfile" };
const langOf = p => LANG[(p.split("/").pop().toLowerCase() === "dockerfile" ? "dockerfile" : p.split(".").pop().toLowerCase())] || "plaintext";
const useDark = () => { const [d, setD] = useState(document.documentElement.dataset.theme === "dark"); useEffect(() => { const f = () => setD(document.documentElement.dataset.theme === "dark"); addEventListener("themechange", f); return () => removeEventListener("themechange", f); }, []); return d; };

export default function GitHub({ route }) {
  const app = useApp();
  const [status, setStatus] = useState(null);
  const load = useCallback(() => api("/api/gh/status").then(s => { setStatus(s); app.setLinks(l => ({ ...l, github: s.connected })); }).catch(fail), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  if (!status) return <SkBlock h={320} />;
  if (!status.connected) return <Connect onDone={load} />;
  const [owner, name] = (route.param || "").split(":");
  return owner && name ? <Repo key={owner + "/" + name} owner={owner} name={name} /> : <Repos status={status} onDisconnect={load} />;
}

function Connect({ onDone }) {
  const [token, setToken] = useState("");
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault(); setErrors({});
    if (!token.trim()) return setErrors({ token: "Paste your token." });
    setBusy(true);
    try { const r = await api("/api/gh/connect", { json: { token: token.trim() } }); toast(`Connected as ${r.login}`); onDone(); } catch (er) { applyError(er, setErrors); }
    setBusy(false);
  };
  return (
    <motion.form className="card card-pad connect-card" onSubmit={submit} noValidate initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ maxWidth: 640 }}>
      <motion.div className="connect-ic gh" initial={{ scale: .5, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 14 }}><Icon name="github" /></motion.div>
      <h3>Connect your GitHub account</h3>
      <p className="help">Reachout uses a <b>personal access token</b> to read and update your repositories. It's stored encrypted and only used from this app.</p>
      <ol className="howto">
        <li>Open <a href="https://github.com/settings/tokens/new?scopes=repo,workflow&description=Reachout" target="_blank" rel="noopener noreferrer">GitHub → Settings → Developer settings → Tokens (classic)</a>. The <b>repo</b> and <b>workflow</b> permissions are pre-selected.</li>
        <li>Pick an expiry, click <b>Generate token</b>, and copy it (it starts with <code>ghp_</code>).</li>
        <li>Paste it below.</li>
      </ol>
      <Field label="Personal access token" error={errors.token}><input className="input" type="password" autoComplete="off" placeholder="ghp_…" value={token} onChange={e => setToken(e.target.value)} /></Field>
      <div className="form-actions"><span className="grow" /><Button type="submit" variant="primary" icon="link" busy={busy} busyLabel="Connecting…">Connect GitHub</Button></div>
    </motion.form>
  );
}

const OWN = [
  ["mine", "Created by me", r => r.mine && !r.fork],
  ["forks", "Forked", r => r.mine && r.fork],
  ["contrib", "Contributed", r => !r.mine && !r.org],
  ["org", "Organisations", r => !r.mine && r.org],
  ["all", "All", () => true],
];

function Repos({ status, onDisconnect }) {
  const [repos, setRepos] = useState(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [own, setOwn] = useState("mine");
  const [vis, setVis] = useState("");
  const [lang, setLang] = useState("");
  const [sort, setSort] = useState("updated");
  const [archived, setArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const dq = useDebounced(q);
  const top = useRef(null);
  useEffect(() => { api("/api/gh/repos").then(r => setRepos(r.repos.map(x => ({ ...x, mine: x.owner.toLowerCase() === status.login.toLowerCase(), org: x.owner_type === "Organization" })))).catch(e => setErr(e.message)); }, [status.login]);
  const all = repos || [];
  const langs = useMemo(() => [...new Set(all.map(r => r.language).filter(Boolean))].sort(), [all]);
  const base = all.filter(r => (archived || !r.archived) && (!vis || (vis === "private" ? r.private : !r.private)) && (!lang || r.language === lang)
    && (!dq || [r.full_name, r.description, r.language].some(v => (v || "").toLowerCase().includes(dq.toLowerCase()))));
  const rows = useMemo(() => {
    const fn = OWN.find(o => o[0] === own)[2];
    const by = { updated: (a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""), name: (a, b) => a.name.localeCompare(b.name),
      stars: (a, b) => b.stargazers_count - a.stargazers_count, size: (a, b) => (b.size || 0) - (a.size || 0) }[sort];
    return base.filter(fn).sort(by);
  }, [base, own, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const pg = usePager(rows, [own, vis, lang, sort, archived, dq].join("|"), 24);
  const disconnect = async () => { if (!await modal({ title: "Disconnect GitHub?", text: "Reachout will forget your token. Your repositories aren't affected.", confirm: "Disconnect", danger: true })) return; await api("/api/gh/disconnect", { json: {} }).catch(fail); onDisconnect(); };
  const filtered = vis || lang || archived || dq;
  return (
    <div ref={top}>
      <div className="toolbar">
        <div className="gh-user">{status.avatar ? <img src={status.avatar} alt="" /> : <Avatar name={status.login} />}<div><b>{status.name || status.login}</b><span className="help">@{status.login} · <button className="link-btn" onClick={disconnect}>Disconnect</button></span></div></div>
        <span className="grow" />
        <Button icon="plus" variant="primary" onClick={() => setCreating(true)}>New repository</Button>
      </div>
      <div className="card gh-filters">
        <Chips value={own} onChange={setOwn} options={OWN.map(([k, l, fn]) => [k, l, repos ? base.filter(fn).length : undefined])} />
        <div className="gh-filter-row">
          <div className="search"><Icon name="search" /><input className="input" type="search" placeholder="Find a repository…" value={q} onChange={e => setQ(e.target.value)} /></div>
          <select className="select auto" value={vis} onChange={e => setVis(e.target.value)} aria-label="Visibility"><option value="">Public &amp; private</option><option value="public">Public only</option><option value="private">Private only</option></select>
          <select className="select auto" value={lang} onChange={e => setLang(e.target.value)} aria-label="Language"><option value="">All languages</option>{langs.map(l => <option key={l}>{l}</option>)}</select>
          <select className="select auto" value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort"><option value="updated">Recently updated</option><option value="name">Name A–Z</option><option value="stars">Most stars</option><option value="size">Largest</option></select>
          <Check checked={archived} onChange={setArchived}>Show archived</Check>
          {filtered && <button className="link-btn" onClick={() => { setQ(""); setVis(""); setLang(""); setArchived(false); }}>Clear filters</button>}
        </div>
      </div>
      {err && <div className="card"><Empty icon="alert" title="Couldn't load repositories">{err}</Empty></div>}
      <div className="gh-repo-grid">
        {!repos && !err && Array.from({ length: 6 }, (_, i) => <div key={i} className="card sk-card" style={{ height: 130 }} />)}
        <AnimatePresence mode="popLayout" initial={false}>
          {pg.items.map((r, i) => (
            <motion.button layout key={r.full_name} className="card gh-repo hover" onClick={() => go(`github/${r.owner}:${r.name}`)} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 12) * .025 } }} exit={{ opacity: 0, scale: .96 }}>
              <div className="gh-repo-top"><Icon name={r.fork ? "branch" : "folder"} /><b>{r.mine ? r.name : r.full_name}</b>
                <Badge dot={false}>{r.private ? "Private" : "Public"}</Badge>{r.fork && <Badge tone="violet" dot={false}>Fork</Badge>}{!r.mine && <Badge tone="brand" dot={false}>{r.org ? "Org" : "Collaborator"}</Badge>}{r.archived && <Badge tone="warn" dot={false}>Archived</Badge>}</div>
              <p>{r.description || "No description"}</p>
              <div className="gh-repo-meta">{r.language && <span><i className="lang-dot" />{r.language}</span>}<span><Icon name="star" />{r.stargazers_count}</span><span><Icon name="branch" />{r.forks_count}</span><span>Updated {ago(r.updated_at)}</span></div>
            </motion.button>))}
        </AnimatePresence>
        {repos && !rows.length && <div style={{ gridColumn: "1/-1" }} className="card"><Empty icon="folder" title={repos.length ? "No repositories match" : "No repositories yet"}>{repos.length ? "Try another filter." : "Create your first one with New repository."}</Empty></div>}
      </div>
      {rows.length > 0 && <div className="card" style={{ marginTop: 14 }}><Pager p={pg} label="repositories" sizes={[12, 24, 48, 96]} scrollTo={top} /></div>}
      <Drawer open={creating} onClose={() => setCreating(false)} label="New repository">{creating && <NewRepo onClose={() => setCreating(false)} />}</Drawer>
    </div>
  );
}

function NewRepo({ onClose }) {
  const [v, setV] = useState({ name: "", description: "", private: true, readme: true });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault(); setErrors({});
    if (!/^[A-Za-z0-9_.-]{1,100}$/.test(v.name.trim())) return setErrors({ name: "Use letters, numbers, - _ and . only." });
    setBusy(true);
    try { const r = await api("/api/gh/repos", { json: { ...v, name: v.name.trim() } }); toast("Repository created"); onClose(); go(`github/${r.owner}:${r.name}`); } catch (er) { applyError(er, setErrors); }
    setBusy(false);
  };
  return <>
    <DrawerHead logo={<span className="co-logo lg grad"><Icon name="github" /></span>} title="New repository" onClose={onClose} />
    <form className="dr-pad" onSubmit={submit} noValidate>
      <Field label="Name" error={errors.name}><input className="input" placeholder="my-project" value={v.name} onChange={e => setV(x => ({ ...x, name: e.target.value }))} autoFocus /></Field>
      <Field label="Description" opt="(optional)" style={{ marginTop: 12 }}><input className="input" value={v.description} onChange={e => setV(x => ({ ...x, description: e.target.value }))} /></Field>
      <div className="stack-sm" style={{ marginTop: 14 }}><Check checked={v.private} onChange={x => setV(y => ({ ...y, private: x }))}>Private</Check><Check checked={v.readme} onChange={x => setV(y => ({ ...y, readme: x }))}>Add a README</Check></div>
      <div className="form-actions"><span className="grow" /><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" busy={busy} busyLabel="Creating…">Create repository</Button></div>
    </form>
  </>;
}

/* ---------------------------------------------------------------- repository view */
function Repo({ owner, name }) {
  const dark = useDark();
  const [repo, setRepo] = useState(null);
  const [err, setErr] = useState("");
  const [branch, setBranch] = useState("");
  const [tree, setTree] = useState(null);
  const [files, setFiles] = useState({}); // path -> { kind, orig, value, sha, isNew, deleted, data, html_url }
  const [active, setActive] = useState("");
  const [openOrder, setOpenOrder] = useState([]);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [view, setView] = useState("edit");
  const [tab, setTab] = useState("code");
  const [md, setMd] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [formError, setFormError] = useState("");
  const base = `${owner}/${name}`;

  const loadTree = useCallback(async br => {
    const d = await api(`/api/gh/tree/${base}?ref=${encodeURIComponent(br)}`);
    setTree(d);
    if (d.truncated) toast("This repository is very large; some files aren't listed.", true);
    return d;
  }, [base]);
  useEffect(() => {
    (async () => {
      try {
        const r = await api(`/api/gh/repo/${base}`);
        setRepo(r); setBranch(r.default_branch);
        const t = await loadTree(r.default_branch);
        const readme = t.items.find(n => /^readme(\.md|\.markdown)?$/i.test(n.path));
        if (readme) openFile(readme.path, r.default_branch, t);
      } catch (e) { setErr(e.message); }
    })();
  }, [base]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = useMemo(() => Object.entries(files).filter(([, f]) => f.deleted || f.isNew || (f.kind === "text" && f.value !== f.orig)), [files]);
  useEffect(() => { const w = e => { if (dirty.length) { e.preventDefault(); e.returnValue = ""; } }; addEventListener("beforeunload", w); return () => removeEventListener("beforeunload", w); }, [dirty.length]);

  async function openFile(path, br = branch, t = tree) {
    setActive(path); setView("edit"); setMd("");
    setOpenOrder(o => o.includes(path) ? o : [...o, path]);
    if (files[path]) return;
    const node = t?.items.find(n => n.path === path);
    setFiles(f => ({ ...f, [path]: { loading: true, sha: node?.sha } }));
    try {
      const d = await api(`/api/gh/file/${base}?path=${encodeURIComponent(path)}&ref=${encodeURIComponent(br)}`);
      setFiles(f => ({ ...f, [path]: { ...d, orig: d.content ?? "", value: d.content ?? "", loading: false } }));
    } catch (e) { fail(e); setFiles(f => { const x = { ...f }; delete x[path]; return x; }); setOpenOrder(o => o.filter(p => p !== path)); }
  }
  const closeTab = async path => {
    const f = files[path];
    if (f && (f.isNew || f.deleted || f.value !== f.orig) && !await modal({ title: "Discard changes to this file?", text: path, confirm: "Discard", danger: true })) return;
    setFiles(x => { const y = { ...x }; delete y[path]; return y; });
    setOpenOrder(o => { const n = o.filter(p => p !== path); if (active === path) setActive(n.at(-1) || ""); return n; });
  };
  const newFile = async () => {
    const path = (await modal({ title: "New file", text: "Path inside the repository, e.g. src/utils.js or docs/setup.md.", input: "", confirm: "Create" }) || "").trim().replace(/^\/+/, "");
    if (!path) return;
    if (path.split("/").some(s => !s || s === "." || s === "..")) return toast("That isn't a valid file path.", true);
    if (tree.items.some(n => n.path === path) || files[path]) return toast("A file with that path already exists.", true);
    setFiles(f => ({ ...f, [path]: { kind: "text", orig: "", value: "", isNew: true, mode: "100644" } }));
    setOpenOrder(o => [...o, path]); setActive(path);
  };
  const toggleDelete = async () => {
    const f = files[active];
    if (f.isNew) return closeTab(active);
    if (!f.deleted && !await modal({ title: `Delete ${active}?`, text: "It's removed from the repository when you commit & push.", confirm: "Delete", danger: true })) return;
    setFiles(x => ({ ...x, [active]: { ...x[active], deleted: !x[active].deleted } }));
  };
  const preview = async () => {
    if (md) return setMd("");
    setBusy("md");
    try {
      const { html } = await api("/api/gh/markdown", { json: { text: files[active].value, context: base } });
      const dir = active.includes("/") ? active.slice(0, active.lastIndexOf("/") + 1) : "";
      setMd(`<!doctype html><html><head><base href="https://github.com/${base}/raw/${encodeURIComponent(branch)}/${dir}" target="_blank"><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/github-markdown-css@5.8.1/github-markdown-${dark ? "dark" : "light"}.min.css"><style>body{margin:0;padding:24px 32px;background:${dark ? "#0d1117" : "#fff"}}.markdown-body{max-width:900px;margin:0 auto}</style></head><body><article class="markdown-body">${html}</article></body></html>`);
    } catch (e) { fail(e); }
    setBusy("");
  };
  const commit = async e => {
    e.preventDefault(); setFormError("");
    if (!dirty.length) return;
    if (!msg.trim()) return setFormError("Describe your change, e.g. “Update README with setup steps”.");
    setBusy("commit");
    try {
      const changes = dirty.map(([path, f]) => f.deleted ? { path, delete: true, mode: f.mode || "100644" } : { path, content: f.value, mode: f.mode || "100644" });
      const r = await api(`/api/gh/commit/${base}`, { json: { branch, message: msg.trim(), changes, base_head: tree.head } });
      setFiles(x => { const y = { ...x }; dirty.forEach(([p, f]) => { if (f.deleted) delete y[p]; else y[p] = { ...y[p], orig: y[p].value, isNew: false }; }); return y; });
      setOpenOrder(o => o.filter(p => !dirty.some(([dp, f]) => dp === p && f.deleted)));
      setMsg(""); await loadTree(branch);
      toast(`Pushed ${r.files} file${r.files === 1 ? "" : "s"} to ${branch}`);
    } catch (er) { setFormError(er.message); if (er.field === "conflict") toast("Pull first, then commit again. Your edits are still here.", true); }
    setBusy("");
  };
  const discardAll = async () => {
    if (!await modal({ title: "Discard all changes?", text: "Every unpushed edit, new file and deletion is lost.", confirm: "Discard all", danger: true })) return;
    setFiles(x => { const y = {}; Object.entries(x).forEach(([p, f]) => { if (!f.isNew) y[p] = { ...f, value: f.orig, deleted: false }; }); return y; });
    setOpenOrder(o => o.filter(p => !files[p]?.isNew));
  };
  const pull = async () => {
    setBusy("pull");
    try {
      const before = tree.head; const t = await loadTree(branch);
      let updated = 0, kept = 0;
      for (const [p, f] of Object.entries(files)) {
        const node = t.items.find(n => n.path === p);
        if (!node || f.kind !== "text" || node.sha === f.sha) continue;
        const d = await api(`/api/gh/file/${base}?path=${encodeURIComponent(p)}&ref=${encodeURIComponent(branch)}`);
        setFiles(x => ({ ...x, [p]: { ...x[p], sha: d.sha, orig: d.content, value: x[p].value === x[p].orig ? d.content : x[p].value } }));
        f.value === f.orig ? updated++ : kept++;
      }
      toast(before === t.head ? "Already up to date." : `Pulled the latest commits${updated ? `, ${updated} open file${updated === 1 ? "" : "s"} refreshed` : ""}${kept ? `. ${kept} file${kept === 1 ? " has" : "s have"} your edits on top` : ""}.`);
    } catch (e) { fail(e); }
    setBusy("");
  };
  const switchBranch = async br => {
    if (dirty.length && !await modal({ title: "Switch branch and discard changes?", text: `You have ${dirty.length} unpushed change(s) on ${branch}.`, confirm: "Switch", danger: true })) return;
    setFiles({}); setOpenOrder([]); setActive(""); setBranch(br); setTree(null);
    try { await loadTree(br); } catch (e) { fail(e); }
  };
  const newBranch = async () => {
    const b = (await modal({ title: "New branch", text: `Created from ${branch}. Your unpushed changes come with you.`, input: "", confirm: "Create branch" }) || "").trim();
    if (!b) return;
    try { await api(`/api/gh/branch/${base}`, { json: { name: b, from: branch } }); setRepo(r => ({ ...r, branches: [...r.branches, b] })); setBranch(b); await loadTree(b); toast(`Switched to new branch ${b}`); } catch (e) { fail(e); }
  };

  if (err) return <div className="card"><Empty icon="alert" title="Couldn't open this repository" action={<Button onClick={() => go("github")}>Back to repositories</Button>}>{err}</Empty></div>;
  const f = files[active];
  return (
    <div className="gh">
      <div className="gh-bar">
        <Button variant="ghost" size="sm" icon="arrow-left" onClick={async () => { if (!dirty.length || await modal({ title: "Discard unpushed changes?", text: `You have ${dirty.length} changed file(s).`, confirm: "Discard", danger: true })) go("github"); }}>Repositories</Button>
        <b className="gh-name">{base}</b>
        {repo && <select className="select sm" value={branch} onChange={e => switchBranch(e.target.value)} aria-label="Branch">{(repo.branches.length ? repo.branches : [branch]).map(b => <option key={b}>{b}</option>)}</select>}
        <Button size="sm" icon="branch" onClick={newBranch}>New branch</Button>
        <Button size="sm" icon="download" busy={busy === "pull"} onClick={pull} title="Get the latest version from GitHub">Pull</Button>
        <span className="grow" />
        <Seg size="sm" value={tab} onChange={setTab} options={[["code", "Code", "file"], ["pulls", "Pull requests", "pr"], ["history", "History", "commit"]]} />
        {repo && <a className="btn btn-sm btn-ghost" target="_blank" rel="noopener noreferrer" href={safeHref(repo.html_url)}><Icon name="external" />Open on GitHub</a>}
      </div>
      <AnimatePresence mode="wait">
        {tab === "code" ? (
          <motion.div key="code" className="gh-code" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <aside className="card gh-tree">
              <div className="gh-tree-head">{tree ? <span className="help clip"><Icon name="commit" />{tree.empty ? "Empty repository" : `${(tree.message || "").slice(0, 40)} · ${ago(tree.date)}`}</span> : <Sk w="70%" />}<span className="grow" /><Button variant="ghost" size="sm" icon="plus" aria-label="New file" title="New file" onClick={newFile} /></div>
              <div className="gh-tree-list">{tree ? <Tree items={tree.items} files={files} active={active} collapsed={collapsed} setCollapsed={setCollapsed} onOpen={p => openFile(p)} /> : Array.from({ length: 8 }, (_, i) => <div key={i} style={{ padding: "6px 12px" }}><Sk w={`${50 + (i * 13) % 40}%`} /></div>)}</div>
            </aside>
            <div className="card gh-editor">
              {openOrder.length > 0 && <div className="gh-tabs-row">
                {openOrder.map(p => { const x = files[p]; const mod = x && (x.isNew || x.deleted || x.value !== x.orig);
                  return <div key={p} className={`gh-tab ${p === active ? "on" : ""} ${x?.deleted ? "del" : ""}`} onClick={() => { setActive(p); setMd(""); }} title={p}>
                    {p === active && <motion.span className="gh-tab-bar" layoutId="ghtab" />}<FileIcon name={p} /><span>{p.split("/").pop()}</span>{mod && <i className="dot" />}
                    <button className="x" aria-label={`Close ${p}`} onClick={e => { e.stopPropagation(); closeTab(p); }}><Icon name="x" /></button></div>; })}
              </div>}
              {f && !f.loading && <div className="gh-edit-tools">
                <span className="help mono clip">{active}</span><span className="grow" />
                {/\.(md|markdown|mdx)$/i.test(active) && f.kind === "text" && <Button size="sm" icon="eye" className={md ? "on" : ""} busy={busy === "md"} onClick={preview}>Preview</Button>}
                {f.kind === "text" && !f.isNew && <Button size="sm" icon="columns" className={view === "diff" ? "on" : ""} onClick={() => { setView(v => v === "diff" ? "edit" : "diff"); setMd(""); }}>Changes</Button>}
                <Button size="sm" variant="ghost" className="btn-danger" icon="trash" onClick={toggleDelete}>{f.deleted ? "Restore file" : "Delete file"}</Button>
              </div>}
              <div className="gh-monaco">
                {!f ? <Empty icon="file" title="Open a file">Pick a file on the left to view or edit it. Changes stay here until you commit &amp; push.</Empty>
                  : f.loading ? <div className="center"><span className="spinner" /></div>
                  : md ? <iframe className="gh-md" title="Markdown preview" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={md} />
                  : f.kind === "image" ? <div className="center"><img className="gh-img" src={f.data} alt={active} /></div>
                  : f.kind !== "text" ? <Empty icon="file" title={f.kind === "large" ? "This file is too large to edit here" : "This is a binary file"} action={f.html_url && <a className="btn btn-sm" target="_blank" rel="noopener noreferrer" href={f.html_url}>Open on GitHub</a>} />
                  : view === "diff" ? <DiffEditor key={"d" + active} original={f.orig} modified={f.value} language={langOf(active)} theme={dark ? "vs-dark" : "vs"} options={{ readOnly: true, renderSideBySide: innerWidth > 900, automaticLayout: true, minimap: { enabled: false } }} />
                  : <Editor key={active} path={active} defaultLanguage={langOf(active)} value={f.value} theme={dark ? "vs-dark" : "vs"}
                      onChange={val => setFiles(x => ({ ...x, [active]: { ...x[active], value: val ?? "" } }))}
                      options={{ readOnly: !!f.deleted, fontSize: 13.5, minimap: { enabled: innerWidth > 1200 }, scrollBeyondLastLine: false, tabSize: 2, wordWrap: "on", automaticLayout: true, smoothScrolling: true, cursorSmoothCaretAnimation: "on" }} />}
              </div>
            </div>
            <aside className="card gh-commit">
              <h3 className="sec-h"><Icon name="upload" />Commit &amp; push</h3>
              <div className="gh-changes">
                <AnimatePresence initial={false}>{dirty.length ? dirty.map(([p, x]) => (
                  <motion.button key={p} layout className="gh-ch" onClick={() => setActive(p)} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
                    <i className={`st ${x.deleted ? "del" : x.isNew ? "new" : "mod"}`}>{x.deleted ? "D" : x.isNew ? "A" : "M"}</i><span>{p}</span></motion.button>))
                  : <p className="help">No changes yet. Edit a file and it appears here.</p>}</AnimatePresence>
              </div>
              <form onSubmit={commit} noValidate>
                <Field label="Commit message"><textarea className="textarea" rows={3} style={{ minHeight: 70 }} placeholder="Describe what you changed" value={msg} onChange={e => setMsg(e.target.value)} /></Field>
                <FormError>{formError}</FormError>
                <Button type="submit" variant="primary" icon="upload" disabled={!dirty.length} busy={busy === "commit"} busyLabel="Pushing…" style={{ width: "100%", marginTop: 10 }}>Commit &amp; push</Button>
                {dirty.length > 0 && <Button variant="ghost" size="sm" style={{ width: "100%", marginTop: 6 }} onClick={discardAll}>Discard all changes</Button>}
              </form>
            </aside>
          </motion.div>
        ) : tab === "pulls" ? <motion.div key="pulls" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><Pulls base={base} repo={repo} branch={branch} /></motion.div>
          : <motion.div key="hist" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><History base={base} branch={branch} /></motion.div>}
      </AnimatePresence>
    </div>
  );
}

function Tree({ items, files, active, collapsed, setCollapsed, onOpen }) {
  const nodes = {};
  items.forEach(n => { nodes[n.path] = n; });
  Object.entries(files).forEach(([p, f]) => { if (f.isNew && !nodes[p]) nodes[p] = { path: p, type: "file" }; });
  const kids = {};
  Object.values(nodes).forEach(n => {
    let parent = n.path.includes("/") ? n.path.slice(0, n.path.lastIndexOf("/")) : "";
    (kids[parent] ||= []).push(n);
    while (parent && !nodes[parent]) { nodes[parent] = { path: parent, type: "dir" }; const pp = parent.includes("/") ? parent.slice(0, parent.lastIndexOf("/")) : ""; (kids[pp] ||= []).push(nodes[parent]); parent = pp; }
  });
  const sort = a => a.sort((x, y) => x.type === y.type ? x.path.localeCompare(y.path) : x.type === "dir" ? -1 : 1);
  const render = (dir, depth) => sort(kids[dir] || []).flatMap(n => {
    const name = n.path.split("/").pop(), f = files[n.path];
    if (n.type === "dir") {
      const open = depth === 0 ? !collapsed.has(n.path) : collapsed.has("+" + n.path);
      const toggle = () => setCollapsed(s => { const x = new Set(s); depth === 0 ? (x.has(n.path) ? x.delete(n.path) : x.add(n.path)) : (x.has("+" + n.path) ? x.delete("+" + n.path) : x.add("+" + n.path)); return x; });
      return [<button key={n.path} className="gh-node dir" style={{ "--d": depth }} onClick={toggle}><Icon name="folder" /><span>{name}</span><motion.i className="caret" animate={{ rotate: open ? 90 : 0 }} /></button>, ...(open ? render(n.path, depth + 1) : [])];
    }
    const state = f?.deleted ? "del" : f?.isNew ? "new" : f && f.kind === "text" && f.value !== f.orig ? "mod" : "";
    return [<button key={n.path} className={`gh-node file ${active === n.path ? "on" : ""} ${state}`} style={{ "--d": depth }} onClick={() => onOpen(n.path)}>
      <FileIcon name={name} /><span>{name}</span>{state && <i className="st">{{ mod: "M", new: "A", del: "D" }[state]}</i>}</button>];
  });
  const out = render("", 0);
  return out.length ? out : <div className="help" style={{ padding: 12 }}>No files yet. Add one with +.</div>;
}

const Patch = ({ p }) => p ? <pre className="patch">{p.split("\n").map((l, i) => <span key={i} className={l.startsWith("+") ? "add" : l.startsWith("-") ? "rem" : l.startsWith("@@") ? "hunk" : ""}>{l}{"\n"}</span>)}</pre> : <p className="help">No text diff (binary or large file).</p>;
const FilesChanged = ({ files }) => files.map(f => (
  <details key={f.filename} className="gh-file-diff"><summary><i className={`st ${f.status === "removed" ? "del" : f.status === "added" ? "new" : "mod"}`}>{f.status[0].toUpperCase()}</i><b>{f.filename}</b><span className="grow" /><span className="add">+{f.additions}</span> <span className="rem">−{f.deletions}</span></summary><Patch p={f.patch} /></details>));

function Pulls({ base, repo, branch }) {
  const [state, setState] = useState("open");
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(null);
  const [creating, setCreating] = useState(false);
  const load = useCallback(() => { setList(null); api(`/api/gh/pulls/${base}?state=${state}`).then(r => setList(r.pulls)).catch(fail); }, [base, state]);
  useEffect(() => { load(); }, [load]);
  return <>
    <div className="toolbar"><Seg size="sm" value={state} onChange={setState} options={[["open", "Open"], ["closed", "Closed"]]} /><span className="grow" /><Button variant="primary" icon="plus" onClick={() => setCreating(true)}>New pull request</Button></div>
    <div className="card">
      {!list && <div className="card-pad"><Sk w="60%" /><Sk w="40%" style={{ marginTop: 10 }} /></div>}
      {list?.map((p, i) => (
        <motion.button key={p.number} className="pr-row" onClick={() => setOpen(p.number)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, transition: { delay: i * .03 } }}>
          <span className={`pr-ic ${p.state}`}><Icon name="pr" /></span><div className="t"><b>{p.title}</b><span className="help">#{p.number} · {p.head} → {p.base} · by {p.user} · {ago(p.updated_at)}</span></div>
          <Badge tone={p.state === "merged" ? "brand" : p.state === "open" ? "ok" : ""}>{p.state}</Badge></motion.button>))}
      {list && !list.length && <Empty icon="pr" title={state === "open" ? "No open pull requests" : "No closed pull requests"}>Create a branch, push your changes to it, then open a pull request to merge them.</Empty>}
    </div>
    <Drawer open={!!open} onClose={() => setOpen(null)} wide label="Pull request">{open && <PullDetail base={base} n={open} onChanged={load} onClose={() => setOpen(null)} />}</Drawer>
    <Drawer open={creating} onClose={() => setCreating(false)} label="New pull request">{creating && repo && <NewPull base={base} repo={repo} branch={branch} onDone={n => { setCreating(false); load(); if (n) setOpen(n); }} />}</Drawer>
  </>;
}

function PullDetail({ base, n, onChanged, onClose }) {
  const [p, setP] = useState(null);
  const [method, setMethod] = useState("merge");
  const [busy, setBusy] = useState("");
  const load = useCallback(() => api(`/api/gh/pull/${base}/${n}`).then(setP).catch(fail), [base, n]);
  useEffect(() => { load(); }, [load]);
  if (!p) return <div className="dr-pad"><Sk w="60%" h={22} /><div className="card sk-block" style={{ marginTop: 20 }} /></div>;
  const act = async kind => {
    if (!await modal({ title: kind === "merge" ? `Merge #${p.number} into ${p.base}?` : `Close #${p.number} without merging?`, confirm: kind === "merge" ? "Merge" : "Close", danger: kind !== "merge" })) return;
    setBusy(kind);
    try { await api(`/api/gh/pull/${base}/${n}/${kind}`, { json: kind === "merge" ? { method } : {} }); toast(kind === "merge" ? "Merged" : "Closed"); load(); onChanged(); } catch (e) { fail(e); }
    setBusy("");
  };
  return <>
    <DrawerHead logo={<span className={`pr-ic lg ${p.state}`}><Icon name="pr" /></span>} title={p.title} sub={<>#{p.number} · {p.head} → {p.base} · by {p.user} · <span className="add">+{p.additions}</span> <span className="rem">−{p.deletions}</span></>} onClose={onClose} />
    <div className="dr-pad">
      {p.body && <div className="pr-body">{p.body}</div>}
      {p.state === "open" ? <div className="form-actions">{p.mergeable === false && <Badge tone="bad">Has conflicts: resolve on GitHub</Badge>}<span className="grow" />
        <Button variant="ghost" className="btn-danger" busy={busy === "close"} onClick={() => act("close")}>Close</Button>
        <select className="select auto" value={method} onChange={e => setMethod(e.target.value)}><option value="merge">Merge commit</option><option value="squash">Squash and merge</option><option value="rebase">Rebase and merge</option></select>
        <Button variant="primary" disabled={p.mergeable === false} busy={busy === "merge"} onClick={() => act("merge")}>Merge</Button></div>
        : <Badge tone={p.state === "merged" ? "brand" : ""}>{p.state}</Badge>}
      <a className="help" href={safeHref(p.url)} target="_blank" rel="noopener noreferrer">Open on GitHub ↗</a>
      <h4 className="dr-sub">Files changed ({p.files.length})</h4>
      <FilesChanged files={p.files} />
    </div>
  </>;
}

function NewPull({ base, repo, branch, onDone }) {
  const others = repo.branches.filter(b => b !== repo.default_branch);
  const [v, setV] = useState({ head: others.includes(branch) ? branch : (others[0] || branch), base: repo.default_branch, title: "", body: "" });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault(); setErrors({});
    if (!v.title.trim()) return setErrors({ title: "Give it a title." });
    if (v.head === v.base) return setErrors({ head: "Pick two different branches." });
    setBusy(true);
    try { const p = await api(`/api/gh/pulls/${base}`, { json: v }); toast(`Pull request #${p.number} created`); onDone(p.number); } catch (er) { applyError(er, setErrors); }
    setBusy(false);
  };
  return <>
    <DrawerHead logo={<span className="pr-ic lg open"><Icon name="pr" /></span>} title="New pull request" onClose={() => onDone(null)} />
    <form className="dr-pad" onSubmit={submit} noValidate>
      <div className="row-2">
        <Field label="Merge changes from" error={errors.head}><select className="select" value={v.head} onChange={e => setV(x => ({ ...x, head: e.target.value }))}>{(others.length ? others : repo.branches).map(b => <option key={b}>{b}</option>)}</select></Field>
        <Field label="Into"><select className="select" value={v.base} onChange={e => setV(x => ({ ...x, base: e.target.value }))}>{repo.branches.map(b => <option key={b}>{b}</option>)}</select></Field>
      </div>
      <Field label="Title" error={errors.title} style={{ marginTop: 12 }}><input className="input" value={v.title} onChange={e => setV(x => ({ ...x, title: e.target.value }))} autoFocus /></Field>
      <Field label="Description" opt="(Markdown)" style={{ marginTop: 12 }}><textarea className="textarea" rows={6} value={v.body} onChange={e => setV(x => ({ ...x, body: e.target.value }))} /></Field>
      <div className="form-actions"><span className="grow" /><Button onClick={() => onDone(null)}>Cancel</Button><Button type="submit" variant="primary" busy={busy}>Create pull request</Button></div>
    </form>
  </>;
}

function History({ base, branch }) {
  const [list, setList] = useState(null);
  const [open, setOpen] = useState({});
  const pg = usePager(list || [], branch, 20);
  useEffect(() => { api(`/api/gh/commits/${base}?ref=${encodeURIComponent(branch)}`).then(r => setList(r.commits)).catch(fail); }, [base, branch]);
  const toggle = async sha => {
    if (open[sha]) return setOpen(o => { const x = { ...o }; delete x[sha]; return x; });
    setOpen(o => ({ ...o, [sha]: "loading" }));
    try { const d = await api(`/api/gh/commit/${base}/${sha}`); setOpen(o => ({ ...o, [sha]: d })); } catch (e) { fail(e); setOpen(o => { const x = { ...o }; delete x[sha]; return x; }); }
  };
  return (
    <div className="card">
      {!list && <div className="card-pad"><Sk w="60%" /><Sk w="40%" style={{ marginTop: 10 }} /></div>}
      {pg.items.map((c, i) => <div key={c.sha}>
        <motion.button className="pr-row" onClick={() => toggle(c.sha)} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: Math.min(i, 15) * .02 } }}>
          {c.avatar ? <img className="av-img" src={c.avatar} alt="" /> : <span className="pr-ic"><Icon name="commit" /></span>}
          <div className="t"><b>{c.message.split("\n")[0]}</b><span className="help">{c.author} · {ago(c.date)} · <code>{c.sha.slice(0, 7)}</code></span></div>
          <motion.span animate={{ rotate: open[c.sha] ? 90 : 0 }}><Icon name="chevron" /></motion.span>
        </motion.button>
        <AnimatePresence>{open[c.sha] && <motion.div className="commit-detail" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
          <div className="card-pad">{open[c.sha] === "loading" ? <Sk w="50%" /> : <>{open[c.sha].message.includes("\n") && <pre className="pr-body">{open[c.sha].message}</pre>}<FilesChanged files={open[c.sha].files} /></>}</div>
        </motion.div>}</AnimatePresence>
      </div>)}
      {list && !list.length && <Empty icon="commit" title="No commits yet" />}
      <Pager p={pg} label="commits" sizes={[20, 50]} />
    </div>
  );
}

export { Alert };
