/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ne transpiler que les packages sans dépendances natives lourdes
  transpilePackages: ['@cdv/types', '@cdv/config', '@cdv/ui'],
};

export default nextConfig;
