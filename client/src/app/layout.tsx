import "./globals.css";

import config from "../../../configs/client";

export const metadata = config.metadata;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <meta name="referrer" content="no-referrer" />
      </head>
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
