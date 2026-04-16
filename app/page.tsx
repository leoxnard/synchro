"use client";
import { useState } from "react";
import PolyRhythmGame from "./PolyRhythmGame/PolyRhythmGame";
import TempoRecognitionGame from "./TempoRecognitionGame/TempoRecognitionGame";

const GAMES = [
    { id: "poly-rhythm", label: "Poly Rhythm", component: PolyRhythmGame },
    { id: "tempo-recognition", label: "Tempo Recognition", component: TempoRecognitionGame },
];

export default function Home() {
    const [activeGame, setActiveGame] = useState("poly-rhythm");
    const currentGame = GAMES.find(g => g.id === activeGame);
    const GameComponent = currentGame?.component || PolyRhythmGame;

    return (
        <div className="flex flex-col h-screen bg-neutral-900 font-sans overflow-hidden">
            <nav className="w-full flex-none">
                <div className="max-w-7xl mx-auto px-4 py-4 flex gap-2">
                    {GAMES.map(game => (
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
            </nav>
            <main className="flex-1 w-full flex items-center justify-center p-8 overflow-auto">
                <GameComponent />
            </main>
        </div>
    );
}
