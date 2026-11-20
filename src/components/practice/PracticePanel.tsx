import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import {
  Frame,
  FrameHeader,
  FrameTitle,
  FrameDescription,
  FramePanel,
} from "../reui/frame";
import { Skeleton } from "../ui/skeleton";
import { cn } from "../../lib/utils";

type Props = HTMLAttributes<HTMLDivElement> & {
  description?: ReactNode;
  accessory?: ReactNode;
  titleId?: string;
};
/** One official Frame composition shared by every practice surface. */
export const PracticePanel = forwardRef<HTMLDivElement, Props>(
  function PracticePanel(
    { children, className, title, description, accessory, titleId, ...props },
    ref,
  ) {
    return (
      <Frame
        ref={ref}
        spacing="default"
        dense
        className={cn(
          "practice-panel [--frame-radius:var(--radius-lg)]",
          className,
        )}
        role={
          props["aria-label"] || props["aria-labelledby"] ? "region" : undefined
        }
        {...props}
      >
        {title && (
          <FrameHeader>
            <div className="frame-heading-row">
              <div>
                <FrameTitle role="heading" aria-level={2} id={titleId}>
                  {title}
                </FrameTitle>
                {description && (
                  <FrameDescription>{description}</FrameDescription>
                )}
              </div>
              {accessory}
            </div>
          </FrameHeader>
        )}
        <FramePanel>
          <div className="practice-panel-body">{children}</div>
        </FramePanel>
      </Frame>
    );
  },
);
export function PracticeLoading({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <PracticePanel title={title} role="status" aria-busy="true">
      <p>{children}</p>
      <div className="loading-question" aria-hidden="true">
        <Skeleton className="h-4 w-2/3 motion-reduce:animate-none" />
        <Skeleton className="h-4 w-full motion-reduce:animate-none" />
        <Skeleton className="h-28 w-full motion-reduce:animate-none" />
      </div>
    </PracticePanel>
  );
}
