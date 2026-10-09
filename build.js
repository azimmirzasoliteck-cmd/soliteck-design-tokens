import StyleDictionary from 'style-dictionary';
import fs from 'fs';

// 1. Load and validate the raw token payload
let rawTokens;
try {
  if (!fs.existsSync('tokens.json')) {
    throw new Error('tokens.json not found in the repository root.');
  }
  rawTokens = JSON.parse(fs.readFileSync('tokens.json', 'utf8'));
} catch (error) {
  console.error('❌ Failed to load tokens.json:', error.message);
  process.exit(1);
}

// 2. Flatten top-level set wraps cleanly
function sanitizeAndFlatten(obj) {
  let combined = {};
  if (obj.global) combined = { ...combined, ...obj.global };
  if (obj.semantic) combined = { ...combined, ...obj.semantic };
  if (Object.keys(combined).length === 0) combined = { ...obj };

  let jsonString = JSON.stringify(combined);
  jsonString = jsonString.replaceAll('{global.', '{');
  jsonString = jsonString.replaceAll('{semantic.', '{');
  return JSON.parse(jsonString);
}

const sanitizedTokens = sanitizeAndFlatten(rawTokens);

// Build reference value lookup map ignoring prefix paths entirely
const flatLookup = {};
function buildFlatLookup(obj, currentPath) {
  let path = currentPath;
  if (!path) {
    path = new Array(); // Bulletproof array construction without brackets
  }
  
  for (const key in obj) {
    if (obj[key] && typeof obj[key] === 'object') {
      const keys = Object.keys(obj[key]);
      const valueKey = keys.find(k => k === 'value' || k.endsWith('value'));
      
      if (valueKey && obj[key][valueKey] !== undefined) {
        const val = obj[key][valueKey];
        const fullPathString = [...path, key].join('-');
        flatLookup[fullPathString.toLowerCase()] = val;
        flatLookup[key.toLowerCase()] = val;
      } else {
        buildFlatLookup(obj[key], [...path, key]);
      }
    }
  }
}
buildFlatLookup(sanitizedTokens, null);

function deepResolveValue(val) {
  if (typeof val !== 'string') return val;
  let cleanVal = val.replace(/\{\s*([^}]+)\s*\}/g, '{\$1}');
  const baseMatch = cleanVal.match(/^\{([^}]+)\}\$/);
  if (baseMatch) {
    const target = baseMatch[1].replace(/\./g, '-').toLowerCase();
    for (const key in flatLookup) {
      if (key.endsWith(target) || target.endsWith(key) || key === target) {
        return deepResolveValue(flatLookup[key]);
      }
    }
  }
  return cleanVal.replace(/\{([^}]+)\}/g, (substring, refKey) => {
    const target = refKey.replace(/\./g, '-').toLowerCase();
    for (const key in flatLookup) {
      if (key.endsWith(target) || target.endsWith(key) || key === target) {
        return deepResolveValue(flatLookup[key]);
      }
    }
    return substring;
  });
}

fs.writeFileSync('tokens-sanitized.json', JSON.stringify(sanitizedTokens, null, 2));

// Helper to sanitize token key names cleanly
function cleanKeyName(pathArray) {
  return pathArray.join('-')
    .replace(/(Color-PrimitivesDefault-|Global-Color-TokensDefault-|Size-PrimitivesDefault-|TypographyDefault-)/g, '')
    .replace(/[^a-zA-Z0-9-]/g, '');
}

function cleanKotlinName(pathArray) {
  return pathArray.map(p => {
    return p.replace(/(Color-PrimitivesDefault-|Global-Color-TokensDefault-|Size-PrimitivesDefault-|TypographyDefault-)/g, '')
            .replace(/[^a-zA-Z0-9]/g, '');
  }).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('').replace(/^[^a-zA-Z]+/, '');
}

