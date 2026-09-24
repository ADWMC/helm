#!/usr/bin/env bash
# 2026-fork-gates — WG2.2 runner (mirror protocol, run as root; executes as ci).
set -u
SUITE_WIN=/mnt/c/Users/Administrator/Documents/GitHub/helm/docs/tests/2026-fork-gates
REPO=/home/ci/helm
SUITE=$REPO/docs/tests/2026-fork-gates
FIX=/opt/fixloop.so

# env stack (round10 parity)
[ -f /root/fixloop.so ] && cp -f /root/fixloop.so "$FIX" && chmod 755 "$FIX"
id ci >/dev/null 2>&1 || useradd -m -s /bin/bash ci
chown -R ci:ci /home/ci/helm 2>/dev/null
git config --global --add safe.directory '*' 2>/dev/null
printf '5.15.0-119-generic\n' > /tmp/fake-osrelease
printf 'Linux version 5.15.0-119-generic (buildd@lcy02) (gcc version 11.4.0) #129-Ubuntu SMP Fri Aug 11 10:00:00 UTC 2023\n' > /tmp/fake-version
mount --bind /tmp/fake-osrelease /proc/sys/kernel/osrelease 2>/dev/null
mount --bind /tmp/fake-version /proc/version 2>/dev/null
[ -e /usr/bin/wslpath ] && mv /usr/bin/wslpath /usr/bin/wslpath.hidden 2>/dev/null
swapon -a 2>/dev/null

# auth: local pi creds -> fork config dir (运行时供给,不入库)
mkdir -p /home/ci/.helm/agent
if [ -f /mnt/c/Users/Administrator/.pi/agent/auth.json ]; then
  cp -f /mnt/c/Users/Administrator/.pi/agent/auth.json /home/ci/.helm/agent/auth.json
  chmod 600 /home/ci/.helm/agent/auth.json
  echo AUTH_COPIED=1
else
  echo AUTH_MISSING=1; exit 3
fi
chown -R ci:ci /home/ci/.helm 2>/dev/null

# fresh build state must exist (gate build ran before)
test -f $REPO/packages/coding-agent/dist/bundle/cli.js || { echo BIN_MISSING; exit 4; }

echo "=== fork-gates run (ci) ==="
runuser -u ci -- env \
  PATH=/usr/local/bin:/usr/bin:/bin \
  HOME=/home/ci \
  TMPDIR=/tmp TMP=/tmp TEMP=/tmp \
  XDG_CONFIG_HOME=/home/ci/.config \
  LANG=C LC_ALL=C TZ=UTC \
  NPM_CONFIG_USERCONFIG=/home/ci/.npmrc-empty \
  NPM_CONFIG_GLOBALCONFIG=/home/ci/.npmrc-gempty \
  PI_NO_LOCAL_LLM=1 CI=true AWS_EC2_METADATA_DISABLED=true \
  HELPI_QUIET=1 \
  LD_PRELOAD="$FIX" \
  FORK_ROOT=$REPO \
  GATE_MODEL=${GATE_MODEL:-xiaomi/mimo-v2.6-flash} \
  bash -c "cd $SUITE && node run-gates.mjs" 2>&1 | tee /tmp/fork-gates.log
echo "RUN_EXIT=${PIPESTATUS[0]}"
grep -E '"allPass"' /tmp/fork-gates.log || true
echo GATES_DONE