const fs = require('fs');
const path = require('path');
const { Snack } = require('snack-sdk');

async function main() {
  const root = path.join(__dirname, '..', 'snack', 'sord-quicknote');
  const app = fs.readFileSync(path.join(root, 'App.js'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const dependencies = {
    '@react-native-async-storage/async-storage': pkg.dependencies['@react-native-async-storage/async-storage'],
    '@react-navigation/bottom-tabs': pkg.dependencies['@react-navigation/bottom-tabs'],
    '@react-navigation/native': pkg.dependencies['@react-navigation/native'],
    'expo': pkg.dependencies['expo'],
    'expo-camera': pkg.dependencies['expo-camera'],
    'expo-location': pkg.dependencies['expo-location'],
    'react-native-ble-plx': pkg.dependencies['react-native-ble-plx'],
    'react-native-maps': pkg.dependencies['react-native-maps'],
    'react-native-safe-area-context': pkg.dependencies['react-native-safe-area-context'],
    'react-native-screens': pkg.dependencies['react-native-screens'],
  };

  const snack = new Snack({
    name: 'SORD QuickNote',
    description: 'Field note hub with maps, reports, BLE scan, and camera capture.',
    sdkVersion: '49.0.0',
    dependencies,
    files: {
      'App.js': { type: 'CODE', contents: app },
    },
  });

  const saved = await snack.saveAsync();
  console.log('Snack URL:', saved.url);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
