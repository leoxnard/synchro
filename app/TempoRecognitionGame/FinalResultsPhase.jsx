import React from 'react';

export default function FinalResultsPhase({ scores, onRestart }) {
    const totalScore = scores.reduce((sum, score) => sum + score, 0);
    const averageScore = scores.length > 0 ? Math.round(totalScore / scores.length) : 0;

    return (
        <div className="w-full flex items-center justify-center">
            <div className="text-center">
                <p className="text-neutral-400 text-sm mb-12">Your Results</p>
                
                <div className="text-8xl font-bold text-primary mb-12">
                    {Math.round(totalScore)}
                </div>

                <p className="text-neutral-400 text-sm mb-16">Average: {averageScore}% per round</p>

                <div className="flex justify-center gap-3 mb-16">
                    {scores.map((score, idx) => (
                        <div key={idx} className="text-center">
                            <p className={`text-2xl font-bold mb-1 ${
                                score >= 80 ? 'text-primary' :
                                    score >= 60 ? 'text-accent' :
                                        'text-danger'
                            }`}>
                                {Math.round(score)}
                            </p>
                            <p className="text-xs text-neutral-500">R{idx + 1}</p>
                        </div>
                    ))}
                </div>

                <button
                    onClick={onRestart}
                    className="px-12 py-3 bg-primary hover:bg-primary-hover text-neutral-900 font-bold rounded-lg transition-colors"
                >
                    Play Again
                </button>
            </div>
        </div>
    );
}
