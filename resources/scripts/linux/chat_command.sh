#!/bin/bash

if [ "$XDG_SESSION_TYPE" == "wayland" ]; then
    CLIP_PASTE="wl-paste -n"
    CLIP_COPY="wl-copy"
else
    CLIP_PASTE="xclip -selection clipboard -o"
    CLIP_COPY="xclip -selection clipboard"
fi

# Sauvegarde
OLD_CLIPBOARD=$($CLIP_PASTE 2>/dev/null)

# Focus
TARGET_WINDOW=$(xdotool search --name "Path of Exile" | head -n 1 2>/dev/null)
if [ -n "$TARGET_WINDOW" ]; then
    xdotool windowactivate "$TARGET_WINDOW"
    sleep 0.3 # Plus de temps pour que le focus soit effectif
fi

for cmd in "$@"
do
    # On vide peut-être le presse-papier avant (optionnel mais aide parfois)
    echo -n "$cmd" | $CLIP_COPY

    # Laisse un micro-délai pour que le compositeur enregistre la copie
    sleep 0.1

    # Enter + Ctrl+V + Enter
    # On augmente un peu le -d (delay) pour être sûr que le jeu capte le Ctrl+V
    ydotool key -d 40 28:1 28:0 29:1 47:1 47:0 29:0 28:1 28:0

    # IMPORTANT: Délai pour laisser au jeu le temps de lire le clipboard avant d'enchaîner
    sleep 0.3
done

# Restauration finale (attend que tout soit bien fini)
sleep 0.5
if [ -n "$OLD_CLIPBOARD" ]; then
    echo -n "$OLD_CLIPBOARD" | $CLIP_COPY
fi
