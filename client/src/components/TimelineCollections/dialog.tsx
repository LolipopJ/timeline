import { mdiClose } from "@mdi/js";
import Icon from "@mdi/react";
import { type ReactNode, useId, useLayoutEffect, useRef } from "react";

import useDialogBackdrop from "@/hooks/useDialogBackdrop";

export const dialogActionClass =
  "min-h-11 cursor-pointer rounded-md border border-control px-3 py-2 text-sm font-medium hover:bg-background-lighter focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-default disabled:opacity-50";

export default function CollectionDialog({
  title,
  onClose,
  busy = false,
  footer,
  children,
}: {
  title: string;
  onClose: () => void;
  busy?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  function closeDialog() {
    dialogRef.current?.close();
    onClose();
  }

  function dismiss() {
    if (!busy) closeDialog();
  }

  const backdrop = useDialogBackdrop(dismiss);
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      {...backdrop}
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      className="archive-dialog fixed inset-0 m-auto max-h-[calc(100dvh-1.5rem)] w-[min(calc(100%-1.5rem),32rem)] max-w-none flex-col overflow-hidden rounded-xl border border-control bg-background-light text-foreground shadow-xl backdrop:bg-black/60 open:flex"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-binding px-4 py-2">
        <h2 id={titleId} className="font-semibold">
          {title}
        </h2>
        <button
          type="button"
          aria-label={"关闭" + title}
          className={dialogActionClass}
          onClick={dismiss}
          disabled={busy}
        >
          <Icon path={mdiClose} className="size-5" aria-hidden="true" />
        </button>
      </header>
      <div className="min-h-0 overflow-auto overscroll-contain p-4">
        {children}
      </div>
      {footer && (
        <footer className="shrink-0 border-t border-binding px-4 py-3">
          {footer}
        </footer>
      )}
    </dialog>
  );
}
