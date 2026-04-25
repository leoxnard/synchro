"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";

const OTHER_PAGES = [
    { id: "impressum", label: "Legal Notice", href: "/legal-notice" },
    { id: "datenschutz", label: "Privacy Policy", href: "/privacy-policy" },
];

export default function Footer() {
    const pathname = usePathname();

    return (
        <footer className="w-full flex-none bg-transparent">
            <div className="flex px-4 pt-3 flex gap-2 justify-center md:justify-start">
                {OTHER_PAGES.map((page) => (
                    <Link
                        key={page.id}
                        href={page.href}
                        className={`px-4 py-2 text-xs transition-colors ${
                            pathname === page.href
                                ? 'text-neutral-900 dark:text-neutral-300'
                                : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-300'
                        }`}
                    >
                        {page.label}
                    </Link>
                ))}
            </div>
        </footer>
    );
}