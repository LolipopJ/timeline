import { mdiDotsHorizontal, mdiEmail, mdiGithub, mdiWebBox } from "@mdi/js";
import Icon from "@mdi/react";
import { type RefObject, useEffect, useId, useRef, useState } from "react";

import AdminViewToggle from "@/components/AdminViewToggle";
import ThemeToggle from "@/components/ThemeToggle";

import config from "../../../configs/client";

const { homepage, email, github } = config;
const links = [
  { label: "个人主页", href: homepage, icon: mdiWebBox },
  { label: "GitHub", href: github, icon: mdiGithub },
  {
    label: "电子邮件",
    href: email ? `mailto:${email}` : undefined,
    icon: mdiEmail,
  },
].filter(({ href }) => href);

export default function TimelineTools({
  previewFocusRef,
}: {
  previewFocusRef: RefObject<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function dismissOutside(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      )
        setOpen(false);
    }
    document.addEventListener("pointerdown", dismissOutside);
    return () => document.removeEventListener("pointerdown", dismissOutside);
  }, [open]);

  function closeMenu() {
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  }

  return (
    <div
      ref={rootRef}
      className="relative flex shrink-0 items-center gap-2 lg:contents"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          event.stopPropagation();
          closeMenu();
        }
      }}
    >
      <button
        ref={(element) => {
          triggerRef.current = element;
          if (
            element &&
            previewFocusRef.current &&
            !window.matchMedia("(min-width: 40rem)").matches
          ) {
            previewFocusRef.current = false;
            element.focus({ preventScroll: true });
          }
        }}
        type="button"
        aria-label="时间线菜单"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className={`order-last grid size-11 cursor-pointer place-items-center rounded-md border border-control bg-background-light text-foreground hover:bg-background-lighter focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:hidden ${links.length ? "" : "sm:hidden"}`}
      >
        <Icon path={mdiDotsHorizontal} className="size-5" aria-hidden="true" />
      </button>
      <div
        id={menuId}
        className={`${open ? "flex" : "hidden"} absolute top-full right-0 z-30 mt-2 min-w-40 flex-col gap-1 rounded-md border border-control bg-background-light p-1 shadow-lg sm:static sm:mt-0 sm:flex sm:min-w-0 sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none lg:contents`}
      >
        <div className="flex flex-col gap-1 sm:flex-row sm:gap-2 lg:flex-col">
          <ThemeToggle />
          <AdminViewToggle focusRef={previewFocusRef} />
        </div>
        {links.length > 0 && (
          <ul
            aria-label="站点链接"
            className={`${open ? "flex" : "hidden"} flex-col border-t border-binding pt-1 sm:absolute sm:top-full sm:right-0 sm:z-30 sm:mt-2 sm:min-w-36 sm:rounded-md sm:border sm:border-control sm:bg-background-light sm:p-1 sm:shadow-lg lg:absolute lg:top-auto lg:right-auto lg:bottom-0 lg:left-0 lg:mt-0 lg:flex lg:w-full lg:min-w-0 lg:flex-row lg:gap-3 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none`}
          >
            {links.map(({ label, href, icon }) => (
              <li key={label}>
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  title={label}
                  onClick={() => {
                    if (open) closeMenu();
                  }}
                  className="flex min-h-11 items-center gap-2 rounded-sm px-3 text-sm text-foreground hover:bg-background-lighter hover:text-primary lg:size-9 lg:min-h-0 lg:justify-center lg:p-0 lg:text-foreground-dark"
                >
                  <Icon
                    path={icon}
                    className="size-5 lg:size-8"
                    aria-hidden="true"
                  />
                  <span className="lg:sr-only">{label}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
