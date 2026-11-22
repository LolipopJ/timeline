import type { ReactNode } from "react";

export default function TimelineActionBar({
  label,
  status,
  children,
}: {
  label: string;
  status: string;
  children: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex w-full flex-wrap items-center justify-center gap-1.5 rounded-lg border border-control bg-background-light p-2 shadow-lg lg:fixed lg:top-4 lg:left-1/2 lg:w-max lg:max-w-[calc(100%-2rem)] lg:-translate-x-1/2"
    >
      <p
        role="status"
        className="mx-1 min-w-0 text-sm font-medium wrap-anywhere tabular-nums"
      >
        {status}
      </p>
      {children}
    </div>
  );
}
