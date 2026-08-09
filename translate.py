import json
import time
from deep_translator import GoogleTranslator

with open('i18n_extracted.json', 'r') as f:
    data = json.load(f)

base = data['base']
common = data['common']
auth = data['auth']

target_langs = list(common.keys())
if 'hi' in target_langs:
    target_langs.remove('hi')

LANG_MAPPING = {
    'or': 'or', 'as': 'as', 'ne': 'ne', 'zh': 'zh-CN',
}

print(f"Translating for {len(target_langs)} languages...")

for lang in target_langs:
    print(f"Processing {lang}...")
    trans_lang = LANG_MAPPING.get(lang, lang)
    translator = GoogleTranslator(source='auto', target=trans_lang)
    
    missing_common_keys = [k for k, v in base.items() if not k.startswith('auth.') and k not in common[lang]]
    missing_common_vals = [base[k] for k in missing_common_keys]
    
    missing_auth_keys = [k for k, v in base.items() if k.startswith('auth.') and k not in auth[lang]]
    missing_auth_vals = [base[k] for k in missing_auth_keys]
    
    # Batch translate common
    if missing_common_vals:
        try:
            res_common = translator.translate_batch(missing_common_vals)
            for k, res in zip(missing_common_keys, res_common):
                common[lang][k] = res if res else base[k]
        except Exception as e:
            print(f"Batch common fail {lang}: {e}")
            for k in missing_common_keys:
                common[lang][k] = base[k]
    
    # Batch translate auth
    if missing_auth_vals:
        try:
            res_auth = translator.translate_batch(missing_auth_vals)
            for k, res in zip(missing_auth_keys, res_auth):
                auth[lang][k] = res if res else base[k]
        except Exception as e:
            print(f"Batch auth fail {lang}: {e}")
            for k in missing_auth_keys:
                auth[lang][k] = base[k]
    
    with open('i18n_translated.json', 'w', encoding='utf-8') as f:
        json.dump({'common': common, 'auth': auth}, f, ensure_ascii=False, indent=2)
    
    time.sleep(1)

print("Done")
