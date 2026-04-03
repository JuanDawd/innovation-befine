import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Status colour mapping (from T103 design system):
 * - initial (grey): logged, pending, booked
 * - progress (blue): awaiting_payment, in_production, confirmed
 * - attention (amber): reopened, done_pending_approval, rescheduled
 * - success (green): closed, approved, delivered, paid_in_full, completed
 * - negative (red): cancelled, no_show
 */
const statusBadgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      status: {
        initial: "bg-status-initial text-status-initial-foreground",
        progress: "bg-status-progress text-status-progress-foreground",
        attention: "bg-status-attention text-status-attention-foreground",
        success: "bg-status-success text-status-success-foreground",
        negative: "bg-status-negative text-status-negative-foreground",
      },
    },
    defaultVariants: {
      status: "initial",
    },
  },
);

type StatusCategory = NonNullable<VariantProps<typeof statusBadgeVariants>["status"]>;

const entityStatusMap: Record<string, StatusCategory> = {
  logged: "initial",
  pending: "initial",
  booked: "initial",
  awaiting_payment: "progress",
  in_production: "progress",
  confirmed: "progress",
  reopened: "attention",
  done_pending_approval: "attention",
  rescheduled: "attention",
  closed: "success",
  approved: "success",
  delivered: "success",
  paid_in_full: "success",
  completed: "success",
  cancelled: "negative",
  no_show: "negative",
};

function resolveStatusCategory(statusOrCategory: string): StatusCategory {
  if (statusOrCategory in entityStatusMap) {
    return entityStatusMap[statusOrCategory];
  }
  const categories: StatusCategory[] = ["initial", "progress", "attention", "success", "negative"];
  if (categories.includes(statusOrCategory as StatusCategory)) {
    return statusOrCategory as StatusCategory;
  }
  return "initial";
}

interface StatusBadgeProps extends React.ComponentProps<"span"> {
  status: string;
  label?: string;
}

function StatusBadge({ status, label, className, ...props }: StatusBadgeProps) {
  const category = resolveStatusCategory(status);
  const displayLabel = label ?? status.replace(/_/g, " ");

  return (
    <span className={cn(statusBadgeVariants({ status: category }), className)} {...props}>
      {displayLabel}
    </span>
  );
}

export { StatusBadge, statusBadgeVariants, entityStatusMap, resolveStatusCategory };
export type { StatusCategory };
