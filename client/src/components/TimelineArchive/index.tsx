import type { ReactNode, Ref } from "react";

export default function TimelineArchive({
  ref,
  toolbar,
  toolbarRef,
  archiveRef,
  footer,
  children,
}: {
  ref?: Ref<HTMLDivElement>;
  toolbar?: ReactNode;
  toolbarRef?: Ref<HTMLDivElement>;
  archiveRef?: Ref<HTMLDivElement>;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      ref={ref}
      tabIndex={ref ? -1 : undefined}
      className="mx-auto max-w-6xl outline-none lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-10 lg:px-8"
    >
      <aside
        aria-label="时间线工具"
        className="sticky top-0 z-20 flex min-h-17 items-center gap-2 border-b border-binding bg-background-light px-3 pt-[max(.5rem,env(safe-area-inset-top))] pb-2 sm:gap-3 sm:px-6 lg:top-8 lg:mt-8 lg:h-[calc(100dvh-4.5rem)] lg:min-h-68 lg:flex-col lg:items-stretch lg:gap-5 lg:self-start lg:border-b-0 lg:bg-background lg:px-0 lg:pt-2 lg:pb-0"
      >
        <div
          ref={toolbarRef}
          className="flex min-w-0 flex-1 items-center gap-2 self-stretch sm:gap-3 lg:flex-none lg:flex-col lg:items-stretch lg:gap-5"
        >
          {toolbar ?? (
            <div
              aria-hidden="true"
              className="flex w-full items-center gap-2 motion-safe:animate-pulse lg:flex-col lg:items-start lg:gap-5"
            >
              <div className="h-9 w-16 shrink-0 rounded-md bg-background-lighter lg:h-16 lg:w-32" />
              <div className="h-11 flex-1 rounded-md border border-binding bg-background-lighter lg:w-full lg:flex-none" />
              <div className="size-11 shrink-0 rounded-md bg-background-lighter lg:w-full" />
            </div>
          )}
        </div>
      </aside>
      <div className="min-w-0 px-4 pt-6 pb-12 sm:px-6 lg:px-0 lg:pt-8">
        <div
          ref={archiveRef}
          data-timeline-archive
          className="ml-1 border-l border-binding pl-(--archive-gutter) [--archive-gutter:1.125rem] lg:ml-24 lg:[--archive-gutter:1.75rem]"
        >
          {children}
        </div>
        {footer}
      </div>
    </div>
  );
}

export function TimelineArchiveLoading({ label }: { label: string }) {
  return (
    <>
      <p role="status" className="mb-4 text-sm text-foreground-dark">
        {label}
      </p>
      <div aria-hidden="true" className="space-y-5 motion-safe:animate-pulse">
        {["w-2/3", "w-1/2"].map((width) => (
          <div
            key={width}
            className="space-y-4 rounded-lg border border-binding bg-background-light p-5"
          >
            <div className={`h-5 rounded bg-background-lighter ${width}`} />
            <div className="h-3 w-5/6 rounded bg-background-lighter" />
            <div className="h-3 w-3/4 rounded bg-background-lighter" />
          </div>
        ))}
      </div>
    </>
  );
}

export function TimelineArchiveError({
  error,
  onRetry,
  retryLabel = "重试加载",
  retrying = false,
}: {
  error: string;
  onRetry: () => void;
  retryLabel?: string;
  retrying?: boolean;
}) {
  return (
    <div className="rounded-lg border border-binding bg-background-light p-5">
      <p role="alert" className="text-danger">
        {error}
      </p>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="mt-3 cursor-pointer rounded-md border border-control px-3 py-2 hover:bg-background-lighter disabled:cursor-default disabled:opacity-70"
      >
        {retryLabel}
      </button>
    </div>
  );
}
