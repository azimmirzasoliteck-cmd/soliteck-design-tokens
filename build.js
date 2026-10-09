import StyleDictionary from 'style-dictionary';
import fs from 'fs';

// 1. Read the raw tokens exported by Figma
const rawData = JSON.parse(fs.readFileSync('tokens.json', 'utf8'));

// 2. Merge global and semantic sets so references can find each other instantly
const mergedTokens = {
  ...rawData.global,
  ...rawData.semantic
};

// 3. Save the temporary cleaned tokens file
fs.writeFileSync('tokens-compiled.json', JSON.stringify(mergedTokens, null, 2));

// 4. Initialize Style Dictionary with the flat tokens data layer
const sd = new StyleDictionary({
  source: ['tokens-compiled.json'],
  platforms: {
    'web/tailwind': {
      transformGroup: 'js',
      buildPath: 'build/web/',
      files: [
        {
          destination: 'tailwind-tokens.js',
          format: 'javascript/module-flat'
        }
      ]
    },
    'android/compose': {
      transformGroup: 'js',
      buildPath: 'build/android/',
      files: [
        {
          destination: 'DesignTokens.kt',
          format: 'javascript/module-flat'
        }
      ]
    }
  }
});

// 5. Execute the cross-platform compilation matrix
await sd.buildAllPlatforms();
