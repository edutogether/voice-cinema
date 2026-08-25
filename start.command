#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "[오류] Node.js가 설치되어 있지 않습니다. https://nodejs.org 에서 설치하세요."
  read -n 1; exit 1
fi
if [ ! -d node_modules ]; then
  echo "[최초 1회] 라이브러리 설치 중..."
  npm install
fi
node server.js
