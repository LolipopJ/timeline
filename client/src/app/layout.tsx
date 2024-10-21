"use client";

import "./globals.css";

import { Fancybox } from "@fancyapps/ui";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";

import { LoginModal } from "@/components/LoginModal";
import { MessageContainer } from "@/components/Message";
import { fetcherPOST } from "@/services/axios";

import config from "../../../configs/client";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const pathname = usePathname();

  const [initialized, setInitialized] = useState<boolean>(false);
  const [login, setLogin] = useState<boolean>(false);
  const [logout, setLogout] = useState<boolean>(false);

  const { isLoading: isRequestingLogout } = useSWR<string>(
    logout ? "/logout" : null,
    fetcherPOST,
  );

  useEffect(() => {
    //#region 初始化登录、登出查询
    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.search);
    setLogin(params.get("login") !== null);
    setLogout(params.get("logout") !== null);
    //#endregion

    //#region 初始化 Fancybox
    Fancybox.bind("[data-fancybox]", {
      Carousel: { infinite: false },
      placeFocusBack: false,
    });
    //#endregion

    setInitialized(true);
  }, []);

  useEffect(() => {
    if (logout && !isRequestingLogout) {
      window.location.replace(pathname);
    }
  }, [isRequestingLogout, logout, pathname]);

  return (
    <html lang="zh-CN">
      <head>
        <title>{String(config.metadata?.title ?? "Timeline")}</title>
        {config.metadata &&
          Object.entries(config.metadata).map((entry) => (
            <meta key={entry[0]} name={entry[0]} content={entry[1]} />
          ))}
        <meta name="referrer" content="no-referrer" />
      </head>
      <body className={`${login ? "overflow-hidden" : ""}`}>
        <main>{!initialized || logout ? null : children}</main>
        {login && (
          <LoginModal
            open={true}
            onClose={() => {
              setLogin(false);
              router.replace(pathname);
            }}
            onLogged={() => window.location.replace(pathname)}
          />
        )}
        <MessageContainer />
      </body>
    </html>
  );
}
