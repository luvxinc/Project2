#!/usr/bin/env python3
"""
i18n Coverage Verification Script
Validates that all i18n keys used in JS files exist in both zh.json and en.json
"""
import json
import re
import os
import sys

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def load_json(filepath):
    """Load JSON file"""
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

def flatten_keys(obj, prefix=''):
    """Flatten nested dict to dot-notation keys"""
    keys = set()
    for k, v in obj.items():
        full_key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            keys.update(flatten_keys(v, full_key))
        else:
            keys.add(full_key)
    return keys

def extract_i18n_keys_from_js(content):
    """Extract i18n keys from JS file content"""
    # Match patterns like: window.i18n?.t('key.subkey') or i18n.t("key.subkey")
    patterns = [
        r"window\.i18n\?\?\.t\(['\"]([^'\"]+)['\"]\)",
        r"window\.i18n\?\.t\(['\"]([^'\"]+)['\"]\)",
        r"i18n\.t\(['\"]([^'\"]+)['\"]\)",
        r"i18n\?\.t\(['\"]([^'\"]+)['\"]\)",
    ]
    keys = set()
    for pattern in patterns:
        matches = re.findall(pattern, content)
        keys.update(matches)
    return keys

def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    i18n_dir = os.path.join(base_dir, 'static', 'i18n')
    js_dir = os.path.join(base_dir, 'static', 'js')
    
    print("=" * 60)
    print("i18n Coverage Verification")
    print("=" * 60)
    
    # Load JSON files
    zh_path = os.path.join(i18n_dir, 'zh.json')
    en_path = os.path.join(i18n_dir, 'en.json')
    
    print(f"\n[1] Loading translation files...")
    zh_data = load_json(zh_path)
    en_data = load_json(en_path)
    
    zh_keys = flatten_keys(zh_data)
    en_keys = flatten_keys(en_data)
    
    print(f"   zh.json: {len(zh_keys)} keys")
    print(f"   en.json: {len(en_keys)} keys")
    
    # Check key parity
    zh_only = zh_keys - en_keys
    en_only = en_keys - zh_keys
    
    if zh_only:
        print(f"\n⚠️  Keys in zh.json but not in en.json ({len(zh_only)}):")
        for k in sorted(list(zh_only))[:10]:
            print(f"   - {k}")
        if len(zh_only) > 10:
            print(f"   ... and {len(zh_only) - 10} more")
    
    if en_only:
        print(f"\n⚠️  Keys in en.json but not in zh.json ({len(en_only)}):")
        for k in sorted(list(en_only))[:10]:
            print(f"   - {k}")
        if len(en_only) > 10:
            print(f"   ... and {len(en_only) - 10} more")
    
    # Check updated JS files for i18n usage
    print(f"\n[2] Checking JS files for i18n calls...")
    
    js_files = [
        'global-exchange-rate.js',
        'security-verify.js',
        'global-file-upload.js',
        'delete-utils.js',
        'global_file_viewer.js',
        'global-modal.js',
    ]
    
    all_js_keys = set()
    for js_file in js_files:
        js_path = os.path.join(js_dir, js_file)
        if os.path.exists(js_path):
            with open(js_path, 'r', encoding='utf-8') as f:
                content = f.read()
            keys = extract_i18n_keys_from_js(content)
            all_js_keys.update(keys)
            print(f"   {js_file}: {len(keys)} keys")
    
    # Check for missing keys
    missing_in_zh = all_js_keys - zh_keys
    missing_in_en = all_js_keys - en_keys
    
    print(f"\n[3] Key Coverage Analysis...")
    print(f"   JS files reference {len(all_js_keys)} unique i18n keys")
    
    if missing_in_zh:
        print(f"\n❌ MISSING in zh.json ({len(missing_in_zh)}):")
        for k in sorted(missing_in_zh):
            print(f"   - {k}")
    
    if missing_in_en:
        print(f"\n❌ MISSING in en.json ({len(missing_in_en)}):")
        for k in sorted(missing_in_en):
            print(f"   - {k}")
    
    # Summary
    print("\n" + "=" * 60)
    if not missing_in_zh and not missing_in_en:
        print("✅ ALL i18n KEYS ARE PROPERLY DEFINED")
        print("=" * 60)
        return 0
    else:
        print("❌ SOME i18n KEYS ARE MISSING")
        print("=" * 60)
        return 1

if __name__ == '__main__':
    sys.exit(main())
