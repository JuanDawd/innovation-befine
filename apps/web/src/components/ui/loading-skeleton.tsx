"use client";

import { cn } from "@/lib/utils";
import { Loader2Icon } from "lucide-react";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}

function Spinner({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & {
  size?: "sm" | "default" | "lg";
}) {
  const sizeClasses = {
    sm: "size-4",
    default: "size-5",
    lg: "size-8",
  };

  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn("flex items-center justify-center", className)}
      {...props}
    >
      <Loader2Icon
        className={cn("animate-spin text-muted-foreground", sizeClasses[size])}
        aria-hidden="true"
      />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function PageSkeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("space-y-6 p-6", className)} {...props}>
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-8 w-24" />
      </div>

      {/* Table rows */}
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-5 flex-1" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

function CardSkeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("rounded-lg border bg-card p-4 shadow-sm space-y-3", className)} {...props}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-4 w-36" />
    </div>
  );
}

export { Skeleton, Spinner, PageSkeleton, CardSkeleton };
