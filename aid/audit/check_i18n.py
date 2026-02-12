
import os
import json
import re

def count_keys(json_file):
    try:
        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            # Count leaf nodes
            count = 0
            stack = [data]
            while stack:
                item = stack.pop()
                if isinstance(item, dict):
                    for k, v in item.items():
                        if isinstance(v, (dict, list)):
                            stack.append(v)
                        else:
                            if k != 'version' and k != 'description' and k != 'updated': # skip meta
                                count += 1
            return count
    except Exception as e:
        print(f"Error reading {json_file}: {e}")
        return 0

def count_in_files(root_dir, pattern_regex, file_extension):
    count = 0
    regex = re.compile(pattern_regex)
    for root, dirs, files in os.walk(root_dir):
        for file in files:
            if file.endswith(file_extension):
                filepath = os.path.join(root, file)
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        content = f.read()
                        matches = regex.findall(content)
                        count += len(matches)
                except Exception as e:
                    # print(f"Error reading {filepath}: {e}")
                    pass
    return count

def main():
    base_dir = '/Users/aaron/Desktop/app/MGMT/backend'
    
    # 1. Count Keys
    zh_path = os.path.join(base_dir, 'static/i18n/zh.json')
    en_path = os.path.join(base_dir, 'static/i18n/en.json')
    
    zh_count = count_keys(zh_path)
    en_count = count_keys(en_path)
    
    print(f"Translation Keys (zh): {zh_count}")
    print(f"Translation Keys (en): {en_count}")
    
    # 2. Count data-i18n tags
    templates_dir = os.path.join(base_dir, 'templates')
    data_i18n_count = count_in_files(templates_dir, r'data-i18n=', '.html')
    print(f"data-i18n attributes: {data_i18n_count}")
    
    # 3. Count i18n.t() calls
    js_dir = os.path.join(base_dir, 'static/js')
    # Match i18n.t('...') or i18n.t("...")
    i18n_t_count = count_in_files(js_dir, r'i18n\.t\(', '.js')
    
    # Also check templates for embedded JS
    i18n_t_count += count_in_files(templates_dir, r'i18n\.t\(', '.html')
    
    print(f"i18n.t() JS calls: {i18n_t_count}")
    
    # 4. Count Django gettext
    # Match gettext(...) or _(...)
    # This is tricky because _() is common. We'll look for explicitly imported alias usage or {% trans %} tags?
    # The audit report says "Django gettext 文件". This implies "files using gettext".
    # Or maybe "occurrences".
    # Let's count files that import gettext.
    
    gettext_files_count = 0
    apps_dir = os.path.join(base_dir, 'apps')
    import_regex = re.compile(r'from django.utils.translation import gettext')
    
    for root, dirs, files in os.walk(apps_dir):
        for file in files:
            if file.endswith('.py'):
                filepath = os.path.join(root, file)
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        if import_regex.search(f.read()):
                            gettext_files_count += 1
                except:
                    pass
    
    print(f"Django gettext files: {gettext_files_count}")

if __name__ == '__main__':
    main()
