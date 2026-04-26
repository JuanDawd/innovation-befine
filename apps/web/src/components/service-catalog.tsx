"use client";

/**
 * ServiceCatalog — T024
 *
 * Admin-only component to manage services and their variants.
 * Lists all services with variants, allows create/edit/deactivate/restore.
 */

import React, { useState, useTransition } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useToast } from "@/hooks/use-toast";
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  RotateCcwIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  Loader2Icon,
} from "lucide-react";
import { createServiceSchema, editServiceSchema, addVariantSchema } from "@befine/types";
import type { CreateServiceInput, EditServiceInput, AddVariantInput } from "@befine/types";
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
import type { ServiceRow } from "@/app/(protected)/admin/catalog/actions/services";
import { CatalogAuditLog } from "@/components/catalog-audit-log";
import {
  createService,
  editService,
  addVariant,
  editVariant,
  deactivateService,
  restoreService,
  deactivateVariant,
  restoreVariant,
} from "@/app/(protected)/admin/catalog/actions/services";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCOP(amount: number): string {
  return `$${amount.toLocaleString("es-CO")}`;
}

// ─── Create Service Dialog ────────────────────────────────────────────────────

function CreateServiceDialog({ onSuccess }: { onSuccess: (service: ServiceRow) => void }) {
  const t = useTranslations("catalog");
  const tc = useTranslations("common");
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<CreateServiceInput>({
    resolver: zodResolver(createServiceSchema),
    defaultValues: {
      name: "",
      description: "",
      variants: [{ name: "", customerPrice: 0, commissionPct: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "variants" });

  function handleOpen() {
    reset({
      name: "",
      description: "",
      variants: [{ name: t("standardVariantName"), customerPrice: 0, commissionPct: 0 }],
    });
    setServerError(null);
    setOpen(true);
  }

  async function onSubmit(data: CreateServiceInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await createService(data);
      if (result.success) {
        showToast("success", t("createServiceSuccess"));
        setOpen(false);
        // Build a minimal ServiceRow to satisfy the parent
        onSuccess({
          id: result.data.id,
          name: data.name,
          description: data.description ?? null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          variants: data.variants.map((v, i) => ({
            id: `temp-${i}`,
            serviceId: result.data.id,
            name: v.name,
            customerPrice: v.customerPrice,
            commissionPct: v.commissionPct.toFixed(2),
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
        });
      } else {
        setServerError(result.error.message);
      }
    });
  }

  return (
    <>
      <Button onClick={handleOpen} size="sm" className="gap-1.5">
        <PlusIcon className="size-4" aria-hidden="true" />
        {t("createService")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("createService")}</DialogTitle>
          </DialogHeader>

          <form
            id="create-service-form"
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
              <label htmlFor="svc-name" className="text-sm font-medium">
                {t("serviceName")}
              </label>
              <Input
                id="svc-name"
                placeholder={t("serviceNamePlaceholder")}
                aria-invalid={!!errors.name}
                {...register("name")}
              />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="svc-desc" className="text-sm font-medium">
                {t("serviceDescription")}{" "}
                <span className="text-muted-foreground">{tc("optional")}</span>
              </label>
              <Input
                id="svc-desc"
                placeholder={t("serviceDescriptionPlaceholder")}
                {...register("description")}
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">{t("variants")}</p>
              {errors.variants?.root && (
                <p className="text-sm text-destructive">{errors.variants.root.message}</p>
              )}
              <div className="space-y-3">
                {fields.map((field, idx) => (
                  <div key={field.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        Variante {idx + 1}
                      </span>
                      {fields.length > 1 && (
                        <button
                          type="button"
                          onClick={() => remove(idx)}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="Eliminar variante"
                        >
                          <TrashIcon className="size-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Input
                        placeholder={t("variantNamePlaceholder")}
                        aria-label={t("variantName")}
                        aria-invalid={!!errors.variants?.[idx]?.name}
                        {...register(`variants.${idx}.name`)}
                      />
                      {errors.variants?.[idx]?.name && (
                        <p className="text-xs text-destructive">
                          {errors.variants[idx].name?.message}
                        </p>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">
                          {t("customerPrice")}
                        </label>
                        <Input
                          type="number"
                          min={0}
                          placeholder={t("customerPricePlaceholder")}
                          aria-invalid={!!errors.variants?.[idx]?.customerPrice}
                          {...register(`variants.${idx}.customerPrice`, { valueAsNumber: true })}
                        />
                        {errors.variants?.[idx]?.customerPrice && (
                          <p className="text-xs text-destructive">
                            {errors.variants[idx].customerPrice?.message}
                          </p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">
                          {t("commissionPct")}
                        </label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={0.01}
                          placeholder={t("commissionPctPlaceholder")}
                          aria-invalid={!!errors.variants?.[idx]?.commissionPct}
                          {...register(`variants.${idx}.commissionPct`, { valueAsNumber: true })}
                        />
                        {errors.variants?.[idx]?.commissionPct && (
                          <p className="text-xs text-destructive">
                            {errors.variants[idx].commissionPct?.message}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full gap-1.5"
                onClick={() => append({ name: "", customerPrice: 0, commissionPct: 0 })}
              >
                <PlusIcon className="size-3.5" />
                {t("createVariant")}
              </Button>
            </div>
          </form>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{tc("cancel")}</DialogClose>
            <Button type="submit" form="create-service-form" disabled={isPending}>
              {isPending && <Loader2Icon className="mr-2 size-4 animate-spin" />}
              {tc("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Edit Service Dialog ──────────────────────────────────────────────────────

function EditServiceDialog({
  service,
  onSuccess,
}: {
  service: ServiceRow;
  onSuccess: (updated: Partial<ServiceRow>) => void;
}) {
  const t = useTranslations("catalog");
  const tc = useTranslations("common");
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EditServiceInput>({
    resolver: zodResolver(editServiceSchema),
  });

  function handleOpen() {
    reset({ name: service.name, description: service.description ?? "" });
    setServerError(null);
    setOpen(true);
  }

  async function onSubmit(data: EditServiceInput) {
    startTransition(async () => {
      const result = await editService(service.id, data);
      if (result.success) {
        showToast("success", t("editServiceSuccess"));
        setOpen(false);
        onSuccess({ name: data.name, description: data.description ?? null });
      } else {
        setServerError(result.error.message);
      }
    });
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="text-muted-foreground hover:text-foreground"
        aria-label={t("editService")}
      >
        <PencilIcon className="size-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("editService")}</DialogTitle>
          </DialogHeader>

          <form
            id="edit-service-form"
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
              <label htmlFor="edit-svc-name" className="text-sm font-medium">
                {t("serviceName")}
              </label>
              <Input id="edit-svc-name" aria-invalid={!!errors.name} {...register("name")} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="edit-svc-desc" className="text-sm font-medium">
                {t("serviceDescription")}{" "}
                <span className="text-muted-foreground">{tc("optional")}</span>
              </label>
              <Input id="edit-svc-desc" {...register("description")} />
            </div>
          </form>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{tc("cancel")}</DialogClose>
            <Button type="submit" form="edit-service-form" disabled={isPending}>
              {isPending && <Loader2Icon className="mr-2 size-4 animate-spin" />}
              {tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Add/Edit Variant Dialog ──────────────────────────────────────────────────

type VariantDialogMode =
  | { mode: "add"; serviceId: string }
  | { mode: "edit"; variantId: string; initial: AddVariantInput };

function VariantDialog({
  config,
  trigger,
  onSuccess,
}: {
  config: VariantDialogMode;
  trigger: React.ReactNode;
  onSuccess: () => void;
}) {
  const t = useTranslations("catalog");
  const tc = useTranslations("common");
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const defaultValues =
    config.mode === "edit" ? config.initial : { name: "", customerPrice: 0, commissionPct: 0 };

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AddVariantInput>({
    resolver: zodResolver(addVariantSchema),
    defaultValues,
  });

  function handleOpen() {
    reset(
      config.mode === "edit" ? config.initial : { name: "", customerPrice: 0, commissionPct: 0 },
    );
    setServerError(null);
    setOpen(true);
  }

  async function onSubmit(data: AddVariantInput) {
    startTransition(async () => {
      const result =
        config.mode === "add"
          ? await addVariant(config.serviceId, data)
          : await editVariant(config.variantId, data);

      if (result.success) {
        showToast(
          "success",
          config.mode === "add" ? t("addVariantSuccess") : t("editVariantSuccess"),
        );
        setOpen(false);
        onSuccess();
      } else {
        setServerError(result.error.message);
      }
    });
  }

  const title = config.mode === "add" ? t("createVariant") : t("editVariant");

  return (
    <>
      {React.isValidElement(trigger)
        ? React.cloneElement(trigger as React.ReactElement<{ onClick?: () => void }>, {
            onClick: handleOpen,
          })
        : trigger}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>

          <form
            id="variant-form"
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
              <label htmlFor="var-name" className="text-sm font-medium">
                {t("variantName")}
              </label>
              <Input
                id="var-name"
                placeholder={t("variantNamePlaceholder")}
                aria-invalid={!!errors.name}
                {...register("name")}
              />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="var-price" className="text-sm font-medium">
                  {t("customerPrice")}
                </label>
                <Input
                  id="var-price"
                  type="number"
                  min={0}
                  placeholder={t("customerPricePlaceholder")}
                  aria-invalid={!!errors.customerPrice}
                  {...register("customerPrice", { valueAsNumber: true })}
                />
                {errors.customerPrice && (
                  <p className="text-sm text-destructive">{errors.customerPrice.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label htmlFor="var-commission" className="text-sm font-medium">
                  {t("commissionPct")}
                </label>
                <Input
                  id="var-commission"
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  placeholder={t("commissionPctPlaceholder")}
                  aria-invalid={!!errors.commissionPct}
                  {...register("commissionPct", { valueAsNumber: true })}
                />
                {errors.commissionPct && (
                  <p className="text-sm text-destructive">{errors.commissionPct.message}</p>
                )}
              </div>
            </div>
          </form>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{tc("cancel")}</DialogClose>
            <Button type="submit" form="variant-form" disabled={isPending}>
              {isPending && <Loader2Icon className="mr-2 size-4 animate-spin" />}
              {tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Service Card ─────────────────────────────────────────────────────────────

function ServiceCard({
  service,
  showInactive,
  onChange,
}: {
  service: ServiceRow;
  showInactive: boolean;
  onChange: () => void;
}) {
  const t = useTranslations("catalog");
  const { showToast } = useToast();
  const [expanded, setExpanded] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [localService, setLocalService] = useState(service);

  const visibleVariants = showInactive
    ? localService.variants
    : localService.variants.filter((v) => v.isActive);

  function handleServiceUpdate(updates: Partial<ServiceRow>) {
    setLocalService((prev) => ({ ...prev, ...updates }));
  }

  function handleDeactivateService() {
    startTransition(async () => {
      const result = await deactivateService(localService.id);
      if (result.success) {
        showToast("success", t("deactivateSuccess"));
        setLocalService((prev) => ({ ...prev, isActive: false }));
      } else {
        showToast("error", t("deactivateError"));
      }
    });
  }

  function handleRestoreService() {
    startTransition(async () => {
      const result = await restoreService(localService.id);
      if (result.success) {
        showToast("success", t("restoreSuccess"));
        setLocalService((prev) => ({ ...prev, isActive: true }));
      } else {
        showToast("error", t("restoreError"));
      }
    });
  }

  function handleDeactivateVariant(variantId: string) {
    startTransition(async () => {
      const result = await deactivateVariant(variantId);
      if (result.success) {
        showToast("success", t("deactivateSuccess"));
        setLocalService((prev) => ({
          ...prev,
          variants: prev.variants.map((v) => (v.id === variantId ? { ...v, isActive: false } : v)),
        }));
      } else {
        showToast("error", t("deactivateError"));
      }
    });
  }

  function handleRestoreVariant(variantId: string) {
    startTransition(async () => {
      const result = await restoreVariant(variantId);
      if (result.success) {
        showToast("success", t("restoreSuccess"));
        setLocalService((prev) => ({
          ...prev,
          variants: prev.variants.map((v) => (v.id === variantId ? { ...v, isActive: true } : v)),
        }));
      } else {
        showToast("error", t("restoreError"));
      }
    });
  }

  return (
    <div className={`rounded-xl border ${localService.isActive ? "" : "opacity-60"}`}>
      {/* Service header */}
      <div className="flex items-center gap-2 p-4">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex flex-1 items-center gap-2 text-left"
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
          )}
          <div>
            <p className="font-medium text-sm">{localService.name}</p>
            {localService.description && (
              <p className="text-xs text-muted-foreground">{localService.description}</p>
            )}
          </div>
        </button>

        <div className="flex items-center gap-1">
          {!localService.isActive && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {t("inactive")}
            </span>
          )}

          <EditServiceDialog service={localService} onSuccess={handleServiceUpdate} />

          {localService.isActive ? (
            <ConfirmationDialog
              trigger={
                <button
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={t("deactivate")}
                  disabled={isPending}
                >
                  <TrashIcon className="size-4" />
                </button>
              }
              title={t("deactivateServiceConfirm", { name: localService.name })}
              description={t("deactivateServiceDescription")}
              confirmLabel={t("deactivate")}
              variant="destructive"
              onConfirm={handleDeactivateService}
            />
          ) : (
            <button
              onClick={handleRestoreService}
              disabled={isPending}
              className="text-muted-foreground hover:text-foreground"
              aria-label={t("restore")}
            >
              <RotateCcwIcon className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* Variants */}
      {expanded && (
        <div className="border-t px-4 pb-4">
          {visibleVariants.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">{t("noVariants")}</p>
          ) : (
            <div className="mt-3 space-y-1">
              {visibleVariants.map((v) => (
                <div
                  key={v.id}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${v.isActive ? "bg-muted/50" : "bg-muted/20 opacity-60"}`}
                >
                  <div>
                    <span className="font-medium">{v.name}</span>
                    {!v.isActive && (
                      <span className="ml-2 text-xs text-muted-foreground">({t("inactive")})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono tabular-nums text-xs">
                      {formatCOP(v.customerPrice)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {parseFloat(v.commissionPct).toFixed(1)}%
                    </span>
                    {v.isActive ? (
                      <>
                        <VariantDialog
                          config={{
                            mode: "edit",
                            variantId: v.id,
                            initial: {
                              name: v.name,
                              customerPrice: v.customerPrice,
                              commissionPct: parseFloat(v.commissionPct),
                            },
                          }}
                          trigger={
                            <span className="text-muted-foreground hover:text-foreground cursor-pointer">
                              <PencilIcon className="size-3.5" aria-label={t("editVariant")} />
                            </span>
                          }
                          onSuccess={onChange}
                        />
                        <ConfirmationDialog
                          trigger={
                            <button
                              className="text-muted-foreground hover:text-destructive"
                              aria-label={t("deactivate")}
                            >
                              <TrashIcon className="size-3.5" />
                            </button>
                          }
                          title={t("deactivateVariantConfirm", { name: v.name })}
                          description={t("deactivateVariantDescription")}
                          confirmLabel={t("deactivate")}
                          variant="destructive"
                          onConfirm={() => handleDeactivateVariant(v.id)}
                        />
                      </>
                    ) : (
                      <button
                        onClick={() => handleRestoreVariant(v.id)}
                        disabled={isPending}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label={t("restore")}
                      >
                        <RotateCcwIcon className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {localService.isActive && (
            <VariantDialog
              config={{ mode: "add", serviceId: localService.id }}
              trigger={
                <Button variant="ghost" size="sm" className="mt-2 gap-1.5 text-xs">
                  <PlusIcon className="size-3" />
                  {t("createVariant")}
                </Button>
              }
              onSuccess={onChange}
            />
          )}

          <CatalogAuditLog entityId={localService.id} />
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ServiceCatalog({ initialServices }: { initialServices: ServiceRow[] }) {
  const t = useTranslations("catalog");
  const [services, setServices] = useState<ServiceRow[]>(initialServices);
  const [showInactive, setShowInactive] = useState(false);

  const visible = showInactive ? services : services.filter((s) => s.isActive);

  function handleCreated(service: ServiceRow) {
    setServices((prev) => [...prev, service]);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground select-none">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="h-4 w-4 rounded border-muted-foreground/30"
          />
          {t("showInactive")}
        </label>
        <CreateServiceDialog onSuccess={handleCreated} />
      </div>

      {visible.length === 0 ? (
        <EmptyState title={t("emptyServicesTitle")} description={t("emptyServicesDescription")} />
      ) : (
        <div className="space-y-3">
          {visible.map((service) => (
            <ServiceCard
              key={service.id}
              service={service}
              showInactive={showInactive}
              onChange={() => {
                // Trigger rerender — server revalidation handles data refresh on next load
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
