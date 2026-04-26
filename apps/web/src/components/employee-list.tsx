"use client";

/**
 * EmployeeList — T014, T015, T022a
 *
 * Displays all employees with:
 * - Role + subtype badges
 * - Active/inactive status
 * - Filter by role and active/inactive toggle
 * - Click row → edit dialog with T014 fields + T015 earnings toggle + T022a deactivate
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import * as Sentry from "@sentry/nextjs";
import { UserIcon, UserXIcon, PencilIcon, Loader2Icon, CheckIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { EmployeeListItem } from "@/app/(protected)/admin/employees/actions/list-employees";
import {
  editEmployee,
  setShowEarnings,
  deactivateEmployee,
  terminateEmployee,
} from "@/app/(protected)/admin/employees/actions/update-employee";
import { previewEarnings } from "@/app/(protected)/admin/payroll/actions";

const STYLIST_SUBTYPES = [
  { value: "hairdresser" },
  { value: "manicurist" },
  { value: "masseuse" },
  { value: "makeup_artist" },
  { value: "spa_manager" },
] as const;

const APP_ROLES = ["cashier_admin", "secretary", "stylist", "clothier"] as const;

const editSchema = z.object({
  name: z.string().min(2).max(100),
  role: z.enum(APP_ROLES),
  stylistSubtype: z
    .enum(["hairdresser", "manicurist", "masseuse", "makeup_artist", "spa_manager"])
    .nullable()
    .optional(),
  dailyRate: z.number().int().min(0).nullable().optional(),
  expectedWorkDays: z.number().int().min(1).max(7),
  version: z.number().int().min(0),
});

type EditInput = z.infer<typeof editSchema>;

interface EmployeeListProps {
  initialEmployees: EmployeeListItem[];
}

export function EmployeeList({ initialEmployees }: EmployeeListProps) {
  const t = useTranslations("employees");
  const tRoles = useTranslations("roles");
  const tSubtypes = useTranslations("stylistSubtypes");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [employees, setEmployees] = useState(initialEmployees);
  const [filterRole, setFilterRole] = useState<string>("all");
  const [showInactive, setShowInactive] = useState(false);
  const [editTarget, setEditTarget] = useState<EmployeeListItem | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [terminateOpen, setTerminateOpen] = useState(false);
  const [terminateTarget, setTerminateTarget] = useState<EmployeeListItem | null>(null);
  const [terminateAmount, setTerminateAmount] = useState("");
  const [terminateMethod, setTerminateMethod] = useState<"cash" | "card" | "transfer">("cash");
  const [terminateReason, setTerminateReason] = useState("");
  const [terminateError, setTerminateError] = useState<string | null>(null);
  const [computedTermination, setComputedTermination] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EditInput>({ resolver: zodResolver(editSchema) });

  // eslint-disable-next-line react-hooks/incompatible-library
  const editRole = watch("role");

  function openEdit(emp: EmployeeListItem) {
    setEditTarget(emp);
    setEditError(null);
    setConfirmDeactivate(false);
    reset({
      name: emp.name,
      role: emp.role as (typeof APP_ROLES)[number],
      stylistSubtype: emp.stylistSubtype as EditInput["stylistSubtype"],
      dailyRate: emp.dailyRate,
      expectedWorkDays: emp.expectedWorkDays,
      version: emp.version,
    });
    setEditOpen(true);
  }

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  }

  async function onEditSubmit(data: EditInput) {
    if (!editTarget) return;
    setEditError(null);
    const result = await editEmployee(editTarget.id, data);
    if (result.success) {
      setEmployees((prev) => prev.map((e) => (e.id === editTarget.id ? result.data : e)));
      setEditOpen(false);
      showToast(t("editSuccess"));
    } else {
      Sentry.addBreadcrumb({ category: "ui.toast", message: result.error.message, level: "error" });
      setEditError(result.error.message);
    }
  }

  function handleToggleEarnings(emp: EmployeeListItem) {
    startTransition(async () => {
      const result = await setShowEarnings(emp.id, !emp.showEarnings);
      if (result.success) {
        setEmployees((prev) =>
          prev.map((e) => (e.id === emp.id ? { ...e, showEarnings: result.data.showEarnings } : e)),
        );
      }
    });
  }

  function handleDeactivate(emp: EmployeeListItem) {
    startTransition(async () => {
      const result = await deactivateEmployee(emp.id);
      if (result.success) {
        setEmployees((prev) =>
          prev.map((e) =>
            e.id === emp.id
              ? { ...e, isActive: false, deactivatedAt: result.data.deactivatedAt }
              : e,
          ),
        );
        showToast(t("deactivateSuccess"));
        return;
      }
      // T022b: unsettled earnings → open termination dialog
      if (result.error.code === "CONFLICT") {
        setTerminateTarget(emp);
        setTerminateError(null);
        setComputedTermination(null);
        setTerminateAmount("");
        setTerminateReason("");
        setTerminateOpen(true);
        // Pre-fill with computed amount
        const preview = await previewEarnings(emp.id, []);
        if (preview.success) {
          // We pass empty array — just surface 0 for now; admin fills in
          setComputedTermination(preview.data.computedAmount);
          setTerminateAmount(String(preview.data.computedAmount));
        }
      }
    });
  }

  function handleTerminate() {
    if (!terminateTarget) return;
    setTerminateError(null);
    startTransition(async () => {
      const amount = parseInt(terminateAmount, 10);
      if (isNaN(amount) || amount < 0) {
        setTerminateError(t("invalidAmount"));
        return;
      }
      if (!terminateReason.trim()) {
        setTerminateError(t("terminationReasonRequired"));
        return;
      }
      const result = await terminateEmployee({
        employeeId: terminateTarget.id,
        terminationAmount: amount,
        method: terminateMethod,
        reason: terminateReason.trim(),
      });
      if (result.success) {
        setEmployees((prev) =>
          prev.map((e) =>
            e.id === terminateTarget.id
              ? { ...e, isActive: false, deactivatedAt: result.data.deactivatedAt }
              : e,
          ),
        );
        setTerminateOpen(false);
        showToast(t("terminateSuccess"));
      } else {
        Sentry.addBreadcrumb({
          category: "ui.toast",
          message: result.error.message,
          level: "error",
        });
        setTerminateError(result.error.message);
      }
    });
  }

  const filtered = employees.filter((emp) => {
    if (!showInactive && !emp.isActive) return false;
    if (filterRole !== "all" && emp.role !== filterRole) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toastMsg && (
        <div
          role="status"
          className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400"
        >
          {toastMsg}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          aria-label={t("filterByRole")}
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        >
          <option value="all">{t("allRoles")}</option>
          {APP_ROLES.map((r) => (
            <option key={r} value={r}>
              {tRoles(r)}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="size-4 rounded"
          />
          {t("showInactive")}
        </label>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <EmptyState
          icon={UserIcon}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={{
            label: t("createEmployee"),
            onClick: () => router.push("/admin/employees/new"),
          }}
        />
      )}

      {/* Employee cards */}
      {filtered.length > 0 && (
        <div className="divide-y rounded-xl border">
          {filtered.map((emp) => (
            <div
              key={emp.id}
              className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                  {emp.isActive ? (
                    <UserIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                  ) : (
                    <UserXIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{emp.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{emp.email}</p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <div className="hidden sm:flex flex-col items-end gap-1">
                  <StatusBadge
                    status={emp.isActive ? "active" : "inactive"}
                    label={emp.isActive ? t("statusActive") : t("statusInactive")}
                    className={
                      emp.isActive
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : undefined
                    }
                  />
                  <span className="text-xs text-muted-foreground">
                    {tRoles(emp.role as Parameters<typeof tRoles>[0])}
                    {emp.stylistSubtype
                      ? ` · ${tSubtypes(emp.stylistSubtype as Parameters<typeof tSubtypes>[0])}`
                      : ""}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => openEdit(emp)}
                  aria-label={t("editEmployee")}
                  disabled={isPending}
                >
                  <PencilIcon className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit dialog — T014 fields + T015 earnings toggle + T022a deactivate */}
      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          setEditError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("editEmployee")}</DialogTitle>
            <DialogDescription>{editTarget?.email}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onEditSubmit)} noValidate className="space-y-4">
            {editError && (
              <div
                role="alert"
                className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {editError}
              </div>
            )}

            {/* Name */}
            <div className="space-y-1.5">
              <label htmlFor="edit-name" className="text-sm font-medium">
                {t("name")}
              </label>
              <Input
                id="edit-name"
                type="text"
                aria-invalid={!!errors.name}
                {...register("name")}
              />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>

            {/* Role */}
            <div className="space-y-1.5">
              <label htmlFor="edit-role" className="text-sm font-medium">
                {t("role")}
              </label>
              <select
                id="edit-role"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                {...register("role")}
              >
                {APP_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {tRoles(r)}
                  </option>
                ))}
              </select>
            </div>

            {/* Stylist subtype */}
            {editRole === "stylist" && (
              <div className="space-y-1.5">
                <label htmlFor="edit-subtype" className="text-sm font-medium">
                  {t("stylistSubtype")}
                </label>
                <select
                  id="edit-subtype"
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                  {...register("stylistSubtype")}
                >
                  <option value="">{t("selectSubtype")}</option>
                  {STYLIST_SUBTYPES.map(({ value }) => (
                    <option key={value} value={value}>
                      {tSubtypes(value)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Daily rate for secretary */}
            {editRole === "secretary" && (
              <div className="space-y-1.5">
                <label htmlFor="edit-rate" className="text-sm font-medium">
                  {t("dailyRate")}
                </label>
                <Input
                  id="edit-rate"
                  type="number"
                  min={0}
                  step={1}
                  placeholder={t("dailyRatePlaceholder")}
                  {...register("dailyRate", { valueAsNumber: true })}
                />
              </div>
            )}

            {/* Expected work days */}
            <div className="space-y-1.5">
              <label htmlFor="edit-work-days" className="text-sm font-medium">
                {t("expectedWorkDays")}
              </label>
              <select
                id="edit-work-days"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                {...register("expectedWorkDays", { valueAsNumber: true })}
              >
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            {/* T015 — earnings visibility toggle */}
            {editTarget && (
              <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                <span className="text-sm">{t("showEarningsToggle")}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={isPending}
                  onClick={() => handleToggleEarnings(editTarget)}
                  aria-label={t("showEarningsToggle")}
                  aria-pressed={editTarget.showEarnings}
                >
                  {editTarget.showEarnings ? (
                    <CheckIcon className="size-4 text-green-600" aria-hidden="true" />
                  ) : (
                    <XIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                  )}
                </Button>
              </div>
            )}

            <DialogFooter className="flex-col gap-2 sm:flex-row">
              {/* T022a — deactivate (inline confirmation to avoid nested dialogs) */}
              {editTarget?.isActive && !confirmDeactivate && (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isPending}
                  className="sm:mr-auto"
                  onClick={() => setConfirmDeactivate(true)}
                >
                  {t("deactivate")}
                </Button>
              )}
              {editTarget?.isActive && confirmDeactivate && (
                <div className="flex flex-col gap-2 sm:mr-auto sm:flex-row">
                  <p className="self-center text-sm text-destructive">
                    {t("deactivateConfirm", { name: editTarget.name })}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmDeactivate(false)}
                    >
                      {tCommon("cancel")}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={isPending}
                      onClick={() => {
                        handleDeactivate(editTarget);
                        setEditOpen(false);
                      }}
                    >
                      {t("deactivate")}
                    </Button>
                  </div>
                </div>
              )}

              <Button type="submit" disabled={isSubmitting || isPending}>
                {isSubmitting && (
                  <Loader2Icon className="mr-2 size-4 animate-spin" aria-hidden="true" />
                )}
                {tCommon("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* T022b — Termination dialog */}
      <Dialog
        open={terminateOpen}
        onOpenChange={(o) => {
          if (!isPending) setTerminateOpen(o);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="text-destructive">{t("terminateTitle")}</DialogTitle>
            <DialogDescription>
              {t("terminateDescription", { name: terminateTarget?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {computedTermination !== null && (
              <p className="text-sm text-muted-foreground">
                {t("terminateComputed")}:{" "}
                <span className="font-mono font-semibold">
                  ${computedTermination.toLocaleString("es-CO")}
                </span>
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="terminateAmount">
                  {t("terminateAmount")} <span className="text-destructive">*</span>
                </label>
                <input
                  id="terminateAmount"
                  type="number"
                  min={0}
                  value={terminateAmount}
                  onChange={(e) => setTerminateAmount(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm font-mono focus-visible:outline-none focus-visible:border-ring"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="terminateMethod">
                  {t("terminateMethod")}
                </label>
                <select
                  id="terminateMethod"
                  value={terminateMethod}
                  onChange={(e) =>
                    setTerminateMethod(e.target.value as "cash" | "card" | "transfer")
                  }
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:border-ring"
                >
                  <option value="cash">{t("cash")}</option>
                  <option value="card">{t("card")}</option>
                  <option value="transfer">{t("transfer")}</option>
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="terminateReason">
                {t("terminateReason")} <span className="text-destructive">*</span>
              </label>
              <input
                id="terminateReason"
                type="text"
                maxLength={500}
                value={terminateReason}
                onChange={(e) => setTerminateReason(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:border-ring"
              />
            </div>
            {terminateError && (
              <p className="text-sm text-destructive" role="alert">
                {terminateError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={isPending} onClick={() => setTerminateOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button variant="destructive" disabled={isPending} onClick={handleTerminate}>
              {isPending ? <Loader2Icon className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              {t("terminateConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
