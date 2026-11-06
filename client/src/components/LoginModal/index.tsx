import {
  mdiCardAccountDetailsOutline,
  mdiCloseThick,
  mdiCodeBraces,
  mdiKeyOutline,
} from "@mdi/js";
import Icon from "@mdi/react";
import { useEffect, useRef, useState } from "react";

import useDialogBackdrop from "@/hooks/useDialogBackdrop";
import axios from "@/services/axios";

export interface LoginModalProps {
  open: boolean;
  onClose: () => void;
  onLogged: () => void;
}

export function LoginModal({ open, onClose, onLogged }: LoginModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    text: string;
    success: boolean;
  }>();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  const closeDialog = () => dialogRef.current?.close();
  const backdrop = useDialogBackdrop(closeDialog);

  async function onLogin() {
    if (loading || !formRef.current) return;
    setLoading(true);
    setFeedback(undefined);

    try {
      const response = await axios.post<string>(
        "/login",
        new FormData(formRef.current),
      );

      if (response.status === 200) {
        setFeedback({ text: response.data, success: true });
        setTimeout(onLogged, 1000);
        return;
      }

      setFeedback({ text: response.data, success: false });
    } catch (error) {
      setFeedback({ text: String(error), success: false });
    }
    setLoading(false);
  }

  return (
    <dialog
      id="login-modal"
      ref={dialogRef}
      inert={!open}
      aria-labelledby="login-modal-title"
      {...backdrop}
      onClose={() => {
        formRef.current?.reset();
        setFeedback(undefined);
        onClose();
      }}
      className="archive-dialog fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-96 flex-col items-center overflow-y-auto overscroll-contain rounded-lg border border-control bg-background-light px-6 py-10 text-foreground shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-xs open:flex sm:px-10 sm:py-12"
    >
      <button
        type="button"
        aria-label="关闭登录"
        onClick={closeDialog}
        className="absolute top-2 right-2 grid size-11 cursor-pointer place-items-center rounded-md hover:bg-background-lighter"
      >
        <Icon path={mdiCloseThick} className="size-5" aria-hidden="true" />
      </button>
      <Icon
        path={mdiCodeBraces}
        size={2}
        className="mb-4 shrink-0"
        aria-hidden="true"
      />
      <h1
        id="login-modal-title"
        className="mb-8 text-xl font-bold tracking-widest"
      >
        管理员登录
      </h1>
      <form
        ref={formRef}
        onSubmit={(event) => {
          event.preventDefault();
          void onLogin();
        }}
        className="flex w-full flex-col gap-4"
      >
        <div>
          <label
            htmlFor="username"
            className="flex items-center gap-2 pb-2 tracking-widest"
          >
            <Icon
              path={mdiCardAccountDetailsOutline}
              size={1}
              aria-hidden="true"
            />
            <span>用户名</span>
          </label>
          <input
            id="username"
            name="username"
            required
            autoComplete="username"
            className="w-full rounded-sm border border-control bg-background-lighter p-2 text-lg"
          />
        </div>
        <div>
          <label
            htmlFor="password"
            className="flex items-center gap-2 pb-2 tracking-widest"
          >
            <Icon path={mdiKeyOutline} size={1} aria-hidden="true" />
            <span>密码</span>
          </label>
          <input
            id="password"
            name="password"
            required
            type="password"
            autoComplete="current-password"
            className="w-full rounded-sm border border-control bg-background-lighter p-2 text-lg"
          />
        </div>
        <button
          type="submit"
          className="mt-2 w-full cursor-pointer rounded-sm bg-primary py-3 tracking-widest text-on-primary hover:bg-primary-light disabled:cursor-default disabled:opacity-70 motion-safe:transition-colors"
          disabled={loading}
        >
          登 录
        </button>
        {feedback && (
          <p
            role={feedback.success ? "status" : "alert"}
            className={feedback.success ? "text-primary" : "text-danger"}
          >
            {feedback.text}
          </p>
        )}
      </form>
    </dialog>
  );
}
