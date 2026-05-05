"use client";

import { useState, useTransition, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { PlusIcon, Trash2Icon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  listActiveClothiers,
  createCraftable,
  type ClothierOption,
} from "@/app/(protected)/craftables/actions";
import { listActiveClothPieces } from "@/app/(protected)/admin/catalog/actions/cloth-pieces";

type ClothPieceVariantOption = { id: string; name: string; isActive: boolean };
type ClothPieceOption = { id: string; name: string; variants: ClothPieceVariantOption[] };
type LargeOrderOption = { id: string; clientName: string; description: string };

type PieceLine = {
  key: number;
  clothPieceId: string;
  clothPieceVariantId: string;
  assignedToEmployeeId: string | null;
  quantity: number;
  color: string;
  style: string;
  size: string;
  instructions: string;
};

export function CreateCraftableForm({
  redirectPath,
  largeOrders = [],
}: {
  redirectPath: string;
  largeOrders?: LargeOrderOption[];
}) {
  const t = useTranslations("craftables");
  const tc = useTranslations("common");
  const router = useRouter();

  const [clothPieces, setClothPieces] = useState<ClothPieceOption[]>([]);
  const [clothiers, setClothiers] = useState<ClothierOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, startLoadTransition] = useTransition();

  const [notes, setNotes] = useState("");
  const [largeOrderId, setLargeOrderId] = useState<string>("");
  const [lines, setLines] = useState<PieceLine[]>([
    {
      key: 0,
      clothPieceId: "",
      clothPieceVariantId: "",
      assignedToEmployeeId: null,
      quantity: 1,
      color: "",
      style: "",
      size: "",
      instructions: "",
    },
  ]);
  const [nextKey, setNextKey] = useState(1);
  const [isPending, startSubmitTransition] = useTransition();
  const { showToast } = useToast();

  useEffect(() => {
    startLoadTransition(async () => {
      const [piecesRes, clothiersRes] = await Promise.all([
        listActiveClothPieces(),
        listActiveClothiers(),
      ]);
      if (!piecesRes.success) {
        setLoadError(piecesRes.error.message);
        return;
      }
      if (!clothiersRes.success) {
        setLoadError(clothiersRes.error.message);
        return;
      }
      setClothPieces(piecesRes.data);
      setClothiers(clothiersRes.data);
    });
  }, []);

  function addLine() {
    setLines((prev) => [
      ...prev,
      {
        key: nextKey,
        clothPieceId: "",
        clothPieceVariantId: "",
        assignedToEmployeeId: null,
        quantity: 1,
        color: "",
        style: "",
        size: "",
        instructions: "",
      },
    ]);
    setNextKey((k) => k + 1);
  }

  function removeLine(key: number) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function updateLine(key: number, patch: Partial<Omit<PieceLine, "key">>) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const updated = { ...l, ...patch };
        if (patch.clothPieceId !== undefined) {
          const piece = clothPieces.find((p) => p.id === patch.clothPieceId);
          const active = piece?.variants.filter((v) => v.isActive) ?? [];
          updated.clothPieceVariantId = active.length === 1 ? active[0].id : "";
        }
        return updated;
      }),
    );
  }

  function handleSubmit() {
    const invalidLine = lines.find((l) => !l.clothPieceId || !l.clothPieceVariantId);
    if (invalidLine) {
      showToast("error", t("selectPieceAndVariant"));
      return;
    }

    startSubmitTransition(async () => {
      const result = await createCraftable({
        notes: notes.trim() || undefined,
        largeOrderId: largeOrderId || undefined,
        pieces: lines.map((l) => ({
          clothPieceId: l.clothPieceId,
          clothPieceVariantId: l.clothPieceVariantId,
          assignedToEmployeeId: l.assignedToEmployeeId,
          quantity: l.quantity,
          color: l.color || undefined,
          style: l.style || undefined,
          size: l.size || undefined,
          instructions: l.instructions || undefined,
        })),
      });

      if (!result.success) {
        showToast("error", result.error.message || t("submitError"));
        return;
      }

      showToast("success", t("submitSuccess"));
      setTimeout(() => router.push(redirectPath), 1000);
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
        <Loader2Icon className="h-4 w-4 animate-spin" />
        {tc("loading")}
      </div>
    );
  }

  if (loadError) {
    return <p className="text-sm text-destructive py-4">{loadError}</p>;
  }

  if (clothPieces.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">{t("noPieces")}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Linked large order (T060) */}
      {largeOrders.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="craftable-order">
            Pedido grande vinculado{" "}
            <span className="text-muted-foreground font-normal">{tc("optional")}</span>
          </label>
          <select
            id="craftable-order"
            value={largeOrderId}
            onChange={(e) => setLargeOrderId(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:border-ring"
          >
            <option value="">Sin vinculación</option>
            {largeOrders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.clientName} — {o.description.slice(0, 50)}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Notes */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="craftable-notes">
          {t("notes")} <span className="text-muted-foreground font-normal">{tc("optional")}</span>
        </label>
        <textarea
          id="craftable-notes"
          placeholder={t("notesPlaceholder")}
          value={notes}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
          rows={2}
          maxLength={500}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
        />
      </div>

      {/* Piece lines */}
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">{t("pieces")}</p>

        {lines.map((line, idx) => {
          const piece = clothPieces.find((p) => p.id === line.clothPieceId);
          const activeVariants = piece?.variants.filter((v) => v.isActive) ?? [];

          return (
            <div key={line.key} className="flex flex-col gap-1 rounded-lg border border-input p-2">
              {/* Row 1: selectors + quantity + assignee + remove */}
              <div className="flex gap-2 items-start">
                {/* Piece type */}
                <div className="flex-1 min-w-0">
                  {idx === 0 && (
                    <label className="text-xs text-muted-foreground mb-1 block">
                      {t("pieceType")}
                    </label>
                  )}
                  <select
                    aria-label={t("pieceType")}
                    value={line.clothPieceId}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                      updateLine(line.key, { clothPieceId: e.target.value })
                    }
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:outline-none focus-visible:border-ring"
                  >
                    <option value="">{t("selectPieceType")}</option>
                    {clothPieces.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Variant */}
                <div className="flex-1 min-w-0">
                  {idx === 0 && (
                    <label className="text-xs text-muted-foreground mb-1 block">
                      {t("variant")}
                    </label>
                  )}
                  <select
                    aria-label={t("variant")}
                    value={line.clothPieceVariantId}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                      updateLine(line.key, { clothPieceVariantId: e.target.value })
                    }
                    disabled={!line.clothPieceId || activeVariants.length === 0}
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:outline-none focus-visible:border-ring disabled:opacity-50"
                  >
                    <option value="">
                      {line.clothPieceId && activeVariants.length === 0
                        ? t("noVariants")
                        : t("selectVariant")}
                    </option>
                    {activeVariants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Quantity */}
                <div className="w-16 shrink-0">
                  {idx === 0 && (
                    <label className="text-xs text-muted-foreground mb-1 block">
                      {t("quantity")}
                    </label>
                  )}
                  <input
                    type="number"
                    aria-label={t("quantity")}
                    min={1}
                    max={999}
                    value={line.quantity}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const v = parseInt(e.target.value, 10);
                      updateLine(line.key, { quantity: Number.isFinite(v) && v >= 1 ? v : 1 });
                    }}
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-center focus-visible:outline-none focus-visible:border-ring"
                  />
                </div>

                {/* Assigned clothier */}
                <div className="flex-1 min-w-0">
                  {idx === 0 && (
                    <label className="text-xs text-muted-foreground mb-1 block">
                      {t("assignTo")}
                    </label>
                  )}
                  <select
                    aria-label={t("assignTo")}
                    value={line.assignedToEmployeeId ?? ""}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                      updateLine(line.key, {
                        assignedToEmployeeId: e.target.value || null,
                      })
                    }
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:outline-none focus-visible:border-ring"
                  >
                    <option value="">{t("unassigned")}</option>
                    {clothiers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Remove button */}
                <div className={idx === 0 ? "mt-5" : ""}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("removePiece")}
                    onClick={() => removeLine(line.key)}
                    disabled={lines.length === 1}
                  >
                    <Trash2Icon className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Row 2: spec fields */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t("color")}</label>
                  <input
                    type="text"
                    aria-label={t("color")}
                    value={line.color}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      updateLine(line.key, { color: e.target.value })
                    }
                    maxLength={80}
                    placeholder={t("colorPlaceholder")}
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t("style")}</label>
                  <input
                    type="text"
                    aria-label={t("style")}
                    value={line.style}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      updateLine(line.key, { style: e.target.value })
                    }
                    maxLength={80}
                    placeholder={t("stylePlaceholder")}
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t("size")}</label>
                  <input
                    type="text"
                    aria-label={t("size")}
                    value={line.size}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      updateLine(line.key, { size: e.target.value })
                    }
                    maxLength={40}
                    placeholder={t("sizePlaceholder")}
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  {t("instructions")}
                </label>
                <input
                  type="text"
                  aria-label={t("instructions")}
                  value={line.instructions}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    updateLine(line.key, { instructions: e.target.value })
                  }
                  maxLength={500}
                  placeholder={t("instructionsPlaceholder")}
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring"
                />
              </div>
            </div>
          );
        })}

        <Button type="button" variant="outline" size="sm" onClick={addLine} className="self-start">
          <PlusIcon className="h-4 w-4 mr-1" />
          {t("addPiece")}
        </Button>
      </div>

      {/* Submit */}
      <Button onClick={handleSubmit} disabled={isPending}>
        {isPending && <Loader2Icon className="h-4 w-4 mr-2 animate-spin" />}
        {t("submit")}
      </Button>
    </div>
  );
}
