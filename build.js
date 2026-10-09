import StyleDictionary from 'style-dictionary';
import fs from 'fs';

// 1. Load the raw variable payload exported by the Figma plugin
const rawTokens = JSON.parse(fs.readFileSync('tokens.json', 'utf8'));

// 2. Extract and flatten top-level set wraps so references resolve instantly
function flattenTokenSets(obj) {
  let combined = {};
  
  const sets = ['global', 'semantic'];
  for (const set of sets) {
    if (obj[set]) {
      combined = { ...combined, ...obj[set] };
    }
  }
  
  if (Object.keys(combined).length === 0) {
    for (const key in obj) {
      if (typeof obj[key] === 'object' && !obj[key].value && !obj[key].\$value) {
        combined = { ...combined, ...obj[key] };
      }
    }
  }
  
  let jsonString = JSON.stringify(combined);
  jsonString = jsonString.replace(/\{global\./g, '{');
  jsonString = jsonString.replace(/\{semantic\./g, '{');
  
  return JSON.parse(jsonString);
}

const sanitizedTokens = flattenTokenSets(rawTokens);
fs.writeFileSync('tokens-sanitized.json', JSON.stringify(sanitizedTokens, null, 2));

// 3. Register Custom Formats to safely read and extract token values into files
StyleDictionary.registerFormat({
  name: 'custom/tailwind-js',
  format: async function({ dictionary }) {
    const tokens = {};
    // Recursively pull all flattened token entries out of the processed dictionary
    dictionary.allTokens.forEach(token => {
      tokens[token.path.join('-')] = token.value || token.\$value;
    });
    return `/**\n * Do not edit directly, this file was auto-generated.\n */\n\nmodule.exports = ${JSON.stringify(tokens, null, 2)};\n`;
  }
});

StyleDictionary.registerFormat({
  name: 'custom/android-kotlin',
  format: async function({ dictionary }) {
    let output = `package com.soliteck.designsystem\n\nimport androidx.compose.ui.graphics.Color\nimport androidx.compose.ui.unit.dp\n\n/**\n * Do not edit directly, this file was auto-generated.\n */\n\nobject DesignTokens {\n`;
    
    dictionary.allTokens.forEach(token => {
      const cleanName = token.path.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
      let val = token.value || token.\$value;
      
      if (typeof val === 'string' && val.startsWith('#')) {
        // Automatically translate standard hex parameters to hex formats for Android colors
        let hex = val.replace('#', '');
        if (hex.length === 6) hex = 'FF' + hex;
        output += `    val ${cleanName} = Color(0x${hex.toUpperCase()})\n`;
      } else if (typeof val === 'number') {
        output += `    val ${cleanName} = ${val}.dp\n`;
      } else {
        output += `    val ${cleanName} = "${val}"\n`;
      }
    });
    
    output += `}\n`;
    return output;
  }
});

// 4. Initialize the Style Dictionary instance architecture pointing to our custom formats
const sd = new StyleDictionary({
  source: ['tokens-sanitized.json'],
  platforms: {
    'web/tailwind': {
      transformGroup: 'js',
      buildPath: 'build/web/',
      files: [
        {
          destination: 'tailwind-tokens.js',
          format: 'custom/tailwind-js'
        }
      ]
    },
    'android/compose': {
      transformGroup: 'js',
      buildPath: 'build/android/',
      files: [
        {
          destination: 'DesignTokens.kt',
          format: 'custom/android-kotlin'
        }
      ]
    }
  }
});

// 5. Fire the cross-platform compilation matrices
await sd.buildAllPlatforms();
