const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch all workspace packages (for @cdv/types etc.)
config.watchFolders = [workspaceRoot];

// Resolve modules from project then workspace root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Root node_modules has react@18 (for Vercel/Next.js), but react-native's Fabric
// renderer needs React 19 internals (ReactSharedInternals.S). resolveRequest runs
// before any node_modules traversal, so it wins over the root react@18.
const mobileModules = path.resolve(projectRoot, 'node_modules');

function resolveToMobile(moduleName) {
  const base = path.join(mobileModules, moduleName);
  // Try as .js file
  if (fs.existsSync(base + '.js')) return base + '.js';
  // Try as directory (package)
  if (fs.existsSync(path.join(base, 'package.json'))) {
    const pkg = JSON.parse(fs.readFileSync(path.join(base, 'package.json'), 'utf8'));
    return path.join(base, pkg.main || 'index.js');
  }
  if (fs.existsSync(path.join(base, 'index.js'))) return path.join(base, 'index.js');
  return null;
}

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react' || moduleName.startsWith('react/') ||
      moduleName === 'react-dom' || moduleName.startsWith('react-dom/')) {
    const filePath = resolveToMobile(moduleName);
    if (filePath) return { type: 'sourceFile', filePath };
  }
  return context.resolveRequest(context, moduleName, platform);
};

// Stub qrcode (not installed) — react-native-qrcode-svg peer dep
config.resolver.extraNodeModules = {
  qrcode: path.resolve(projectRoot, 'src/lib/qrcode-stub.js'),
};

// 1 worker = pic mémoire plus bas (machine sous pression RAM, évite l'OOM/SIGKILL)
config.maxWorkers = 1;

module.exports = config;
