// Talks to Reachout for the page script. Requests go from here (the extension), never from the job site's page,
// so the site never sees your Reachout address or key. The key is kept in chrome.storage.local on this computer.

const SERVERS = ["http://127.0.0.1:5050", "http://localhost:5050", "https://reachout-application.netlify.app"];

async function settings() {
  const s = await chrome.storage.local.get(["server", "key"]);
  return { server: SERVERS.includes(s.server) ? s.server : SERVERS[0], key: s.key || "" };
}

async function call(path, { method = "GET", body } = {}) {
  const { server, key } = await settings();
  if (!key) throw new Error("Add your Reachout extension key first (click the extension icon).");
  let r;
  try {
    r = await fetch(server + path, {
      method,
      headers: { Authorization: "Bearer " + key, "X-Requested-With": "fetch", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      credentials: "omit",
    });
  } catch {
    throw new Error(server.includes("127.0.0.1") || server.includes("localhost")
      ? "Can't reach Reachout on this Mac. Start it with start.command." : "Can't reach Reachout. Check your connection.");
  }
  if (path === "/api/ext/resume" && r.ok) {
    const buf = new Uint8Array(await r.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { name: r.headers.get("X-Filename") || "resume.pdf", base64: btoa(bin) };
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Reachout answered ${r.status}.`);
  return data;
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type !== "reachout-api") return false;
  call(msg.path, msg).then(data => reply({ ok: true, data })).catch(e => reply({ ok: false, error: e.message }));
  return true; // answer asynchronously
});
