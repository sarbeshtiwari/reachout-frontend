import { savePref } from "./api";

const root = document.documentElement;
export const themeChoice = () => root.dataset.themeChoice || "system";
export function applyTheme() {
  const c = themeChoice();
  root.dataset.theme = c === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : c;
  dispatchEvent(new Event("themechange"));
}
export function setTheme(choice) {
  root.dataset.themeChoice = choice;
  // A soft cross-fade when the theme switches.
  root.classList.add("theme-anim");
  applyTheme();
  setTimeout(() => root.classList.remove("theme-anim"), 400);
  savePref({ theme: choice });
}
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);
export const cssVar = v => getComputedStyle(root).getPropertyValue(v).trim();
