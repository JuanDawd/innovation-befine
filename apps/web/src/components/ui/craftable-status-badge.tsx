import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/ui/status-badge";

export type CraftableStatusKey =
  | "not_started"
  | "in_progress"
  | "pending_approval"
  | "all_approved";

const craftableStatusToCategory: Record<CraftableStatusKey, string> = {
  not_started: "initial",
  in_progress: "progress",
  pending_approval: "attention",
  all_approved: "success",
};

interface CraftableStatusBadgeProps extends React.ComponentProps<"span"> {
  status: CraftableStatusKey;
}

export function CraftableStatusBadge({ status, ...props }: CraftableStatusBadgeProps) {
  const t = useTranslations("craftables");
  const labelKey =
    status === "not_started"
      ? "statusNotStarted"
      : status === "in_progress"
        ? "statusInProgress"
        : status === "pending_approval"
          ? "statusPendingApproval"
          : "statusAllApproved";

  return <StatusBadge status={craftableStatusToCategory[status]} label={t(labelKey)} {...props} />;
}
