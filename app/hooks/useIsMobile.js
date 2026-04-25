import { useState, useEffect } from 'react';

export const useIsMobile = () => {
    const [isTouchDevice, setIsTouchDevice] = useState(false);

    useEffect(() => {
        const checkTouch = () => {
            return (
                'ontouchstart' in window ||
                navigator.maxTouchPoints > 0 ||
                window.matchMedia('(pointer: coarse)').matches
            );
        };

        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsTouchDevice(checkTouch());

        const mql = window.matchMedia('(pointer: coarse)');
        
        const handleChange = () => {
            setIsTouchDevice(checkTouch());
        };

        mql.addEventListener('change', handleChange);
        
        return () => mql.removeEventListener('change', handleChange);
    }, []);

    return isTouchDevice;
};