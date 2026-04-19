'use client'

import { useId, type ChangeEvent } from 'react';
import { SlArrowLeft, SlArrowRight } from 'react-icons/sl';

type NumberStepperProps = {
    label?: string;
    value: number;
    onChange: (value: number) => void;
    min: number;
    max: number;
    step?: number;
    compact?: boolean;
    className?: string;
};

export default function NumberStepper({
    label,
    value,
    onChange,
    min,
    max,
    step = 1,
    compact = false,
    className = ''
}: NumberStepperProps) {
    const inputId = useId();

    const clampValue = (rawValue: number | string) => {
        const numericValue = Number(rawValue);
        if (!Number.isFinite(numericValue)) {
            return min;
        }
        return Math.min(max, Math.max(min, numericValue));
    };

    const handleStep = (direction: number) => {
        const nextValue = Number(value) + (direction * step);
        onChange(clampValue(nextValue));
    };

    return (
        <div className={`flex flex-col gap-1 relative group ${className}`}>
            {label && (
                <label
                    htmlFor={inputId}
                    className="flex items-end text-[0.625rem] text-neutral-400 uppercase tracking-widest leading-4 text-left"
                >
                    {label}
                </label>
            )}
            <div className="relative flex items-center gap-1">
                <button
                    type="button"
                    onClick={() => handleStep(-1)}
                    aria-label={label ? `${label} decrease` : 'Decrease value'}
                    className="h-9 w-9 rounded-md border border-neutral-700 bg-neutral-800/70 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700/70 transition-colors flex items-center justify-center flex-shrink-0"
                >
                    <SlArrowLeft size={16} />
                </button>

                <input
                    id={inputId}
                    type="number"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    aria-label={label ?? 'Number value'}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                        const rawValue = e.target.value;
                        if (rawValue === '') return;
                        onChange(clampValue(rawValue));
                    }}
                    onBlur={() => onChange(clampValue(value))}
                    className={`w-16 bg-neutral-900 rounded-lg border border-neutral-700 focus:border-stone-400 focus:outline-none transition-colors font-bold text-center appearance-none ${compact ? 'h-9 px-2 text-base' : 'h-10 px-3 text-lg'}`}
                />

                <button
                    type="button"
                    onClick={() => handleStep(1)}
                    aria-label={label ? `${label} increase` : 'Increase value'}
                    className="h-9 w-9 rounded-md border border-neutral-700 bg-neutral-800/70 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700/70 transition-colors flex items-center justify-center flex-shrink-0"
                >
                    <SlArrowRight size={16} />
                </button>
            </div>
        </div>
    );
}