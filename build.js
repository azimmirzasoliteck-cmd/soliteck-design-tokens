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

// Recursive lookup function to trace down the raw value parameter no matter the nesting depth
function discoverValue(tokenObj) {
  if (!tokenObj) return '';
  if (tokenObj.value !== undefined) return tokenObj.value;
  if (tokenObj.value !== undefined) return tokenObj.value;
  if (typeof tokenObj === 'object') {
    if (tokenObj.value !== undefined) return tokenObj.value;
    if (tokenObj.value !== undefined) return tokenObj.value;
    // Fall back to original definition structures
    if (tokenObj.original) {
      if (tokenObj.original.value !== undefined) return tokenObj.original.value;
      if (tokenObj.original.value !== undefined) return tokenObj.original.value;
    }
    // Deep structural scan if the value is nested under a primary key
    for (const subKey in tokenObj) {
      if (subKey === 'value' || subKey === '\$value') return tokenObj[subKey];
    }
  }
  return '';
}

// 3. Register Custom Formats using robust modern token maps
StyleDictionary.registerFormat({
  name: 'custom/tailwind-js',
  format: async function({ dictionary }) {
    const tokens = {};
    const targetTokens = dictionary.allTokens || [];
    
    targetTokens.forEach(token => {
      let val = discoverValue(token);
      if (!val && token.original) val = discoverValue(token.original);
      
      if (val !== undefined && val !== '') {
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
    
    const targetTokens = dictionary.allTokens || [];
    
    targetTokens.forEach(token => {
      let val = discoverValue(token);
      if (!val && token.original) val = discoverValue(token.original);
      
      if (val !== undefined && val !== '') {
        const cleanName = token.path.map(p => {
          return p.replace(/[^a-zA-Z0-9]/g, '').charAt(0).toUpperCase() + p.replace(/[^a-zA-Z0-9]/g, '').slice(1);
        }).join('');
        
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

await sd.buildAllPlatforms();
