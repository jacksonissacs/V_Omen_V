/** Highest migration in `db/migrations`. The PostgreSQL adapter refuses older schemas. */
export const EXPECTED_SCHEMA_VERSION = 5

export const MIGRATIONS_TABLE = "omen_schema_migrations"
export const IDENTITY_TABLE = "omen_database_identity"

/** Environments this tooling may write to. There is deliberately no production value. */
export const DATABASE_ENVIRONMENTS = ["development", "test", "demo"] as const
export type DatabaseEnvironment = (typeof DATABASE_ENVIRONMENTS)[number]
