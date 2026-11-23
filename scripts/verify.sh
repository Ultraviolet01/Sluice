#!/usr/bin/env bash
# Runs every check in the repository: contract tests, agent typecheck and tests,
# invoice-reader tests and the web build. Prints one PASS/FAIL line per check.
set -u
cd "$(dirname "$0")/.."
pass=0; fail=0
run() {
  local name="$1"; shift
  if out=$("$@" 2>&1); then echo "PASS  $name"; pass=$((pass+1)); else echo "FAIL  $name"; echo "$out" | tail -20; fail=$((fail+1)); fi
}
[ -d contracts/node_modules ] || (cd contracts && npm ci --legacy-peer-deps >/dev/null)
[ -d agent/node_modules ] || (cd agent && npm ci >/dev/null)
[ -d web/node_modules ] || (cd web && npm ci >/dev/null)
[ -d bot/node_modules ] || (cd bot && npm ci >/dev/null)
run "contract tests (vault + stolen-key attacks)" bash -c "cd contracts && npx hardhat test"
run "agent typecheck" bash -c "cd agent && npm run typecheck"
run "agent tests" bash -c "cd agent && npm test"
run "bot typecheck and tests (linking, guardian actions)" bash -c "cd bot && npm run typecheck && npm test"
run "web tests (invoice reader, bill import)" bash -c "cd web && npm test"
run "web typecheck and build" bash -c "cd web && npm run build"
run "docs line links match the contract" node scripts/check-links.mjs
echo
if [ $fail -eq 0 ]; then echo "VERIFY PASSED: $pass passed, 0 failed"; else echo "VERIFY FAILED: $pass passed, $fail failed"; exit 1; fi
