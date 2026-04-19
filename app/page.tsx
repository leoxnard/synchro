"use client";
import { useState } from "react";
import Link from "next/link";
import PolyRhythmGame from "./PolyRhythmGame/PolyRhythmGame";
import TempoRecognitionGame from "./TempoRecognitionGame/TempoRecognitionGame";
import HoldTheTimeGame from "./HoldTheTime/HoldTheTime";

const GAMES = [
    { id: "poly-rhythm", label: "Polyrhythm", component: PolyRhythmGame },
    { id: "tempo-recognition", label: "Tempo Recognition", component: TempoRecognitionGame },
    { id: "hold-the-time", label: "Hold The Time", component: HoldTheTimeGame },
];

export default function Home() {
    const [activeGame, setActiveGame] = useState("poly-rhythm");
    const currentGame = GAMES.find((g) => g.id === activeGame);
    const GameComponent = currentGame?.component || PolyRhythmGame;

    return (
        <div className="flex flex-col h-[100dvh] bg-neutral-900 font-sans overflow-hidden">
            <nav className="w-full flex-none">
                <div className="mx-auto px-2 py-2 md:px-4 md:py-4 flex items-center justify-between gap-2">
                    <div className="flex gap-2">
                        {GAMES.map((game) => (
                            <button
                                key={game.id}
                                onClick={() => setActiveGame(game.id)}
                                className={`px-4 py-2 font-medium transition-colors ${
                                    activeGame === game.id
                                        ? 'text-neutral-300'
                                        : 'text-neutral-500 hover:text-neutral-300 cursor-default'
                                }`}
                            >
                                {game.label}
                            </button>
                        ))}
                    </div>
                    <div className="hidden md:flex gap-4">
                        <Link
                            href="/legal-notice"
                            className="px-3 py-2 text-sm text-neutral-400 transition-colors hover:text-neutral-200"
                        >
                            Legal Notice
                        </Link>
                        <Link
                            href="/privacy"
                            className="px-3 py-2 text-sm text-neutral-400 transition-colors hover:text-neutral-200"
                        >
                            Privacy
                        </Link>
                    </div>
                </div>
            </nav>

            <div className="flex-1 w-full min-h-0 flex items-stretch justify-stretch md:items-center md:justify-center p-2 md:p-8 overflow-hidden md:overflow-auto">
                <GameComponent />
            </div>

            {/* Mobile Footer */}
            <div className="md:hidden flex justify-center gap-3 border-t border-white/10 bg-neutral-900 px-4 py-3 flex-none">
                <Link
                    href="/legal-notice"
                    className="text-xs text-neutral-400 transition-colors hover:text-neutral-200"
                >
                    Legal Notice
                </Link>
                <span className="text-neutral-600">·</span>
                <Link
                    href="/privacy"
                    className="text-xs text-neutral-400 transition-colors hover:text-neutral-200"
                >
                    Privacy
                </Link>
            </div>
        </div>
    );
}

