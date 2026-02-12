from pathlib import Path
import re

def parse_patch_notes(file_path):
    """
    Parses the patch notes text file.
    Expected format:
    VERSION=V1.6.0
    
    [V1.6.0] 2025-12-10
    Title
    - Note 1
    ...
    """
    if not Path(file_path).exists():
        return [], "V0.0.0", "Unknown"
        
    content = Path(file_path).read_text(encoding='utf-8')
    lines = content.split('\n')
    
    current_version = "Unknown"
    # Read global version from first non-empty line
    for line in lines:
        if line.strip().startswith("VERSION="):
            current_version = line.split("=")[1].strip()
            break
            
    # Regex to find blocks: [V...] Date
    # We will split by `[` but that might be risky. 
    # Let's iterate.
    
    notes = []
    current_block = None
    
    # Simple state machine
    for line in lines:
        line = line.strip()
        if not line: continue
        if line.startswith("VERSION="): continue
        
        # New Block Header: [V1.6.0] 2025-12-10
        match = re.match(r'^\[(V[\d\.]+)\]\s+(.*)$', line)
        if match:
            if current_block:
                notes.append(current_block)
            
            current_block = {
                "version": match.group(1),
                "date": match.group(2),
                "content": []
            }
        else:
            if current_block:
                current_block["content"].append(line)
                
    if current_block:
        notes.append(current_block)
        
    return notes, current_version

def get_latest_release_info(notes, version):
    """Find release date for specific version"""
    for note in notes:
        if note["version"] == version:
            return note["date"]
    return "Unknown Date"
