"use client";

/**
 * Details catalog — T137
 *
 * The admin creates what products can vary by, and lists its values.
 */

import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2Icon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  addDetailValue,
  createDetail,
  setDetailActive,
  setDetailValueActive,
  updateDetail,
  type DetailRow,
} from "@/app/(protected)/admin/catalog/actions/details";

function Flag({
  label,
  help,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  help: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-2 text-sm">
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-4"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="font-medium">
        {label}
        <span className="block text-xs font-normal text-muted-foreground">{help}</span>
      </span>
    </label>
  );
}

function DetailCard({
  detail,
  onChange,
}: {
  detail: DetailRow;
  onChange: (next: DetailRow) => void;
}) {
  const t = useTranslations("catalog.details");
  const uid = useId();
  const { showToast } = useToast();
  const [newValue, setNewValue] = useState("");
  const [isPending, startTransition] = useTransition();

  function saveFlags(patch: Partial<Pick<DetailRow, "splitsStock" | "allowFreeText">>) {
    const next = { ...detail, ...patch };
    startTransition(async () => {
      const res = await updateDetail(detail.id, {
        name: next.name,
        splitsStock: next.splitsStock,
        allowFreeText: next.allowFreeText,
      });
      if (!res.success) return showToast("error", res.error.message);
      onChange(next);
      showToast("success", t("saved"));
    });
  }

  function toggle() {
    startTransition(async () => {
      const res = await setDetailActive(detail.id, !detail.isActive);
      if (!res.success) return showToast("error", res.error.message);
      onChange({ ...detail, isActive: !detail.isActive });
    });
  }

  function addValue() {
    startTransition(async () => {
      const res = await addDetailValue(detail.id, { label: newValue });
      if (!res.success) return showToast("error", res.error.message);
      setNewValue("");
      onChange({ ...detail, values: [...detail.values, res.data] });
    });
  }

  function toggleValue(id: string, isActive: boolean) {
    startTransition(async () => {
      const res = await setDetailValueActive(id, !isActive);
      if (!res.success) return showToast("error", res.error.message);
      onChange({
        ...detail,
        values: detail.values.map((v) => (v.id === id ? { ...v, isActive: !isActive } : v)),
      });
    });
  }

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">
          {detail.name}
          {!detail.isActive && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">{t("inactive")}</span>
          )}
        </h3>
        {detail.builtin ? (
          <span className="text-xs text-muted-foreground">{t("builtin")}</span>
        ) : (
          <Button variant="outline" size="sm" disabled={isPending} onClick={toggle}>
            {detail.isActive ? t("deactivate") : t("restore")}
          </Button>
        )}
      </div>

      {detail.builtin ? (
        <p className="text-sm text-muted-foreground">
          {detail.builtin === "style" ? t("styleHint") : t("builtinHint")}
        </p>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <Flag
              label={t("splitsStock")}
              help={t("splitsStockHelp")}
              checked={detail.splitsStock}
              disabled={isPending}
              onChange={(splitsStock) => saveFlags({ splitsStock })}
            />
            <Flag
              label={t("allowFreeText")}
              help={t("allowFreeTextHelp")}
              checked={detail.allowFreeText}
              disabled={isPending}
              onChange={(allowFreeText) => saveFlags({ allowFreeText })}
            />
          </div>
          <div className="space-y-2">
            <h4 className="text-sm font-medium">{t("values")}</h4>
            {detail.values.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noValues")}</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {detail.values.map((v) => (
                  <li key={v.id}>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      aria-pressed={v.isActive}
                      className={v.isActive ? undefined : "text-muted-foreground line-through"}
                      onClick={() => toggleValue(v.id, v.isActive)}
                    >
                      {v.label}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <label htmlFor={`${uid}-value`} className="text-sm font-medium">
                  {t("valueLabel")}
                </label>
                <Input
                  id={`${uid}-value`}
                  value={newValue}
                  maxLength={40}
                  onChange={(e) => setNewValue(e.target.value)}
                />
              </div>
              <Button variant="outline" disabled={isPending || !newValue.trim()} onClick={addValue}>
                {t("addValue")}
              </Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

export function DetailCatalog({ initialDetails }: { initialDetails: DetailRow[] }) {
  const t = useTranslations("catalog.details");
  const uid = useId();
  const { showToast } = useToast();
  const [list, setList] = useState(initialDetails);
  const [name, setName] = useState("");
  const [splitsStock, setSplitsStock] = useState(false);
  const [allowFreeText, setAllowFreeText] = useState(false);
  const [isPending, startTransition] = useTransition();

  function create() {
    startTransition(async () => {
      const res = await createDetail({ name, splitsStock, allowFreeText });
      if (!res.success) return showToast("error", res.error.message);
      setList((l) => [...l, res.data]);
      setName("");
      setSplitsStock(false);
      setAllowFreeText(false);
      showToast("success", t("saved"));
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h3 className="text-lg font-semibold">{t("create")}</h3>
        <div className="space-y-1">
          <label htmlFor={`${uid}-name`} className="text-sm font-medium">
            {t("name")}
          </label>
          <Input
            id={`${uid}-name`}
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Flag
            label={t("splitsStock")}
            help={t("splitsStockHelp")}
            checked={splitsStock}
            onChange={setSplitsStock}
          />
          <Flag
            label={t("allowFreeText")}
            help={t("allowFreeTextHelp")}
            checked={allowFreeText}
            onChange={setAllowFreeText}
          />
        </div>
        <Button disabled={isPending || !name.trim()} onClick={create}>
          {isPending ? (
            <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <PlusIcon className="size-4" aria-hidden="true" />
          )}
          {t("create")}
        </Button>
      </section>
      {list.length === 0 ? (
        <EmptyState icon={PlusIcon} title={t("empty")} description={t("description")} />
      ) : (
        list.map((d) => (
          <DetailCard
            key={d.id}
            detail={d}
            onChange={(next) => setList((l) => l.map((x) => (x.id === next.id ? next : x)))}
          />
        ))
      )}
    </div>
  );
}
