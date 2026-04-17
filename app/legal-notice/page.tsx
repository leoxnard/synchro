import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Legal Notice",
    description: "Legal notice with provider and contact information.",
    alternates: {
        canonical: "/legal-notice",
    },
};

export default function LegalNoticePage() {
    return (
        <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-10 text-neutral-200 leading-relaxed">
            <div className="mt-4 flex w-full flex-col gap-6 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-8">
                <h1 className="mb-2 text-3xl font-semibold tracking-tight text-neutral-100">Legal Notice</h1>

                <div>
                    <h2 className="text-lg font-medium text-neutral-100">Information pursuant to Section 5 TMG</h2>
                    <p className="mt-2 text-neutral-300">Leonard Sima</p>
                    <p className="text-neutral-300">Floriansmühlstrasse 1</p>
                    <p className="text-neutral-300">80939 Munich</p>
                    <p className="text-neutral-300">Germany</p>
                </div>

                <div>
                    <h2 className="mt-2 text-lg font-medium text-neutral-100">Contact</h2>
                    <p className="text-neutral-300">Email: synchro@leonardsima.de</p>
                </div>

                <div>
                    <h2 className="mt-2 text-lg font-medium text-neutral-100">Responsible for Content</h2>
                    <p className="mt-2 text-neutral-300">Leonard Sima</p>
                    <p className="text-neutral-300">Floriansmühlstrasse 1</p>
                    <p className="text-neutral-300">80939 Munich</p>
                    <p className="text-neutral-300">Germany</p>
                </div>

                <div className="my-2 h-px w-full bg-neutral-800" />

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
