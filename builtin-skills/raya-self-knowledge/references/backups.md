# Raya Backup, Restore, and Uninstall

## Commands

- `raya backup --setup`: choose GitHub or Local and save the target without creating a backup immediately.
- First unconfigured `raya backup`: run setup, ask for a backup name, then create it.
- Configured `raya backup`: ask for a name and create a backup in the configured mode.
- `raya backup --local <name>`: configure Local mode and create that named backup without the name prompt.
- `raya backup --github <repository>`: configure and verify a GitHub repository, then ask for the backup name unless `--name` is supplied.
- `raya backup --list` and typo-compatible `raya bakcup --list`: print separate GitHub and Local sections with backup name, Raya version, creation date, and restore command.
- `raya backup --restore [name-or-reference]`: always ask `GitHub` or `Local`, even when a reference was supplied, then require the exact word `RESTORE`.
- `raya uninstall`: require the exact word `UNINSTALL`, remove the package, launchers, `RAYA_HOME`, and local backup root. `--keep-backups` preserves the local backup root. Remote repositories are never deleted.

## Local Layout

Every new local backup is exactly one direct child of the backup root:

```text
~/raya-backups/
├── before-upgrade/
│   ├── .raya/
│   ├── src/
│   ├── builtin-skills/
│   ├── package.json
│   ├── manifest.json
│   └── raya-package.tgz
└── after-upgrade/
    ├── .raya/
    ├── src/
    ├── builtin-skills/
    ├── package.json
    ├── manifest.json
    └── raya-package.tgz
```

The source tree keeps its natural folders, but there is no extra date directory, `snapshot`, `snapshots`, `backups`, `raya-source`, `raya-home`, or `.git` wrapper around it. The backup name becomes the folder name after safe path normalization. A duplicate folder name fails instead of replacing an existing backup. If creation fails, Raya removes the incomplete named folder.

Local backups include the complete `.raya` state, including `.env` and `auth.json`, so the backup root must remain private.

## GitHub Layout and Lifetime

GitHub mode does not create or retain a repository under `~/raya-backups`. Create, list, and restore each clone the configured repository into a temporary system directory and remove that checkout in a `finally` cleanup path, including when an operation fails.

Raya changes only `.raya-backup` in the remote repository. The remote snapshot contains `raya-source`, `raya-home`, `manifest.json`, and `raya-package.tgz`. `.env` and `auth.json` are excluded, but sessions, memory, configuration, and personality files can still be personal, so the repository should be private.

GitHub versions are remote Git commits. Listing reads their manifests from remote history; restore checks out the selected commit temporarily and never turns it into a persistent local backup.

## Configuration

The typed `backup` object in `~/.raya/config.json` stores the active mode, display name, setup time, and either the local backup root or sanitized repository URL. `RAYA_BACKUP_TARGET` in owner-only `~/.raya/.env` mirrors the exact target. Updates must merge with the existing config and preserve unknown fields.

## Restore and Compatibility

`--restore` always asks for the source first. It then resolves the supplied name/reference within that source, asks for `RESTORE`, installs `raya-package.tgz`, and restores state. GitHub restores preserve existing local credentials because remote snapshots intentionally omit them.

New local backups use only the flat named-folder layout. Discovery and restore remain compatible with older `snapshots/<id>` layouts and the earlier local-Git history format; compatibility must not be used when creating new backups.
