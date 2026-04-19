import type { Metadata } from 'next';
import HoldTheTime from './HoldTheTime';

export const metadata: Metadata = {
    title: 'Hold The Time',
    description: 'Keep the beat alive while the drum loop drops out and returns.',
};

export default function HoldTheTimePage() {
    return <HoldTheTime />;
}