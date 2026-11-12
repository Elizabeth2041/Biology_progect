#!/usr/bin/env bash
# Выкладывает сайт на https://dano.media (сервер dnevnik.club, Caddy в контейнере gia-caddy-1).
# Caddy раздаёт папку как статику, поэтому перезапускать ничего не нужно.
set -euo pipefail
cd "$(dirname "$0")"

KEY="${DEPLOY_KEY:-$HOME/Восстановлено/.ssh/id_ed25519}"
HOST="deploy@dnevnik.club"
DEST=/var/lib/docker/volumes/gia_django_media/_data/dano
FILES=(index.html css js data img)

tar czf - "${FILES[@]}" | ssh -i "$KEY" -o IdentitiesOnly=yes "$HOST" "set -e
T=\$(mktemp -d); tar xzf - -C \$T
sudo find $DEST -mindepth 1 -delete
sudo cp -r \$T/. $DEST/ && rm -rf \$T
sudo chown -R root:root $DEST
sudo find $DEST -type d -exec chmod 755 {} +
sudo find $DEST -type f -exec chmod 644 {} +
echo \"Выложено: \$(sudo du -sh $DEST | cut -f1)\""

echo "Готово: https://dano.media/"
