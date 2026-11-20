import { forwardRef, type HTMLAttributes } from "react";
import { Card, CardHeader } from "../ui/card";
import { Skeleton } from "../ui/skeleton";
import { cn } from "../../lib/utils";

/** Shared Card composition; spacing and shape stay owned by shadcn. */
export const PracticePanel = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(function PracticePanel({ children, className, ...props }, ref) {
  return (
    <Card
      ref={ref}
      className={cn("practice-panel", className)}
      role={
        props["aria-label"] || props["aria-labelledby"] ? "region" : undefined
      }
      {...props}
    >
      <CardHeader>
        <div className="practice-panel-body">{children}</div>
      </CardHeader>
    </Card>
  );
});

export function PracticeLoading({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <PracticePanel
      role="status"
      aria-busy="true"
      className="practice-loading-state"
    >
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      <div className="loading-question" aria-hidden="true">
        <Skeleton className="h-4 w-2/3 motion-reduce:animate-none" />
        <Skeleton className="h-4 w-full motion-reduce:animate-none" />
        <Skeleton className="h-28 w-full motion-reduce:animate-none" />
      </div>
    </PracticePanel>
  );
}
