import StyleDictionary from 'style-dictionary';
import fs from 'fs';

// 1. Load and validate the raw token payload with strict error hooks
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

// 2. Deep clean and flatten top-level set wraps
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

// Validate sanitized output profile matrices
if (!sanitizedTokens || Object.keys(sanitizedTokens).length === 0) {
  console.error('❌ Sanitization produced an empty object template. Verify tokens.json properties.');
  process.exit(1);
}

// Create a flat data dictionary dictionary lookup map to resolve nested references manually
const flatValueMap = {};
function buildValueMap(obj, currentPath = []) {
  for (const key in obj) {
    if (obj[key] && typeof obj[key] === 'object') {
      if (obj[key].value !== undefined || obj[key].\$value !== undefined) {
        const val = obj[key].value !== undefined ? obj[key].value : obj[key].\$value;
        const lookupKey = [...currentPath, key].join('.');
        flatValueMap[lookupKey] = val;
      } else {
        buildValueMap(obj[key], [...currentPath, key]);
      }
    }
  }
}
buildValueMap(sanitizedTokens);

// Recursive lookup tracking function to securely trace reference aliases (e.g., "{Neutral.Neutral-50}" -> "#ffffff")
function resolveTokenValue(val) {
  if (typeof val !== 'string') return val;
  
  // Match absolute patterns like {Neutral.Neutral-50}
  const refRegex = /^\{([^}]+)\}\$/;
  const match = val.match(refRegex);
  
  if (match) {
    const targetKey = match[1];
    if (flatValueMap[targetKey] !== undefined) {
      return resolveTokenValue(flatValueMap[targetKey]);
    }
  }
  
  // Handle complex composite properties like rgba({Neutral.Neutral-0}, 0.5)
  return val.replace(/\{([^}]+)\}/g, (substring, targetKey) => {
    if (flatValueMap[targetKey] !== undefined) {
      return resolveTokenValue(flatValueMap[targetKey]);
    }
    return substring;
  });
}

// Write the pristine sanitized data module for tracking configurations
fs.writeFileSync('tokens-sanitized.json', JSON.stringify(sanitizedTokens, null, 2));

// 3. Register Custom Formats that use our internal reference parsing fallback
StyleDictionary.registerFormat({
  name: 'custom/tailwind-js',
  format: async function({ dictionary }) {
    const tokens = {};
    const targetTokens = dictionary.allTokens || [];
    
    targetTokens.forEach(token => {
      let rawVal = token.value !== undefined ? token.value : (token.value !== undefined ? token.value : '');
      if (token.original && !rawVal) {
        rawVal = token.original.value !== undefined ? token.original.value : token.original.\$value;
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
      let rawVal = token.value !== undefined ? token.value : (token.value !== undefined ? token.value : '');
      if (token.original && !rawVal) {
        rawVal = token.original.value !== undefined ? token.original.value : token.original.\$value;
      }
      
      let val = resolveTokenValue(rawVal);

      if (val !== undefined && val !== '') {
        const cleanName = token.path.map(p => {
          return p.replace(/[^a-zA-Z0-9]/g, '').charAt(0).toUpperCase() + p.replace(/[^a-zA-Z0-9]/g, '').slice(1);
        }).join('');
        
        let finalVarName = cleanName.replace(/^[^a-zA-Z]+/, '');
        if (!finalVarName) finalVarName = "Token" + Math.floor(Math.random() * 100);

        if (typeof val === 'string' && val.includes('rgba')) {
          val = '#00000000'; // Safe mapping fallback for alpha-channel opacity layers
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

// 4. Initialize Style Dictionary configuration structures
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

// 5. Execute compilation with isolated try/catch hooks
try {
  await sd.buildAllPlatforms();
  console.log('🏁 ✓ Omni-channel token system compilation successful!');
} catch (error) {
  console.error('❌ Build failed during platform token generation:', error.message);
  process.exit(1);
}
