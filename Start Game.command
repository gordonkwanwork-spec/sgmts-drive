#!/bin/zsh
cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if curl -fsS http://127.0.0.1:5174/ 2>/dev/null | /usr/bin/grep -q 'SGMTS Drive'; then
  open http://127.0.0.1:5174/
  exit 0
fi
if [ ! -d node_modules ]; then npm install || exit 1; fi
(
  for attempt in {1..40}; do
    if curl -fsS http://127.0.0.1:5174/ >/dev/null 2>&1; then open http://127.0.0.1:5174/; break; fi
    sleep 0.25
  done
) &
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
