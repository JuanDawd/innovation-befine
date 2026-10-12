"use client";

/**
 * LogServiceForm — T035
 *
 * Ticket creation form shared by cashier, secretary, and stylist roles.
 * - cashier / admin / secretary: employee selector shown (all active stylists)
 * - stylist: employee pre-selected to self, selector hidden
 */

import { notifyDataChanged } from "@/lib/data-events";
import { newUuid } from "@/lib/uuid";
import { useState, useTransition } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { unwrap } from "@/lib/action-query";
import { useToast } from "@/hooks/use-toast";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClientSearchWidget, type ClientSelection } from "@/components/client-search-widget";
import {
  listActiveStylists,
  createTicket,
  type StylistOption,
} from "@/app/(protected)/tickets/actions";
import { listActiveServices } from "@/app/(protected)/admin/catalog/actions/services";

type ServiceVariant = {
  id: string;
  name: string;
  customerPrice: number;
  commissionPct: string;
};
type Service = { id: string; name: string; variants: ServiceVariant[] };

export function LogServiceForm({
  currentEmployeeId,
  isStylist,
  redirectPath,
  onClose,
}: {
  currentEmployeeId: string;
  isStylist: boolean;
  redirectPath: string;
  onClose?: () => void;
}) {
  const t = useTranslations("tickets");
  const tc = useTranslations("common");
  const router = useRouter();

  // Cached across dialog openings — catalog and staff rarely change.
  const servicesQuery = useQuery({
    queryKey: queryKeys.catalog.services,
    queryFn: () => unwrap(listActiveServices()),
    staleTime: 5 * 60_000,
  });
  const stylistsQuery = useQuery({
    queryKey: queryKeys.staff.activeStylists,
    queryFn: () => unwrap(listActiveStylists()),
    staleTime: 5 * 60_000,
    enabled: !isStylist,
  });
  const services = (servicesQuery.data ?? []) as Service[];
  const stylists: StylistOption[] = stylistsQuery.data ?? [];
  const isLoading = servicesQuery.isPending || (!isStylist && stylistsQuery.isPending);
  const loadError = (servicesQuery.error ?? stylistsQuery.error)?.message ?? null;
  const { showToast } = useToast();

  const [employeeId, setEmployeeId] = useState(currentEmployeeId);
  const [serviceId, setServiceId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [clientSelection, setClientSelection] = useState<ClientSelection>(null);
  const [isPending, startSubmitTransition] = useTransition();

  const selectedService = services.find((s) => s.id === serviceId);
  const variants = selectedService?.variants ?? [];
  const selectedVariant = variants.find((v) => v.id === variantId);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!variantId || !clientSelection) return;

    const input = {
      employeeId,
      serviceVariantId: variantId,
      quantity,
      clientType: clientSelection.type,
      clientId: clientSelection.type === "saved" ? clientSelection.client.id : undefined,
      guestName: clientSelection.type === "guest" ? clientSelection.guestName : undefined,
      idempotencyKey: newUuid(),
    };

    startSubmitTransition(async () => {
      const result = await createTicket(input);
      if (result.success) {
        showToast("success", t("submitSuccess"));
        notifyDataChanged("tickets");
        router.refresh();
        if (onClose) {
          setTimeout(() => onClose(), 1200);
        } else {
          setTimeout(() => router.push(redirectPath), 1200);
        }
      } else {
        showToast("error", result.error.message ?? t("submitError"));
      }
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError) {
    return (
      <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {loadError}
      </p>
    );
  }

  if (services.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("noCatalog")}</p>;
  }

  if (!isStylist && stylists.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("noStylists")}</p>;
  }

  const canSubmit = !!employeeId && !!variantId && !!clientSelection && !isPending;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {/* Employee selector — staff only */}
      {!isStylist && (
        <div className="space-y-1.5">
          <label htmlFor="ls-employee" className="text-sm font-medium">
            {t("employee")}
          </label>
          <select
            id="ls-employee"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="flex h-8 w-full rounded-lg border border-input bg-background px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
          >
            <option value="">{t("employeePlaceholder")}</option>
            {stylists.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Service selector */}
      <div className="space-y-1.5">
        <label htmlFor="ls-service" className="text-sm font-medium">
          {t("service")}
        </label>
        <select
          id="ls-service"
          value={serviceId}
          onChange={(e) => {
            setServiceId(e.target.value);
            setVariantId("");
          }}
          className="flex h-8 w-full rounded-lg border border-input bg-background px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
        >
          <option value="">{t("servicePlaceholder")}</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* Variant selector */}
      {serviceId && (
        <div className="space-y-1.5">
          <label htmlFor="ls-variant" className="text-sm font-medium">
            {t("variant")}
          </label>
          <select
            id="ls-variant"
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
            className="flex h-8 w-full rounded-lg border border-input bg-background px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
          >
            <option value="">{t("variantPlaceholder")}</option>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          {selectedVariant && (
            <p className="text-xs text-muted-foreground">
              {t("price")}: ${selectedVariant.customerPrice.toLocaleString("es-CO")} ·{" "}
              {t("commission")}: {selectedVariant.commissionPct}%
            </p>
          )}
        </div>
      )}

      {/* Quantity */}
      <div className="space-y-1.5 flex items-center justify-between ">
        <label htmlFor="ls-quantity" className="text-sm font-medium">
          {t("quantity")}
        </label>
        <Input
          id="ls-quantity"
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
          className="w-24"
        />
      </div>

      {/* Client */}
      <div className="space-y-1.5">
        <p className="text-sm font-medium">{t("client")}</p>
        <ClientSearchWidget
          value={clientSelection}
          onChange={setClientSelection}
          allowInlineCreate={!isStylist}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={!canSubmit}>
          {isPending && <Loader2Icon className="mr-2 size-4 animate-spin" />}
          {t("submit")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => (onClose ? onClose() : router.push(redirectPath))}
          disabled={isPending}
        >
          {tc("cancel")}
        </Button>
      </div>
    </form>
  );
}
