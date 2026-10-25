"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LogServiceForm } from "@/components/log-service-form";
import { getCurrentEmployeeId } from "@/app/(protected)/tickets/actions";

type Props = {
  isStylist: boolean;
  redirectPath: string;
  /** Phones: pin the trigger full-width above the bottom nav, in thumb reach */
  floatingOnMobile?: boolean;
};

export function LogServiceDialog({ isStylist, redirectPath, floatingOnMobile }: Props) {
  const t = useTranslations("tickets");
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleOpen() {
    setOpen(true);
    if (employeeId === null) {
      startTransition(async () => {
        const res = await getCurrentEmployeeId();
        setEmployeeId(res.success ? res.data.employeeId : "");
      });
    }
  }

  return (
    <>
      <Button
        onClick={handleOpen}
        data-fab={floatingOnMobile ? "" : undefined}
        className={cn(
          floatingOnMobile &&
            "max-md:fixed max-md:inset-x-4 max-md:bottom-[calc(var(--app-bottom-inset)+0.75rem)] max-md:z-20 max-md:h-12 max-md:text-base max-md:shadow-lg",
        )}
      >
        <PlusIcon className="size-4 mr-2" aria-hidden="true" />
        {t("logService")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("logService")}</DialogTitle>
          </DialogHeader>
          {open && employeeId !== null && (
            <LogServiceForm
              currentEmployeeId={employeeId}
              isStylist={isStylist}
              redirectPath={redirectPath}
              onClose={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
