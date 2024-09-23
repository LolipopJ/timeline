"use client";

import "./globals.css";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
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
  const searchParams = useSearchParams();
  const login = searchParams.get("login") !== null;
  const logout = searchParams.get("logout") !== null;

  const { isLoading: isRequestingLogout } = useSWR<string>(
    logout ? "/logout" : null,
    fetcherPOST,
  );
  useEffect(() => {
    if (logout && !isRequestingLogout) {
      window.location.replace(pathname);
    }
  }, [isRequestingLogout, logout, pathname]);

  return (
    <html lang="zh-CN">
      <head>
        <meta name="referrer" content="no-referrer" />
        {config.metadata &&
          Object.entries(config.metadata).map((entry) => (
            <meta key={entry[0]} name={entry[0]} content={entry[1]} />
          ))}
      </head>
      <body className={`${login ? "overflow-hidden" : ""}`}>
        <main>{logout ? null : children}</main>
        <LoginModal
          open={!!login}
          onClose={() => router.replace(pathname)}
          onLogged={() => window.location.replace(pathname)}
        />
        <MessageContainer />
      </body>
    </html>
  );
}
