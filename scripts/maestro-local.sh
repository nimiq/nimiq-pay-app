#!/usr/bin/env bash
# Runs `maestro test` locally with the MAESTRO_* lines of the repo's .env exported, so flows can
# use local secrets (e.g. MAESTRO_TESTNET_WALLET_WORDS). Maestro reads MAESTRO_* variables from its
# environment, which keeps the values off the command line. The file is parsed, never sourced.
# Maestro's debug output and test output record the values it types: whichever of --debug-output
# and --test-output-dir you don't pass goes to a temporary folder that is deleted afterwards (treat
# folders you pass as secret).
# Usage: scripts/maestro-local.sh --device emulator-5554 test -e APP_ID=com.nimiq.pay.debug -e PIN=1111 <flow>
set -euo pipefail

args=("$@")
is_test=false
has_debug_output=false
has_test_output_dir=false
for arg in "$@"; do
  [[ "$arg" == test ]] && is_test=true
  [[ "$arg" == --debug-output* ]] && has_debug_output=true
  [[ "$arg" == --test-output-dir* ]] && has_test_output_dir=true
done

if [[ "$is_test" == true ]]; then
  env_file="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.env"
  if [[ -f "$env_file" ]]; then
    while IFS= read -r line; do
      line="${line%$'\r'}"
      value="${line#*=}"
      if [[ "$value" =~ ^\"(.*)\"$ || "$value" =~ ^\'(.*)\'$ ]]; then
        value="${BASH_REMATCH[1]}"
      fi
      export "${line%%=*}=$value"
    done < <(grep -E '^MAESTRO_[A-Z0-9_]+=' "$env_file" || true)
  fi

  if [[ "$has_debug_output" == false || "$has_test_output_dir" == false ]]; then
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' EXIT
    # Maestro accepts the test options after the flow path.
    [[ "$has_debug_output" == false ]] && args+=(--debug-output "$tmp_dir/debug")
    [[ "$has_test_output_dir" == false ]] && args+=(--test-output-dir "$tmp_dir/test-output")
  fi
fi

maestro "${args[@]}"
