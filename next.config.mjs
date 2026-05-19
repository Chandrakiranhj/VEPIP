import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  serverExternalPackages: ["@napi-rs/canvas", "tesseract.js"],
  turbopack: {
    root: __dirname,
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  // pdf-parse uses test fixtures that confuse bundlers; keep it as a native require
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "unpdf"],
};

export default nextConfig;
