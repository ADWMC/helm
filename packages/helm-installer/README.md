# @adwmc/helm-installer

Thin shell for [helm](https://github.com/ADWMC/helm) (mimocode-style delivery):
the package itself is a few KB; `postinstall` downloads the platform payload
that matches this package's version from the GitHub release built by the
Build Binaries workflow, verifies it against `SHA256SUMS`, and installs it to
`~/.helm/bin` (Windows: `%USERPROFILE%\.helm\bin`). The `helm` bin resolves
that payload and execs it.

```sh
npm install -g @adwmc/helm-installer
helm --version
```

Without npm, use the one-line installers in the repository:

```sh
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/ADWMC/helm/main/install/install | bash
```

```powershell
# Windows PowerShell
irm https://raw.githubusercontent.com/ADWMC/helm/main/install/install.ps1 | iex
```

## Environment

| Variable | Meaning |
|----------|---------|
| `HELM_VERSION` | Pin a payload version (default: the installer package's own version) |
| `HELM_INSTALL_DIR` | Install directory (default `~/.helm/bin`) |
| `HELM_BIN_PATH` | Point the `helm` bin at a specific payload executable |
| `HELM_REPO` | Source repository for the latest-version lookup (default `ADWMC/helm`) |
| `HELM_RELEASE_BASE` | Release download base URL (default GitHub Releases) |
| `HELM_DRY_RUN` | `1` = print the plan without downloading |

If the download is skipped (air-gapped host, `--ignore-scripts`), the shell
still installs and `helm` prints how to fetch the payload; nothing else breaks.
