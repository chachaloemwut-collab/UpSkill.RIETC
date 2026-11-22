export function LoadingSkeleton({ label = "กำลังโหลดข้อมูล", rows = 3 }: { label?: string; rows?: number }) {
  return <div role="status" aria-label={label} className="w-full space-y-3 py-4 motion-safe:animate-pulse print:hidden">
    {Array.from({ length: rows }, (_, index) => <div aria-hidden="true" key={index} className="flex min-h-12 items-center gap-3 rounded-lg border bg-card p-3">
      <div className="size-9 shrink-0 rounded-md bg-muted" />
      <div className="flex-1 space-y-2"><div className="h-3 w-2/5 rounded bg-muted" /><div className="h-2 w-3/4 rounded bg-muted" /></div>
    </div>)}
  </div>;
}
