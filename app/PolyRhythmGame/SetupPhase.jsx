import React from 'react';

export default function SetupPhase({
    tracks,
    baseTrackId,
    setBaseTrackId,
    addTrack,
    updateTrack,
    removeTrack,
    startGame,
    bpm,
    setBpm,
    measures,
    setMeasures
}) {
    return (
        <div className="w-full max-w-md bg-neutral-800 p-8 rounded-2xl shadow-2xl border border-neutral-700">
            <h2 className="text-xl mb-6 font-semibold text-center border-b border-neutral-700 pb-4">Configuration</h2>
      
            <div className="flex gap-4 mb-6 pb-6 border-b border-neutral-700/50">
                <div className="flex-1 flex flex-col gap-2 relative group">
                    <label className="text-xs text-neutral-400 uppercase tracking-widest font-bold">Tempo (BPM)</label>
                    <input 
                        type="number" 
                        min="30" max="240" step="5"
                        value={bpm}
                        onChange={(e) => setBpm(Number(e.target.value))}
                        className="bg-neutral-900 rounded-lg p-2 text-center text-xl font-bold border border-neutral-700 focus:border-emerald-400 focus:outline-none transition-colors"
                    />
                </div>
                <div className="flex-1 flex flex-col gap-2 relative group">
                    <label className="text-xs text-neutral-400 uppercase tracking-widest font-bold">Measures</label>
                    <input 
                        type="number" 
                        min="1" max="16" step="1"
                        value={measures}
                        onChange={(e) => setMeasures(Number(e.target.value))}
                        className="bg-neutral-900 rounded-lg p-2 text-center text-xl font-bold border border-neutral-700 focus:border-emerald-400 focus:outline-none transition-colors"
                    />
                </div>
            </div>
      
            <div className="space-y-4 mb-6">
                {tracks.map((track, index) => {
                    const assignedKey = track.key || '';
                    const displayKey = assignedKey === ' ' ? 'SPACE' : assignedKey.toUpperCase();
          
                    return (
                        <div key={track.id} className="flex items-center gap-4">
                            <input 
                                type="radio" 
                                name="baseTrack" 
                                checked={(tracks.some(t => t.id === baseTrackId) ? baseTrackId : tracks[0].id) === track.id}
                                onChange={() => setBaseTrackId(track.id)}
                                className="w-5 h-5 accent-emerald-500 cursor-pointer shrink-0"
                                title="Use this rhythm as count-in and metronome"
                            />
                            <div className="flex-1 bg-neutral-900 rounded-lg p-2 flex items-center justify-between border border-neutral-700 focus-within:border-emerald-400 transition-colors">
                                <input 
                                    type="number" 
                                    min="1" max="16"
                                    value={track.pulses}
                                    onChange={(e) => updateTrack(track.id, 'pulses', Number(e.target.value))}
                                    className="bg-transparent w-16 text-center text-xl font-bold focus:outline-none"
                                />
                                <span className="text-neutral-500">Beats</span>
                            </div>
                            <span className="text-xl font-bold text-neutral-600">on</span>
            
                            <div 
                                className="flex-1 bg-neutral-900/80 hover:bg-neutral-800 rounded-lg p-2 flex items-center justify-center border border-neutral-700 focus-within:border-emerald-400 transition-colors cursor-pointer outline-none relative group"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    e.preventDefault();
                                    updateTrack(track.id, 'key', e.key.toLowerCase());
                                }}
                            >
                                <span className="text-xl font-bold text-emerald-400/80 uppercase tracking-widest">{displayKey}</span>
                                {/* Tooltip hint that shows on hover */}
                                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-neutral-900 border border-neutral-700 text-neutral-400 text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                Click & Press Key
                                </div>
                            </div>

                            {tracks.length > 1 && (
                                <button onClick={() => removeTrack(track.id)} className="text-red-400 hover:text-red-300 p-2 font-bold w-6 shrink-0">✕</button>
                            )}
                        </div>
                    )})}
            </div>

            <div className="flex justify-between mt-8">
                {tracks.length < 5 ? (
                    <button 
                        onClick={addTrack}
                        className="px-6 py-3 rounded-lg border border-neutral-600 hover:bg-neutral-700 transition-colors font-medium"
                    >
            + Rhythm
                    </button>
                ) : (
                    <div className="px-6 py-3 text-neutral-500 text-sm">Max. 5 rhythms</div>
                )}
                <button 
                    onClick={startGame}
                    className="px-8 py-3 flex items-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-neutral-900 font-bold transition-all transform hover:scale-105"
                >
          START <span className="text-xs bg-neutral-900/20 px-2 py-1 rounded text-neutral-800 tracking-widest ml-1">SPACE</span>
                </button>
            </div>
        </div>
    );
}