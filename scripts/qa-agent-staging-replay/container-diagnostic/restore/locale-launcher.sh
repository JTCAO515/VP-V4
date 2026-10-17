#!/bin/sh
# Exact base-image locale archive; preserve argv and exec the original binary.
export LOCALE_ARCHIVE=/nix/var/nix/profiles/default/lib/locale/locale-archive
case "${0##*/}" in
  initdb) exec /nix/var/nix/profiles/default/bin/initdb "$@" ;;
  postgres) exec /nix/var/nix/profiles/default/bin/postgres "$@" ;;
  *) exit 64 ;;
esac
