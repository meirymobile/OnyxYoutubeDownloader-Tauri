#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"
echo "Starting Onyx DJ Performance Shield — By DJ Shazz..."
npm run tauri dev
