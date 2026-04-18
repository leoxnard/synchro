/** @type {import('next').NextConfig} */
const nextConfig = {
    // Für Next.js 15/16 muss dieser Key oft direkt in die Top-Level Config
    allowedDevOrigins: ['little-hornets-tap.loca.lt', 'localhost:3000'],

    // Falls das nicht reicht, versuche es zusätzlich hier:
    experimental: {
        serverActions: {
            allowedOrigins: ['*.loca.lt', 'localhost:3000'],
        },
    },
};

export default nextConfig;