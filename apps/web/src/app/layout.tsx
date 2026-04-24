import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Fraunces, Inter_Tight, JetBrains_Mono } from "next/font/google";
import { cn } from "@/lib/utils";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { SwUpdatePrompt } from "@/components/sw-update-prompt";

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
      className={cn("font-sans", interTight.variable, fraunces.variable, jetbrainsMono.variable)}
    >
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
          <SwUpdatePrompt />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
