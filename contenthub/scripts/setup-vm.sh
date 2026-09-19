#!/usr/bin/env bash
# Einmalige Grundeinrichtung der Hub-VM (Ubuntu LTS), als root ausführen:
#   curl -fsSL <raw-url>/scripts/setup-vm.sh | bash -s -- <deploy-benutzer> "<ssh-public-key>"
set -euo pipefail
NUTZER="${1:?Deploy-Benutzer}"; KEY="${2:?SSH-Public-Key}"
export DEBIAN_FRONTEND=noninteractive
apt-get update && apt-get -y upgrade
apt-get -y install ca-certificates curl gnupg ufw unattended-upgrades fail2ban rsync
# Docker (offizielles Repo)
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt-get update && apt-get -y install docker-ce docker-ce-cli containerd.io docker-compose-plugin
# Deploy-Benutzer
id -u "$NUTZER" >/dev/null 2>&1 || useradd -m -s /bin/bash -G docker "$NUTZER"
install -d -m 700 -o "$NUTZER" -g "$NUTZER" "/home/$NUTZER/.ssh"
echo "$KEY" > "/home/$NUTZER/.ssh/authorized_keys"; chown "$NUTZER:$NUTZER" "/home/$NUTZER/.ssh/authorized_keys"; chmod 600 "/home/$NUTZER/.ssh/authorized_keys"
# SSH härten
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/; s/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh
# Firewall (zusätzlich zur Hetzner Cloud Firewall)
ufw default deny incoming; ufw default allow outgoing
ufw allow 22/tcp; ufw allow 80/tcp; ufw allow 443/tcp; ufw allow 443/udp
ufw --force enable
dpkg-reconfigure -f noninteractive unattended-upgrades
timedatectl set-timezone Europe/Berlin
# Swap 2 GB (Sicherheitsnetz)
if [ ! -f /swapfile ]; then fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab; fi
# Zielordner
install -d -o "$NUTZER" -g "$NUTZER" /opt/contenthub
echo "Fertig. Weiter: als $NUTZER  →  cd /opt/contenthub && (git clone … . | ./deploy.sh) && cp .env.example .env"
