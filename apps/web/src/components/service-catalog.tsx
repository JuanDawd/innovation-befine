"use client";

/**
 * ServiceCatalog — T024
 *
 * Admin-only component to manage services and their variants.
 * Lists all services with variants, allows create/edit/deactivate/restore.
 */

import { useState, useTransition, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useToast } from "@/hooks/use-toast";
import {
  PlusIcon,
  PencilIcon,
  Trash2Icon,
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
  checkVariantOpenTickets,
  checkServiceOpenTickets,
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
                          <Trash2Icon className="size-3.5" />
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

// ─── Variant Accordion Open Slot ─────────────────────────────────────────────

type OpenSlot = { type: "none" } | { type: "edit"; variantId: string } | { type: "add" };

// ─── Inline Variant Edit Row ──────────────────────────────────────────────────

type VariantRow = ServiceRow["variants"][number];

function VariantEditRow({
  variant,
  onSave,
  onCancel,
  onDirtyChange,
}: {
  variant: VariantRow;
  onSave: () => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const t = useTranslations("catalog");
  const tc = useTranslations("common");
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<AddVariantInput>({
    resolver: zodResolver(addVariantSchema),
    defaultValues: {
      name: variant.name,
      customerPrice: variant.customerPrice,
      commissionPct: parseFloat(variant.commissionPct),
    },
  });

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  function onSubmit(data: AddVariantInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await editVariant(variant.id, data);
      if (result.success) {
        showToast("success", t("editVariantSuccess"));
        onSave();
      } else {
        setServerError(result.error.message);
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="rounded-lg border border-primary/30 bg-background p-3 space-y-3"
    >
      {serverError && (
        <p className="text-xs text-destructive" role="alert">
          {serverError}
        </p>
      )}
      <div className="space-y-1">
        <label htmlFor={`var-name-${variant.id}`} className="text-xs font-medium">
          {t("variantName")}
        </label>
        <Input
          id={`var-name-${variant.id}`}
          placeholder={t("variantNamePlaceholder")}
          aria-invalid={!!errors.name}
          {...register("name")}
        />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label htmlFor={`var-price-${variant.id}`} className="text-xs font-medium">
            {t("customerPrice")}
          </label>
          <Input
            id={`var-price-${variant.id}`}
            type="number"
            min={0}
            placeholder={t("customerPricePlaceholder")}
            aria-invalid={!!errors.customerPrice}
            {...register("customerPrice", { valueAsNumber: true })}
          />
          {errors.customerPrice && (
            <p className="text-xs text-destructive">{errors.customerPrice.message}</p>
          )}
        </div>
        <div className="space-y-1">
          <label htmlFor={`var-commission-${variant.id}`} className="text-xs font-medium">
            {t("commissionPct")}
          </label>
          <Input
            id={`var-commission-${variant.id}`}
            type="number"
            min={0}
            max={100}
            step={0.01}
            placeholder={t("commissionPctPlaceholder")}
            aria-invalid={!!errors.commissionPct}
            {...register("commissionPct", { valueAsNumber: true })}
          />
          {errors.commissionPct && (
            <p className="text-xs text-destructive">{errors.commissionPct.message}</p>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending && <Loader2Icon className="mr-1 size-3 animate-spin" />}
          {tc("save")}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {tc("cancel")}
        </Button>
      </div>
    </form>
  );
}

// ─── Inline Add Variant Row ───────────────────────────────────────────────────

function AddVariantRow({
  serviceId,
  onSave,
  onCancel,
  onDirtyChange,
}: {
  serviceId: string;
  onSave: () => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const t = useTranslations("catalog");
  const tc = useTranslations("common");
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<AddVariantInput>({
    resolver: zodResolver(addVariantSchema),
    defaultValues: { name: "", customerPrice: 0, commissionPct: 0 },
  });

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  function onSubmit(data: AddVariantInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await addVariant(serviceId, data);
      if (result.success) {
        showToast("success", t("addVariantSuccess"));
        onSave();
      } else {
        setServerError(result.error.message);
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="rounded-lg border border-dashed border-primary/40 bg-background p-3 space-y-3"
    >
      {serverError && (
        <p className="text-xs text-destructive" role="alert">
          {serverError}
        </p>
      )}
      <div className="space-y-1">
        <label htmlFor={`new-var-name-${serviceId}`} className="text-xs font-medium">
          {t("variantName")}
        </label>
        <Input
          id={`new-var-name-${serviceId}`}
          placeholder={t("variantNamePlaceholder")}
          aria-invalid={!!errors.name}
          {...register("name")}
        />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label htmlFor={`new-var-price-${serviceId}`} className="text-xs font-medium">
            {t("customerPrice")}
          </label>
          <Input
            id={`new-var-price-${serviceId}`}
            type="number"
            min={0}
            placeholder={t("customerPricePlaceholder")}
            aria-invalid={!!errors.customerPrice}
            {...register("customerPrice", { valueAsNumber: true })}
          />
          {errors.customerPrice && (
            <p className="text-xs text-destructive">{errors.customerPrice.message}</p>
          )}
        </div>
        <div className="space-y-1">
          <label htmlFor={`new-var-commission-${serviceId}`} className="text-xs font-medium">
            {t("commissionPct")}
          </label>
          <Input
            id={`new-var-commission-${serviceId}`}
            type="number"
            min={0}
            max={100}
            step={0.01}
            placeholder={t("commissionPctPlaceholder")}
            aria-invalid={!!errors.commissionPct}
            {...register("commissionPct", { valueAsNumber: true })}
          />
          {errors.commissionPct && (
            <p className="text-xs text-destructive">{errors.commissionPct.message}</p>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending && <Loader2Icon className="mr-1 size-3 animate-spin" />}
          {tc("create")}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {tc("cancel")}
        </Button>
      </div>
    </form>
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
  const [serviceImpact, setServiceImpact] = useState<number | null>(null);
  const [variantImpact, setVariantImpact] = useState<Record<string, number>>({});

  // Accordion mutual-exclusion state
  const [openSlot, setOpenSlot] = useState<OpenSlot>({ type: "none" });
  // Tracks whether the currently open inline form is dirty
  const [slotIsDirty, setSlotIsDirty] = useState(false);
  // Pending slot to switch to after discard confirmation
  const [pendingSlot, setPendingSlot] = useState<OpenSlot | null>(null);

  const visibleVariants = showInactive
    ? localService.variants
    : localService.variants.filter((v) => v.isActive);

  function requestOpenSlot(next: OpenSlot) {
    if (slotIsDirty) {
      setPendingSlot(next);
    } else {
      setOpenSlot(next);
      setSlotIsDirty(false);
    }
  }

  function handleDiscardConfirmed() {
    if (pendingSlot) {
      setOpenSlot(pendingSlot);
      setPendingSlot(null);
      setSlotIsDirty(false);
    }
  }

  function handleServiceUpdate(updates: Partial<ServiceRow>) {
    setLocalService((prev) => ({ ...prev, ...updates }));
  }

  async function loadServiceImpact() {
    const result = await checkServiceOpenTickets(localService.id);
    setServiceImpact(result.success ? result.data.count : 0);
  }

  async function loadVariantImpact(variantId: string) {
    const result = await checkVariantOpenTickets(variantId);
    setVariantImpact((prev) => ({ ...prev, [variantId]: result.success ? result.data.count : 0 }));
  }

  function handleDeactivateService() {
    startTransition(async () => {
      const result = await deactivateService(localService.id);
      if (result.success) {
        showToast("success", t("deactivateSuccess"));
        setLocalService((prev) => ({ ...prev, isActive: false }));
        setServiceImpact(null);
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
        setVariantImpact((prev) => {
          const next = { ...prev };
          delete next[variantId];
          return next;
        });
        if (openSlot.type === "edit" && openSlot.variantId === variantId) {
          setOpenSlot({ type: "none" });
          setSlotIsDirty(false);
        }
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
    <>
      {/* Discard-changes guard dialog — rendered outside card so it isn't nested */}
      <ConfirmationDialog
        open={pendingSlot !== null}
        onOpenChange={(open) => {
          if (!open) setPendingSlot(null);
        }}
        trigger={<span />}
        title={t("discardChanges")}
        description={t("discardChangesDescription")}
        confirmLabel={t("discard")}
        variant="destructive"
        onConfirm={handleDiscardConfirmed}
      />

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
                    onClick={() => loadServiceImpact()}
                  >
                    <Trash2Icon className="size-4" />
                  </button>
                }
                title={t("deactivateServiceConfirm", { name: localService.name })}
                description={t("deactivateServiceDescription")}
                warning={
                  serviceImpact !== null && serviceImpact > 0
                    ? t("impactWarning", { count: serviceImpact })
                    : undefined
                }
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

        {/* Variants accordion */}
        {expanded && (
          <div className="border-t px-4 pb-4">
            {visibleVariants.length === 0 && openSlot.type !== "add" ? (
              <p className="py-3 text-sm text-muted-foreground">{t("noVariants")}</p>
            ) : (
              <div className="mt-3 space-y-1">
                {visibleVariants.map((v) => {
                  const isEditOpen = openSlot.type === "edit" && openSlot.variantId === v.id;
                  return (
                    <div key={v.id} className="transition-all duration-200">
                      {/* Collapsed row */}
                      <div
                        className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${v.isActive ? "bg-muted/50" : "bg-muted/20 opacity-60"} ${isEditOpen ? "rounded-b-none border-b-0" : ""}`}
                      >
                        <div>
                          <span className="font-medium">{v.name}</span>
                          {!v.isActive && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              ({t("inactive")})
                            </span>
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
                              <button
                                className={`text-muted-foreground hover:text-foreground ${isEditOpen ? "text-primary" : ""}`}
                                aria-label={t("editVariant")}
                                aria-expanded={isEditOpen}
                                onClick={() =>
                                  requestOpenSlot(
                                    isEditOpen
                                      ? { type: "none" }
                                      : { type: "edit", variantId: v.id },
                                  )
                                }
                              >
                                <PencilIcon className="size-3.5" />
                              </button>
                              <ConfirmationDialog
                                trigger={
                                  <button
                                    className="text-muted-foreground hover:text-destructive"
                                    aria-label={t("deactivate")}
                                    onClick={() => loadVariantImpact(v.id)}
                                  >
                                    <Trash2Icon className="size-3.5" />
                                  </button>
                                }
                                title={t("deactivateVariantConfirm", { name: v.name })}
                                description={t("deactivateVariantDescription")}
                                warning={
                                  variantImpact[v.id] !== undefined && variantImpact[v.id] > 0
                                    ? t("impactWarning", { count: variantImpact[v.id] })
                                    : undefined
                                }
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

                      {/* Inline edit form */}
                      {isEditOpen && (
                        <div className="overflow-hidden transition-all duration-200">
                          <VariantEditRow
                            variant={v}
                            onDirtyChange={setSlotIsDirty}
                            onSave={() => {
                              setOpenSlot({ type: "none" });
                              setSlotIsDirty(false);
                              onChange();
                            }}
                            onCancel={() => {
                              setOpenSlot({ type: "none" });
                              setSlotIsDirty(false);
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add variant slot */}
            {localService.isActive && (
              <div className="mt-2">
                {openSlot.type === "add" ? (
                  <div className="overflow-hidden transition-all duration-200">
                    <AddVariantRow
                      serviceId={localService.id}
                      onDirtyChange={setSlotIsDirty}
                      onSave={() => {
                        setOpenSlot({ type: "none" });
                        setSlotIsDirty(false);
                        onChange();
                      }}
                      onCancel={() => {
                        setOpenSlot({ type: "none" });
                        setSlotIsDirty(false);
                      }}
                    />
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => requestOpenSlot({ type: "add" })}
                  >
                    <PlusIcon className="size-3" />
                    {t("createVariant")}
                  </Button>
                )}
              </div>
            )}

            <CatalogAuditLog entityId={localService.id} />
          </div>
        )}
      </div>
    </>
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
