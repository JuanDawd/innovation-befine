import { PageSkeleton } from "@/components/ui/loading-skeleton";

export default function Loading() {
  return (
    <div className="p-4 md:p-6 lg:p-8">
      <PageSkeleton />
    </div>
  );
}
