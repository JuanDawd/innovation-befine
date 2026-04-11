"use client";

/**
 * ClientList — T030, T032
 *
 * Full client management screen: search, create, edit, archive/unarchive.
 * Shows no-show count badge when count >= NO_SHOW_WARNING_THRESHOLD.
 * Used on both /cashier/clients and /secretary/clients pages.
 */

import { useState, useTransition, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import {
  PlusIcon,
  PencilIcon,
  ArchiveIcon,
  ArchiveRestoreIcon,
  SearchIcon,
  Loader2Icon,
  AlertTriangleIcon,
} from "lucide-react";
import { createClientSchema } from "@befine/types";
import type { CreateClientInput } from "@befine/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import type { ClientRow } from "@/app/(protected)/clients/actions";
import {
  searchClients,
  createClient,
  editClient,
  archiveClient,
  unarchiveClient,
} from "@/app/(protected)/clients/actions";

/** No-show count threshold for the warning badge */
const NO_SHOW_WARNING_THRESHOLD = 3;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function NoShowBadge({ count }: { count: number }) {
  const t = useTranslations("clients");
  if (count < NO_SHOW_WARNING_THRESHOLD) return null;
  return (
    <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
      <AlertTriangleIcon className="size-3" aria-hidden="true" />
      {t("noShowWarning", { count })}
    </span>
  );
}

// ─── Client Form Dialog ───────────────────────────────────────────────────────

type ClientDialogMode = { mode: "create" } | { mode: "edit"; client: ClientRow };

function ClientDialog({
  config,
  trigger,
  onSuccess,
}: {
  config: ClientDialogMode;
  trigger: React.ReactNode;
  onSuccess: (client: ClientRow) => void;
}) {
  const t = useTranslations("clients");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isEdit = config.mode === "edit";

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateClientInput>({ resolver: zodResolver(createClientSchema) });

  function handleOpen() {
    reset(
      isEdit
        ? {
            name: config.client.name,
            phone: config.client.phone ?? "",
            email: config.client.email ?? "",
            notes: config.client.notes ?? "",
          }
        : { name: "", phone: "", email: "", notes: "" },
    );
    setServerError(null);
    setOpen(true);
  }

  async function onSubmit(data: CreateClientInput) {
    startTransition(async () => {
      const result = isEdit ? await editClient(config.client.id, data) : await createClient(data);

      if (result.success) {
        setOpen(false);
        onSuccess(result.data);
      } else {
        setServerError(result.error.message);
      }
    });
  }

  return (
    <>
      {/* Clone trigger to attach onClick */}
      <button type="button" onClick={handleOpen} className="contents">
        {trigger}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isEdit ? t("editClient") : t("createClient")}</DialogTitle>
          </DialogHeader>

          <form id="client-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            {serverError && (
              <p
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {serverError}
              </p>
            )}

            <div className="space-y-1.5">
              <label htmlFor="client-name" className="text-sm font-medium">
                {t("name")}
              </label>
              <Input
                id="client-name"
                placeholder={t("namePlaceholder")}
                aria-invalid={!!errors.name}
                {...register("name")}
              />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="client-phone" className="text-sm font-medium">
                  {t("phone")} <span className="text-muted-foreground">{tc("optional")}</span>
                </label>
                <Input
                  id="client-phone"
                  placeholder={t("phonePlaceholder")}
                  {...register("phone")}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="client-email" className="text-sm font-medium">
                  {t("email")} <span className="text-muted-foreground">{tc("optional")}</span>
                </label>
                <Input
                  id="client-email"
                  type="email"
                  placeholder={t("emailPlaceholder")}
                  aria-invalid={!!errors.email}
                  {...register("email")}
                />
                {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="client-notes" className="text-sm font-medium">
                {t("notes")} <span className="text-muted-foreground">{tc("optional")}</span>
              </label>
              <Input id="client-notes" placeholder={t("notesPlaceholder")} {...register("notes")} />
            </div>
          </form>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{tc("cancel")}</DialogClose>
            <Button type="submit" form="client-form" disabled={isPending}>
              {isPending && <Loader2Icon className="mr-2 size-4 animate-spin" />}
              {isEdit ? tc("save") : tc("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Client Card ──────────────────────────────────────────────────────────────

function ClientCard({
  client,
  onUpdate,
}: {
  client: ClientRow;
  onUpdate: (updated: ClientRow | null) => void;
}) {
  const t = useTranslations("clients");
  const [localClient, setLocalClient] = useState(client);
  const [isPending, startTransition] = useTransition();

  function handleArchive() {
    startTransition(async () => {
      const result = await archiveClient(localClient.id);
      if (result.success) {
        const updated = { ...localClient, isActive: false };
        setLocalClient(updated);
        onUpdate(updated);
      }
    });
  }

  function handleUnarchive() {
    startTransition(async () => {
      const result = await unarchiveClient(localClient.id);
      if (result.success) {
        const updated = { ...localClient, isActive: true };
        setLocalClient(updated);
        onUpdate(updated);
      }
    });
  }

  return (
    <div
      className={`flex items-start justify-between rounded-xl border p-4 ${!localClient.isActive ? "opacity-60" : ""}`}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-sm">{localClient.name}</p>
          {!localClient.isActive && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {t("archived")}
            </span>
          )}
          <NoShowBadge count={localClient.noShowCount} />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
          {localClient.phone && <span>{localClient.phone}</span>}
          {localClient.email && <span>{localClient.email}</span>}
        </div>
        {localClient.notes && (
          <p className="text-xs text-muted-foreground italic">{localClient.notes}</p>
        )}
        {localClient.noShowCount > 0 && localClient.noShowCount < NO_SHOW_WARNING_THRESHOLD && (
          <p className="text-xs text-muted-foreground">
            {t("noShowCount")}: {localClient.noShowCount}
          </p>
        )}
      </div>

      <div className="ml-3 flex shrink-0 items-center gap-1">
        {localClient.isActive && (
          <ClientDialog
            config={{ mode: "edit", client: localClient }}
            trigger={
              <button
                className="text-muted-foreground hover:text-foreground p-1"
                aria-label={t("editClient")}
              >
                <PencilIcon className="size-4" />
              </button>
            }
            onSuccess={(updated) => {
              setLocalClient(updated);
              onUpdate(updated);
            }}
          />
        )}

        {localClient.isActive ? (
          <ConfirmationDialog
            trigger={
              <button
                className="text-muted-foreground hover:text-destructive p-1"
                aria-label={t("archive")}
                disabled={isPending}
              >
                <ArchiveIcon className="size-4" />
              </button>
            }
            title={t("archiveConfirmTitle", { name: localClient.name })}
            description={t("archiveConfirmDescription")}
            confirmLabel={t("archive")}
            variant="destructive"
            onConfirm={handleArchive}
          />
        ) : (
          <button
            onClick={handleUnarchive}
            disabled={isPending}
            className="text-muted-foreground hover:text-foreground p-1"
            aria-label={t("unarchive")}
          >
            <ArchiveRestoreIcon className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ClientList({ initialClients }: { initialClients: ClientRow[] }) {
  const t = useTranslations("clients");
  const [clients, setClients] = useState<ClientRow[]>(initialClients);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ClientRow[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [isSearching, startSearchTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      startSearchTransition(async () => {
        const result = await searchClients(query);
        if (result.success) setSearchResults(result.data);
      });
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function handleQueryChange(value: string) {
    setQuery(value);
    if (!value.trim()) setSearchResults(null);
  }

  function handleCreated(client: ClientRow) {
    setClients((prev) => [client, ...prev]);
    setQuery("");
    setSearchResults(null);
  }

  function handleUpdated(updated: ClientRow | null) {
    if (!updated) return;
    setClients((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    if (searchResults) {
      setSearchResults((prev) => prev?.map((c) => (c.id === updated.id ? updated : c)) ?? null);
    }
  }

  const displayList = searchResults !== null ? searchResults : clients;
  const visible = showArchived ? displayList : displayList.filter((c) => c.isActive);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("searchPlaceholder")}
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            className="pl-9"
            aria-label={t("searchPlaceholder")}
          />
          {isSearching && (
            <Loader2Icon className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>

        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground select-none">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="h-4 w-4 rounded border-muted-foreground/30"
            />
            {t("showArchived")}
          </label>

          <ClientDialog
            config={{ mode: "create" }}
            trigger={
              <Button size="sm" className="gap-1.5">
                <PlusIcon className="size-4" aria-hidden="true" />
                {t("addClient")}
              </Button>
            }
            onSuccess={handleCreated}
          />
        </div>
      </div>

      {/* Client list */}
      {visible.length === 0 ? (
        query.trim() ? (
          <EmptyState title={t("emptySearchTitle")} description={t("emptySearchDescription")} />
        ) : (
          <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
        )
      ) : (
        <div className="space-y-2">
          {visible.map((client) => (
            <ClientCard key={client.id} client={client} onUpdate={handleUpdated} />
          ))}
        </div>
      )}
    </div>
  );
}
