#!/usr/bin/env python3
"""
导出 Data_COGS 表到 CSV
Usage: python backend/scripts/export_data_cogs.py
Output: backend/data/exports/Data_COGS_<timestamp>.csv
"""
import sys
from pathlib import Path
from datetime import datetime

# Bootstrap Django environment
project_root = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(project_root))

# PyMySQL patch
import pymysql
pymysql.install_as_MySQLdb()

import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.django_config.settings')

import django
django.setup()

from core.components.db.client import DBClient

def main():
    print("=" * 60)
    print("Exporting Data_COGS table to CSV...")
    print("=" * 60)
    
    # Read table
    df = DBClient.read_df("SELECT * FROM Data_COGS")
    
    if df.empty:
        print("⚠️ Table is empty, no data to export.")
        return 1
    
    print(f"✅ Loaded {len(df)} rows, {len(df.columns)} columns")
    
    # Prepare output directory
    exports_dir = project_root / "backend" / "data" / "exports"
    exports_dir.mkdir(parents=True, exist_ok=True)
    
    # Generate filename with timestamp
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_file = exports_dir / f"Data_COGS_{timestamp}.csv"
    
    # Export to CSV
    df.to_csv(output_file, index=False, encoding='utf-8-sig')
    
    print(f"✅ Exported to: {output_file}")
    print(f"   File size: {output_file.stat().st_size:,} bytes")
    
    print("\n" + "=" * 60)
    print("✅ Export completed!")
    print("=" * 60)
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
