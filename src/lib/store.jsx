import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { emit, on } from "./bus";

// Everything most pages share: the account, contacts, templates, profile, files, settings, WhatsApp link,
// the running campaign and the little counters in the sidebar.
const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const [me, setMe] = useState(null);
  const [data, setData] = useState({ recipients: [], templates: [], profile: {}, documents: [], settings: {} });
  const [wa, setWa] = useState({ state: "unknown" });
  const [job, setJob] = useState({ running: false, lines: [] });
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [counts, setCounts] = useState({});
  const [links, setLinks] = useState({});
  const [campaignPreset, setCampaignPreset] = useState(null);
  const polling = useRef(false);

  const reload = useCallback(async () => {
    const [st, m] = await Promise.all([api("/api/state"), api("/api/me")]);
    setData({ recipients: st.recipients, templates: st.templates, profile: st.profile, documents: st.documents, settings: st.settings });
    setMe(m);
    return st;
  }, []);

  const pollJob = useCallback(async () => {
    if (polling.current) return;
    polling.current = true;
    let failures = 0;
    for (;;) {
      const j = await api("/api/job").catch(() => null);
      if (j) { failures = 0; setJob(j); if (!j.running) break; }
      else failures++;
      await new Promise(r => setTimeout(r, failures ? 4000 : 1500));
    }
    polling.current = false;
    reload().catch(() => {});
    emit("history-changed");
  }, [reload]);

  const refreshCounts = useCallback(() => {
    api("/api/replies?f=open").then(d => setCounts(c => ({ ...c, replies: d.counts.open }))).catch(() => {});
    api("/api/apps").then(d => setCounts(c => ({ ...c, apps: d.apps.filter(a => !a.hidden && ["interview", "shortlisted", "assessment", "offer"].includes(a.status)).length }))).catch(() => {});
    api("/api/jobs").then(d => setCounts(c => ({ ...c, jobs: d.jobs.filter(j => j.eligible && !["dismissed", "applied"].includes(j.state)).length }))).catch(() => {});
    api("/api/queue").then(d => setCounts(c => ({ ...c, queue: d.items.filter(i => i.status === "queued").length }))).catch(() => {});
    api("/api/naukri").then(d => setLinks(l => ({ ...l, naukri: d.connected }))).catch(() => {});
    api("/api/li/status").then(d => setLinks(l => ({ ...l, linkedin: d.connected }))).catch(() => {});
    api("/api/gh/status").then(d => setLinks(l => ({ ...l, github: d.connected }))).catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [m, st, w] = await Promise.all([api("/api/me"), api("/api/state"), api("/api/whatsapp")]);
        setMe(m); setWa(w); setJob(st.job);
        setData({ recipients: st.recipients, templates: st.templates, profile: st.profile, documents: st.documents, settings: st.settings });
        if (st.job.running) pollJob();
        api("/api/leads").then(d => setCounts(c => ({ ...c, leads: d.leads.filter(l => l.status === "new").length }))).catch(() => {});
      } catch (e) { setError(e.message); }
    })();
    refreshCounts();
    const offs = [on("replies-changed", refreshCounts), on("apps-changed", refreshCounts), on("sync-done", refreshCounts)];
    return () => offs.forEach(f => f());
  }, [pollJob, refreshCounts]);

  const patchRecipient = (id, row) => setData(d => ({ ...d, recipients: d.recipients.map(r => r.id === id ? { ...r, ...row } : r) }));

  const value = {
    me, data, setData, reload, wa, setWa, job, setJob, pollJob, error, loaded: !!me,
    selected, setSelected, counts, setCounts, links, setLinks, refreshCounts, patchRecipient,
    campaignPreset, setCampaignPreset,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
