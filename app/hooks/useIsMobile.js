import { useState, useEffect } from 'react';

export const useIsMobile = () => {
    const [isTouchDevice, setIsTouchDevice] = useState(false);

    useEffect(() => {
        // Funktion zur reinen Touch-Erkennung
        const checkTouch = () => {
            return (
                'ontouchstart' in window ||
                navigator.maxTouchPoints > 0 ||
                // Die zuverlässigste Methode für moderne Browser:
                window.matchMedia('(pointer: coarse)').matches
            );
        };

        // Initialer Check
        setIsTouchDevice(checkTouch());

        // Optional: Listener für Änderungen (falls man z.B. im DevTools-Modus umschaltet)
        const mql = window.matchMedia('(pointer: coarse)');
        
        const handleChange = () => {
            setIsTouchDevice(checkTouch());
        };

        mql.addEventListener('change', handleChange);
        
        return () => mql.removeEventListener('change', handleChange);
    }, []);

    return isTouchDevice;
};