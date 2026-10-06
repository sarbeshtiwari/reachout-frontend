export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/;
export const phoneOk = v => !v || (/^\+?[\d\s\-().]+$/.test(v) && v.replace(/\D/g, "").length >= 8 && v.replace(/\D/g, "").length <= 15);
export const emailOk = v => !v || EMAIL_RE.test(v.trim());
export const bracesOk = v => { let d = 0; for (const ch of v || "") { if (ch === "{") d++; if (ch === "}") d--; if (d < 0 || d > 1) return false; } return d === 0; };

export const kb = n => n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.ceil(n / 1024)) + " KB";
export const ext = n => ((n || "").split(".").pop() || "").toLowerCase();
export const initials = t => (t || "?").replace(/[^A-Za-z0-9& ]/g, " ").trim().split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join("").toUpperCase() || "?";
export const hue = s => [...(s || "")].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

export const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
export const addDays = n => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4 + n * 864e5).toISOString().slice(0, 10);
export const localInput = d => new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);

export function ago(ts) {
  if (!ts) return "";
  const t = typeof ts === "number" && ts < 1e12 ? ts * 1000 : new Date(ts).getTime();
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  if (s < 86400 * 7) return Math.floor(s / 86400) + "d ago";
  return new Date(t).toLocaleDateString();
}
export const fmtDate = d => d ? new Date(d.length === 10 ? d + "T00:00" : d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: new Date(d).getFullYear() === new Date().getFullYear() ? undefined : "numeric" }) : "";
export const fmtD = iso => iso ? new Date(iso).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }) : "";
export const fmtT = iso => iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
export const fmtDT = iso => iso ? new Date(iso).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
export const fmtDur = s => { s = Math.max(0, Math.round(s)); const m = Math.floor(s / 60); return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${m}:${String(s % 60).padStart(2, "0")}`; };
export const fmtNext = iso => {
  const t = new Date(iso), d = t.toDateString();
  const day = d === new Date().toDateString() ? "today" : d === new Date(Date.now() + 864e5).toDateString() ? "tomorrow" : t.toLocaleDateString([], { day: "numeric", month: "short" });
  return `${day} ${t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
};
export const gmailLink = id => `https://mail.google.com/mail/u/0/#search/${encodeURIComponent("rfc822msgid:" + (id || "").replace(/[<>]/g, ""))}`;
export const splitCsv = v => (v || "").split(/[,\n]/).map(x => x.trim()).filter(Boolean);

// Links built from data (emails, GitHub, user input) only ever open web pages or mail/phone apps.
// A javascript: or data: link would run code inside Reachout, so anything else becomes undefined (no link).
export const safeHref = (u, { mail = false } = {}) => {
  const s = String(u || "").trim();
  if (/^https?:\/\/[^\s"'<>]+$/i.test(s)) return s;
  if (mail && /^(mailto|tel):[^\s"'<>]+$/i.test(s)) return s;
  return undefined;
};

// The public home page: the same site when Flask serves everything, a separate Netlify site otherwise.
export const LANDING = (import.meta.env.VITE_LANDING_URL || "").replace(/\/$/, "") || "/";
