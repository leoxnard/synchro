import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

export const metadata: Metadata = {
    title: "Privacy Policy",
    description: "Privacy policy for the Synchro website and rhythm games.",
    alternates: {
        canonical: "/privacy",
    },
};

export default function PrivacyPolicyPage() {
    return (
        <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 py-10 text-neutral-200 leading-relaxed">
            <div className="mt-4 flex w-full flex-col gap-6 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-8 md:p-10">
                <h1 className="mb-4 text-4xl font-semibold tracking-tight text-neutral-100">Privacy Policy</h1>

                <section>
                    <h2 className="mb-2 text-2xl font-medium text-neutral-100">1. Data Controller</h2>
                    <p>
                        Responsible for data processing on this website:
                        <Image src="/images/address-info.png" alt="Address Details" width={250} height={60} className="pointer-events-none select-none" />
                        <br />
                        Email: synchro@leonardsima.de
                    </p>
                </section>

                <section>
                    <h2 className="mb-2 text-2xl font-medium text-neutral-100">2. Data We Process</h2>
                    <p className="mb-2">
                        Synchro is primarily a client-side application. We process only data that is
                        required for technical operation and game functionality.
                    </p>
                    <ul className="list-disc space-y-2 pl-6">
                        <li>
                            <strong>Highscores in Local Storage:</strong> Synchro stores game-specific
                            highscores in your browser&apos;s Local Storage so your best results remain
                            available on your device.
                        </li>
                        <li>
                            <strong>Technical Server Logs:</strong> Our hosting provider may process
                            technical request data (for example IP address, browser and access time)
                            to ensure security and reliability.
                        </li>
                    </ul>
                </section>

                <section>
                    <h2 className="mb-2 text-2xl font-medium text-neutral-100">3. Cookies and Browser Storage</h2>
                    <p>
                        We do not use advertising or tracking cookies. Synchro uses functional browser
                        storage (Local Storage) exclusively to save highscores on your device.
                        You can delete this data at any time in your browser settings.
                    </p>
                </section>

                <section>
                    <h2 className="mb-2 text-2xl font-medium text-neutral-100">4. Analytics</h2>
                    <p>
                        We use Vercel Analytics to understand overall website performance and usage.
                        According to the provider, this is designed to work without invasive tracking.
                        Data may still be processed on Vercel infrastructure for aggregated insights
                        and service quality.
                    </p>
                </section>

                <section>
                    <h2 className="mb-2 text-2xl font-medium text-neutral-100">5. Your Rights</h2>
                    <p>
                        Under GDPR, you have the right to request information about your personal data,
                        correction, deletion, restriction of processing, and data portability,
                        where applicable. You may also object to certain processing and lodge a complaint
                        with a supervisory authority.
                    </p>
                </section>

                <section>
                    <h2 className="mb-2 text-2xl font-medium text-neutral-100">6. Contact</h2>
                    <p>
                        If you have privacy-related questions, contact:
                        <br />
                        synchro@leonardsima.de
                    </p>
                </section>

                <div className="my-6 h-px w-full bg-neutral-800" />

                <Link
                    href="/"
                    className="text-center text-sm font-medium uppercase tracking-widest text-neutral-400 transition-colors hover:text-neutral-200"
                >
                    Back to Home
                </Link>
            </div>
        </main>
    );
}
