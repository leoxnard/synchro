import React from 'react';
import { SlArrowRight } from "react-icons/sl";

export default function RoundResultsView({ round, totalRounds, targetTempo, guessTempo, score, onContinue }) {
    return (
        <div className="h-full w-full flex items-center justify-center">
            <div className="relative w-full max-w-lg h-full flex flex-col px-2 md:px-3">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className="text-[11px] uppercase tracking-[0.28em] text-neutral-500 mb-2">Round {round} of {totalRounds}</p>
                    </div>
                    <div className="text-center">
                        <p className="text-[11px] uppercase tracking-[0.22em] text-neutral-500 mb-1">Score</p>
                        <div className="text-4xl md:text-8xl font-black text-stone-200 leading-none">
                            {(Math.round(score)/10).toFixed(1)}
                        </div>
                    </div>
                </div>


                <div className="grid flex-1 gap-6 pb-16 pt-5 place-items-center text-center">
                    <div>
                        <p className="text-xs uppercase tracking-[0.24em] text-neutral-500 mb-3">Target</p>
                        <div className="text-5xl md:text-8xl font-black text-neutral-500 leading-none">
                            {targetTempo}
                        </div>
                        <p className="mt-1.5 text-xs text-neutral-400">BPM</p>
                    </div>

                    <div>
                        <p className="text-xs uppercase tracking-[0.24em] text-neutral-500 mb-3">Guess</p>
                        <div className="text-5xl md:text-8xl font-black text-neutral-200 leading-none">
                            {guessTempo}
                        </div>
                        <p className="mt-1.5 text-xs text-neutral-400">BPM</p>
                    </div>
                </div>

                <div className="pointer-events-none absolute bottom-0 right-0">
                    <button
                        onClick={onContinue}
                        className="pointer-events-auto grid h-12 w-12 place-items-center rounded-full bg-stone-200 text-neutral-950 shadow-lg shadow-stone-500/30 transition-transform hover:scale-105 active:scale-95"
                        aria-label={round < totalRounds ? 'Next round' : 'Results'}
                    >
                        <span className="text-xl leading-none">
                            <SlArrowRight /> 
                        </span>
                    </button>
                </div>
            </div>
        </div>
    );
}
