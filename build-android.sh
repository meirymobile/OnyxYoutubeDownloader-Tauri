#!/bin/bash
export JAVA_HOME=/Library/Java/JavaVirtualMachines/jdk-20.jdk/Contents/Home
export PATH="$HOME/.cargo/bin:$PATH"

echo "Building Onyx Youtube Downloader for Android..."
npm run tauri android build
