import { mdiDotsHorizontal, mdiEmail, mdiGithub, mdiWebBox } from "@mdi/js";
import Icon from "@mdi/react";
import { useEffect, useId, useRef, useState } from "react";

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

export default function TimelineOwner() {
  const [open, setOpen] = useState(false);
  const listId = useId();
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

  if (!links.length) return null;

  return (
    <div
      ref={rootRef}
      className="relative shrink-0"
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
        ref={triggerRef}
        type="button"
        aria-label="站点链接"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        className="grid size-11 cursor-pointer place-items-center rounded-md border border-control bg-background-light text-foreground hover:bg-background-lighter lg:hidden"
      >
        <Icon path={mdiDotsHorizontal} className="size-5" aria-hidden="true" />
      </button>
      <ul
        id={listId}
        aria-label="站点链接"
        className={`${open ? "flex" : "hidden"} absolute top-full right-0 z-30 mt-2 w-max min-w-36 flex-col rounded-md border border-control bg-background-light p-1 shadow-lg lg:static lg:mt-0 lg:flex lg:w-full lg:min-w-0 lg:flex-row lg:gap-3 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none`}
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
    </div>
  );
}
