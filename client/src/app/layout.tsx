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
        <main className="max-w-screen-md px-4 py-6 sm:px-6 sm:py-8 md:mx-auto md:px-8 md:py-10">
          {children}
        </main>
      </body>
    </html>
  );
}
