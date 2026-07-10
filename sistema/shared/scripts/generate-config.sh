#!/bin/bash
# Generate config.js from environment variables for each module
# Used by Netlify build step

set -e

OUTPUT_DIR="${1:-.}"

cat > "$OUTPUT_DIR/config.js" << CONFIGEOF
/* Auto-generated from environment variables — DO NOT EDIT */
var ENV = {
  SUPABASE_URL: '${SUPABASE_URL}',
  SUPABASE_KEY: '${SUPABASE_ANON_KEY}',
  GESTAO_SUPABASE_URL: '${GESTAO_SUPABASE_URL}',
  GESTAO_SUPABASE_KEY: '${GESTAO_SUPABASE_ANON_KEY}',
  EVOLUTION_API_KEY: '${EVOLUTION_API_KEY}',
  EVOLUTION_BASE_URL: '${EVOLUTION_BASE_URL}',
  N8N_URL: '${N8N_URL}',
  N8N_API_KEY: '${N8N_API_KEY}',
};
CONFIGEOF

echo "config.js generated in $OUTPUT_DIR"
