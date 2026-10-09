import StyleDictionary from 'style-dictionary';
import fs from 'fs';

// 1. Load the raw variable payload exported by the Figma plugin
const rawTokens = JSON.parse(fs.readFileSync('tokens.json', 'utf8'));

// 2. Flatten top-level set wraps cleanly
function sanitizeAndFlatten(obj) {
  let combined = {};
  
  if (obj.global) combined = { ...combined, ...obj.global };
  if (obj.semantic) combined = { ...combined, ...obj.semantic };
  
  if (Object.keys(combined).length === 0) {
    combined = { ...obj };
  }

  let jsonString = JSON.stringify(combined);
  jsonString = jsonString.replaceAll('{global.', '{');
  jsonString = jsonString.replaceAll('{semantic.', '{');
  
  return JSON.parse(jsonString);
}

const sanitizedTokens = sanitizeAndFlatten(rawTokens);
fs.writeFileSync('tokens-sanitized.json', JSON.stringify(sanitizedTokens, null, 2));

// Helper function to extract a value from a token no matter where it is hidden
function extractValue(token) {
  if (!token) return '';
  if (token.value !== undefined) return token.value;
  if (token.value !== undefined) return token.value;
  if (token.original && token.original.value !== undefined) return token.original.value;
  if (token.original && token.original.value !== undefined) return token.original.value;
  return '';
}

// 3. Register Custom Formats to safely extract values
StyleDictionary.registerFormat({
  name: 'custom/tailwind-js',
  format: async function({ dictionary }) {
    const tokens = {};
    dictionary.allTokens.forEach(token => {
      const val = extractValue(token);
      if (val !== '') {
        // Clean up the object key name for Tailwind matching
        const cleanKey = token.path.join('-').replace(/[^a-zA-Z0-9-]/g, '');
        tokens[cleanKey] = val;
      }
    });
    return `/**\n * Do not edit directly, this file was auto-generated.\n */\n\nmodule.exports = ${JSON.stringify(tokens, null, 2)};\n`;
  }
});

StyleDictionary.registerFormat({
  name: 'custom/android-kotlin',
  format: async function({ dictionary }) {
    let output = `package com.soliteck.designsystem\n\nimport androidx.compose.ui.graphics.Color\nimport androidx.compose.ui.unit.dp\n\n/**\n * Do not edit directly, this file was auto-generated.\n */\n\nobject DesignTokens {\n`;
    
    dictionary.allTokens.forEach(token => {
      const val = extractValue(token);
      if (val !== '') {
        // Clean up name: remove slashes, hyphens, and illegal characters for Kotlin variables
        const cleanName = token.path.map(p => {
          return p.replace(/[^a-zA-Z0-9]/g, '').charAt(0).toUpperCase() + p.replace(/[^a-zA-Z0-9]/g, '').slice(1);
        }).join('');
        
        // Ensure variable name doesn't start with a number or weird underscore
        let finalVarName = cleanName.replace(/^[^a-zA-Z]+/, '');
        if (!finalVarName) finalVarName = "Token" + Math.floor(Math.random() * 100);

        if (typeof val === 'string' && val.startsWith('#')) {
          let hex = val.replace('#', '');
          if (hex.length === 6) hex = 'FF' + hex;
          output += `    val ${finalVarName} = Color(0x${hex.toUpperCase()})\n`;
        } else if (!isNaN(val) && val !== '') {
          output += `    val ${finalVarName} = ${val}.dp\n`;
        } else {
          output += `    val ${finalVarName} = "${val}"\n`;
        }
      }
    });
    
    output += `}\n`;
    return output;
  }
});

// 4. Initialize Style Dictionary and explicitly force reference evaluation bypass
const sd = new StyleDictionary({
  source: ['tokens-sanitized.json'],
  log: {
    warnings: 'disabled',
    verbosity: 'silent',
    errors: {
      brokenReferences: 'console'
    }
  },
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
