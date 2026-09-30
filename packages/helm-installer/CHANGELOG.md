# Changelog

## [Unreleased]

### Added

- Initial release: `@adwmc/helm-installer` thin shell. `postinstall` installs
  the platform payload (release asset + `SHA256SUMS` verification) into
  `~/.helmd/bin`, the `helm` bin execs it, and `lib/payload.mjs` carries the
  shared asset-mapping/verification logic used by the tests. One-line
  installers live in the repository `install/` directory.
- Product skills shipped in the payload (`skills/*.md`) are installed into the
  user-level skills dir (`$HELM_CODING_AGENT_DIR` or `~/.helm/agent`)/`skills`,
  content-addressed so reruns only rewrite changed files. Disable with
  `HELM_INSTALL_SKILLS=0`.
