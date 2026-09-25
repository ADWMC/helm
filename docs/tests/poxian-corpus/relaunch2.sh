#!/usr/bin/env bash
# Correct run 3: rebuild bundle (loader hatch must be IN dist), fix spec priority, relaunch.
set -u
S=/home/ci/helm/docs/tests/poxian-corpus
pkill -f run-dualarm.mjs 2>/dev/null
sleep 2

# 1. authorized spec at BOTH candidate paths (cwd/.helm/spec.json wins first)
mkdir -p "$S/.helm"
cp "$S/spec.json" "$S/.helm/spec.json"
chown -R ci:ci "$S/.helm" "$S/spec.json"

# 2. archive run2 logs (stale bundle -> arms invalid)
cd "$S"
mkdir -p logs-run2
mv logs/*.txt logs-run2/ 2>/dev/null
mv logs/*.START logs-run2/ 2>/dev/null
rm -f reports/runner-crash.txt reports/dual-arm-stats.json reports/partial-stats.json

# 3. rebuild coding-agent bundle so withBuiltinKernel hatch (and any src change) is IN dist
runuser -u ci -- env PATH=/usr/local/bin:/usr/bin:/bin HOME=/home/ci TMPDIR=/tmp TMP=/tmp TEMP=/tmp \
  LANG=C TZ=UTC NPM_CONFIG_USERCONFIG=/home/ci/.npmrc-empty NPM_CONFIG_GLOBALCONFIG=/home/ci/.npmrc-gempty \
  PI_NO_LOCAL_LLM=1 CI=true LD_PRELOAD=/opt/fixloop.so \
  bash -c "cd /home/ci/helm && npm run build --workspace=@adwmc/helm-coding-agent > /tmp/rebuild.log 2>&1"
echo "REBUILD=$?"
grep -c "HELM_KERNEL_BUILTIN" /home/ci/helm/packages/coding-agent/dist/bundle/cli.js || echo "HATCH_NOT_IN_BUNDLE"

# 4. relaunch detached
chown -R ci:ci "$S"
setsid nohup runuser -u ci -- env \
  PATH=/usr/local/bin:/usr/bin:/bin HOME=/home/ci TMPDIR=/tmp TMP=/tmp TEMP=/tmp \
  XDG_CONFIG_HOME=/home/ci/.config LANG=C TZ=UTC \
  NPM_CONFIG_USERCONFIG=/home/ci/.npmrc-empty NPM_CONFIG_GLOBALCONFIG=/home/ci/.npmrc-gempty \
  PI_NO_LOCAL_LLM=1 CI=true AWS_EC2_METADATA_DISABLED=true HELPI_QUIET=1 \
  LD_PRELOAD=/opt/fixloop.so FORK_ROOT=/home/ci/helm \
  GATE_MODEL=xiaomi/mimo-v2.6-flash LANES=4 \
  bash -c "cd $S && node run-dualarm.mjs > reports/runner.log 2>&1" \
  < /dev/null > /dev/null 2>&1 &
sleep 3
echo "RUNNER_PIDS=$(pgrep -f run-dualarm.mjs | tr '\n' ' ')"
echo "LAUNCHED3"
