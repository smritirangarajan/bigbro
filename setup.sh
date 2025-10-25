#!/bin/bash

# Setup script for Productivity Task Monitor

echo "🚀 Productivity Task Monitor Setup"
echo "=================================="
echo ""

# Check if config files already exist
if [ -f "config.js" ]; then
    echo "⚠️  config.js already exists. Skipping..."
else
    echo "📝 Creating config.js from template..."
    cp config_template.js config.js
    echo "✅ Created config.js"
    echo "⚠️  Please edit config.js and add your API keys!"
fi

if [ -f "webapp/config.js" ]; then
    echo "⚠️  webapp/config.js already exists. Skipping..."
else
    echo "📝 Creating webapp/config.js from template..."
    cp webapp/config_template.js webapp/config.js
    echo "✅ Created webapp/config.js"
    echo "⚠️  Please edit webapp/config.js and add your Supabase credentials!"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Edit config.js and add your API keys"
echo "2. Edit webapp/config.js and add your Supabase credentials"
echo "3. Load the extension in Chrome (chrome://extensions/)"
echo "4. Run the web app (cd webapp && python -m http.server 8000)"
echo ""
