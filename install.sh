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

ensure_raya_on_path() {
  local raya_executable="$1"
  local path_entry

  case ":$PATH:" in
    *":$npm_global_bin:"*)
      return
      ;;
  esac

  # `curl | bash` cannot modify the parent shell's PATH. Put a launcher in a
  # writable directory that is already on PATH so `raya` works immediately in
  # the terminal that ran the installer.
  local old_ifs="$IFS"
  IFS=":"
  for path_entry in $PATH; do
    [ -n "$path_entry" ] || continue
    [ "${path_entry#/}" != "$path_entry" ] || continue
    if [ -d "$path_entry" ] && [ -w "$path_entry" ]; then
      ln -sf "$raya_executable" "$path_entry/raya"
      IFS="$old_ifs"
      return
    fi
  done
  IFS="$old_ifs"

  # There was no writable PATH entry. Preserve a dependable launcher and make
  # it available to future zsh/bash sessions. The current parent shell cannot
  # be changed by a piped installer, so state the one required refresh clearly.
  local fallback_bin="$HOME/.local/bin"
  mkdir -p "$fallback_bin"
  ln -sf "$raya_executable" "$fallback_bin/raya"

  local shell_file
  for shell_file in "$HOME/.zshrc" "$HOME/.bashrc"; do
    if [ -f "$shell_file" ] && ! grep -Fqx 'export PATH="$HOME/.local/bin:$PATH"' "$shell_file"; then
      printf '\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "$shell_file"
    fi
  done

  echo "Added Raya to $fallback_bin." >&2
  echo "Open a new terminal or run: export PATH=\"\$HOME/.local/bin:\$PATH\"" >&2
}

tmpdir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmpdir"
}
trap cleanup EXIT

echo "Downloading Raya from $REPO_URL#$REPO_REF..."
git clone --depth 1 --branch "$REPO_REF" "$REPO_URL" "$tmpdir/raya"

cd "$tmpdir/raya"
npm ci
npm run build
# Installing a directory globally can create a link back to this temporary
# checkout. Install the packed archive instead, because the checkout is removed
# by the EXIT trap when this script finishes.
package_tarball="$(npm pack --ignore-scripts --pack-destination "$tmpdir" | tail -n 1)"
npm install -g "$tmpdir/$package_tarball"

npm_global_bin="$(npm prefix -g)/bin"
raya_executable="$npm_global_bin/raya"
if [ ! -x "$raya_executable" ]; then
  echo "Raya was installed, but its executable was not found at $raya_executable." >&2
  exit 1
fi

ensure_raya_on_path "$raya_executable"
"$raya_executable" skills sync

echo
echo "Raya installed."
echo "Next steps:"
echo "  raya login"
echo "  raya"
