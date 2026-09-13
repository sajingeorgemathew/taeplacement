import type { Metadata } from "next";
import { Geist } from "next/font/google";

import { APP_FULL_NAME, APP_NAME } from "@/lib/navigation";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

/**
 * The tab icon comes from src/app/icon.png, the supplied academy favicon. It is
 * picked up by the App Router file convention, so no icon is declared here.
 */
export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_FULL_NAME,
  applicationName: APP_NAME,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full bg-canvas text-ink">{children}</body>
    </html>
  );
}
