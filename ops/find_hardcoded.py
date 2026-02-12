import os
import re

# Configuration
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(PROJECT_ROOT, 'backend')

# Regex to find Chinese characters
# Range \u4e00-\u9fa5 covers most common CJK characters
CHINESE_PATTERN = re.compile(r'[\u4e00-\u9fa5]+')

# Regex to ignore (lines that are effectively comments or distinct i18n tags)
# 1. Django comments: {# ... #}
# 2. HTML comments: <!-- ... --> (handled by simple string check usually, but regex is safer)
# 3. JS comments: // ... or /* ... */

def is_comment(line):
    line = line.strip()
    if line.startswith('{#') or line.startswith('<!--') or line.startswith('//') or line.startswith('/*') or line.startswith('*'):
        return True
    return False

def contains_chinese(text):
    return bool(CHINESE_PATTERN.search(text))

def scan_file(file_path):
    issues = []
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            
        for i, line in enumerate(lines):
            # Skip comments (simple check)
            if is_comment(line):
                continue
                
            # If line has Chinese
            if contains_chinese(line):
                # Now the tricky part: Is this Chinese inside a data-i18n tag value?
                # e.g. <span data-i18n="key">中文</span> -> This is VALID (fallback text)
                # But... <p>这是中文</p> -> This is INVALID
                
                # Heuristic: If the line contains 'data-i18n', we tentatively say it's "Safe" 
                # strictly for this "Quick Scan" to find the egregious ones.
                # BUT, your case has mixed content: "Text <span data-i18n>...</span> Text"
                # So we can't just skip lines with data-i18n.
                
                # Let's just output it for review. The user needs to see the mixed lines.
                issues.append((i + 1, line.strip()))
                
    except Exception as e:
        pass
        
    return issues

def main():
    print(f"Scanning for Hardcoded Chinese in: {BACKEND_DIR}")
    print("Excluding comments and backup files...")
    print("="*60)
    
    count = 0
    file_count = 0
    
    for root, dirs, files in os.walk(BACKEND_DIR):
        for file in files:
            if file.endswith('.html') or file.endswith('.js') or file.endswith('.py'):
                # Skip legacy/backup files
                if '.bak' in file or 'migrations' in root:
                    continue
                    
                path = os.path.join(root, file)
                rel_path = os.path.relpath(path, PROJECT_ROOT)
                
                issues = scan_file(path)
                if issues:
                    file_count += 1
                    print(f"\n📄 {rel_path}")
                    for line_num, content in issues:
                        # Truncate long lines
                        if len(content) > 80:
                            content = content[:80] + "..."
                        print(f"    Line {line_num}: {content}")
                        count += 1
                        
    print("\n" + "="*60)
    print(f"Scan Complete.")
    print(f"Found {count} lines with hardcoded Chinese in {file_count} files.")
    print("="*60)

if __name__ == "__main__":
    main()
