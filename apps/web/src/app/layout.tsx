import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { SwUpdatePrompt } from "@/components/sw-update-prompt";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

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
  themeColor: "#8B3A62",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className={cn("font-sans", geist.variable)}>
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
          <SwUpdatePrompt />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
