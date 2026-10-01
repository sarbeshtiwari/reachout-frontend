// Talks to the Flask API. Session is an HttpOnly cookie; the X-Requested-With header is the CSRF guard.
export class ApiError extends Error {
  constructor(message, field, status) { super(message); this.name = "ApiError"; this.field = field; this.status = status; }
}

export async function api(url, opts = {}) {
  const o = { ...opts, headers: { "X-Requested-With": "fetch", ...(opts.headers || {}) } };
  if (o.json !== undefined) {
    o.body = JSON.stringify(o.json);
    o.headers["Content-Type"] = "application/json";
    o.method = o.method || "POST";
    delete o.json;
  }
  let r;
  try { r = await fetch(url, o); }
  catch { throw new ApiError("Can't reach the server. Check your connection and try again."); }
  if (r.status === 401 && !url.startsWith("/api/auth")) {
    location.href = "/login";
    throw new ApiError("Your session has ended. Please log in again.");
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(data.error || (r.status >= 500 ? "Something went wrong on our side. Please try again." : r.statusText), data.field, r.status);
  return data;
}

// Upload with progress (fetch can't report upload progress).
export function upload(url, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("POST", url);
    x.setRequestHeader("X-Requested-With", "fetch");
    x.upload.onprogress = e => e.lengthComputable && onProgress && onProgress(e.loaded / e.total);
    x.onload = () => {
      let data = {};
      try { data = JSON.parse(x.responseText); } catch { /* not JSON */ }
      if (x.status === 401) { location.href = "/login"; return; }
      x.status < 400 ? resolve(data) : reject(new ApiError(data.error || "Upload failed. Please try again.", data.field, x.status));
    };
    x.onerror = () => reject(new ApiError("Upload failed. Check your connection and try again."));
    x.send(formData);
  });
}

// Fire-and-forget preference save (theme, sidebar) — kept in HttpOnly cookies, never localStorage.
export const savePref = prefs => fetch("/api/prefs", {
  method: "POST", headers: { "X-Requested-With": "fetch", "Content-Type": "application/json" }, body: JSON.stringify(prefs),
}).catch(() => {});
