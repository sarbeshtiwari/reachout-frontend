const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

async function show() {
  const { server, key } = await chrome.storage.local.get(["server", "key"]);
  $("setup").hidden = !!key;
  $("main").hidden = !key;
  if (server) $("server").value = server;
  $("open").href = (server || "http://127.0.0.1:5050") + "/app/ai-jobs";
}

$("save").onclick = async () => {
  const key = $("key").value.trim(), server = $("server").value;
  if (!/^[0-9a-f]{32}\.[\w-]{30,80}$/.test(key)) { $("setupMsg").textContent = "That doesn't look like a Reachout extension key."; return; }
  await chrome.storage.local.set({ key, server });
  $("setupMsg").textContent = "";
  $("key").value = "";
  show();
};
$("change").onclick = async e => { e.preventDefault(); await chrome.storage.local.remove("key"); show(); };

async function inPage(cmd, extra = {}) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https?:/.test(tab.url || "")) throw new Error("Open a job application form first.");
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["fill.js"] });
  const r = await chrome.tabs.sendMessage(tab.id, { cmd, ...extra });
  if (!r?.ok) throw new Error(r?.error || "Couldn't work on this page.");
  return r.r;
}

$("fill").onclick = async () => {
  const btn = $("fill"), out = $("result");
  btn.disabled = true; btn.textContent = "Filling…";
  out.hidden = false; out.innerHTML = "Working on the page…";
  try {
    const r = await inPage("fill", { drafts: $("drafts").checked });
    out.innerHTML = `<div class="ok">Filled ${r.filled + (r.resume ? 1 : 0)} details and ${r.answered} saved answer${r.answered === 1 ? "" : "s"}` +
      `${r.drafts ? `, ${r.drafts} draft${r.drafts === 1 ? "" : "s"}` : ""}${r.company ? ` for ${esc(r.company)}` : ""}.</div>` +
      (r.resumeError ? `<div class="bad">Resume: ${esc(r.resumeError)}</div>` : "") +
      (r.missing.length ? `<div class="bad">${r.missing.length} need you (outlined red):</div><ul>${r.missing.slice(0, 8).map(m => `<li>${esc(m)}</li>`).join("")}</ul>`
        : "<div>Nothing left. Check the form and press Submit.</div>");
  } catch (e) { out.innerHTML = `<div class="bad">${esc(e.message)}</div>`; }
  btn.disabled = false; btn.textContent = "✦ Fill this application";
};

$("learn").onclick = async () => {
  const out = $("result");
  out.hidden = false;
  try {
    const r = await inPage("learn");
    out.innerHTML = `<div class="ok">Saved ${r.saved} answer${r.saved === 1 ? "" : "s"} to Reachout.</div><div>Approve them in AI job match → My answers.</div>`;
  } catch (e) { out.innerHTML = `<div class="bad">${esc(e.message)}</div>`; }
};

show();
