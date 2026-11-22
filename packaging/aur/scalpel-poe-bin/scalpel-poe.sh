#!/bin/sh
case ":${XDG_CURRENT_DESKTOP:-}:" in
    *:KDE:*)
        if [ -n "${WAYLAND_DISPLAY:-}" ]; then
            exec /opt/scalpel-poe/Scalpel.AppImage "$@"
        fi
        ;;
esac

export XDG_SESSION_TYPE=x11
exec /opt/scalpel-poe/Scalpel.AppImage --ozone-platform=x11 "$@"
