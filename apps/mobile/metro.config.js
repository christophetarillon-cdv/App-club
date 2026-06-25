const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

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

// Stub qrcode (not installed) — react-native-qrcode-svg peer dep
// To replace: pnpm add qrcode --filter @cdv/mobile  then remove this alias
config.resolver.extraNodeModules = {
  qrcode: path.resolve(projectRoot, 'src/lib/qrcode-stub.js'),
};

// 1 worker = pic mémoire plus bas (machine sous pression RAM, évite l'OOM/SIGKILL)
config.maxWorkers = 1;

module.exports = config;
