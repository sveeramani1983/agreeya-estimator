import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep pdfjs-dist, mammoth, and Gemini as native Node modules
  // so they are not bundled by Turbopack (avoids canvas/worker issues)
  serverExternalPackages: [
    "pdfjs-dist",
    "mammoth",
    "@google/generative-ai",
  ],
  // Empty turbopack config satisfies Next.js 16's check
  turbopack: {},
};

export default nextConfig;
