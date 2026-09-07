#!/bin/bash
echo "Avvio Brawl Hero Studio..."
cd "$(dirname "$0")"
python3 -m http.server 8000
