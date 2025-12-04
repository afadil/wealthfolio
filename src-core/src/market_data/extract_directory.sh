#!/bin/bash

# Usage: ./extract_directory.sh /path/to/wealthfolio/src-core/src/market_data

DIRECTORY="${1:-.}"
OUTPUT_FILE="market_data_combined.txt"

# Clear the output file
> "$OUTPUT_FILE"

echo "Extracting files from: $DIRECTORY"
echo "Output will be saved to: $OUTPUT_FILE"
echo ""

# Find all files recursively and process them
find "$DIRECTORY" -type f | sort | while read -r file; do
    echo "Processing: $file"
    
    # Add file separator
    echo "=================================================================================" >> "$OUTPUT_FILE"
    echo "FILE: $file" >> "$OUTPUT_FILE"
    echo "=================================================================================" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
    
    # Add file contents
    cat "$file" >> "$OUTPUT_FILE"
    
    # Add spacing between files
    echo "" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
done

echo ""
echo "Done! All files have been combined into $OUTPUT_FILE"
