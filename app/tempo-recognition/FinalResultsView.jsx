import React from 'react';
import { SlReload } from "react-icons/sl";

export default function FinalResultsView({ scores, highscore, isNewHighscore, onRestart }) {
    const totalScore = scores.reduce((sum, score) => sum + score, 0);
    const averageScore = scores.length > 0 ? Math.round(totalScore / scores.length) : 0;

    return (
        <div className="absolute inset-0 flex flex-col p-5 md:p-7">
            <div className="shrink-0 text-center">
                <p className="text-[11px] md:text-xs uppercase tracking-[0.28em] text-neutral-500 mb-2">Session Complete</p>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center min-h-0 w-full">
                <div className="w-full max-w-xl text-center px-2 flex flex-col gap-4">
                    
                    <div>
                        <div className="mb-1 text-xs md:text-sm uppercase tracking-[0.22em] text-neutral-500">Total Score</div>
                        <div className="mb-2 text-7xl md:text-9xl font-black text-stone-200 leading-none tabular-nums">
                            {(Math.round(totalScore)/10).toFixed(1)}
                        </div>
                    </div>

                    {isNewHighscore && (
                        <div className="text-sm md:text-base font-bold text-amber-400 mb-2 animate-pulse">NEW HIGHSCORE</div>
                    )}
                    {!isNewHighscore && highscore > 0 && (
                        <div className="text-xs md:text-sm text-neutral-500 mb-4">Highscore: {(Math.round(highscore)/10).toFixed(1)}</div>
                    )}

                    <p className="mb-4 text-sm md:text-base text-neutral-300">Average accuracy: <span className="font-semibold text-stone-200">{(averageScore/10).toFixed(1)}</span></p>

                    <div className="mb-2 grid grid-cols-5 gap-2">
                        {scores.map((score, idx) => (
                            <div key={idx} className="rounded-xl border border-white/10 bg-white/[0.03] px-1 md:px-2 py-2 md:py-3">
                                <p className={`text-xl md:text-3xl font-black mb-1 ${
                                    score >= 90 ? 'text-emerald-400' :
                                        score >= 80 ? 'text-amber-400' :
                                            'text-red-400'
                                }`}>
                                    {(Math.round(score)/10).toFixed(1)}
                                </p>
                                <p className="text-[9px] md:text-[10px] uppercase tracking-[0.16em] text-neutral-500">R{idx + 1}</p>
                            </div>
                        ))}
                    </div>

                </div>
            </div>

            <div className="shrink-0 flex justify-end w-full">
                <button
                    onClick={onRestart}
                    className="grid h-12 w-12 md:h-14 md:w-14 place-items-center rounded-full bg-stone-200 text-neutral-950 shadow-lg shadow-stone-500/30 transition-transform hover:scale-105 active:scale-95"
                >
                    <span className="text-xl md:text-2xl leading-none">
                        <SlReload />
                    </span>
                </button>
            </div>

        </div>
    );
}
