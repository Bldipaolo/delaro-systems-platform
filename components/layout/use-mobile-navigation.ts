"use client";

import { useEffect, useRef, useState } from "react";

export function useMobileNavigation() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    const trigger = triggerRef.current;
    const desktop = window.matchMedia("(min-width: 801px)");
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    const focusFrame = requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLButtonElement>(".mobile-nav-close")?.focus();
    });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>("a, button:not([disabled])") ?? []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!panelRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    function onViewportChange() {
      if (desktop.matches) setOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    desktop.addEventListener("change", onViewportChange);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
      window.removeEventListener("keydown", onKeyDown);
      desktop.removeEventListener("change", onViewportChange);
      trigger?.focus();
    };
  }, [open]);

  return { open, setOpen, panelRef, triggerRef };
}
