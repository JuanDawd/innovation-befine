"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/use-theme";

/** Segmented day/night pill. Used inside the sidebar footer. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

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
        onClick={() => setTheme("light")}
        aria-pressed={theme === "light"}
        aria-label="Tema claro"
        className={cn(
          "flex size-7 items-center justify-center rounded-full transition-colors",
          "text-sidebar-foreground/60 hover:text-sidebar-foreground",
          theme === "light" && "bg-sidebar-foreground text-sidebar",
        )}
      >
        <SunIcon className="size-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => setTheme("dark")}
        aria-pressed={theme === "dark"}
        aria-label="Tema oscuro"
        className={cn(
          "flex size-7 items-center justify-center rounded-full transition-colors",
          "text-sidebar-foreground/60 hover:text-sidebar-foreground",
          theme === "dark" && "bg-sidebar-foreground text-sidebar",
        )}
      >
        <MoonIcon className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
