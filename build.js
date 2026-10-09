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

// Create a flat dictionary map to resolve aliases manually
const flatValueMap = {};
function buildValueMap(obj, currentPath = []) {
  for (const key in obj) {
    if (obj[key] && typeof obj[key] === 'object') {
      // Modern loops: grab values safely by scanning the object properties keys directly
      const keys = Object.keys(obj[key]);
      const valueKey = keys.find(k => k === 'value' || k.endsWith('value'));
      
      if (valueKey && obj[key][valueKey] !== undefined) {
        const val = obj[key][valueKey];
        const lookupKey = [...currentPath, key].join('.');
        flatValueMap[lookupKey] = val;
      } else {
        buildValueMap(obj[key], [...currentPath, key]);
      }
    }
  }
}
buildValueMap(sanitizedTokens);

// Function to resolve references recursively (e.g., "{Neutral.Neutral-50}" -> real hex)
function resolveTokenValue(val) {
  if (typeof val !== 'string') return val;
  
  // Match patterns like {Neutral.Neutral-50}
  const refRegex = /^\{([^}]+)\}\$/;
  const match = val.match(refRegex);
  
  if (match) {
    const targetKey = match[1];
    if (flatValueMap[targetKey] !== undefined) {
      return resolveTokenValue(flatValueMap[targetKey]);
    }
  }
  
  return val.replace(/\{([^}]+)\}/g, (substring, targetKey) => {
    if (flatValueMap[targetKey] !== undefined) {
      return resolveTokenValue(flatValueMap[targetKey]);
    }
    return substring;
  });
}

// Write the sanitized raw file for Style Dictionary tracking
fs.writeFileSync('tokens-sanitized.json', JSON.stringify(sanitizedTokens, null, 2));

// 3. Register Custom Formats using our custom resolution engine
StyleDictionary.registerFormat({
  name: 'custom/tailwind-js',
  format: async function({ dictionary }) {
    const tokens = {};
    const targetTokens = dictionary.allTokens || [];
    
    targetTokens.forEach(token => {
      let rawVal = token.value;
      if (token.original && !rawVal) {
        const keys = Object.keys(token.original);
        const valueKey = keys.find(k => k === 'value' || k.endsWith('value'));
        if (valueKey) rawVal = token.original[valueKey];
      }
      
      const resolvedVal = resolveTokenValue(rawVal);

      if (resolvedVal !== undefined && resolvedVal !== '') {
        const cleanKey = token.path.join('-').replace(/[^a-zA-Z0-9-]/g, '');
        tokens[cleanKey] = resolvedVal;
      }
    });
    
    return `/**\n * Do not edit directly, this file was auto-generated.\n */\n\nmodule.exports = ${JSON.stringify(tokens, null, 2)};\n`;
  }
});

StyleDictionary.registerFormat({
  name: 'custom/android-kotlin',
  format: async function({ dictionary }) {
    let output = `package com.soliteck.designsystem\n\nimport androidx.compose.ui.graphics.Color\nimport androidx.compose.ui.unit.dp\n\n/**\n * Do not edit directly, this file was auto-generated.\n */\n\nobject DesignTokens {\n`;
    
    const targetTokens = dictionary.allTokens || [];
    
    targetTokens.forEach(token => {
      let rawVal = token.value;
      if (token.original && !rawVal) {
        const keys = Object.keys(token.original);
        const valueKey = keys.find(k => k === 'value' || k.endsWith('value'));
        if (valueKey) rawVal = token.original[valueKey];
      }
      
      let val = resolveTokenValue(rawVal);

      if (val !== undefined && val !== '') {
        const cleanName = token.path.map(p => {
          return p.replace(/[^a-zA-Z0-9]/g, '').charAt(0).toUpperCase() + p.replace(/[^a-zA-Z0-9]/g, '').slice(1);
        }).join('');
        
        let finalVarName = cleanName.replace(/^[^a-zA-Z]+/, '');
        if (!finalVarName) finalVarName = "Token" + Math.floor(Math.random() * 100);

        if (typeof val === 'string' && val.includes('rgba')) {
          val = '#00000000'; // Safe fallback for transparent layers
        }

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

// 4. Initialize Style Dictionary instance
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

try {
  await sd.buildAllPlatforms();
  console.log('🏁 ✓ Omni-channel token system compilation successful!');
} catch (error) {
  console.error('❌ Build failed during platform token generation:', error.message);
  process.exit(1);
}
