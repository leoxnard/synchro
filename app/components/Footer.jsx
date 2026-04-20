"use client";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";

import { useIsMobile } from "../hooks/useIsMobile";

const OTHER_PAGES = [
    { id: "impressum", label: "Legal Notice", href: "/legal-notice" },
    { id: "datenschutz", label: "Privacy Policy", href: "/privacy-policy" },
];

export default function Footer() {
    const pathname = usePathname();
    const isMobile = useIsMobile();
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    if (!isClient) return <div className="loading-placeholder" />;

    if (!isMobile) return null;

    return (
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
    );
}