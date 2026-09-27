#!/usr/bin/env python3
"""
Brave History Exporter
----------------------
Extracts unique URLs and titles from Brave, Edge, or Chrome SQLite History databases
into a clean JSON file (urls.json) for the Brave History Sync Replayer extension.
"""

import sys
import os
import shutil
import sqlite3
import json
import argparse
from pathlib import Path

def find_default_history_path():
    home = Path.home()
    candidates = [
        # Linux - Brave
        home / ".config/BraveSoftware/Brave-Browser/Default/History",
        # macOS - Brave
        home / "Library/Application Support/BraveSoftware/Brave-Browser/Default/History",
        # Windows - Brave
        home / "AppData/Local/BraveSoftware/Brave-Browser/User Data/Default/History",
        # Linux - Chrome
        home / ".config/google-chrome/Default/History",
        # macOS - Chrome
        home / "Library/Application Support/Google/Chrome/Default/History",
        # Windows - Chrome
        home / "AppData/Local/Google/Chrome/User Data/Default/History",
        # Linux - Edge
        home / ".config/microsoft-edge/Default/History",
        # Windows - Edge
        home / "AppData/Local/Microsoft/Edge/User Data/Default/History",
    ]
    for p in candidates:
        if p.exists():
            return p
    return None

def export_history(db_path, output_path, max_urls=28000):
    print(f"[*] Usando base de datos: {db_path}")
    
    # Copy to temporary file to avoid SQLite file locking by running browser
    temp_copy = Path(output_path).parent / "temp_history_dump.db"
    try:
        shutil.copy2(db_path, temp_copy)
        wal_path = Path(str(db_path) + "-wal")
        if wal_path.exists():
            shutil.copy2(wal_path, Path(str(temp_copy) + "-wal"))
            
        conn = sqlite3.connect(temp_copy)
        c = conn.cursor()
        c.execute("""
            SELECT url, title, visit_count, last_visit_time
            FROM urls
            WHERE url LIKE 'http://%' OR url LIKE 'https://%'
            ORDER BY last_visit_time DESC
        """)

        seen = set()
        data = []
        for r in c.fetchall():
            url = r[0].strip()
            if url not in seen:
                seen.add(url)
                data.append({
                    "url": url,
                    "title": r[1] or "",
                    "visits": r[2] or 1
                })
                if len(data) >= max_urls:
                    print(f"[!] Límite de seguridad alcanzado ({max_urls} URLs) para prevenir OVER_QUOTA.")
                    break

        conn.close()

        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        print(f"[+] Éxito: {len(data):,} URLs únicas exportadas a '{output_path}'.")

    finally:
        if temp_copy.exists():
            temp_copy.unlink()
        temp_wal = Path(str(temp_copy) + "-wal")
        if temp_wal.exists():
            temp_wal.unlink()

def main():
    parser = argparse.ArgumentParser(description="Exporta historial de navegadores Chromium a JSON")
    parser.add_argument("-i", "--input", help="Ruta al archivo History SQLite (opcional)")
    parser.add_argument("-o", "--output", default="urls.json", help="Archivo JSON de salida (por defecto: urls.json)")
    parser.add_argument("-m", "--max", type=int, default=28000, help="Límite máximo de URLs (por defecto: 28000)")
    args = parser.parse_args()

    input_path = Path(args.input) if args.input else find_default_history_path()
    if not input_path or not input_path.exists():
        print("[-] Error: No se encontró la base de datos History automáticamente.")
        print("    Por favor especifica la ruta con: python3 export_history.py -i /ruta/al/History")
        sys.exit(1)

    export_history(input_path, args.output, args.max)

if __name__ == "__main__":
    main()
