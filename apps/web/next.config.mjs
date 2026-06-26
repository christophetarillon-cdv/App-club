import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
// Root node_modules: contains react@18 + react-dom@18 (the authoritative copies).
// apps/web also has its own react@18 → two instances → hooks break at prerender.
// Prepending root to resolve.modules forces webpack to find react (and all its
// subpaths: react/jsx-runtime, react/jsx-dev-runtime, etc.) from root first,
// so the whole bundle shares one single react instance.
const rootNodeModules = path.resolve(here, '../../node_modules');

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@cdv/types', '@cdv/config', '@cdv/ui', '@cdv/core', '@cdv/firebase'],
  webpack: (config) => {
    config.resolve.alias['@'] = path.join(process.cwd(), 'src');
    config.resolve.modules = [rootNodeModules, ...(config.resolve.modules ?? ['node_modules'])];
    return config;
  },
};

export default nextConfig;
