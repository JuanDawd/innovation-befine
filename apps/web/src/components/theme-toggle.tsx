"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark";
const STORAGE_KEY = "befine-theme";
const EVENT = "befine-theme-change";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.setAttribute("data-theme", theme);
}

function readTheme(): Theme {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function ThemeToggle({ className }: { className?: string }) {
  // Returns undefined on the server (serverSnapshot) so the component
  // renders a neutral state during SSR; after hydration it reads localStorage.
  const theme = useSyncExternalStore<Theme | undefined>(
    subscribe,
    () => readTheme(),
    () => undefined,
  );

  function setAndPersist(next: Theme) {
    applyTheme(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    window.dispatchEvent(new Event(EVENT));
  }

  return (
    <div
      role="group"
      aria-label="Cambiar tema"
      className={cn(
        "inline-flex items-center gap-0 rounded-full border border-sidebar-border p-0.5",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setAndPersist("light")}
        aria-pressed={theme === "light"}
        aria-label="Tema claro"
        className={cn(
          "flex size-7 items-center justify-center rounded-full transition-colors",
          "text-sidebar-foreground/60 hover:text-sidebar-foreground",
          theme === "light" && "bg-sidebar-foreground text-sidebar",
        )}
      >
        <Sun className="size-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => setAndPersist("dark")}
        aria-pressed={theme === "dark"}
        aria-label="Tema oscuro"
        className={cn(
          "flex size-7 items-center justify-center rounded-full transition-colors",
          "text-sidebar-foreground/60 hover:text-sidebar-foreground",
          theme === "dark" && "bg-sidebar-foreground text-sidebar",
        )}
      >
        <Moon className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
