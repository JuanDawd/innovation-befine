"use client";

/**
 * Assignment controls on the pedido detail — T122 (spec §3.2.6–8)
 *
 * AssignButton: units of one size → one clothier (piece rate from the catalog;
 * admin may set a special rate with a reason). AssignmentRow actions: release
 * unreported units (staff) and change the rate before work starts (admin).
 * Rates are only shown to admin and cashier (the server redacts them otherwise).
 */

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2Icon, UserPlusIcon } from "lucide-react";
import type { PedidoDetailAssignment } from "@befine/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { notifyDataChanged } from "@/lib/data-events";
import { formatMoney } from "@/i18n";
import {
  assignUnits,
  changeAssignmentRate,
  listClothiers,
  releaseAssignment,
  type ClothierOption,
} from "../production-actions";

export type AssignableCell = { id: string; label: string; unassigned: number };

function useDone() {
  const router = useRouter();
  const { showToast } = useToast();
  return (message: string) => {
    showToast("success", message);
    notifyDataChanged("pedidos");
    router.refresh();
  };
}

// ─── Assign ──────────────────────────────────────────────────────────────────

export function AssignButton({
  garment,
  cells,
  catalogRate,
  isAdmin,
  canSeeRates,
}: {
  garment: string;
  cells: AssignableCell[];
  /** Variant piece rate; null when the viewer may not see it */
  catalogRate: number | null;
  isAdmin: boolean;
  canSeeRates: boolean;
}) {
  const t = useTranslations("pedidos.assign");
  const tc = useTranslations("common");
  const uid = useId();
  const done = useDone();
  const [open, setOpen] = useState(false);
  const [clothiers, setClothiers] = useState<ClothierOption[] | null>(null);
  const [cellId, setCellId] = useState(cells[0]?.id ?? "");
  const [employeeId, setEmployeeId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [special, setSpecial] = useState(false);
  const [rate, setRate] = useState("");
  const [rateReason, setRateReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const cell = cells.find((c) => c.id === cellId);
  const qty = Number(quantity) || 0;
  const effectiveRate = special ? Number(rate) || 0 : catalogRate;

  useEffect(() => {
    if (!open || clothiers) return;
    void listClothiers().then((res) => setClothiers(res.success ? res.data : []));
  }, [open, clothiers]);

  function openDialog() {
    const first = cells[0];
    setCellId(first?.id ?? "");
    setQuantity(first ? String(first.unassigned) : "");
    setEmployeeId("");
    setSpecial(false);
    setRate(catalogRate != null ? String(catalogRate) : "");
    setRateReason("");
    setError(null);
    setOpen(true);
  }

  function submit() {
    if (!cell) return;
    setError(null);
    startTransition(async () => {
      const res = await assignUnits({
        cellId: cell.id,
        employeeId,
        quantity: qty,
        expectedUnassigned: cell.unassigned,
        ...(special ? { pieceRate: Number(rate) || 0, rateReason } : {}),
      });
      if (!res.success) {
        setError(res.error.message);
        return;
      }
      setOpen(false);
      const name = clothiers?.find((c) => c.id === employeeId)?.name ?? "";
      done(t("done", { count: qty, name }));
    });
  }

  const invalid =
    !cell ||
    !employeeId ||
    qty < 1 ||
    qty > (cell?.unassigned ?? 0) ||
    (special && (!rate || !rateReason.trim()));

  return (
    <>
      <Button size="sm" variant="outline" onClick={openDialog}>
        <UserPlusIcon className="size-4" aria-hidden="true" />
        {t("button")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{garment}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor={`${uid}-size`} className="text-sm font-medium">
                  {t("size")}
                </label>
                <NativeSelect
                  id={`${uid}-size`}
                  value={cellId}
                  onChange={(e) => {
                    setCellId(e.target.value);
                    const next = cells.find((c) => c.id === e.target.value);
                    if (next) setQuantity(String(next.unassigned));
                  }}
                  className="w-full"
                >
                  {cells.map((c) => (
                    <option key={c.id} value={c.id}>
                      {t("sizeOption", { size: c.label, n: c.unassigned })}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <label htmlFor={`${uid}-qty`} className="text-sm font-medium">
                  {t("quantity")}
                </label>
                <Input
                  id={`${uid}-qty`}
                  inputMode="numeric"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value.replace(/\D/g, "").slice(0, 5))}
                  aria-invalid={!!cell && qty > cell.unassigned}
                  className="font-mono tabular-nums"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${uid}-clothier`} className="text-sm font-medium">
                {t("clothier")}
              </label>
              <NativeSelect
                id={`${uid}-clothier`}
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="w-full"
                disabled={!clothiers}
              >
                <option value="">{clothiers ? t("chooseClothier") : tc("loading")}</option>
                {clothiers?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
              {clothiers?.length === 0 && (
                <p className="text-sm text-muted-foreground">{t("noClothiers")}</p>
              )}
            </div>
            {canSeeRates && effectiveRate != null && (
              <p className="rounded-lg bg-muted/50 p-3 text-sm">
                {t("earnings", {
                  rate: formatMoney(effectiveRate),
                  total: formatMoney(effectiveRate * qty),
                })}
              </p>
            )}
            {isAdmin && (
              <div className="space-y-3">
                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm md:min-h-0">
                  <input
                    type="checkbox"
                    checked={special}
                    onChange={(e) => setSpecial(e.target.checked)}
                    className="size-4"
                  />
                  {t("specialRate")}
                </label>
                {special && (
                  <div className="grid gap-3 sm:grid-cols-[9rem_1fr]">
                    <div className="space-y-1.5">
                      <label htmlFor={`${uid}-rate`} className="text-sm font-medium">
                        {t("rate")}
                      </label>
                      <MoneyInput id={`${uid}-rate`} value={rate} onValueChange={setRate} />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor={`${uid}-rate-reason`} className="text-sm font-medium">
                        {t("rateReason")}
                      </label>
                      <Input
                        id={`${uid}-rate-reason`}
                        value={rateReason}
                        maxLength={300}
                        placeholder={t("rateReasonPlaceholder")}
                        onChange={(e) => setRateReason(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{tc("cancel")}</DialogClose>
            <Button onClick={submit} disabled={invalid || isPending}>
              {isPending && <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />}
              {t("confirm", { count: qty })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── One assignment ──────────────────────────────────────────────────────────

export function AssignmentRow({
  assignment: a,
  isAdmin,
  canSeeRates,
  editable,
}: {
  assignment: PedidoDetailAssignment;
  isAdmin: boolean;
  canSeeRates: boolean;
  editable: boolean;
}) {
  const t = useTranslations("pedidos.assign");
  const tc = useTranslations("common");
  const uid = useId();
  const done = useDone();
  const [mode, setMode] = useState<"release" | "rate" | null>(null);
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const p = a.progress;
  const started = p.reported + p.rework > 0;

  function open(next: "release" | "rate") {
    setMode(next);
    setValue(next === "release" ? String(p.unstarted) : String(a.pieceRate ?? ""));
    setReason("");
    setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res =
        mode === "release"
          ? await releaseAssignment(a.id, { version: a.version, quantity: Number(value) || 0 })
          : await changeAssignmentRate(a.id, {
              version: a.version,
              pieceRate: Number(value) || 0,
              reason,
            });
      if (!res.success) {
        setError(res.error.message);
        return;
      }
      setMode(null);
      done(mode === "release" ? t("released") : t("rateChanged"));
    });
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-sm">
      <span className="min-w-0">
        <span className="font-medium">{a.employeeName}</span>
        <span className="text-muted-foreground">
          {" · "}
          {a.sizeLabel} · {t("units", { n: p.live })}
          {a.source === "claimed" && ` · ${t("claimed")}`}
        </span>
        <span className="block text-xs text-muted-foreground">
          {t("progress", { reported: p.reported + p.rework, approved: p.approved })}
          {canSeeRates && a.pieceRate != null && (
            <>
              {" · "}
              <span className="font-mono tabular-nums">{formatMoney(a.pieceRate)}</span>{" "}
              {t("perUnit")}
              {a.rateReason && ` (${a.rateReason})`}
            </>
          )}
        </span>
      </span>
      {editable && (
        <span className="flex gap-1">
          {p.unstarted > 0 && (
            <Button size="sm" variant="ghost" onClick={() => open("release")}>
              {t("release")}
            </Button>
          )}
          {isAdmin && !started && (
            <Button size="sm" variant="ghost" onClick={() => open("rate")}>
              {t("changeRate")}
            </Button>
          )}
        </span>
      )}
      <Dialog open={mode !== null} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {mode === "release" ? t("releaseTitle") : t("changeRateTitle")}
            </DialogTitle>
            <DialogDescription>
              {a.employeeName} · {a.sizeLabel}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {mode === "release" ? (
              <div className="space-y-1.5">
                <label htmlFor={`${uid}-qty`} className="text-sm font-medium">
                  {t("releaseQuantity", { n: p.unstarted })}
                </label>
                <Input
                  id={`${uid}-qty`}
                  inputMode="numeric"
                  value={value}
                  onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 5))}
                  className="font-mono tabular-nums"
                />
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <label htmlFor={`${uid}-rate`} className="text-sm font-medium">
                    {t("rate")}
                  </label>
                  <MoneyInput id={`${uid}-rate`} value={value} onValueChange={setValue} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor={`${uid}-reason`} className="text-sm font-medium">
                    {t("rateReason")}
                  </label>
                  <Input
                    id={`${uid}-reason`}
                    value={reason}
                    maxLength={300}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
              </>
            )}
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{tc("cancel")}</DialogClose>
            <Button
              onClick={submit}
              disabled={
                isPending ||
                !value ||
                (mode === "release" && (Number(value) < 1 || Number(value) > p.unstarted)) ||
                (mode === "rate" && reason.trim().length < 3)
              }
            >
              {isPending && <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />}
              {tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}
