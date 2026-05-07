import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/ui/status-badge";

export type ProductStatusKey = "not_started" | "in_progress" | "pending_approval" | "all_approved";

const productStatusToCategory: Record<ProductStatusKey, string> = {
  not_started: "initial",
  in_progress: "progress",
  pending_approval: "attention",
  all_approved: "success",
};

interface ProductStatusBadgeProps extends React.ComponentProps<"span"> {
  status: ProductStatusKey;
}

export function ProductStatusBadge({ status, ...props }: ProductStatusBadgeProps) {
  const t = useTranslations("products");
  const labelKey =
    status === "not_started"
      ? "statusNotStarted"
      : status === "in_progress"
        ? "statusInProgress"
        : status === "pending_approval"
          ? "statusPendingApproval"
          : "statusAllApproved";

  return <StatusBadge status={productStatusToCategory[status]} label={t(labelKey)} {...props} />;
}
