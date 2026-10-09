import StyleDictionary from 'style-dictionary';
import fs from 'fs';

// 1. Load the raw variable payload exported by the Figma plugin
const rawTokens = JSON.parse(fs.readFileSync('tokens.json', 'utf8'));

// 2. Flatten top-level set wraps cleanly without string syntax traps
function sanitizeAndFlatten(obj) {
  let combined = {};
  
  // Directly pull and combine the properties from the global and semantic sets
  if (obj.global) combined = { ...combined, ...obj.global };
  if (obj.semantic) combined = { ...combined, ...obj.semantic };
  
  if (Object.keys(combined).length === 0) {
    combined = { ...obj };
  }

  // Sanitize internal string references (e.g., "{global.color}" to "{color}")
  let jsonString = JSON.stringify(combined);
  jsonString = jsonString.replaceAll('{global.', '{');
  jsonString = jsonString.replaceAll('{semantic.', '{');
  
  return JSON.parse(jsonString);
}

const sanitizedTokens = sanitizeAndFlatten(rawTokens);
fs.writeFileSync('tokens-sanitized.json', JSON.stringify(sanitizedTokens, null, 2));

// 3. Register Custom Formats to safely extract values using dictionary tokens mapping
StyleDictionary.registerFormat({
  name: 'custom/tailwind-js',
  format: async function({ dictionary }) {
    const tokens = {};
    dictionary.allTokens.forEach(token => {
      // Safely fetch token value by looking at standard value paths
      tokens[token.path.join('-')] = token.value;
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
      let val = token.value;
      
      if (typeof val === 'string' && val.startsWith('#')) {
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

// 4. Initialize Style Dictionary pointing directly to our custom format processors
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

// 5. Run the cross-platform compilation matrices
await sd.buildAllPlatforms();
