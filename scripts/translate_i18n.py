import os
import sys
import re
import time
from deep_translator import GoogleTranslator

i18n_path = 'lib/i18n.ts'

with open(i18n_path, 'r', encoding='utf-8') as f:
    content = f.read()

# We will parse all keys and values from the 'bn: {' block in COMMON_TRANSLATIONS
# First, find COMMON_TRANSLATIONS
common_start = content.find("const COMMON_TRANSLATIONS")
common_end = content.find("};\n\nconst AUTH_TRANSLATIONS", common_start)

# Find 'bn: {' in COMMON_TRANSLATIONS
bn_match_common = re.search(r"  bn: \{(.*?)\n  \},", content[common_start:common_end], re.DOTALL)
if not bn_match_common:
    print("Could not find bn in COMMON_TRANSLATIONS")
    sys.exit(1)

bn_common_str = bn_match_common.group(1)
common_pairs = re.findall(r"'([\w.]+)':\s*\"([^\"]*)\"|'([\w.]+)':\s*'([^']*)'", bn_common_str)
common_dict = {}
for p in common_pairs:
    k = p[0] or p[2]
    v = p[1] or p[3]
    if k:
        common_dict[k] = v

# Same for AUTH_TRANSLATIONS
auth_start = content.find("const AUTH_TRANSLATIONS")
auth_end = content.find("};\n\nconst TRANSLATIONS", auth_start)

bn_match_auth = re.search(r"  bn: \{(.*?)\n  \},", content[auth_start:auth_end], re.DOTALL)
if not bn_match_auth:
    print("Could not find bn in AUTH_TRANSLATIONS")
    sys.exit(1)

bn_auth_str = bn_match_auth.group(1)
auth_pairs = re.findall(r"'([\w.]+)':\s*\"([^\"]*)\"|'([\w.]+)':\s*'([^']*)'", bn_auth_str)
auth_dict = {}
for p in auth_pairs:
    k = p[0] or p[2]
    v = p[1] or p[3]
    if k:
        auth_dict[k] = v


languages = ['bn', 'te', 'mr', 'ta', 'ur', 'gu', 'kn', 'ml', 'pa', 'or', 'as', 'ne', 'es', 'fr', 'de', 'pt', 'ar', 'id', 'ja', 'ko', 'zh-CN', 'ru', 'tr', 'vi']
lang_mapping = {
    'zh': 'zh-CN',
    'or': 'or', # Google Translate supports Odia as 'or'
    'as': 'as', # Google Translate supports Assamese as 'as'
    'bn': 'bn',
}

def do_translation(d, lang):
    code = lang_mapping.get(lang, lang)
    if code == 'en' or code == 'hi': return d
    print(f"Translating for {code}...")
    t = GoogleTranslator(source='en', target=code)
    
    keys = list(d.keys())
    values = list(d.values())
    
    translated_vals = []
    # batch size of 40
    for i in range(0, len(values), 40):
        batch = values[i:i+40]
        protected_batch = [re.sub(r'\{([^}]+)\}', r'<span class="\1"></span>', v) for v in batch]
        text = " \n".join(protected_batch)
        try:
            res = t.translate(text)
            if not res: res = text
            t_batch = res.split(" \n")
            for v in t_batch:
                v = re.sub(r'<span class="([^"]+)"></span>', r'{\1}', v)
                v = v.replace('"', '\\"')
                translated_vals.append(v.strip())
        except Exception as e:
            print(f"Error {e}")
            translated_vals.extend(batch)
        time.sleep(0.5)
        
    result_dict = {}
    for i, k in enumerate(keys):
        result_dict[k] = translated_vals[i] if i < len(translated_vals) else values[i]
    return result_dict


def build_block(base_str, start_idx, end_idx, base_dict):
    existing_hi_match = re.search(r'  hi: \{(.*?)\n  \},', content[start_idx:end_idx], re.DOTALL)
    existing_hi = "  hi: {" + existing_hi_match.group(1) + "\n  }," if existing_hi_match else ""
    
    output = base_str + "\n" + existing_hi + "\n"
    for lang in languages:
        code = lang.replace('-CN', '')
        t_dict = do_translation(base_dict, code)
        output += f"  {code}: {{\n"
        for k, v in t_dict.items():
            output += f"    '{k}': \"{v}\",\n"
        output += "  },\n"
    output += "};\n"
    return output

new_common = build_block("const COMMON_TRANSLATIONS: Record<Exclude<AppLanguageCode, 'en'>, TranslationMap> = {", common_start, common_end, common_dict)
new_auth = build_block("const AUTH_TRANSLATIONS: Record<Exclude<AppLanguageCode, 'en'>, TranslationMap> = {", auth_start, auth_end, auth_dict)

new_content = content[:common_start] + new_common + "\n" + new_auth + content[auth_end+2:]

with open(i18n_path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Translation complete!")
