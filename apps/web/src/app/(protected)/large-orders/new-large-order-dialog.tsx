"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CreateLargeOrderForm } from "./create-large-order-form";
import type { ClientOption } from "./actions";
import type { ClothPieceRow } from "@/app/(protected)/admin/catalog/actions/cloth-pieces";

type Props = {
  clients: ClientOption[];
  clothPieces: ClothPieceRow[];
  canOverridePrice: boolean;
};

export function NewLargeOrderDialog({ clients, clothPieces, canOverridePrice }: Props) {
  const t = useTranslations("largeOrders");
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PlusIcon className="size-4 mr-2" />
        {t("newOrder")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("newOrder")}</DialogTitle>
          </DialogHeader>
          {open && (
            <CreateLargeOrderForm
              clients={clients}
              clothPieces={clothPieces}
              canOverridePrice={canOverridePrice}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
