#!/usr/bin/env bash
# W3-T06 dual-arm: stop stale runner, archive run1 logs, launch detached corrected run.
set -u
S=/home/ci/helm/docs/tests/poxian-corpus
pkill -f run-dualarm.mjs 2>/dev/null
sleep 2
cd "$S"
mkdir -p logs-run1 reports
mv logs/*.txt logs-run1/ 2>/dev/null
mv logs/*.START logs-run1/ 2>/dev/null
rm -f reports/runner-crash.txt reports/dual-arm-stats.json
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
echo "ARCHIVED=$(ls logs-run1/*.txt 2>/dev/null | wc -l)"
echo "FRESH_STARTS=$(ls logs/*.START 2>/dev/null | wc -l)"
echo "LAUNCHED"
