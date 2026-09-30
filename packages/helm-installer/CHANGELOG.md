# Changelog

## [Unreleased]

### Added

- Initial release: `@adwmc/helm-installer` thin shell. `postinstall` installs
  the platform payload (release asset + `SHA256SUMS` verification) into
  `~/.helmd/bin`, the `helm` bin execs it, and `lib/payload.mjs` carries the
  shared asset-mapping/verification logic used by the tests. One-line
  installers live in the repository `install/` directory.
