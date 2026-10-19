#!/usr/bin/env bash
set -e

APP_DIR="build_app"
mkdir -p "$APP_DIR"
APP_PATH="$APP_DIR/OnyxYoutubeDownloader.app"

# Clean any previous temporary app
rm -rf "$APP_PATH"

echo "==> Resolving complete application bundle..."
if [ -f "src-tauri/target/release/bundle/macos/OnyxYoutubeDownloader.app/Contents/MacOS/onyxyoutubedownloader-tauri" ]; then
    cp -R "src-tauri/target/release/bundle/macos/OnyxYoutubeDownloader.app" "$APP_DIR/"
else
    # Extract from Tauri's generated DMG
    TAURI_DMG=$(ls src-tauri/target/release/bundle/dmg/OnyxYoutubeDownloader*.dmg 2>/dev/null | head -n 1)
    if [ -z "$TAURI_DMG" ] || [ ! -f "$TAURI_DMG" ]; then
        echo "Error: Could not find compiled app or Tauri DMG. Run 'npx tauri build' first."
        exit 1
    fi
    echo "==> Extracting full application bundle from $TAURI_DMG..."
    MOUNT_INFO=$(hdiutil attach -nobrowse -noverify "$TAURI_DMG")
    DEV=$(echo "$MOUNT_INFO" | grep -E '/dev/disk[0-9]+s[0-9]+' | head -n 1 | awk '{print $1}')
    MOUNT_DIR=$(echo "$MOUNT_INFO" | grep -E '/Volumes/' | head -n 1 | awk '{$1=$2=""; print $0}' | sed 's/^[ \t]*//')
    cp -R "$MOUNT_DIR/OnyxYoutubeDownloader.app" "$APP_DIR/"
    hdiutil detach "$DEV" -force
fi

echo "==> Embedding djay_reader.dylib into app bundle..."
mkdir -p "$APP_PATH/Contents/Frameworks" "$APP_PATH/Contents/MacOS"
cp src-tauri/djay_reader.dylib "$APP_PATH/Contents/Frameworks/"
cp src-tauri/djay_reader.dylib "$APP_PATH/Contents/MacOS/"

echo "==> Stripping quarantine and signing bundle ad-hoc..."
xattr -cr "$APP_PATH"
codesign --force --deep --sign - "$APP_PATH"
codesign -v "$APP_PATH"

echo "==> Packaging standard drag-and-drop DMG installer..."
mkdir -p install
TEMP_DMG="temp_build.dmg"
FINAL_DMG="./install/OnyxYoutubeDownloader.dmg"

# Clean up any lingering mounts or files
for vol in /Volumes/Onyx*; do [ -d "$vol" ] && hdiutil detach "$vol" -force 2>/dev/null || true; done
rm -f "$TEMP_DMG" "$FINAL_DMG"

# Create a clean HFS+ blank image (500MB to comfortably fit full app bundle)
hdiutil create -size 500m -fs HFS+ -volname "Onyx Youtube Downloader" "$TEMP_DMG"

# Mount with -nobrowse so Finder/Spotlight do not lock it
MOUNT_INFO=$(hdiutil attach -nobrowse -noverify -noautoopen "$TEMP_DMG")
DEV=$(echo "$MOUNT_INFO" | grep -E '/dev/disk[0-9]+s[0-9]+' | head -n 1 | awk '{print $1}')
MOUNT_DIR=$(echo "$MOUNT_INFO" | grep -E '/Volumes/' | head -n 1 | awk '{$1=$2=""; print $0}' | sed 's/^[ \t]*//')

# Copy app bundle
cp -R "$APP_PATH" "$MOUNT_DIR/"

# Create standard Applications drag-and-drop symlink
ln -s /Applications "$MOUNT_DIR/Applications"

sync
sleep 1

# Detach and convert to final compressed UDZO DMG
hdiutil detach "$DEV" -force
hdiutil convert "$TEMP_DMG" -format UDZO -imagekey zlib-level=9 -o "$FINAL_DMG"
rm -f "$TEMP_DMG"
rm -rf "$APP_DIR"

echo "==> Done! Standard installer is ready in: $FINAL_DMG"
ls -lh "$FINAL_DMG"
