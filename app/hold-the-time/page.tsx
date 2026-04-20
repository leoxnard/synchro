import type { Metadata } from 'next';
import HoldTheTime from './HoldTheTime';

export const metadata: Metadata = {
    title: 'Hold The Tempo',
    description: 'Keep the beat alive while the drum loop drops out and returns.',
    keywords: ['hold the tempo', 'drum game', 'rhythm game', 'music game', 'timing challenge', 'timing game'],
};

export default function HoldTheTimePage() {
    return <HoldTheTime />;
}