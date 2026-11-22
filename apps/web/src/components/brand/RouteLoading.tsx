import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { BrandSignal } from "./BrandActivity";
import type { BrandState, WordMotion } from "./states";

export function RouteLoading({ state = "page-loading", word, children }: { state?: BrandState; word?: WordMotion; children: string }) {
  return (
    <div className="grid justify-items-start gap-2 text-sm text-muted-foreground">
      <BrandSignal state={state} {...(word ? { word } : {})} full />
      <LoadingSkeleton label={children} />
    </div>
  );
}
