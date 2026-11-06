"use client";

import "./globals.css";

import { Fancybox } from "@fancyapps/ui";
import type { LoginStatus } from "@timeline/contracts";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";

import { LoginModal } from "@/components/LoginModal";
import { MessageContainer } from "@/components/Message";
import TimelineArchive, {
  TimelineArchiveError,
  TimelineArchiveLoading,
} from "@/components/TimelineArchive";
import config from "@/config";
import { LS_LAST_VISIT_DATE } from "@/constants";
import GlobalContext, {
  GLOBAL_CONTEXT_DEFAULT_VALUE,
  type GlobalContextValue,
} from "@/contexts/GlobalContext";
import { AUTH_EXPIRED_EVENT, fetcherGET, fetcherPOST } from "@/services/axios";
import { THEME_INIT_SCRIPT } from "@/utils/theme";

function loginReturnUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("login");
  return `${url.pathname}${url.search}${url.hash}`;
}

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
  const [urlLogoutRequested, setUrlLogoutRequested] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [guestPreview, setGuestPreview] = useState(false);
  const logoutPending = useRef(false);
  const {
    data: loginStatus,
    error: loginStatusError,
    mutate: mutateLoginStatus,
  } = useSWR<LoginStatus>("/login", fetcherGET, {
    onSuccess: (status) => {
      if (!status.isLoggedIn) setGuestPreview(false);
    },
  });

  const logout = useCallback(async () => {
    if (logoutPending.current) return;
    logoutPending.current = true;
    setIsLoggingOut(true);
    setLogoutError(null);
    try {
      await fetcherPOST("/logout");
      await mutateLoginStatus({ isLoggedIn: false }, { revalidate: false });
      setGuestPreview(false);
    } catch {
      setLogoutError("退出失败，请重试。");
    } finally {
      logoutPending.current = false;
      setIsLoggingOut(false);
    }
  }, [mutateLoginStatus]);

  const isLoggedIn = loginStatus?.isLoggedIn ?? false;
  const globalContext: GlobalContextValue = {
    ...GLOBAL_CONTEXT_DEFAULT_VALUE,
    lastVisitDate,
    isLoggedIn,
    view: isLoggedIn && !guestPreview ? "admin" : "public",
    setView: (view) => setGuestPreview(view === "public"),
    canManageItems: isLoggedIn && !guestPreview,
    isLoggingOut,
    logout,
  };

  useEffect(() => {
    // 服务端返回登录态已过期（401）时，清除本地登录状态
    const onAuthExpired = () => {
      void mutateLoginStatus({ isLoggedIn: false }, false);
      setGuestPreview(false);
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onAuthExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onAuthExpired);
  }, [mutateLoginStatus]);

  // Static HTML must match the first client render; browser storage and URL
  // initialization deliberately run once after hydration.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const lsLastVisitDate = localStorage.getItem(LS_LAST_VISIT_DATE);
      setLastVisitDate(lsLastVisitDate ? new Date(lsLastVisitDate) : null);
      localStorage.setItem(LS_LAST_VISIT_DATE, String(new Date()));
    } catch {
      // Reading the timeline does not require browser storage.
    }

    //#region 初始化登录、登出查询
    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.search);
    setLogin(params.get("login") !== null);
    if (params.has("logout")) {
      setUrlLogoutRequested(true);
      void logout();
    }
    //#endregion

    //#region 初始化 Fancybox
    Fancybox.bind("[data-fancybox]", {
      Carousel: { infinite: false },
      placeFocusBack: false,
    });
    //#endregion

    setInitialized(true);
  }, [logout]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (urlLogoutRequested) router.replace(pathname);
  }, [urlLogoutRequested, router, pathname]);

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <title>{String(config.metadata?.title ?? "Timeline")}</title>
        {config.metadata &&
          Object.entries(config.metadata).map((entry) => (
            <meta key={entry[0]} name={entry[0]} content={entry[1]} />
          ))}
        <meta name="referrer" content="no-referrer" />
      </head>
      <body>
        <GlobalContext.Provider value={globalContext}>
          {logoutError && (
            <div
              role="alert"
              className="fixed inset-x-4 top-24 z-30 mx-auto max-w-lg rounded-md border border-danger bg-background-light p-4 text-danger shadow-lg md:top-28 lg:top-4"
            >
              {logoutError}
              <button
                type="button"
                onClick={() => void logout()}
                disabled={isLoggingOut}
                className="ml-4 cursor-pointer text-primary-light disabled:opacity-50"
              >
                重试退出
              </button>
            </div>
          )}
          <main>
            {initialized && loginStatus !== undefined ? (
              children
            ) : (
              <TimelineArchive>
                {loginStatusError ? (
                  <TimelineArchiveError
                    error="登录状态读取失败。"
                    onRetry={() => void mutateLoginStatus()}
                    retryLabel="重试"
                  />
                ) : (
                  <TimelineArchiveLoading label="正在确认登录状态…" />
                )}
              </TimelineArchive>
            )}
          </main>
          <LoginModal
            open={login}
            onClose={() => {
              setLogin(false);
              router.replace(loginReturnUrl(), { scroll: false });
            }}
            onLogged={() => {
              void mutateLoginStatus({ isLoggedIn: true }, false);
              window.location.replace(loginReturnUrl());
            }}
          />
          <MessageContainer />
        </GlobalContext.Provider>
      </body>
    </html>
  );
}
