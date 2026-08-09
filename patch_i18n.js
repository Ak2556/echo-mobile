const fs = require('fs');

const data = JSON.parse(fs.readFileSync('i18n_extracted.json', 'utf8'));
const base = data.base;
const common = data.common;
const auth = data.auth;

const target_langs = Object.keys(common);

for (const lang of target_langs) {
    if (lang === 'hi') continue;
    
    // Fill common
    for (const key in base) {
        if (!key.startsWith('auth.') && !(key in common[lang])) {
            common[lang][key] = base[key];
        }
    }
    
    // Fill auth
    for (const key in base) {
        if (key.startsWith('auth.') && !(key in auth[lang])) {
            auth[lang][key] = base[key];
        }
    }
}

// Read original file
let content = fs.readFileSync('lib/i18n.ts', 'utf8');

// Replace COMMON_TRANSLATIONS block
// The block goes from "const COMMON_TRANSLATIONS... = {" to "};"
const commonRegex = /const COMMON_TRANSLATIONS: Record<Exclude<AppLanguageCode, 'en'>, TranslationMap> = \{[\s\S]*?\n\};\n/g;
let commonCode = "const COMMON_TRANSLATIONS: Record<Exclude<AppLanguageCode, 'en'>, TranslationMap> = {\n";
for (const lang of Object.keys(common)) {
    commonCode += `  ${lang}: {\n`;
    for (const key in common[lang]) {
        commonCode += `    '${key}': ${JSON.stringify(common[lang][key])},\n`;
    }
    commonCode += `  },\n`;
}
commonCode += "};\n";

content = content.replace(commonRegex, commonCode);

// Replace AUTH_TRANSLATIONS block
const authRegex = /const AUTH_TRANSLATIONS: Record<Exclude<AppLanguageCode, 'en'>, TranslationMap> = \{[\s\S]*?\n\};\n/g;
let authCode = "const AUTH_TRANSLATIONS: Record<Exclude<AppLanguageCode, 'en'>, TranslationMap> = {\n";
for (const lang of Object.keys(auth)) {
    authCode += `  ${lang}: {\n`;
    for (const key in auth[lang]) {
        authCode += `    '${key}': ${JSON.stringify(auth[lang][key])},\n`;
    }
    authCode += `  },\n`;
}
authCode += "};\n";

content = content.replace(authRegex, authCode);

fs.writeFileSync('lib/i18n.ts', content);
console.log("i18n patched globally!");
