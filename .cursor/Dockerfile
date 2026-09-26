FROM node:22-bookworm-slim

# System packages and PostgreSQL 16 from PGDG (Application CI uses postgres:16; not Debian 15).
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
    sudo \
  && install -d /usr/share/postgresql-common/pgdg \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    | gpg --dearmor -o /usr/share/keyrings/postgresql-pgdg.gpg \
  && echo "deb [signed-by=/usr/share/keyrings/postgresql-pgdg.gpg] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    chromium \
    git \
    postgresql-16 \
    postgresql-client-16 \
  && rm -rf /var/lib/apt/lists/*

# Bootstrap disposable test role (local CI parity only; not production credentials).
RUN PG_CONF="/etc/postgresql/16/main/pg_hba.conf" \
  && service postgresql start \
  && su postgres -c "psql -v ON_ERROR_STOP=1 -tc \"SELECT 1 FROM pg_roles WHERE rolname = 'omen_test'\" | grep -q 1 \
    || psql -v ON_ERROR_STOP=1 -c \"CREATE ROLE omen_test LOGIN PASSWORD 'local_ci_only' CREATEDB;\"" \
  && printf '%s\n' "host all all 127.0.0.1/32 scram-sha-256" "host all all ::1/128 scram-sha-256" >> "$PG_CONF" \
  && service postgresql restart \
  && service postgresql stop

RUN printf '%s\n' \
  '# OMEN Cloud Agent test-only env (matches .cursor/scripts/cloud-agent-env.sh)' \
  'export OMEN_TEST_DATABASE_ADMIN_URL="${OMEN_TEST_DATABASE_ADMIN_URL:-postgresql://omen_test:local_ci_only@127.0.0.1:5432/postgres}"' \
  'export PGPASSWORD="${PGPASSWORD:-local_ci_only}"' \
  'export CHROME_PATH="${CHROME_PATH:-/usr/bin/chromium}"' \
  > /etc/profile.d/omen-cloud-agent-env.sh \
  && chmod 644 /etc/profile.d/omen-cloud-agent-env.sh

# Cloud Agent runtime user (environment.json user=ubuntu). node:22-bookworm-slim ships `node` at uid 1000.
RUN if id -u node >/dev/null 2>&1; then \
      usermod -l ubuntu -d /home/ubuntu -m node \
      && usermod -s /bin/bash ubuntu \
      && (groupmod -n ubuntu node 2>/dev/null || usermod -g ubuntu ubuntu); \
    elif ! id -u ubuntu >/dev/null 2>&1; then \
      groupadd --gid 1000 ubuntu \
      && useradd --uid 1000 --gid ubuntu --create-home --shell /bin/bash ubuntu; \
    fi \
  && mkdir -p /workspace \
  && chown ubuntu:ubuntu /workspace \
  && echo 'ubuntu ALL=(ALL) NOPASSWD: /usr/sbin/service postgresql start, /usr/sbin/service postgresql stop, /usr/sbin/service postgresql restart, /usr/bin/pg_ctlcluster 16 main start, /usr/bin/pg_ctlcluster 16 main stop, /usr/bin/pg_ctlcluster 16 main restart' \
    > /etc/sudoers.d/ubuntu-postgres \
  && chmod 440 /etc/sudoers.d/ubuntu-postgres

USER ubuntu
WORKDIR /workspace
