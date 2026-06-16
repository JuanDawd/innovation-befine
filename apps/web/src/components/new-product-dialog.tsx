"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CreateProductForm } from "@/components/create-product-form";

type LargeOrderOption = { id: string; clientName: string; description: string };

export function NewProductDialog({
  redirectPath,
  largeOrders = [],
}: {
  redirectPath: string;
  largeOrders?: LargeOrderOption[];
}) {
  const t = useTranslations("products");
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PlusIcon className="size-4 mr-2" />
        {t("createProduct")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("createProduct")}</DialogTitle>
          </DialogHeader>
          {open && (
            <CreateProductForm
              redirectPath={redirectPath}
              largeOrders={largeOrders}
              onClose={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
