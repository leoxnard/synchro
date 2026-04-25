import React from 'react';
import { SlArrowRight } from "react-icons/sl";

export default function RoundResultsView({ round, totalRounds, targetTempo, guessTempo, score, onContinue }) {
    return (
        <div className="absolute inset-0 flex flex-col p-5 md:p-7">
            <div className="flex justify-between items-start w-full shrink-0">
                <div>
                    <p className="text-xs md:text-xs uppercase tracking-[0.28em] text-neutral-500 mb-1">Round {round} / {totalRounds}</p>
                </div>
                <div className="text-center">
                    <p className="text-xs md:text-xs uppercase tracking-[0.22em] text-neutral-500 mb-1">Score</p>
                    <div className="text-8xl md:text-8xl font-black text-stone-200 leading-none tabular-nums">
                        {(Math.round(score)/10).toFixed(1)}
                    </div>
                </div>
            </div>
            <div className="flex-1 flex flex-col justify-center items-center gap-6 min-h-0">
                <div className="text-center">
                    <p className="text-xs uppercase tracking-[0.24em] text-neutral-500 mb-2">Target</p>
                    <div className="text-8xl md:text-8xl font-black text-neutral-500/80 leading-none tabular-nums">
                        {targetTempo}
                    </div>
                    <p className="mt-1 text-xs text-neutral-400">BPM</p>
                </div>
                <div className="text-center">
                    <p className="text-xs uppercase tracking-[0.24em] text-neutral-500 mb-2">Guess</p>
                    <div className="text-8xl md:text-8xl font-black text-stone-200 leading-none tabular-nums">
                        {guessTempo}
                    </div>
                    <p className="mt-1 text-xs text-neutral-400">BPM</p>
                </div>
            </div>
            <div className="shrink-0 flex justify-end w-full">
                <button
                    onClick={onContinue}
                    className="grid h-12 w-12 md:h-14 md:w-14 place-items-center rounded-full bg-stone-200 text-neutral-950 shadow-lg shadow-stone-500/30 transition-transform hover:scale-105 active:scale-95"
                    aria-label={round < totalRounds ? 'Next round' : 'Results'}
                >
                    <span className="text-xl md:text-2xl leading-none">
                        <SlArrowRight /> 
                    </span>
                </button>
            </div>
        </div>
    );
}