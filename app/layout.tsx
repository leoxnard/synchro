"use client";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import "./globals.css";

import { useIsMobile } from "./hooks/useIsMobile";

const GAMES = [
    { id: "poly-rhythm", label: "Polyrhythm", href: "/poly-rhythm" },
    { id: "tempo-recognition", label: "Tempo Recognition", href: "/tempo-recognition" },
    { id: "hold-the-time", label: "Hold The Time", href: "/hold-the-time" },
];

// add impressum and datenschutz pages
const OTHER_PAGES = [
    { id: "impressum", label: "Legal Notice", href: "/legal-notice" },
    { id: "datenschutz", label: "Privacy Policy", href: "/privacy-policy" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isMobile = useIsMobile();
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    if (!isClient) return <div className="loading-placeholder" />;

    return (
        <html lang="de">
            <body className="bg-neutral-900 text-white">
                <div className="flex flex-col h-[100dvh] overflow-hidden">
                    <nav className="w-full flex-none">
                        <div className="flex px-4 py-4 flex gap-2">
                            {GAMES.map((game) => (
                                <Link
                                    key={game.id}
                                    href={game.href}
                                    className={`px-4 py-2 font-medium transition-colors ${
                                        pathname === game.href
                                            ? 'text-neutral-300'
                                            : 'text-neutral-500 hover:text-neutral-300'
                                    }`}
                                >
                                    {game.label}
                                </Link>
                            ))}
                            {!isMobile && (
                                <div className="flex px-4 py-2 flex gap-2 justify-end ml-auto">
                                    {OTHER_PAGES.map((page) => (
                                        <Link
                                            key={page.id}
                                            href={page.href}
                                            className={`px-4 py-2 font-medium transition-colors ${
                                                pathname === page.href
                                                    ? 'text-neutral-300'
                                                    : 'text-neutral-500 hover:text-neutral-300'
                                            }`}
                                        >
                                            {page.label}
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>
                    </nav>

                    <main className="flex-1 overflow-hidden">
                        {children}
                    </main>

                    {isMobile && (
                        <footer className="w-full flex-none">
                            <div className="flex px-4 py-4 flex gap-2 justify-center">
                                {OTHER_PAGES.map((page) => (
                                    <Link
                                        key={page.id}
                                        href={page.href}
                                        className={`px-4 py-2 font-medium transition-colors ${
                                            pathname === page.href
                                                ? 'text-neutral-300'
                                                : 'text-neutral-500 hover:text-neutral-300'
                                        }`}
                                    >
                                        {page.label}
                                    </Link>
                                ))}
                            </div>
                        </footer>
                    )}
                </div>
            </body>
        </html>
    );
}