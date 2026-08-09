const fs = require('fs');

const content = fs.readFileSync('lib/i18n.ts', 'utf-8');

const baseMatch = content.match(/const BASE_TRANSLATIONS = (\{[\s\S]*?\}) as const;/);
const commonMatch = content.match(/const COMMON_TRANSLATIONS:.*?= (\{[\s\S]*?\});\n\nconst AUTH_TRANSLATIONS/);
const authMatch = content.match(/const AUTH_TRANSLATIONS:.*?= (\{[\s\S]*?\});\n\n/);

if (!baseMatch || !commonMatch || !authMatch) {
  console.log("Failed to match!");
  process.exit(1);
}

const parseObj = (str) => {
    return eval('(' + str + ')');
};

const base = parseObj(baseMatch[1]);
const common = parseObj(commonMatch[1]);
const auth = parseObj(authMatch[1]);

fs.writeFileSync('i18n_extracted.json', JSON.stringify({base, common, auth}, null, 2));
console.log("Extracted successfully!");
