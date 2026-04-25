import { useRef } from 'react';

export function useAudioEngine() {
    const audioCtxRef = useRef(null);
    const activeAudioNodesRef = useRef([]);

    const initAudioContext = async () => {
        if (!audioCtxRef.current) {
            audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
            const unmute = (await import('iosunmute')).default;
            unmute(audioCtxRef.current);
        }
        if (audioCtxRef.current.state !== 'running') {
            await audioCtxRef.current.resume().catch(() => {});
        }
        return audioCtxRef.current;
    };

    const closeAudioContext = () => {
        if (audioCtxRef.current) {
            audioCtxRef.current.close().catch(console.error);
            audioCtxRef.current = null;
        }
    };

    const getAudioContextOffset = () => {
        if (!audioCtxRef.current) return 0;
        return performance.now() - (audioCtxRef.current.currentTime * 1000);
    };

    const playMetronomeClick = (time, freq = 800) => {
        if (!audioCtxRef.current) return;
        const osc = audioCtxRef.current.createOscillator();
        const gain = audioCtxRef.current.createGain();
        osc.connect(gain);
        gain.connect(audioCtxRef.current.destination);
        osc.frequency.value = freq; 
        gain.gain.setValueAtTime(0.5, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
        osc.start(time);
        osc.stop(time + 0.1);
        activeAudioNodesRef.current.push({ osc, gain });
    };

    const scheduleDedupedClickEvents = (events) => {
        if (!Array.isArray(events) || events.length === 0) return;

        const CLICK_DEDUP_EPSILON_MS = 12;
        const sorted = [...events].sort((a, b) => a.time - b.time);
        const deduped = [];

        sorted.forEach((event) => {
            const last = deduped[deduped.length - 1];
            if (!last) {
                deduped.push(event);
                return;
            }

            const isSameTime = Math.abs((event.time - last.time) * 1000) <= CLICK_DEDUP_EPSILON_MS;
            if (!isSameTime) {
                deduped.push(event);
                return;
            }

            if ((event.rank ?? Number.MAX_SAFE_INTEGER) < (last.rank ?? Number.MAX_SAFE_INTEGER)) {
                deduped[deduped.length - 1] = event;
            }
        });

        deduped.forEach((event) => playMetronomeClick(event.time, event.freq));
    };

    const stopAllAudioNodes = () => {
        activeAudioNodesRef.current.forEach(({ osc, gain }) => {
            try { osc.stop(); } catch {}
            try { osc.disconnect(); } catch {}
            try { gain.disconnect(); } catch {}
        });
        activeAudioNodesRef.current = [];
    };

    return {
        audioCtxRef,
        initAudioContext,
        closeAudioContext,
        getAudioContextOffset,
        scheduleDedupedClickEvents,
        stopAllAudioNodes
    };
}