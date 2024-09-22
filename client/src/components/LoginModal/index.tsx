import {
  mdiCardAccountDetailsOutline,
  mdiCloseThick,
  mdiCodeBraces,
  mdiKeyOutline,
} from "@mdi/js";
import Icon from "@mdi/react";
import { useRef, useState } from "react";

import axios from "@/services/axios";

import message from "../Message";

export interface LoginModalProps {
  open: boolean;
  onClose: () => void;
}

export function LoginModal(props: LoginModalProps) {
  const { open, onClose } = props;
  const formRef = useRef<HTMLFormElement>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const onLogin = async () => {
    if (loading || !formRef.current) return;
    setLoading(true);

    const formData = new FormData(formRef.current);

    try {
      const response = await axios.post("/login", formData);

      if (response.status === 200) {
        message.success(response.data);
        onClose();
      } else {
        message.error(response.data);
      }
    } catch (error) {
      message.error(String(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`${open ? "block" : "hidden"} fixed inset-0 z-40 bg-neutral-950/20 backdrop-blur-sm`}
    >
      <div className="bg-background-light relative left-1/2 top-1/2 flex max-w-96 -translate-x-1/2 -translate-y-2/3 flex-col items-center overflow-hidden rounded-lg px-10 py-16">
        <a
          onClick={onClose}
          className="absolute right-2 top-2 cursor-pointer p-2"
        >
          <Icon path={mdiCloseThick} size={1} />
        </a>
        <Icon path={mdiCodeBraces} size={2} className="mb-4" />
        <span className="mb-8 text-xl font-bold tracking-widest">
          管理员登录
        </span>
        <form
          ref={formRef}
          onSubmit={(e) => {
            e.preventDefault();
            onLogin();
          }}
          className="flex w-full flex-col gap-4"
        >
          <div>
            <label
              htmlFor="username"
              className="flex items-center gap-2 pb-2 tracking-widest"
            >
              <Icon path={mdiCardAccountDetailsOutline} size={1} />
              <span>用户名</span>
            </label>
            <input
              name="username"
              required
              autoComplete="username"
              className="bg-background-lighter border-1 w-full rounded border-neutral-50/20 p-2 text-lg"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="flex items-center gap-2 pb-2 tracking-widest"
            >
              <Icon path={mdiKeyOutline} size={1} />
              <span>密码</span>
            </label>
            <input
              name="password"
              required
              type="password"
              autoComplete="current-password"
              className="bg-background-lighter border-1 w-full rounded border-neutral-50/20 p-2 text-lg"
            />
          </div>
          <div>
            <button
              type="submit"
              className="bg-primary-dark hover:bg-primary mt-2 w-full rounded py-3 tracking-widest transition"
              disabled={loading}
            >
              登 录
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
