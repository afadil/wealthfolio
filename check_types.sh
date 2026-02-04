#!/bin/bash

# Quick TypeScript type check for rebalancing commands
cd /Users/admin/Desktop/wealthfolio

echo "🔍 Checking TypeScript compilation..."
pnpm tsc --noEmit

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ TypeScript compilation successful!"
    echo ""
    echo "📁 Created files:"
    echo "  ✓ src/commands/rebalancing.ts"
    echo "  ✓ src/lib/types.ts (updated with rebalancing types)"
    echo ""
    echo "🎯 Phase 4 Complete - Frontend Commands Ready!"
    echo ""
    echo "Next: Create React UI components (Phase 5)"
else
    echo ""
    echo "❌ TypeScript errors found. Review output above."
fi
