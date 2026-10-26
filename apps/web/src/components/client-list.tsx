"use client";

/**
 * ClientList — T030, T032
 *
 * Full client management screen: search, create, edit, archive/unarchive.
 * Shows no-show count badge when count >= NO_SHOW_WARNING_THRESHOLD.
 * Used on both /cashier/clients and /secretary/clients pages.
 */

import { notifyDataChanged } from "@/lib/data-events";
import { cloneElement, useState, useTransition, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { RecordHistoryButton } from "@/components/record-history";
import { useToast } from "@/hooks/use-toast";
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
import { useIncrementalList } from "@/hooks/use-incremental-list";
import { ShowMore } from "@/components/ui/show-more";

/** No-show count threshold for the warning badge */
const NO_SHOW_WARNING_THRESHOLD = 3;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Any no-show is worth seeing when booking; from the threshold on it's a warning. */
function NoShowBadge({ count }: { count: number }) {
  const t = useTranslations("clients");
  if (count === 0) return null;
  const warn = count >= NO_SHOW_WARNING_THRESHOLD;
  return (
    <span
      className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        warn
          ? "bg-status-attention text-status-attention-foreground"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {warn && <AlertTriangleIcon className="size-3" aria-hidden="true" />}
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
  /** A button element; the dialog attaches its own onClick to it. */
  trigger: React.ReactElement<{ onClick?: () => void }>;
  onSuccess: (client: ClientRow) => void;
}) {
  const t = useTranslations("clients");
  const tc = useTranslations("common");
  const { showToast } = useToast();
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
            birthday: config.client.birthday ?? "",
          }
        : { name: "", phone: "", email: "", notes: "", birthday: "" },
    );
    setServerError(null);
    setOpen(true);
  }

  async function onSubmit(data: CreateClientInput) {
    startTransition(async () => {
      const result = isEdit ? await editClient(config.client.id, data) : await createClient(data);

      if (result.success) {
        showToast("success", isEdit ? t("editSuccess") : t("createSuccess"));
        notifyDataChanged("clients");
        setOpen(false);
        onSuccess(result.data);
      } else {
        setServerError(result.error.message);
      }
    });
  }

  return (
    <>
      {cloneElement(trigger, { onClick: handleOpen })}

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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

            <div className="space-y-1.5">
              <label htmlFor="client-birthday" className="text-sm font-medium">
                {t("birthday")} <span className="text-muted-foreground">{tc("optional")}</span>
              </label>
              <Input
                id="client-birthday"
                type="date"
                aria-invalid={!!errors.birthday}
                {...register("birthday")}
              />
              {errors.birthday && (
                <p className="text-sm text-destructive">{errors.birthday.message}</p>
              )}
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

// ─── Client Row ──────────────────────────────────────────────────────────────

function ClientCard({
  client,
  onUpdate,
}: {
  client: ClientRow;
  onUpdate: (updated: ClientRow | null) => void;
}) {
  const t = useTranslations("clients");
  const { showToast } = useToast();
  const [localClient, setLocalClient] = useState(client);
  const [isPending, startTransition] = useTransition();

  function handleArchive() {
    startTransition(async () => {
      const result = await archiveClient(localClient.id);
      if (result.success) {
        showToast("success", t("archiveSuccess"));
        notifyDataChanged("clients");
        const updated = { ...localClient, isActive: false };
        setLocalClient(updated);
        onUpdate(updated);
      } else {
        showToast("error", t("archiveError"));
      }
    });
  }

  function handleUnarchive() {
    startTransition(async () => {
      const result = await unarchiveClient(localClient.id);
      if (result.success) {
        showToast("success", t("unarchiveSuccess"));
        notifyDataChanged("clients");
        const updated = { ...localClient, isActive: true };
        setLocalClient(updated);
        onUpdate(updated);
      } else {
        showToast("error", t("unarchiveError"));
      }
    });
  }

  const archived = !localClient.isActive;
  const iconButton = "text-muted-foreground pointer-coarse:size-11";

  return (
    <li className="grid gap-x-6 gap-y-1 px-4 py-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,1.2fr)_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p
            className={`truncate text-sm font-medium ${archived ? "text-muted-foreground" : "text-foreground"}`}
          >
            {localClient.name}
          </p>
          {archived && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {t("archived")}
            </span>
          )}
          <NoShowBadge count={localClient.noShowCount} />
        </div>
        {localClient.notes && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground italic">
            {localClient.notes}
          </p>
        )}
      </div>
      <p className="truncate font-mono text-xs text-muted-foreground tabular-nums max-md:col-span-2 md:text-sm">
        {localClient.phone ?? (
          <span className="font-sans" aria-hidden="true">
            —
          </span>
        )}
      </p>
      {/* On phones an empty email takes no row; on desktop the column keeps its dash */}
      <p
        className={`truncate text-xs text-muted-foreground max-md:col-span-2 md:text-sm ${localClient.email ? "" : "max-md:hidden"}`}
      >
        {localClient.email ?? <span aria-hidden="true">—</span>}
      </p>

      <div className="-mr-2 flex shrink-0 items-center justify-end gap-0.5 max-md:row-start-1 max-md:col-start-2 max-md:self-start">
        <RecordHistoryButton
          entityType="client"
          entityId={localClient.id}
          title={localClient.name}
        />
        {localClient.isActive && (
          <ClientDialog
            config={{ mode: "edit", client: localClient }}
            trigger={
              <Button
                variant="ghost"
                size="icon"
                className={iconButton}
                aria-label={`${t("editClient")}: ${localClient.name}`}
              >
                <PencilIcon aria-hidden="true" />
              </Button>
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
              <Button
                variant="ghost"
                size="icon"
                className={`${iconButton} hover:text-destructive`}
                aria-label={`${t("archive")}: ${localClient.name}`}
                disabled={isPending}
              >
                <ArchiveIcon aria-hidden="true" />
              </Button>
            }
            title={t("archiveConfirmTitle", { name: localClient.name })}
            description={t("archiveConfirmDescription")}
            confirmLabel={t("archive")}
            variant="destructive"
            onConfirm={handleArchive}
          />
        ) : (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleUnarchive}
            disabled={isPending}
            className={iconButton}
            aria-label={`${t("unarchive")}: ${localClient.name}`}
          >
            <ArchiveRestoreIcon aria-hidden="true" />
          </Button>
        )}
      </div>
    </li>
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
  const filtered = showArchived ? displayList : displayList.filter((c) => c.isActive);
  const { visible, remaining, showMore } = useIncrementalList(filtered, `${query}|${showArchived}`);

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
      {filtered.length === 0 ? (
        query.trim() ? (
          <EmptyState title={t("emptySearchTitle")} description={t("emptySearchDescription")} />
        ) : (
          <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
        )
      ) : (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border bg-card">
            {/* Column headings for the desktop grid (rows label themselves on phones) */}
            <div
              className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,1.2fr)_auto] gap-x-6 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground max-md:hidden"
              aria-hidden="true"
            >
              <span>{t("colName")}</span>
              <span>{t("colPhone")}</span>
              <span>{t("colEmail")}</span>
              <span className="w-[3.5rem]" />
            </div>
            <ul className="divide-y max-md:[&>li]:grid-cols-[minmax(0,1fr)_auto]">
              {visible.map((client) => (
                <ClientCard key={client.id} client={client} onUpdate={handleUpdated} />
              ))}
            </ul>
          </div>
          <ShowMore remaining={remaining} onClick={showMore} />
        </div>
      )}
    </div>
  );
}
