"use client";

/**
 * GarmentAttributeCatalog — T110
 *
 * "Tallas y colores" tab of the admin catalog. Sizes are ordered (that order
 * is the column order of every size grid); colours are alphabetical with an
 * optional swatch. Deactivate instead of delete — records keep what they use.
 */

import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";
import { garmentColorSchema, garmentSizeSchema } from "@befine/types";
import type { GarmentColorInput, GarmentSizeInput } from "@befine/types";
import { notifyDataChanged } from "@/lib/data-events";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CatalogAuditLog } from "@/components/catalog-audit-log";
import {
  createGarmentColor,
  createGarmentSize,
  editGarmentColor,
  renameGarmentSize,
  reorderGarmentSizes,
  setGarmentColorActive,
  setGarmentSizeActive,
} from "@/app/(protected)/admin/catalog/actions/garment-attributes";
import type {
  GarmentColorRow,
  GarmentSizeRow,
} from "@/app/(protected)/admin/catalog/actions/garment-attributes";
import { cn } from "@/lib/utils";

const ICON_BUTTON =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-40 max-md:size-11";

// ─── Shared bits ─────────────────────────────────────────────────────────────

function ServerError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
      role="alert"
    >
      {message}
    </p>
  );
}

function ActiveToggle({
  label,
  isActive,
  disabled,
  onChange,
}: {
  label: string;
  isActive: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  const t = useTranslations("catalog");
  if (!isActive)
    return (
      <button
        onClick={() => onChange(true)}
        disabled={disabled}
        className={ICON_BUTTON}
        aria-label={`${t("restore")}: ${label}`}
      >
        <RotateCcwIcon className="size-4" />
      </button>
    );
  return (
    <ConfirmationDialog
      trigger={
        <button
          disabled={disabled}
          className={cn(ICON_BUTTON, "hover:text-destructive")}
          aria-label={`${t("deactivate")}: ${label}`}
        >
          <Trash2Icon className="size-4" />
        </button>
      }
      title={t("garments.deactivateConfirm", { name: label })}
      description={t("garments.deactivateDescription")}
      confirmLabel={t("deactivate")}
      variant="destructive"
      onConfirm={() => onChange(false)}
    />
  );
}

// ─── Sizes ───────────────────────────────────────────────────────────────────

function SizeEditDialog({
  size,
  open,
  onOpenChange,
  onSaved,
}: {
  size: GarmentSizeRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (row: GarmentSizeRow) => void;
}) {
  const t = useTranslations("catalog");
  const tc = useTranslations("common");
  const { showToast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<GarmentSizeInput>({
    resolver: zodResolver(garmentSizeSchema),
    values: { label: size.label },
  });

  function onSubmit(data: GarmentSizeInput) {
    startTransition(async () => {
      const res = await renameGarmentSize(size.id, data);
      if (res.success) {
        showToast("success", t("garments.saved"));
        notifyDataChanged("catalog");
        onSaved(res.data);
        onOpenChange(false);
      } else {
        setServerError(res.error.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("garments.editSize")}</DialogTitle>
        </DialogHeader>
        <form
          id={`size-form-${size.id}`}
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="space-y-4"
        >
          <ServerError message={serverError} />
          <div className="space-y-1.5">
            <label htmlFor={`size-label-${size.id}`} className="text-sm font-medium">
              {t("garments.sizeLabel")}
            </label>
            <Input
              id={`size-label-${size.id}`}
              aria-invalid={!!errors.label}
              aria-describedby={errors.label ? `size-label-${size.id}-error` : undefined}
              {...register("label")}
            />
            {errors.label && (
              <p id={`size-label-${size.id}-error`} className="text-sm text-destructive">
                {errors.label.message}
              </p>
            )}
          </div>
        </form>
        <CatalogAuditLog entityId={size.id} />
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{tc("cancel")}</DialogClose>
          <Button type="submit" form={`size-form-${size.id}`} disabled={isPending}>
            {isPending && <Loader2Icon className="mr-2 size-4 animate-spin" />}
            {tc("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddSizeForm({ onCreated }: { onCreated: (row: GarmentSizeRow) => void }) {
  const t = useTranslations("catalog");
  const tc = useTranslations("common");
  const { showToast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<GarmentSizeInput>({
    resolver: zodResolver(garmentSizeSchema),
    defaultValues: { label: "" },
  });

  function onSubmit(data: GarmentSizeInput) {
    startTransition(async () => {
      const res = await createGarmentSize(data);
      if (res.success) {
        showToast("success", t("garments.sizeCreated"));
        notifyDataChanged("catalog");
        setServerError(null);
        reset({ label: "" });
        onCreated(res.data);
      } else {
        setServerError(res.error.message);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-1">
      <div className="flex gap-2">
        <Input
          placeholder={t("garments.sizePlaceholder")}
          aria-label={t("garments.sizeLabel")}
          aria-invalid={!!errors.label}
          aria-describedby={errors.label ? "new-size-error" : undefined}
          className="flex-1"
          {...register("label")}
        />
        <Button type="submit" disabled={isPending} className="gap-1.5">
          {isPending ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <PlusIcon className="size-4" aria-hidden="true" />
          )}
          {tc("add")}
        </Button>
      </div>
      {errors.label && (
        <p id="new-size-error" className="text-xs text-destructive">
          {errors.label.message}
        </p>
      )}
      {serverError && (
        <p className="text-xs text-destructive" role="alert">
          {serverError}
        </p>
      )}
    </form>
  );
}

function SizesSection({
  sizes,
  setSizes,
  showInactive,
}: {
  sizes: GarmentSizeRow[];
  setSizes: (rows: GarmentSizeRow[]) => void;
  showInactive: boolean;
}) {
  const t = useTranslations("catalog");
  const { showToast } = useToast();
  const [editing, setEditing] = useState<GarmentSizeRow | null>(null);
  const [isPending, startTransition] = useTransition();

  const visible = showInactive ? sizes : sizes.filter((s) => s.isActive);

  function move(id: string, direction: -1 | 1) {
    // Swap with the neighbour in the visible list; hidden inactive sizes keep their slots.
    const vi = visible.findIndex((s) => s.id === id);
    const neighbour = visible[vi + direction];
    if (!neighbour) return;
    const ids = sizes.map((s) => s.id);
    const a = ids.indexOf(id);
    const b = ids.indexOf(neighbour.id);
    [ids[a], ids[b]] = [ids[b]!, ids[a]!];

    const previous = sizes;
    setSizes(ids.map((x) => sizes.find((s) => s.id === x)!));
    startTransition(async () => {
      const res = await reorderGarmentSizes({ ids });
      if (res.success) {
        setSizes(res.data);
        notifyDataChanged("catalog");
      } else {
        setSizes(previous);
        showToast("error", res.error.message);
      }
    });
  }

  function setActive(row: GarmentSizeRow, isActive: boolean) {
    startTransition(async () => {
      const res = await setGarmentSizeActive(row.id, isActive);
      if (res.success) {
        showToast("success", isActive ? t("restoreSuccess") : t("deactivateSuccess"));
        notifyDataChanged("catalog");
        setSizes(sizes.map((s) => (s.id === row.id ? { ...s, isActive } : s)));
      } else {
        showToast("error", res.error.message);
      }
    });
  }

  return (
    <section aria-labelledby="sizes-heading" className="space-y-3">
      <div>
        <h2 id="sizes-heading" className="text-lg font-semibold">
          {t("garments.sizesTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("garments.sizesHint")}</p>
      </div>

      <AddSizeForm onCreated={(row) => setSizes([...sizes, row])} />

      {visible.length === 0 ? (
        <EmptyState
          title={t("garments.emptySizesTitle")}
          description={t("garments.emptySizesDescription")}
        />
      ) : (
        <ol className="divide-y rounded-xl border">
          {visible.map((size, i) => (
            <li
              key={size.id}
              className={cn("flex items-center gap-2 px-3 py-1.5", !size.isActive && "opacity-60")}
            >
              <span className="w-6 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
              <span className="flex-1 truncate text-sm font-medium">{size.label}</span>
              {!size.isActive && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {t("inactive")}
                </span>
              )}
              <button
                onClick={() => move(size.id, -1)}
                disabled={isPending || i === 0}
                className={ICON_BUTTON}
                aria-label={t("garments.moveUp", { name: size.label })}
              >
                <ArrowUpIcon className="size-4" />
              </button>
              <button
                onClick={() => move(size.id, 1)}
                disabled={isPending || i === visible.length - 1}
                className={ICON_BUTTON}
                aria-label={t("garments.moveDown", { name: size.label })}
              >
                <ArrowDownIcon className="size-4" />
              </button>
              <button
                onClick={() => setEditing(size)}
                disabled={isPending}
                className={ICON_BUTTON}
                aria-label={`${t("garments.editSize")}: ${size.label}`}
              >
                <PencilIcon className="size-4" />
              </button>
              <ActiveToggle
                label={size.label}
                isActive={size.isActive}
                disabled={isPending}
                onChange={(next) => setActive(size, next)}
              />
            </li>
          ))}
        </ol>
      )}

      {editing && (
        <SizeEditDialog
          size={editing}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          onSaved={(row) => setSizes(sizes.map((s) => (s.id === row.id ? row : s)))}
        />
      )}
    </section>
  );
}

// ─── Colours ─────────────────────────────────────────────────────────────────

function Swatch({ hex }: { hex: string | null }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-5 shrink-0 rounded-full border border-border",
        !hex &&
          "bg-[repeating-linear-gradient(45deg,var(--muted),var(--muted)_3px,transparent_3px,transparent_6px)]",
      )}
      style={hex ? { backgroundColor: hex } : undefined}
    />
  );
}

type ColorDialogConfig = { mode: "create" } | { mode: "edit"; color: GarmentColorRow };

function ColorDialog({
  config,
  onOpenChange,
  onSaved,
}: {
  config: ColorDialogConfig;
  onOpenChange: (open: boolean) => void;
  onSaved: (row: GarmentColorRow) => void;
}) {
  const t = useTranslations("catalog");
  const tc = useTranslations("common");
  const { showToast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isEdit = config.mode === "edit";

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<GarmentColorInput>({
    resolver: zodResolver(garmentColorSchema),
    defaultValues: isEdit
      ? { label: config.color.label, hex: config.color.hex }
      : { label: "", hex: "#000000" },
  });
  const hex = useWatch({ control, name: "hex" });

  function onSubmit(data: GarmentColorInput) {
    startTransition(async () => {
      const res = isEdit
        ? await editGarmentColor(config.color.id, data)
        : await createGarmentColor(data);
      if (res.success) {
        showToast("success", isEdit ? t("garments.saved") : t("garments.colorCreated"));
        notifyDataChanged("catalog");
        onSaved(res.data);
        onOpenChange(false);
      } else {
        setServerError(res.error.message);
      }
    });
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t("garments.editColor") : t("garments.addColor")}</DialogTitle>
        </DialogHeader>
        <form id="color-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <ServerError message={serverError} />
          <div className="space-y-1.5">
            <label htmlFor="color-label" className="text-sm font-medium">
              {t("garments.colorLabel")}
            </label>
            <Input
              id="color-label"
              placeholder={t("garments.colorPlaceholder")}
              aria-invalid={!!errors.label}
              aria-describedby={errors.label ? "color-label-error" : undefined}
              {...register("label")}
            />
            {errors.label && (
              <p id="color-label-error" className="text-sm text-destructive">
                {errors.label.message}
              </p>
            )}
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              {t("garments.swatch")} <span className="text-muted-foreground">{tc("optional")}</span>
            </legend>
            <div className="flex items-center gap-3">
              <input
                type="color"
                aria-label={t("garments.swatch")}
                value={hex ?? "#000000"}
                disabled={hex == null}
                onChange={(e) => setValue("hex", e.target.value.toUpperCase())}
                className="h-11 w-14 cursor-pointer rounded-md border border-input bg-background p-1 disabled:cursor-not-allowed disabled:opacity-40"
              />
              <span className="font-mono text-sm tabular-nums text-muted-foreground">
                {hex ?? t("garments.noSwatch")}
              </span>
            </div>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm md:min-h-0">
              <input
                type="checkbox"
                checked={hex == null}
                onChange={(e) => setValue("hex", e.target.checked ? null : "#000000")}
                className="size-4 rounded border-muted-foreground/30"
              />
              {t("garments.noSwatchHint")}
            </label>
            {errors.hex && <p className="text-sm text-destructive">{errors.hex.message}</p>}
          </fieldset>
        </form>
        {isEdit && <CatalogAuditLog entityId={config.color.id} />}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{tc("cancel")}</DialogClose>
          <Button type="submit" form="color-form" disabled={isPending}>
            {isPending && <Loader2Icon className="mr-2 size-4 animate-spin" />}
            {isEdit ? tc("save") : tc("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ColorsSection({
  colors,
  setColors,
  showInactive,
}: {
  colors: GarmentColorRow[];
  setColors: (rows: GarmentColorRow[]) => void;
  showInactive: boolean;
}) {
  const t = useTranslations("catalog");
  const { showToast } = useToast();
  const [dialog, setDialog] = useState<ColorDialogConfig | null>(null);
  const [isPending, startTransition] = useTransition();

  const visible = showInactive ? colors : colors.filter((c) => c.isActive);
  const sorted = (rows: GarmentColorRow[]) =>
    [...rows].sort((a, b) => a.label.localeCompare(b.label, "es"));

  function setActive(row: GarmentColorRow, isActive: boolean) {
    startTransition(async () => {
      const res = await setGarmentColorActive(row.id, isActive);
      if (res.success) {
        showToast("success", isActive ? t("restoreSuccess") : t("deactivateSuccess"));
        notifyDataChanged("catalog");
        setColors(colors.map((c) => (c.id === row.id ? { ...c, isActive } : c)));
      } else {
        showToast("error", res.error.message);
      }
    });
  }

  return (
    <section aria-labelledby="colors-heading" className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="colors-heading" className="text-lg font-semibold">
            {t("garments.colorsTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("garments.colorsHint")}</p>
        </div>
        <Button
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={() => setDialog({ mode: "create" })}
        >
          <PlusIcon className="size-4" aria-hidden="true" />
          {t("garments.addColor")}
        </Button>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={t("garments.emptyColorsTitle")}
          description={t("garments.emptyColorsDescription")}
        />
      ) : (
        <ul className="divide-y rounded-xl border">
          {visible.map((color) => (
            <li
              key={color.id}
              className={cn("flex items-center gap-3 px-3 py-1.5", !color.isActive && "opacity-60")}
            >
              <Swatch hex={color.hex} />
              <span className="flex-1 truncate text-sm font-medium">{color.label}</span>
              {!color.isActive && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {t("inactive")}
                </span>
              )}
              <button
                onClick={() => setDialog({ mode: "edit", color })}
                disabled={isPending}
                className={ICON_BUTTON}
                aria-label={`${t("garments.editColor")}: ${color.label}`}
              >
                <PencilIcon className="size-4" />
              </button>
              <ActiveToggle
                label={color.label}
                isActive={color.isActive}
                disabled={isPending}
                onChange={(next) => setActive(color, next)}
              />
            </li>
          ))}
        </ul>
      )}

      {dialog && (
        <ColorDialog
          key={dialog.mode === "edit" ? dialog.color.id : "new"}
          config={dialog}
          onOpenChange={(open) => !open && setDialog(null)}
          onSaved={(row) =>
            setColors(
              sorted(
                colors.some((c) => c.id === row.id)
                  ? colors.map((c) => (c.id === row.id ? row : c))
                  : [...colors, row],
              ),
            )
          }
        />
      )}
    </section>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export function GarmentAttributeCatalog({
  initialSizes,
  initialColors,
}: {
  initialSizes: GarmentSizeRow[];
  initialColors: GarmentColorRow[];
}) {
  const t = useTranslations("catalog");
  const [sizes, setSizes] = useState(initialSizes);
  const [colors, setColors] = useState(initialColors);
  const [showInactive, setShowInactive] = useState(false);

  return (
    <div className="space-y-6">
      <label className="flex min-h-11 w-fit cursor-pointer items-center gap-2 text-sm text-muted-foreground select-none md:min-h-0">
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
          className="size-4 rounded border-muted-foreground/30"
        />
        {t("showInactive")}
      </label>
      <div className="grid gap-8 lg:grid-cols-2">
        <SizesSection sizes={sizes} setSizes={setSizes} showInactive={showInactive} />
        <ColorsSection colors={colors} setColors={setColors} showInactive={showInactive} />
      </div>
    </div>
  );
}
