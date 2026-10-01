import { useEffect, useRef, useState } from "react";

// Click-outside / Escape handling for top-bar popovers.
export function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const c = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const k = e => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", c); addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", c); removeEventListener("keydown", k); };
  }, [open]);
  return { open, setOpen, ref };
}
export const popAnim = {
  initial: { opacity: 0, y: -8, scale: .97 }, animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -6, scale: .98, transition: { duration: .12 } }, transition: { type: "spring", stiffness: 500, damping: 34 },
};
