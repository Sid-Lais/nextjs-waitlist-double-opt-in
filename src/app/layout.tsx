import type { Metadata } from "next";
import { DM_Mono, DM_Sans, Doto } from "next/font/google";
import "./globals.css";

const sans = DM_Sans({ subsets: ["latin"], variable: "--font-sans" });
const mono = DM_Mono({ subsets: ["latin"], weight: ["500"], variable: "--font-mono" });
const led = Doto({ subsets: ["latin"], weight: ["900"], variable: "--font-led" });

export const metadata: Metadata = {
  title: "Join the waitlist",
  description: "Get early access. Confirm your email, invite friends, move up the list.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${led.variable}`}>
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
