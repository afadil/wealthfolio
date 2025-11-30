#!/bin/bash

# Generate icon variants from public/logo.png using sips (macOS)

SOURCE="public/logo.png"
ICONS_DIR="src-tauri/icons"

if [ ! -f "$SOURCE" ]; then
  echo "Error: $SOURCE not found"
  exit 1
fi

echo "Generating icon variants from $SOURCE..."

# PNG sizes for src-tauri/icons/
declare -a sizes=(
  "32"
  "64"
  "128"
  "256"
  "512"
  "1024"
)

for size in "${sizes[@]}"; do
  output="${ICONS_DIR}/${size}x${size}.png"
  echo "Creating $output..."
  sips -z "$size" "$size" "$SOURCE" --out "$output"
done

# 128x128@2x (256x256)
echo "Creating ${ICONS_DIR}/128x128@2x.png..."
sips -z 256 256 "$SOURCE" --out "${ICONS_DIR}/128x128@2x.png"

# icon.png (512x512)
echo "Creating ${ICONS_DIR}/icon.png..."
sips -z 512 512 "$SOURCE" --out "${ICONS_DIR}/icon.png"

# Windows tiles
declare -a windows_sizes=(
  "30"
  "44"
  "71"
  "89"
  "107"
  "142"
  "150"
  "284"
  "310"
)

for size in "${windows_sizes[@]}"; do
  output="${ICONS_DIR}/Square${size}x${size}Logo.png"
  echo "Creating $output..."
  sips -z "$size" "$size" "$SOURCE" --out "$output"
done

# StoreLogo (50x50)
echo "Creating ${ICONS_DIR}/StoreLogo.png..."
sips -z 50 50 "$SOURCE" --out "${ICONS_DIR}/StoreLogo.png"

echo ""
echo "✓ PNG variants created!"
echo ""
echo "For ICNS and ICO, install ImageMagick:"
echo "  brew install imagemagick"
echo ""
echo "Then run: brew install imagemagick && magick public/logo.png src-tauri/icons/icon.icns"
echo "And: magick public/logo.png -define icon:auto-resize=256,128,96,64,48,32,16 src-tauri/icons/icon.ico"
