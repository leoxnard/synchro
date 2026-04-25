'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface GameContainerProps {
    children: React.ReactNode;
    desktopWidth?: string;
    desktopHeight?: string;
    mobileHeight?: string;
}

export default function GameContainer({ 
    children, 
    desktopWidth = '30rem', 
    desktopHeight = '32rem',
    mobileHeight = '100%' 
}: GameContainerProps) {
    
    const mobileClasses = 
        mobileHeight === '100%' ? 'flex-1 h-full' : 
        mobileHeight === 'auto' ? 'h-auto' : 
        'h-[var(--mobile-h)]';

    return (
        <motion.div
            layout
            transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
            style={{
                "--desktop-w": desktopWidth,
                "--desktop-h": desktopHeight,
                "--mobile-h": mobileHeight !== '100%' && mobileHeight !== 'auto' ? mobileHeight : undefined,
            } as React.CSSProperties}
            className={`
                tempo-window relative isolate mx-auto flex flex-col 
                border border-white/10 dark:bg-neutral-900/80 bg-black/90 
                shadow-[0_20px_60px_rgba(0,0,0,0.4)] backdrop-blur 
                rounded-[1.7rem]
                overflow-hidden
                
                /* FIX 1: Verhindert, dass das Fenster im Handy-Querformat über Navbar/Footer wächst */
                max-h-full max-w-full shrink
                
                /* MOBILE FIRST */
                w-full ${mobileClasses}
                
                /* FIX 2: md:flex-none stoppt das "flex-1" vom Polyrhythmus, damit es am Desktop wieder zentriert ist! */
                md:w-[var(--desktop-w)] md:h-[var(--desktop-h)] md:flex-none
            `}
        >
            <div className="pointer-events-none absolute inset-0 z-0">
                <div className="tempo-orb tempo-orb-a" />
                <div className="tempo-orb tempo-orb-b" />
                <div className="tempo-orb tempo-orb-c" />
                <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.04),transparent_24%,transparent_76%,rgba(255,255,255,0.03))]" />
            </div>

            <div className="relative z-10 flex flex-1 flex-col w-full h-full min-h-0 overflow-y-auto">
                {children}
            </div>
        </motion.div>
    );
}