"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { SearchIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface FilterChip {
  id: string;
  label: string;
}

interface SearchFilterProps extends React.ComponentProps<"div"> {
  placeholder?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  filters?: FilterChip[];
  activeFilters?: string[];
  onFilterChange?: (activeFilters: string[]) => void;
  debounceMs?: number;
}

function SearchFilter({
  placeholder = "Buscar…",
  value: controlledValue,
  onValueChange,
  filters = [],
  activeFilters: controlledActiveFilters,
  onFilterChange,
  debounceMs = 300,
  className,
  ...props
}: SearchFilterProps) {
  const [internalValue, setInternalValue] = useState("");
  const [internalActiveFilters, setInternalActiveFilters] = useState<string[]>([]);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const searchValue = controlledValue ?? internalValue;
  const activeFilterIds = controlledActiveFilters ?? internalActiveFilters;

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      if (controlledValue === undefined) {
        setInternalValue(newValue);
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        onValueChange?.(newValue);
      }, debounceMs);
    },
    [controlledValue, onValueChange, debounceMs],
  );

  const handleClear = useCallback(() => {
    if (controlledValue === undefined) {
      setInternalValue("");
    }
    onValueChange?.("");
  }, [controlledValue, onValueChange]);

  const toggleFilter = useCallback(
    (filterId: string) => {
      const next = activeFilterIds.includes(filterId)
        ? activeFilterIds.filter((id) => id !== filterId)
        : [...activeFilterIds, filterId];
      if (controlledActiveFilters === undefined) {
        setInternalActiveFilters(next);
      }
      onFilterChange?.(next);
    },
    [activeFilterIds, controlledActiveFilters, onFilterChange],
  );

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const hasResults = true; // consumers render the zero-results state themselves

  return (
    <div className={cn("space-y-3", className)} {...props}>
      <div className="relative">
        <SearchIcon
          className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          placeholder={placeholder}
          value={searchValue}
          onChange={handleSearchChange}
          className="pl-8 pr-8"
          aria-label={placeholder}
        />
        {searchValue && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="absolute right-1.5 top-1/2 -translate-y-1/2"
            onClick={handleClear}
            aria-label="Limpiar búsqueda"
          >
            <XIcon />
          </Button>
        )}
      </div>

      {filters.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtros">
          {filters.map((filter) => {
            const isActive = activeFilterIds.includes(filter.id);
            return (
              <button
                key={filter.id}
                type="button"
                onClick={() => toggleFilter(filter.id)}
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80",
                )}
                aria-pressed={isActive}
              >
                {filter.label}
              </button>
            );
          })}

          {activeFilterIds.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (controlledActiveFilters === undefined) {
                  setInternalActiveFilters([]);
                }
                onFilterChange?.([]);
              }}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <XIcon className="size-3" />
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {!hasResults && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No se encontraron resultados.
        </p>
      )}
    </div>
  );
}

export { SearchFilter };
export type { FilterChip };
