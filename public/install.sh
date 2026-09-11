#!/bin/sh
# Installs the dynaform Claude skill into ~/.claude/skills/dynaform.
#
#   curl -fsSL https://dynaform.prcm.xyz/install.sh | sh
#
# Set DYNAFORM_PIN to the PIN you want every link from this install to require before
# it can be opened (recommended — without one, anyone who sees a link has full access
# to it). If unset and a terminal is attached, you'll be prompted for one.
set -e

BASE_URL="${DYNAFORM_URL:-https://dynaform.prcm.xyz}"
DEST="${DYNAFORM_SKILL_DIR:-$HOME/.claude/skills/dynaform}"

mkdir -p "$DEST/scripts"
curl -fsSL "$BASE_URL/skill/SKILL.md" -o "$DEST/SKILL.md"
curl -fsSL "$BASE_URL/skill/scripts/dynaform.mjs" -o "$DEST/scripts/dynaform.mjs"
chmod +x "$DEST/scripts/dynaform.mjs"

PIN="$DYNAFORM_PIN"
if [ -z "$PIN" ] && [ -r /dev/tty ]; then
  printf 'Set a PIN to protect your links (recommended, press enter to skip): '
  read -r PIN < /dev/tty || PIN=""
fi
if [ -n "$PIN" ]; then
  printf '%s' "$PIN" > "$DEST/pin"
  chmod 600 "$DEST/pin"
  echo "PIN saved to $DEST/pin — you'll need to enter it whenever you open a dynaform link."
else
  echo "No PIN set. Anyone who sees a link you send will be able to open it. Add one later by writing to $DEST/pin."
fi

echo "Installed dynaform skill to $DEST"
echo "Requires Node.js >= 19. Server: $BASE_URL"
