import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Join the waitlist",
  description: "Get early access. Confirm your email, invite friends, move up the list.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
