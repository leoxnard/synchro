"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const GAMES = [
    { id: "poly-rhythm", label: "Polyrhythm", href: "/poly-rhythm" },
    { id: "hold-the-time", label: "Hold The Tempo", href: "/hold-the-time" },
    { id: "tempo-recognition", label: "Tempo Recognition", href: "/tempo-recognition" },
];

export default function Navbar() {
    const pathname = usePathname();

    return (
        <nav className="w-full flex-none">
            <div className="flex px-4 py-4 flex gap-2">
                {GAMES.map((game) => (
                    <Link
                        key={game.id}
                        href={game.href}
                        className={`px-4 py-2 font-medium transition-colors flex items-center ${ 
                            pathname === game.href
                                ? 'text-neutral-900 dark:text-neutral-300'
                                : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-300'
                        }`}
                    >
                        {game.label}
                    </Link>
                ))}
            </div>
        </nav>
    );

}
