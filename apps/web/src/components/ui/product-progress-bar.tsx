import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface ProductProgressBarProps {
  pct: number;
  className?: string;
  showLabel?: boolean;
}

function progressIndicatorColor(pct: number): string {
  if (pct >= 80) return "bg-status-success";
  if (pct >= 30) return "bg-status-attention";
  return "bg-status-negative";
}

export function ProductProgressBar({ pct, className, showLabel = true }: ProductProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div className={cn("flex items-center gap-2 min-w-[80px]", className)}>
      <Progress
        value={clamped}
        aria-label={`${clamped}%`}
        className="flex-1 h-1.5"
        indicatorClassName={progressIndicatorColor(clamped)}
      />
      {showLabel && (
        <span className="text-xs tabular-nums text-muted-foreground w-8 text-right">
          {clamped}%
        </span>
      )}
    </div>
  );
}
