module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'nativewind/babel', // Adicione esta linha se usar Tailwind/NativeWind
      'react-native-reanimated/plugin', // Mantenha este como o ÚLTIMO
    ],
  };
};