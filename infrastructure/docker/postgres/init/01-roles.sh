#!/bin/sh
# Creates the runtime roles used by the platform. The superuser created by the
# image (POSTGRES_USER) owns the schema and runs migrations; runtime services
# never connect as it.
#   mp_app     - API request path. Subject to row-level security.
#   mp_service - workers and auth lookups. BYPASSRLS; queries filter by tenant explicitly.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOSQL
CREATE ROLE mp_app LOGIN PASSWORD '${MP_APP_PASSWORD}' NOSUPERUSER NOBYPASSRLS;
CREATE ROLE mp_service LOGIN PASSWORD '${MP_SERVICE_PASSWORD}' NOSUPERUSER BYPASSRLS;
CREATE DATABASE mail_platform_test OWNER "$POSTGRES_USER";
EOSQL
