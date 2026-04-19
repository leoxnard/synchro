import React from 'react';
import { SlReload } from "react-icons/sl";

export default function FinalResultsPhase({ scores, highscore, isNewHighscore, onRestart }) {
    const totalScore = scores.reduce((sum, score) => sum + score, 0);
    const averageScore = scores.length > 0 ? Math.round(totalScore / scores.length) : 0;

    return (
        <div className="h-full w-full flex flex-col items-center justify-center">
            <p className="mb-4 text-[11px] uppercase tracking-[0.28em] text-neutral-500">Session Complete</p>
            <div className="relative h-full w-full flex flex-col items-center justify-center">
                <div className="w-full max-w-xl text-center px-2 md:px-3 flex flex-col gap-4">

                    <div className="mb-1 text-xs uppercase tracking-[0.22em] text-neutral-500">Total Score</div>
                    <div className="mb-2 text-6xl font-black text-stone-200 md:text-8xl">
                        {(Math.round(totalScore)/10).toFixed(1)}
                    </div>

                    {isNewHighscore && (
                        <div className="text-sm font-bold text-amber-400 mb-2 animate-pulse">NEW HIGHSCORE</div>
                    )}
                    {!isNewHighscore && highscore > 0 && (
                        <div className="text-xs text-neutral-500 mb-4">Highscore: {(Math.round(highscore)/10).toFixed(1)}</div>
                    )}

                    <p className="mb-4 text-md text-neutral-300">Average accuracy: <span className="font-semibold text-stone-200">{(averageScore/10).toFixed(1)}</span></p>

                    <div className="mb-7 grid grid-cols-5 gap-2">
                        {scores.map((score, idx) => (
                            <div key={idx} className="rounded-xl border border-white/10 bg-white/[0.03] px-1.5 py-2.5">
                                <p className={`text-2xl font-black mb-1 ${
                                    score >= 90 ? 'text-emerald-400' :
                                        score >= 80 ? 'text-amber-400' :
                                            'text-red-400'
                                }`}>
                                    {(Math.round(score)/10).toFixed(1)}
                                </p>
                                <p className="text-[9px] uppercase tracking-[0.16em] text-neutral-500">R{idx + 1}</p>
                            </div>
                        ))}
                    </div>

                </div>
                <div className="pointer-events-none absolute bottom-0 right-0">
                    <button
                        onClick={onRestart}
                        className="pointer-events-auto grid h-12 w-12 place-items-center rounded-full bg-stone-200 text-neutral-950 shadow-lg shadow-stone-500/30 transition-transform hover:scale-105 active:scale-95"
                    >
                        <span className="text-xl leading-none">
                            <SlReload />
                        </span>
                    </button>
                </div>
            </div>
        </div>
    );
}
