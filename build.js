import StyleDictionary from 'style-dictionary';
import fs from 'fs';

// 1. Load and validate the raw token payload
let rawTokens;
try {
  if (!fs.existsSync('tokens.json')) {
    throw new Error('tokens.json not found in the repository root. Ensure your Figma plugin sync is verified.');
  }
  rawTokens = JSON.parse(fs.readFileSync('tokens.json', 'utf8'));
} catch (error) {
  console.error('❌ Failed to load or parse tokens.json:', error.message);
  process.exit(1);
}

// 2. Flatten top-level set wraps cleanly
function sanitizeAndFlatten(obj) {
  let combined = {};
  
  if (obj.global) combined = { ...combined, ...obj.global };
  if (obj.semantic) combined = { ...combined, ...obj.semantic };
  
  if (Object.keys(combined).length === 0) {
    combined = { ...obj };
  }

  // Convert raw structure text: standardize reference pointers safely
  let jsonString = JSON.stringify(combined);
  jsonString = jsonString.replaceAll('{global.', '{');
  jsonString = jsonString.replaceAll('{semantic.', '{');
  
  return JSON.parse(jsonString);
}

const sanitizedTokens = sanitizeAndFlatten(rawTokens);

if (!sanitizedTokens || Object.keys(sanitizedTokens).length === 0) {
  console.error('❌ Sanitization produced an empty object template. Verify tokens.json properties.');
  process.exit(1);
}

// Create a flat dictionary mapping index to resolve paths manually
const flatValueMap = {};
function buildValueMap(obj, currentPath =) {
  for (const key in obj) {
    if (obj[key] && typeof obj[key] === 'object') {
      const keys = Object.keys(obj[key]);
      const valueKey = keys.find(k => k === 'value' || k.endsWith('value'));
      
      if (valueKey && obj[key][valueKey] !== undefined) {
        let val = obj[key][valueKey];
        const lookupKey = [...currentPath, key].join('.');
        
        // Clean up common variations inside key formats
        const secondaryLookupKey = lookupKey.replace(/-/g, '.');
        flatValueMap[lookupKey] = val;
        flatValueMap[secondaryLookupKey] = val;
      } else {
        buildValueMap(obj[key], [...currentPath, key]);
      }
    }
  }
}
buildValueMap(sanitizedTokens);

// Advanced recursive tracker to replace reference tokens with real static values
function resolveTokenValue(val) {
  if (typeof val !== 'string') return val;
  
  // Clean up space variants inside reference scopes
  let workingVal = val.replace(/\{\s*([^}]+)\s*\}/g, '{\$1}');
  
  // Base check if the property points entirely to a single reference template
  const baseRefMatch = workingVal.match(/^\{([^}]+)\}\$/);
  if (baseRefMatch) {
    const targetKey = baseRefMatch[1];
    const alternates = [targetKey, targetKey.replace(/\s+/g, ''), targetKey.replace(/\./g, '-')];
    
    for (const alt of alternates) {
      if (flatValueMap[alt] !== undefined) {
        return resolveTokenValue(flatValueMap[alt]);
      }
    }
  }
  
  // Handle complex inline components like rgba({Neutral.Neutral-0}, 0.5)
  return workingVal.replace(/\{([^}]+)\}/g, (substring, targetKey) => {
    const alternates = [targetKey, targetKey.replace(/\s+/g, ''), targetKey.replace(/\./g, '-')];
    for (const alt of alternates) {
      if (flatValueMap[alt] !== undefined) {
        return resolveTokenValue(flatValueMap[alt]);
      }
    }
    return substring;
  });
}

fs.writeFileSync('tokens-sanitized.json', JSON.stringify(sanitizedTokens, null, 2));

// 3. Register Custom Formats that process deep reference substitutions
StyleDictionary.registerFormat({
  name: 'custom/tailwind-js',
  format: async function({ dictionary }) {
    const tokens = {};
    const targetTokens = dictionary.allTokens ||;
    
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
    
    const targetTokens = dictionary.allTokens ||;
    
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

        // Advanced RGBA translation loop to handle color transparencies securely for Android classes
        if (typeof val === 'string' && val.includes('rgba')) {
          const hexExtract = val.match(/#[a-fA-F0-9]{6}/);
          const alphaExtract = val.match(/0\.\d+|[01]/);
          
          if (hexExtract) {
            let hex = hexExtract[0].replace('#', '');
            let alphaPercent = alphaExtract ? parseFloat(alphaExtract[0]) : 1;
            let alphaHex = Math.round(alphaPercent * 255).toString(16).toUpperCase().padStart(2, '0');
            output += `    val ${finalVarName} = Color(0x${alphaHex}${hex.toUpperCase()})\n`;
            return;
          } else {
            val = '#00000000'; // Global safe default tracker for transparent structures
          }
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

// 4. Initialize Style Dictionary Instance
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
