#!/bin/bash
# Upload PNGs to a nimiq/nimiq-pay-app PR through the user's signed-in Chrome (Claude in Chrome via headless claude CLI).
# Images are appended to the PR description and saved with Update: unsaved uploads 404 forever.
# Usage: upload-shots.sh <pr-number> <png>...   Prints JSON {"<path>": "<user-attachments url>"} or FAILED: <reason>
set -euo pipefail
pr="$1"; shift
[ $# -gt 0 ] || { echo "FAILED: no files"; exit 1; }
for f in "$@"; do [ -f "$f" ] || { echo "FAILED: missing $f"; exit 1; }; done
files=$(printf '%s\n' "$@")
cd /tmp
claude -p "Using the claude-in-chrome tools, in a NEW tab (tabs_create_mcp) open https://github.com/nimiq/nimiq-pay-app/pull/${pr} . Confirm the user is signed in. Open the PR description editor (the '...' menu on the first comment, then Edit). Put the cursor at the very END of the description text, add a new line, then for EACH file below, one at a time, upload it with file_upload on the editor's file input (use find to locate it) and poll the textarea value with javascript_tool (up to 60s) until a new https://github.com/user-attachments/assets/ URL for that file appears. Files:
${files}
When all URLs are present, click the 'Update comment' button to SAVE (never cancel: unsaved uploads are lost). Wait until the description re-renders, then close your tab. Do not touch any other text. Reply with ONLY a JSON object mapping each file path to its URL (no code fences), or FAILED: <reason>." \
  --chrome --allowedTools "mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__find,mcp__claude-in-chrome__file_upload,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__tabs_close_mcp,mcp__claude-in-chrome__computer" \
  < /dev/null 2>&1 | tail -1
