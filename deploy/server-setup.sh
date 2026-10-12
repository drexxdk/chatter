#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu machine for the production stack (made for Oracle's Ubuntu 24.04 images, ARM or x86).
# Safe to run again. Run it as a user with sudo, with the public key of the deploy user in the environment:
#   scp deploy/server-setup.sh ubuntu@HOST:/tmp/ && ssh ubuntu@HOST "DEPLOY_PUBLIC_KEY='ssh-ed25519 AAAA... deploy' sudo -E bash /tmp/server-setup.sh"
# What it does: updates the system and turns on automatic security updates, installs Docker, makes a `deploy` user that
# may only log in with that key and run Docker (the deploy workflow uses it), makes /opt/chatter, adds a swap file,
# opens ports 80 and 443 in the machine's own firewall, and switches off password and root logins over SSH.
# It cannot open the ports in the cloud provider's network rules (Oracle: the subnet's security list); do that in the console.
set -euo pipefail

: "${DEPLOY_PUBLIC_KEY:?set DEPLOY_PUBLIC_KEY to the public key the deploy workflow logs in with}"
[ "$(id -u)" -eq 0 ] || { echo "Run as root (sudo -E bash $0)." >&2; exit 1; }

export DEBIAN_FRONTEND=noninteractive

echo "== System updates"
apt-get update -y
apt-get upgrade -y
apt-get install -y ca-certificates curl unattended-upgrades iptables-persistent rclone
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "== Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

echo "== deploy user"
if ! id deploy >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" deploy
fi
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
grep -qxF "$DEPLOY_PUBLIC_KEY" /home/deploy/.ssh/authorized_keys 2>/dev/null \
  || echo "$DEPLOY_PUBLIC_KEY" >>/home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

echo "== /opt/chatter"
install -d -m 755 -o deploy -g deploy /opt/chatter
install -d -m 700 -o deploy -g deploy /opt/chatter/deploy

echo "== Swap file"
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi

echo "== Firewall (ports 80 and 443)"
# Oracle's images end the INPUT chain with a REJECT after allowing only SSH, so the new rules go in before it.
reject_line="$(iptables -L INPUT --line-numbers -n | awk '$2 == "REJECT" { print $1; exit }')"
for rule in "tcp --dport 80" "tcp --dport 443" "udp --dport 443"; do
  # shellcheck disable=SC2086
  if ! iptables -C INPUT -p $rule -j ACCEPT 2>/dev/null; then
    # shellcheck disable=SC2086
    iptables -I INPUT "${reject_line:-1}" -p $rule -j ACCEPT
  fi
done
netfilter-persistent save

echo "== SSH: keys only, no root"
cat >/etc/ssh/sshd_config.d/99-chatter.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
EOF
sshd -t
systemctl reload ssh

echo "== Done"
docker --version
docker compose version
