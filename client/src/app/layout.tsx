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
      <head></head>
      <body className="antialiased">
        <main className="mx-auto my-6 max-w-screen-md">{children}</main>
      </body>
    </html>
  );
}
