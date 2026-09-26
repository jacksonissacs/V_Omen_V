FROM node:22-bookworm-slim

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates \
    chromium \
    git \
    postgresql \
    postgresql-contrib \
    sudo \
  && rm -rf /var/lib/apt/lists/* \
  && echo 'ubuntu ALL=(ALL) NOPASSWD: /usr/sbin/service postgresql start, /usr/sbin/service postgresql stop, /usr/sbin/service postgresql restart' \
    > /etc/sudoers.d/ubuntu-postgres \
  && chmod 440 /etc/sudoers.d/ubuntu-postgres

# One-time cluster bootstrap matching Application CI credentials (local/test only).
RUN PG_CONF="$(find /etc/postgresql -name pg_hba.conf | head -1)" \
  && service postgresql start \
  && su postgres -c "psql -v ON_ERROR_STOP=1 -tc \"SELECT 1 FROM pg_roles WHERE rolname = 'omen_test'\" | grep -q 1 \
    || psql -v ON_ERROR_STOP=1 -c \"CREATE ROLE omen_test LOGIN PASSWORD 'local_ci_only' CREATEDB;\"" \
  && printf '%s\n' "host all all 127.0.0.1/32 scram-sha-256" "host all all ::1/128 scram-sha-256" >> "$PG_CONF" \
  && service postgresql restart \
  && service postgresql stop

USER ubuntu
WORKDIR /workspace
