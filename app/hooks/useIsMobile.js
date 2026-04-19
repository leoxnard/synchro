import { useState, useEffect } from 'react';

export const useIsMobile = (breakpoint = 768) => {
    // Initialer State ist null oder ein Standardwert, um Hydration-Fehler zu vermeiden
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        // 1. Media Query für die Breite (Layout-Check)
        const mql = window.matchMedia(`(max-width: ${breakpoint}px)`);
        
        // 2. Check für Touch-Eingabe (Hardware-Check)
        const isTouch = () => {
            return (
                'ontouchstart' in window ||
                navigator.maxTouchPoints > 0 ||
                window.matchMedia('(pointer: coarse)').matches
            );
        };

        const updateDevice = () => {
            // Logik: Ein Gerät ist "mobil", wenn der Bildschirm schmal ist 
            // ODER es ein kleineres Tablet mit Touch-Fokus ist.
            setIsMobile(mql.matches || (isTouch() && window.innerWidth <= 1024));
        };

        // Initialer Check
        updateDevice();

        // Listener für Änderungen (Resize/Rotation)
        mql.addEventListener('change', updateDevice);
        
        return () => mql.removeEventListener('change', updateDevice);
    }, [breakpoint]);

    return isMobile;
};