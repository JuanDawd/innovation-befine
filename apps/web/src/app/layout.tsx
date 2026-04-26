import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Fraunces, Inter_Tight, JetBrains_Mono } from "next/font/google";
import { cn } from "@/lib/utils";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { SwUpdatePrompt } from "@/components/sw-update-prompt";
import { Toaster } from "sonner";

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
  title: "Innovation Befine",
  description: "Plataforma de operaciones internas — Innovation Befine",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Innovation Befine",
  },
};

export const viewport: Viewport = {
  themeColor: "#E9408E",
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
          {children}
          <SwUpdatePrompt />
          <Toaster richColors closeButton duration={4000} position="bottom-right" />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
