"use client";

import "./globals.css";

import { Fancybox } from "@fancyapps/ui";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";

import { LoginModal } from "@/components/LoginModal";
import { MessageContainer } from "@/components/Message";
import { LS_LAST_VISIT_DATE } from "@/constants";
import GlobalContext, {
  GLOBAL_CONTEXT_DEFAULT_VALUE,
  type GlobalContextValue,
} from "@/contexts/GlobalContext";
import { AUTH_EXPIRED_EVENT, fetcherGET, fetcherPOST } from "@/services/axios";

import config from "../../../configs/client";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const pathname = usePathname();

  const [lastVisitDate, setLastVisitDate] = useState<Date | null>(null);
  const [initialized, setInitialized] = useState<boolean>(false);
  const [login, setLogin] = useState<boolean>(false);
  const [logout, setLogout] = useState<boolean>(false);

  const { isLoading: isRequestingLogout } = useSWR<string>(
    logout ? "/logout" : null,
    fetcherPOST,
  );
  const { data: loginStatus, mutate: mutateLoginStatus } = useSWR<{
    isLoggedIn: boolean;
  }>("/login", fetcherGET);

  const globalContext: GlobalContextValue = {
    ...GLOBAL_CONTEXT_DEFAULT_VALUE,
    lastVisitDate,
    isLoggedIn: loginStatus?.isLoggedIn ?? false,
  };

  useEffect(() => {
    // 服务端返回登录态已过期（401）时，清除本地登录状态
    const onAuthExpired = () =>
      void mutateLoginStatus({ isLoggedIn: false }, false);
    window.addEventListener(AUTH_EXPIRED_EVENT, onAuthExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onAuthExpired);
  }, [mutateLoginStatus]);

  // Static HTML must match the first client render; browser storage and URL
  // initialization deliberately run once after hydration.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const lsLastVisitDate = localStorage.getItem(LS_LAST_VISIT_DATE);
    setLastVisitDate(lsLastVisitDate ? new Date(lsLastVisitDate) : null);
    localStorage.setItem(LS_LAST_VISIT_DATE, String(new Date()));

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
  /* eslint-enable react-hooks/set-state-in-effect */

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
        <GlobalContext.Provider value={globalContext}>
          <main>{!initialized || logout ? null : children}</main>
          {login && (
            <LoginModal
              open={true}
              onClose={() => {
                setLogin(false);
                router.replace(pathname);
              }}
              onLogged={() => {
                void mutateLoginStatus({ isLoggedIn: true }, false);
                window.location.replace(pathname);
              }}
            />
          )}
          <MessageContainer />
        </GlobalContext.Provider>
      </body>
    </html>
  );
}
