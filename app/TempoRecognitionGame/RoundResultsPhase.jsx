import React from 'react';

export default function RoundResultsPhase({ round, totalRounds, targetTempo, guessTempo, score, onContinue }) {
    return (
        <div className="w-full flex items-center justify-center px-4 py-8">
            <div className="relative w-full max-w-xl overflow-hidden rounded-[2rem] border border-primary/20 bg-gradient-to-br from-neutral-900 via-neutral-900 to-emerald-950 shadow-2xl">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.15),transparent_45%)]" />

                <div className="relative p-8 md:p-10 min-h-[22rem] flex flex-col">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-xs uppercase tracking-[0.35em] text-neutral-500 mb-3">Round {round} of {totalRounds}</p>
                        </div>

                        <div className="text-right">
                            <p className="text-xs uppercase tracking-[0.28em] text-neutral-500 mb-2">Accuracy</p>
                            <div className="text-5xl md:text-6xl font-black text-primary leading-none">
                                {Math.round(score)/10}
                            </div>
                        </div>
                    </div>

                    <div className="mt-10 grid flex-1 gap-8 place-items-center text-center">
                        <div>
                            <p className="text-sm uppercase tracking-[0.3em] text-neutral-500 mb-4">Target</p>
                            <div className="text-6xl md:text-7xl font-black text-white leading-none">
                                {targetTempo}
                            </div>
                            <p className="mt-2 text-sm text-neutral-400">BPM</p>
                        </div>
                        
                        <div>
                            <p className="text-sm uppercase tracking-[0.3em] text-neutral-500 mb-3">Guess</p>
                            <div className="text-6xl md:text-7xl font-black text-accent leading-none">
                                {guessTempo}
                            </div>
                            <p className="mt-2 text-sm text-neutral-400">BPM</p>
                        </div>
                    </div>

                    <div className="pointer-events-none absolute bottom-6 right-6">
                        <button
                            onClick={onContinue}
                            className="pointer-events-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-400 text-neutral-950 shadow-lg shadow-primary/30 transition-transform hover:scale-105 active:scale-95"
                            aria-label={round < totalRounds ? 'Next round' : 'Results'}
                        >
                            <span className="text-2xl leading-none">›</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
