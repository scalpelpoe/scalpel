#!/bin/sh
export XDG_SESSION_TYPE=x11
# The flag below is a default, not a user choice: Scalpel's display mode
# setting may relaunch with a different Ozone platform.
export SCALPEL_MANAGED_OZONE=1
exec /opt/scalpel-poe/Scalpel.AppImage --ozone-platform=x11 "$@"
