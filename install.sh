#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${RAYA_REPO_URL:-https://github.com/SDH4114/Raya-APPLE.git}"
REPO_REF="${RAYA_REPO_REF:-prime}"
NODE_MAJOR="${RAYA_NODE_MAJOR:-22}"

case "$(uname -s)" in
  Darwin|Linux) ;;
  *)
    echo "Raya installer supports macOS and Linux only." >&2
    exit 1
    ;;
esac

need_node=0
if ! command -v node >/dev/null 2>&1; then
  need_node=1
else
  current_major="$(node -p 'process.versions.node.split(".")[0]')"
  if [ "$current_major" -lt "$NODE_MAJOR" ]; then
    need_node=1
  fi
fi

if [ "$need_node" -eq 1 ]; then
  if ! command -v curl >/dev/null 2>&1; then
    echo "curl is required to install Node.js via nvm." >&2
    exit 1
  fi

  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    echo "Installing nvm..."
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
  fi

  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm install "$NODE_MAJOR"
  nvm use "$NODE_MAJOR"
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required but was not found after Node.js setup." >&2
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "git is required to install Raya from GitHub." >&2
  exit 1
fi

tmpdir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmpdir"
}
trap cleanup EXIT

echo "Downloading Raya from $REPO_URL#$REPO_REF..."
git clone --depth 1 --branch "$REPO_REF" "$REPO_URL" "$tmpdir/raya"

cd "$tmpdir/raya"
npm install
npm run build
npm install -g .

echo
echo "Raya installed."
echo "Next steps:"
echo "  raya login"
echo "  raya"
