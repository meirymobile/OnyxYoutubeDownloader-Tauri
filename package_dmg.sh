#!/usr/bin/env bash
set -e

echo "==> Embedding djay_reader.dylib into app bundle..."
APP_PATH="src-tauri/target/release/bundle/macos/OnyxYoutubeDownloader.app"
mkdir -p "$APP_PATH/Contents/Frameworks" "$APP_PATH/Contents/MacOS"
cp src-tauri/djay_reader.dylib "$APP_PATH/Contents/Frameworks/"
cp src-tauri/djay_reader.dylib "$APP_PATH/Contents/MacOS/"

echo "==> Creating DMG installer..."
mkdir -p src-tauri/target/release/bundle/dmg install
rm -f src-tauri/target/release/bundle/dmg/OnyxYoutubeDownloader.dmg
hdiutil create -volname "OnyxYoutubeDownloader" -srcfolder "$APP_PATH" -ov -format UDZO src-tauri/target/release/bundle/dmg/OnyxYoutubeDownloader.dmg

echo "==> Saving DMG exclusively to install/ folder..."
cp src-tauri/target/release/bundle/dmg/OnyxYoutubeDownloader.dmg ./install/OnyxYoutubeDownloader.dmg

echo "==> Done! Installer is available in ./install/OnyxYoutubeDownloader.dmg"
