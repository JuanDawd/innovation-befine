"use client";

import type { ReactNode } from "react";
import React, { useState } from "react";
import { AlertTriangleIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConfirmationDialogProps {
  trigger: ReactNode;
  title: string;
  description: string;
  /** Optional warning line rendered above the description (e.g. open-ticket count). */
  warning?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  variant?: "default" | "destructive";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function ConfirmationDialog({
  trigger,
  title,
  description,
  warning,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  onConfirm,
  variant = "default",
  open,
  onOpenChange,
}: ConfirmationDialogProps) {
  const isDestructive = variant === "destructive";

  // Works controlled (open/onOpenChange) or uncontrolled. The dialog closes
  // after confirming so any error/toast the action produces is visible instead
  // of being rendered behind the modal (M-66).
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const actualOpen = isControlled ? open : internalOpen;

  function setOpen(next: boolean) {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  }

  function handleConfirm() {
    // Run first so handlers can still read state that closing may reset.
    const result = onConfirm();
    setOpen(false);
    return result;
  }

  return (
    <Dialog open={actualOpen} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent className="max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-start gap-3">
            {isDestructive && (
              <div className="rounded-full bg-destructive/10 p-2">
                <AlertTriangleIcon className="size-5 text-destructive" aria-hidden="true" />
              </div>
            )}
            <div className="space-y-1.5">
              <DialogTitle className={cn(isDestructive && "text-destructive")}>{title}</DialogTitle>
              {warning && (
                <p className="flex items-center gap-1.5 text-sm text-status-attention-foreground">
                  <AlertTriangleIcon className="size-3.5 shrink-0" aria-hidden="true" />
                  {warning}
                </p>
              )}
              <DialogDescription>{description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{cancelLabel}</DialogClose>
          <Button variant={isDestructive ? "destructive" : "default"} onClick={handleConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { ConfirmationDialog };
