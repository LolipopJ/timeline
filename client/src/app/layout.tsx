"use client";

import "./globals.css";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { LoginModal } from "@/components/LoginModal";
import { MessageContainer } from "@/components/Message";

import config from "../../../configs/client";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const login = searchParams.get("login");

  return (
    <html lang="zh-CN">
      <head>
        <meta name="referrer" content="no-referrer" />
        {config.metadata &&
          Object.entries(config.metadata).map((entry) => (
            <meta key={entry[0]} name={entry[0]} content={entry[1]} />
          ))}
      </head>
      <body>
        <main>{children}</main>
        <LoginModal
          open={login !== null}
          onClose={() => router.replace(pathname)}
        />
        <MessageContainer />
      </body>
    </html>
  );
}
