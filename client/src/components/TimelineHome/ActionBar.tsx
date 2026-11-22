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
      className="flex w-full flex-wrap items-center justify-center gap-1.5 rounded-lg border border-control bg-background-light p-2 shadow-lg lg:justify-end"
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
