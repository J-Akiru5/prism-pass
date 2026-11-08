import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="mx-auto max-w-6xl space-y-3 bg-white p-4 md:p-6" aria-label="Loading">
      <Skeleton className="h-8 w-52 !rounded-lg" />
      <Skeleton className="h-4 w-80" />
      <TableSkeleton rows={6} />
    </main>
  );
}
