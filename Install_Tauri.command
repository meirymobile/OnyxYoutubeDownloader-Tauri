#!/bin/bash
echo "========================================="
echo " Installing Onyx (Tauri Version)..."
echo "========================================="

APP_NAME="onyxyoutubedownloader-tauri.app"
SOURCE="/Volumes/onyxyoutubedownloader-tauri/$APP_NAME"
DEST="/Applications/$APP_NAME"

if [ ! -d "$SOURCE" ]; then
    echo "Error: Please make sure you have the Onyx DMG opened (mounted) first!"
    exit 1
fi

echo "Copying application to /Applications folder..."
# Using cp avoids the Finder's automatic malware scanner that deletes unsigned apps
cp -R "$SOURCE" /Applications/

echo "Removing Apple Gatekeeper quarantine flags..."
xattr -cr "$DEST"

echo "========================================="
echo "✅ Installation Complete!"
echo "You can now safely open the app from your Applications folder."
echo "========================================="
