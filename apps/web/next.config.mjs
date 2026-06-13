import path from 'path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@cdv/types', '@cdv/config', '@cdv/ui', '@cdv/core', '@cdv/firebase'],
  webpack: (config) => {
    config.resolve.alias['@'] = path.join(process.cwd(), 'src');
    return config;
  },
};

export default nextConfig;
