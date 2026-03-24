import { CatalogSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <div className="mb-8 space-y-2">
        <div className="skeleton h-4 w-24 rounded" />
        <div className="skeleton h-8 w-64 rounded-lg" />
        <div className="skeleton h-3.5 w-32 rounded" />
      </div>
      <CatalogSkeleton count={9} />
    </div>
  );
}
