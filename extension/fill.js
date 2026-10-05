// Reachout Autofill: runs in the application page only when you click "Fill this application".
// It fills fields with your details, resume and approved answers, outlines what it filled (green), drafts (amber)
// and what still needs you (red). It never presses Submit: you check the form and submit it yourself.
(() => {
  if (window.__reachoutAutofill) return;
  window.__reachoutAutofill = true;

  const clean = x => (x || "").replace(/[✱*]/g, "").replace(/\s+/g, " ").trim();
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const shown = e => !!(e && (e.offsetWidth || e.offsetHeight || e.getClientRects().length));
  const api = msg => new Promise((resolve, reject) =>
    chrome.runtime.sendMessage({ type: "reachout-api", ...msg }, r => (r && r.ok ? resolve(r.data) : reject(new Error(r ? r.error : "Reachout isn't reachable.")))));

  function labelOf(e) {
    if (e.labels && e.labels[0] && clean(e.labels[0].innerText)) return clean(e.labels[0].innerText);
    if (e.getAttribute("aria-label")) return clean(e.getAttribute("aria-label"));
    const by = e.getAttribute("aria-labelledby");
    if (by && document.getElementById(by.split(" ")[0])) return clean(document.getElementById(by.split(" ")[0]).innerText);
    const box = e.closest("li, fieldset, .application-question, [class*=question], [class*=field], [class*=Field]");
    const head = box && box.querySelector("label, legend, .application-label, .text, [class*=label], [class*=Label]");
    return clean(head ? head.innerText : "") || clean(e.getAttribute("placeholder"));
  }

  const outline = (el, color) => {
    const box = el.closest(".select-shell, .field, .application-question, li, fieldset, [class*=_fieldEntry]") || el;
    box.style.outline = `2px solid ${color}`;
    box.style.outlineOffset = "3px";
    box.style.borderRadius = "6px";
  };
  const GREEN = "#0f6b54", AMBER = "#d97706", RED = "#e5484d";

  // Typing into React/Vue forms: set the value the way the browser does, then tell the page.
  function setValue(el, value) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }
  function press(el) {
    for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
    }
  }
  const pickerHasValue = e => !!e.closest("[class*=select__control], [class*=-control]")?.querySelector("[class*=single-value], [class*=singleValue]");

  const CITY_NAMES = { gurugram: "gurgaon", gurgaon: "gurugram", bengaluru: "bangalore", bangalore: "bengaluru", mumbai: "bombay",
    chennai: "madras", kolkata: "calcutta", "new delhi": "delhi", delhi: "new delhi", pune: "poona", kochi: "cochin", mysuru: "mysore" };
  const escRe = x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Open a searchable dropdown, type into it like a person would, and choose the option that matches your own value.
  async function choose(input, text, { place = "" } = {}) {
    const control = input.closest("[class*=select__control], [class*=-control], [role=combobox]") || input;
    press(control);
    input.focus();
    await sleep(150);
    for (let i = 1; i <= text.length; i++) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, text.slice(0, i));
      input.dispatchEvent(new InputEvent("input", { bubbles: true, data: text[i - 1], inputType: "insertText" }));
      await sleep(45);
    }
    const names = [text, CITY_NAMES[text.toLowerCase()]].filter(Boolean).map(n => new RegExp("^\\s*" + escRe(n) + "\\b", "i"));
    for (let i = 0; i < 20; i++) {  // options load as you type (city lists come from the site's server)
      await sleep(250);
      const opts = [...document.querySelectorAll("[role=option], [class*=select__option]")].filter(shown);
      const opt = opts.find(o => names.some(re => re.test(o.innerText)) && (!place || o.innerText.toLowerCase().includes(place.toLowerCase())))
        || opts.find(o => names.some(re => re.test(o.innerText)));
      if (opt) { press(opt); await sleep(300); return true; }
    }
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "");
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    input.blur();
    return false;
  }

  const textBoxes = () => [...document.querySelectorAll(
    "input:not([type=file]):not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=search])" +
    ":not([role=combobox]):not([aria-autocomplete]):not([readonly]):not([type=password]), textarea")].filter(shown);
  const pickers = () => [...document.querySelectorAll("input[class*=select__input], input[role=combobox], input[aria-autocomplete=list]")]
    .filter(e => shown(e) && !e.closest(".iti") && e.type !== "search");
  const groups = () => [...document.querySelectorAll("fieldset, [role=radiogroup]")].filter(shown);
  const groupLabel = g => clean((g.querySelector("legend, label, [class*=label]") || {}).innerText);

  const fileLabel = f => `${f.name} ${f.id} ${f.getAttribute("aria-label") || ""} ${labelOf(f)}`;

  async function attach(input, path) {
    const r = await api({ path });
    const bytes = Uint8Array.from(atob(r.base64), c => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], r.name, { type: /\.pdf$/i.test(r.name) ? "application/pdf" : "application/octet-stream" }));
    input.files = dt.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    outline(input, GREEN);
    return true;
  }

  async function attachResume(status) {
    const inputs = [...document.querySelectorAll("input[type=file]")];
    const input = inputs.find(f => /resume|cv/i.test(fileLabel(f))) || inputs.find(f => !/cover/i.test(fileLabel(f)));
    if (!input || input.files.length) return false;
    status("Attaching your resume…");
    await attach(input, "/api/ext/resume");
    await sleep(2500); // some forms read the resume and refill fields
    return true;
  }

  // The form's cover letter field, if it has one: attach your letter, or paste its text where it asks for text.
  async function addCover(cover, status) {
    if (!cover) return "";
    const input = [...document.querySelectorAll("input[type=file]")].find(f => /cover/i.test(fileLabel(f)) && !f.files.length);
    if (input) { status("Attaching your cover letter…"); await attach(input, "/api/ext/cover"); return "attached"; }
    const box = textBoxes().find(e => e.tagName === "TEXTAREA" && !e.value &&
      /^(your |a )?cover letter( \(optional\))?$|^message to (the )?hiring (team|manager)$/i.test(labelOf(e)));
    if (box && cover.text) { setValue(box, cover.text); outline(box, GREEN); return "pasted"; }
    return "";
  }

  function bar(text) {
    let el = document.getElementById("__reachout_autofill_bar");
    if (!el) {
      el = document.createElement("div");
      el.id = "__reachout_autofill_bar";
      el.style.cssText = "position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483647;max-width:min(720px,94vw);" +
        "padding:11px 16px;border-radius:14px;color:#fff;font:600 14px/1.4 -apple-system,system-ui,sans-serif;" +
        "background:linear-gradient(120deg,#7a4b8f,#0f6b54);box-shadow:0 10px 30px rgba(0,0,0,.25);cursor:pointer";
      el.title = "Click to hide";
      el.onclick = () => el.remove();
      document.documentElement.appendChild(el);
    }
    el.textContent = "✦ Reachout · " + text;
  }

  async function fill({ drafts }) {
    const result = { filled: 0, answered: 0, drafts: 0, resume: false, missing: [], company: "" };
    bar("Filling…");
    result.resume = await attachResume(bar).catch(e => { result.resumeError = e.message; return false; });

    const questions = new Set();
    textBoxes().forEach(e => !e.value && questions.add(labelOf(e)));
    pickers().forEach(e => !pickerHasValue(e) && questions.add(labelOf(e)));
    document.querySelectorAll("select").forEach(e => shown(e) && e.selectedIndex <= 0 && questions.add(labelOf(e)));
    groups().forEach(g => !g.querySelector("input:checked, [aria-checked=true], [aria-pressed=true]") && questions.add(groupLabel(g)));
    questions.delete("");
    const data = await api({ path: "/api/ext/autofill", method: "POST", body: { url: location.href, title: document.title, questions: [...questions] } });
    result.company = data.company;
    result.cover = await addCover(data.cover, bar).catch(() => "");
    const f = data.fields;
    const map = data.field_map.map(([pat, key]) => [new RegExp(pat.replace(/\\\\/g, "\\")), key]);
    const contactKey = label => {
      const l = label.toLowerCase().replace(/[\s?:]+$/, "").trim();
      if (l.length > 40) return null;
      const hit = map.find(([re]) => re.test(l));
      return hit ? hit[1] : null;
    };
    const answerFor = label => {
      const a = data.answers[label];
      if (!a || (a.draft && !drafts)) return null;
      return a;
    };

    // Text boxes: contact details, then saved answers.
    for (const el of textBoxes()) {
      if (el.value) continue;
      const label = labelOf(el);
      const key = contactKey(label);
      if (key && f[key]) { setValue(el, f[key]); outline(el, GREEN); result.filled++; continue; }
      const a = answerFor(label);
      if (a) { setValue(el, a.answer); outline(el, a.draft ? AMBER : GREEN); a.draft ? result.drafts++ : result.answered++; }
    }
    // Searchable dropdowns: country and city from your details, the rest from saved answers.
    for (const el of pickers()) {
      if (pickerHasValue(el)) continue;
      const label = labelOf(el), l = label.toLowerCase().replace(/[\s?:]+$/, "");
      let value = null, draft = false, place = "";
      if (/^country( of residence)?$/.test(l)) value = f.country;
      else if (/^(current )?(location|city)( \(city\))?$/.test(l)) { value = (f.location || "").split(",")[0].trim(); place = f.country; }
      else { const a = answerFor(label); if (a) { value = a.answer; draft = a.draft; } }
      if (el.value) continue;
      if (value && await choose(el, value, { place })) { outline(el, draft ? AMBER : GREEN); draft ? result.drafts++ : (/(country|location|city)/.test(l) ? result.filled++ : result.answered++); }
    }
    // Phone number's country code.
    const flag = document.querySelector(".iti__selected-country, .iti__selected-flag");
    if (flag && f.dial && !((flag.getAttribute("title") || "") + flag.innerText).includes("+" + f.dial)) {
      press(flag); await sleep(300);
      const item = document.querySelector(`.iti__country[data-dial-code='${f.dial}']`);
      if (item) { press(item); result.filled++; } else document.body.click();
    }
    // Plain dropdowns.
    for (const el of document.querySelectorAll("select")) {
      if (!shown(el) || el.selectedIndex > 0) continue;
      const a = answerFor(labelOf(el));
      const opt = a && [...el.options].find(o => clean(o.text).toLowerCase() === a.answer.trim().toLowerCase());
      if (opt) { el.value = opt.value; el.dispatchEvent(new Event("change", { bubbles: true })); outline(el, a.draft ? AMBER : GREEN); a.draft ? result.drafts++ : result.answered++; }
    }
    // Yes/No and multiple choice.
    for (const g of groups()) {
      if (g.querySelector("input:checked, [aria-checked=true], [aria-pressed=true]")) continue;
      const a = answerFor(groupLabel(g));
      if (!a) continue;
      const want = a.answer.trim().toLowerCase();
      const opt = [...g.querySelectorAll("label, button, [role=radio]")].find(o => clean(o.innerText).toLowerCase() === want);
      if (opt) { press(opt); outline(g, a.draft ? AMBER : GREEN); a.draft ? result.drafts++ : result.answered++; }
      else if (/^(yes|i agree|agree)$/.test(want) && g.querySelectorAll("input[type=checkbox]").length === 1) {
        g.querySelector("input[type=checkbox]").click(); outline(g, a.draft ? AMBER : GREEN); result.answered++;
      }
    }
    // What's still needed: required and empty.
    await sleep(400);
    document.querySelectorAll("input[required], textarea[required], select[required], [aria-required=true]").forEach(e => {
      if (e.type === "hidden" || (!shown(e) && e.getAttribute("aria-hidden") !== "true")) return;
      if (!e.matches("input, textarea, select")) {
        if ([...e.querySelectorAll("input[type=file]")].some(x => x.files.length) || /\.(pdf|docx?|txt|rtf)\b/i.test(e.innerText)) return;
      } else if (e.matches("[class*=select__input], [role=combobox]") ? pickerHasValue(e)
        : (e.type === "checkbox" || e.type === "radio") ? document.querySelector(`input[name="${CSS.escape(e.name)}"]:checked`) : e.value) return;
      if (e.getAttribute("aria-hidden") === "true") { const v = e.parentElement?.querySelector("input:not([aria-hidden])"); if (v && pickerHasValue(v)) return; }
      const label = labelOf(e) || "A question";
      if (!result.missing.includes(label)) result.missing.push(label);
      outline(e.closest(".select-shell") || e, RED);
    });
    const first = document.querySelector(`[style*="${RED}"]`) || document.querySelector(`[style*="${AMBER}"]`);
    if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
    if (result.cover) result.filled++;
    const parts = [`filled ${result.filled + (result.resume ? 1 : 0)} details${result.cover ? ` (cover letter ${result.cover})` : ""}`, `${result.answered} saved answer${result.answered === 1 ? "" : "s"}`];
    if (result.drafts) parts.push(`${result.drafts} draft${result.drafts === 1 ? "" : "s"} (amber: check them)`);
    bar(parts.join(", ") + ". " + (result.missing.length ? `${result.missing.length} question${result.missing.length === 1 ? "" : "s"} need you (red).` : "") +
      " Check the form, then press Submit yourself.");
    return result;
  }

  function snapshot() {
    const out = [];
    textBoxes().forEach(e => e.value.trim() && out.push([labelOf(e), e.value.trim()]));
    document.querySelectorAll("[class*=select__control], [class*=-control]").forEach(c => {
      const v = c.querySelector("[class*=single-value], [class*=singleValue]"), i = c.querySelector("input");
      if (v && i && !c.closest(".iti")) out.push([labelOf(i), clean(v.innerText)]);
    });
    document.querySelectorAll("select").forEach(e => shown(e) && e.selectedIndex > 0 && out.push([labelOf(e), clean(e.options[e.selectedIndex].text)]));
    groups().forEach(g => {
      const on = g.querySelector("input:checked, [aria-checked=true], [aria-pressed=true]");
      if (!on) return;
      const a = on.type === "checkbox" && g.querySelectorAll("input[type=checkbox]").length === 1 ? "Yes" : clean(on.labels?.[0]?.innerText || on.innerText || on.value);
      out.push([groupLabel(g), a]);
    });
    return out.filter(([q, a]) => q && a && q.length < 300);
  }

  async function learn() {
    const pairs = snapshot();
    const r = await api({ path: "/api/ext/learn", method: "POST", body: { url: location.href, title: document.title, pairs } });
    bar(`Saved ${r.saved} of your answers to Reachout. Approve them in AI job match → My answers.`);
    return r;
  }

  chrome.runtime.onMessage.addListener((msg, _s, reply) => {
    if (msg?.cmd === "fill") fill(msg).then(r => reply({ ok: true, r })).catch(e => { bar(e.message); reply({ ok: false, error: e.message }); });
    else if (msg?.cmd === "learn") learn().then(r => reply({ ok: true, r })).catch(e => reply({ ok: false, error: e.message }));
    else return false;
    return true;
  });
})();
