"use client";

/**
 * ClientSearchWidget — T030, T031, T032
 *
 * Compact inline client selector used inside ticket and appointment creation forms.
 * Supports:
 * - Searching saved clients by name/phone/email with debounce
 * - Creating a new saved client inline (no page navigation)
 * - Selecting "Guest / Walk-in" and entering a free-text guest name
 * - Showing no-show warning badge for clients with count >= threshold
 *
 * Usage:
 *   <ClientSearchWidget
 *     value={selection}
 *     onChange={setSelection}
 *   />
 *
 * The value is a union:
 *   { type: "saved"; client: ClientRow }
 *   | { type: "guest"; guestName: string }
 *   | null
 */

import { useState, useTransition, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import {
  SearchIcon,
  Loader2Icon,
  AlertTriangleIcon,
  UserIcon,
  UserPlusIcon,
  XIcon,
} from "lucide-react";
import { createClientSchema } from "@befine/types";
import type { CreateClientInput } from "@befine/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import type { ClientRow } from "@/app/(protected)/clients/actions";
import { searchClients, createClient } from "@/app/(protected)/clients/actions";

const NO_SHOW_WARNING_THRESHOLD = 3;

export type ClientSelection =
  | { type: "saved"; client: ClientRow }
  | { type: "guest"; guestName: string }
  | null;

// ─── Inline create dialog ─────────────────────────────────────────────────────

function InlineCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (client: ClientRow) => void;
}) {
  const t = useTranslations("clients");
  const tc = useTranslations("common");
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateClientInput>({ resolver: zodResolver(createClientSchema) });

  function handleOpenChange(next: boolean) {
    if (!next) {
      reset();
      setServerError(null);
    }
    onOpenChange(next);
  }

  async function onSubmit(data: CreateClientInput) {
    startTransition(async () => {
      const result = await createClient(data);
      if (result.success) {
        reset();
        onCreated(result.data);
      } else {
        setServerError(result.error.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("createClient")}</DialogTitle>
        </DialogHeader>
        <form
          id="inline-client-form"
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="space-y-4"
        >
          {serverError && (
            <p
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {serverError}
            </p>
          )}
          <div className="space-y-1.5">
            <label htmlFor="ic-name" className="text-sm font-medium">
              {t("name")}
            </label>
            <Input
              id="ic-name"
              placeholder={t("namePlaceholder")}
              aria-invalid={!!errors.name}
              {...register("name")}
            />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="ic-phone" className="text-sm font-medium">
                {t("phone")} <span className="text-muted-foreground">{tc("optional")}</span>
              </label>
              <Input id="ic-phone" placeholder={t("phonePlaceholder")} {...register("phone")} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="ic-email" className="text-sm font-medium">
                {t("email")} <span className="text-muted-foreground">{tc("optional")}</span>
              </label>
              <Input
                id="ic-email"
                type="email"
                placeholder={t("emailPlaceholder")}
                aria-invalid={!!errors.email}
                {...register("email")}
              />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="ic-notes" className="text-sm font-medium">
              {t("notes")} <span className="text-muted-foreground">{tc("optional")}</span>
            </label>
            <Input id="ic-notes" placeholder={t("notesPlaceholder")} {...register("notes")} />
          </div>
        </form>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{tc("cancel")}</DialogClose>
          <Button type="submit" form="inline-client-form" disabled={isPending}>
            {isPending && <Loader2Icon className="mr-2 size-4 animate-spin" />}
            {tc("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main widget ──────────────────────────────────────────────────────────────

export function ClientSearchWidget({
  value,
  onChange,
  allowInlineCreate = true,
}: {
  value: ClientSelection;
  onChange: (selection: ClientSelection) => void;
  /** When false, hide “New client” actions (e.g. stylist — createClient is cashier/secretary only). */
  allowInlineCreate?: boolean;
}) {
  const t = useTranslations("clients");
  const tc = useTranslations("common");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientRow[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSearching, startSearchTransition] = useTransition();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [guestMode, setGuestMode] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim()) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      startSearchTransition(async () => {
        const result = await searchClients(query);
        if (result.success) {
          setSearchError(null);
          setResults(result.data);
          setShowDropdown(true);
        } else {
          setSearchError(result.error.message);
          setResults([]);
          setShowDropdown(false);
        }
      });
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function handleQueryChange(value: string) {
    setQuery(value);
    setSearchError(null);
    if (!value.trim()) {
      setResults([]);
      setShowDropdown(false);
    }
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function selectClient(client: ClientRow) {
    onChange({ type: "saved", client });
    setQuery("");
    setShowDropdown(false);
    setGuestMode(false);
  }

  function selectGuest() {
    setGuestMode(true);
    setShowDropdown(false);
    setQuery("");
  }

  function confirmGuest() {
    if (guestName.trim()) {
      onChange({ type: "guest", guestName: guestName.trim() });
      setGuestMode(false);
    }
  }

  function clearSelection() {
    onChange(null);
    setQuery("");
    setGuestName("");
    setGuestMode(false);
  }

  // Show selected saved client
  if (value?.type === "saved") {
    const client = value.client;
    return (
      <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <UserIcon className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{client.name}</p>
            {(client.phone || client.email) && (
              <p className="text-xs text-muted-foreground truncate">
                {client.phone ?? client.email}
              </p>
            )}
          </div>
          {client.noShowCount >= NO_SHOW_WARNING_THRESHOLD && (
            <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 shrink-0">
              <AlertTriangleIcon className="size-3" aria-hidden="true" />
              {t("noShowWarning", { count: client.noShowCount })}
            </span>
          )}
        </div>
        <button
          onClick={clearSelection}
          className="ml-2 shrink-0 text-muted-foreground hover:text-foreground"
          aria-label={t("clearSelection")}
        >
          <XIcon className="size-4" />
        </button>
      </div>
    );
  }

  // Show selected guest
  if (value?.type === "guest") {
    return (
      <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-2">
          <UserIcon className="size-4 shrink-0 text-muted-foreground" />
          <p className="text-sm">
            <span className="text-muted-foreground">{t("guestOption")}: </span>
            <span className="font-medium">{value.guestName}</span>
          </p>
        </div>
        <button
          onClick={clearSelection}
          className="ml-2 text-muted-foreground hover:text-foreground"
          aria-label={t("clearSelection")}
        >
          <XIcon className="size-4" />
        </button>
      </div>
    );
  }

  // Guest name input mode
  if (guestMode) {
    return (
      <div className="flex items-center gap-2">
        <Input
          ref={(el) => {
            el?.focus();
          }}
          placeholder={t("guestNamePlaceholder")}
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              confirmGuest();
            }
            if (e.key === "Escape") {
              setGuestMode(false);
              setGuestName("");
            }
          }}
          aria-label={t("guestNameLabel")}
        />
        <Button size="sm" onClick={confirmGuest} disabled={!guestName.trim()}>
          {tc("confirm")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setGuestMode(false);
            setGuestName("");
          }}
        >
          <XIcon className="size-4" />
        </Button>
      </div>
    );
  }

  // Search input + dropdown
  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t("searchPlaceholder")}
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => {
            if (query.trim()) setShowDropdown(true);
          }}
          className="pl-9"
          aria-label={t("searchPlaceholder")}
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-invalid={!!searchError}
        />
        {isSearching && (
          <Loader2Icon className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {searchError && (
        <p className="mt-1.5 text-sm text-destructive" role="alert">
          {searchError}
        </p>
      )}

      {showDropdown && (
        <div
          role="listbox"
          className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border bg-popover shadow-md"
        >
          {results.length === 0 ? (
            <div className="px-3 py-4 text-center">
              <p className="text-sm text-muted-foreground">{t("emptySearchDescription")}</p>
              {allowInlineCreate && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="mt-2 gap-1.5"
                  onClick={() => {
                    setShowDropdown(false);
                    setShowCreateDialog(true);
                  }}
                >
                  <UserPlusIcon className="size-4" />
                  {t("createClient")}
                </Button>
              )}
            </div>
          ) : (
            <>
              {results.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-accent"
                  onClick={() => selectClient(client)}
                >
                  <UserIcon className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{client.name}</p>
                    {(client.phone || client.email) && (
                      <p className="text-xs text-muted-foreground truncate">
                        {client.phone ?? client.email}
                      </p>
                    )}
                  </div>
                  {client.noShowCount >= NO_SHOW_WARNING_THRESHOLD && (
                    <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 shrink-0">
                      <AlertTriangleIcon className="size-3" aria-hidden="true" />
                      {t("noShowWarning", { count: client.noShowCount })}
                    </span>
                  )}
                </button>
              ))}
              {allowInlineCreate && (
                <div className="border-t">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                    onClick={() => {
                      setShowDropdown(false);
                      setShowCreateDialog(true);
                    }}
                  >
                    <UserPlusIcon className="size-4" />
                    {t("createClient")}
                  </button>
                </div>
              )}
            </>
          )}

          <div className="border-t">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={selectGuest}
            >
              <UserIcon className="size-4" />
              {t("guestOption")}
            </button>
          </div>
        </div>
      )}

      {/* "Guest" shortcut when no query typed */}
      {!query && !showDropdown && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-1.5 gap-1.5 text-xs text-muted-foreground"
          onClick={selectGuest}
        >
          <UserIcon className="size-3.5" />
          {t("guestOption")}
        </Button>
      )}

      <InlineCreateDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreated={(client) => {
          setShowCreateDialog(false);
          selectClient(client);
        }}
      />
    </div>
  );
}
