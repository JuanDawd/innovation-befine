"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CreateEmployeeForm } from "@/components/create-employee-form";

export function NewEmployeeDialog() {
  const t = useTranslations("employees");
  const [open, setOpen] = useState(false);

  function handleSuccess({ name }: { name: string; email: string }) {
    toast.success(`${t("createSuccess")} — ${name}`);
    setTimeout(() => setOpen(false), 1000);
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PlusIcon className="size-4 mr-2" />
        {t("createEmployee")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("createEmployee")}</DialogTitle>
          </DialogHeader>
          {open && <CreateEmployeeForm onSuccess={handleSuccess} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