// 3. Register Custom Formats that organize tokens into structured objects
StyleDictionary.registerFormat({
  name: 'custom/tailwind-js',
  format: async function({ dictionary }) {
    const primitives = {};
    const semantic = {};
    const targetTokens = dictionary.allTokens || new Array();
    
    targetTokens.forEach(token => {
      const rawVal = token.value || (token.original ? (token.original.value || token.original.\$value) : '');
      const resolvedVal = deepResolveValue(rawVal);
      const cleanKey = cleanKeyName(token.path);
      
      if (cleanKey) {
        if (token.path.join('-').toLowerCase().includes('primitive')) {
          primitives[cleanKey] = resolvedVal;
        } else {
          semantic[cleanKey] = resolvedVal;
        }
      }
    });
    
    return `/**\n * Auto-generated design tokens object architecture.\n */\n\nconst primitives = ${JSON.stringify(primitives, null, 2)};\n\nconst semantic = ${JSON.stringify(semantic, null, 2)};\n\nmodule.exports = { primitives, semantic };\n`;
  }
});

StyleDictionary.registerFormat({
  name: 'custom/android-kotlin',
  format: async function({ dictionary }) {
    let primitivesOutput = `    object Primitives {\n`;
    let colorsOutput = `    object Colors {\n`;
    let spacingOutput = `    object Spacing {\n`;
    let typographyOutput = `    object Typography {\n`;
    
    const targetTokens = dictionary.allTokens || new Array();
    
    targetTokens.forEach(token => {
      const rawVal = token.value || (token.original ? (token.original.value || token.original.\$value) : '');
      let val = deepResolveValue(rawVal);
      const varName = cleanKotlinName(token.path);
      const fullPath = token.path.join('-').toLowerCase();
      
      if (!varName || val === undefined || val === '') return;

      if (typeof val === 'string' && val.includes('rgba')) {
        const hexExtract = val.match(/#[a-fA-F0-9]{6}/);
        const alphaExtract = val.match(/0\.\d+|1/);
        if (hexExtract) {
          let hex = hexExtract[0].replace('#', '');
          let alphaPercent = alphaExtract ? parseFloat(alphaExtract[0]) : 1;
          let alphaHex = Math.round(alphaPercent * 255).toString(16).toUpperCase().padStart(2, '0');
          val = `#${alphaHex}${hex}`;
        } else {
          val = '#00000000';
        }
      }

      let line = '';
      if (typeof val === 'string' && val.startsWith('#')) {
        let hex = val.replace('#', '');
        if (hex.length === 6) hex = 'FF' + hex;
        line = `        val ${varName} = Color(0x${hex.toUpperCase()})\n`;
        
        if (fullPath.includes('primitive')) {
          primitivesOutput += line;
        } else {
          colorsOutput += line;
        }
      } else if (!isNaN(val) && val !== '') {
        line = `        val ${varName} = ${val}.dp\n`;
        spacingOutput += line;
      } else {
        line = `        val ${varName} = "${val}"\n`;
        if (fullPath.includes('typography')) {
          typographyOutput += line;
        } else {
          spacingOutput += line;
        }
      }
    });
    
    primitivesOutput += `    }\n\n`;
    colorsOutput += `    }\n\n`;
    spacingOutput += `    }\n\n`;
    typographyOutput += `    }\n`;
    
    return `package com.soliteck.designsystem\n\nimport androidx.compose.ui.graphics.Color\nimport androidx.compose.ui.unit.dp\n\n/**\n * Auto-generated structured design token classes.\n */\nobject DesignTokens {\n${primitivesOutput}${colorsOutput}${spacingOutput}${typographyOutput}}\n`;
  }
});

// 4. Initialize Style Dictionary
const sd = new StyleDictionary({
  source: ['tokens-sanitized.json'],
  platforms: {
    'web/tailwind': {
      transformGroup: 'js',
      buildPath: 'build/web/',
      files: [{ destination: 'tailwind-tokens.js', format: 'custom/tailwind-js' }]
    },
    'android/compose': {
      transformGroup: 'js',
      buildPath: 'build/android/',
      files: [{ destination: 'DesignTokens.kt', format: 'custom/android-kotlin' }]
    }
  }
});

try {
  await sd.buildAllPlatforms();
  console.log('🏁 ✓ Structured multi-tiered token generation successful!');
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}
