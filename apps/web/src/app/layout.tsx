import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Fraunces, Inter_Tight, JetBrains_Mono } from "next/font/google";
import { cn } from "@/lib/utils";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { AppUpdater } from "@/components/app-updater";
import { QueryProvider } from "@/components/query-provider";
import { Toaster } from "sonner";
import { BRAND_FULL_NAME } from "@/lib/brand";

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  axes: ["opsz", "SOFT"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: BRAND_FULL_NAME,
  description: `Plataforma de operaciones internas · ${BRAND_FULL_NAME}`,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: BRAND_FULL_NAME,
  },
};

export const viewport: Viewport = {
  // Lets content reach under the notch/home indicator; shells pad with env(safe-area-inset-*).
  viewportFit: "cover",
  // Match the canvas (--background) so the browser chrome blends in.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f2ea" },
    { media: "(prefers-color-scheme: dark)", color: "#010101" },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={cn("font-sans", interTight.variable, fraunces.variable, jetbrainsMono.variable)}
    >
      <head>
        {/* No-flash theme init — runs before React hydrates */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('befine-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.classList.toggle('dark',t==='dark');document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <NextIntlClientProvider messages={messages}>
          <QueryProvider>
            {children}
            <AppUpdater />
            <Toaster
              richColors
              closeButton
              duration={4000}
              position="bottom-right"
              mobileOffset={{
                bottom: "calc(var(--app-bottom-inset) + var(--app-fab-inset) + 16px)",
              }}
            />
          </QueryProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
