import os
import re
import json
import sys

# Configuration
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(PROJECT_ROOT, 'backend')
I18N_FILE = os.path.join(BACKEND_DIR, 'static', 'i18n', 'zh.json')

# Regex patterns
# 1. HTML: data-i18n="key"
PATTERN_HTML_DATA = re.compile(r'data-i18n=["\']([^"\']+)["\']')
# 2. HTML: data-i18n-placeholder="key"
PATTERN_HTML_PLACEHOLDER = re.compile(r'data-i18n-placeholder=["\']([^"\']+)["\']')
# 3. HTML: data-i18n-title="key"  (Found in i18n.js updateDOM)
PATTERN_HTML_TITLE = re.compile(r'data-i18n-title=["\']([^"\']+)["\']')
# 4. JS: i18n.t('key') or i18n.t("key")
PATTERN_JS_T = re.compile(r'i18n\.t\(\s*["\']([^"\']+)["\']')

def load_json_keys(file_path):
    if not os.path.exists(file_path):
        print(f"Error: I18n file not found at {file_path}")
        return set()
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        flat_keys = set()
        
        def flatten(obj, prefix=''):
            for k, v in obj.items():
                current_key = f"{prefix}.{k}" if prefix else k
                if isinstance(v, dict):
                    flatten(v, current_key)
                else:
                    flat_keys.add(current_key)
        
        flatten(data)
        return flat_keys
    except Exception as e:
        print(f"Error loading JSON: {e}")
        return set()

def scan_files():
    found_keys = set()
    usage_map = {} # key -> list of file paths

    for root, dirs, files in os.walk(BACKEND_DIR):
        for file in files:
            if file.endswith('.html') or file.endswith('.js'):
                path = os.path.join(root, file)
                rel_path = os.path.relpath(path, PROJECT_ROOT)
                
                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        content = f.read()
                        
                    matches = []
                    matches.extend(PATTERN_HTML_DATA.findall(content))
                    matches.extend(PATTERN_HTML_PLACEHOLDER.findall(content))
                    matches.extend(PATTERN_HTML_TITLE.findall(content))
                    matches.extend(PATTERN_JS_T.findall(content))
                    
                    for key in matches:
                        # Filter out variable interpolation keys if possible (simple heuristic)
                        if '{' in key or '}' in key or '+' in key:
                            continue
                            
                        found_keys.add(key)
                        if key not in usage_map:
                            usage_map[key] = []
                        if rel_path not in usage_map[key]:
                            usage_map[key].append(rel_path)
                            
                except Exception as e:
                    print(f"Warning: Could not read {rel_path}: {e}")

    return found_keys, usage_map

def main():
    print("Starting I18n Scan...")
    print(f"Project Root: {PROJECT_ROOT}")
    print(f"Scanning for I18n source file: {I18N_FILE}")

    defined_keys = load_json_keys(I18N_FILE)
    print(f"Found {len(defined_keys)} defined keys in zh.json")
    
    used_keys, usage_map = scan_files()
    print(f"Found {len(used_keys)} keys used in code")
    
    missing_keys = used_keys - defined_keys
    unused_keys = defined_keys - used_keys
    
    # Filter meta keys from unused
    unused_keys = {k for k in unused_keys if not k.startswith('meta.')}

    print("\n" + "="*50)
    print(f"MISSING KEYS (Used in code but not in JSON): {len(missing_keys)}")
    print("="*50)
    for k in sorted(missing_keys):
        print(f"[MISSING] {k}")
        # Print first 3 occurrences
        usages = usage_map[k]
        for u in usages[:3]:
            print(f"    - {u}")
        if len(usages) > 3:
            print(f"    - ... and {len(usages)-3} more")

    print("\n" + "="*50)
    print(f"UNUSED KEYS (Defined in JSON but not found in code): {len(unused_keys)}")
    print("="*50)
    # Only print first 20 unused to avoid spam
    for i, k in enumerate(sorted(unused_keys)):
        if i < 20:
            print(f"[UNUSED] {k}")
        else:
            print(f"... and {len(unused_keys)-20} more")
            break

if __name__ == "__main__":
    main()
