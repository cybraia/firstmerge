import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { auth } from "@/auth";
import { SignOutButton } from "@/components/AuthButtons";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "firstmerge: open source repos that actually merge outside PRs",
  description:
    "We measure how open-source projects treat outside contributors: merge rate, reply time and ghosting. Find where your first PR will actually land.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <header className="site-header">
          <div className="wrap">
            <Link href="/" className="brand">
              first<span>merge</span>
            </Link>
            {session ? (
              <div className="who">
                <span>{session.login}</span>
                <SignOutButton />
              </div>
            ) : null}
          </div>
        </header>
        <main className="wrap">{children}</main>
        <footer>
          <div className="wrap">
            <p className="fine-print">
              Numbers come from public GitHub pull-request history and are estimates, not guarantees. Not affiliated
              with GitHub.
            </p>
            <div className="wordmark" aria-hidden="true">
              firstmerge
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
