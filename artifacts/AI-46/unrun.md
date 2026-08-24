# AI-46 unrun checks

- Remote project evidence: the intended new project ref is not visible to the current Supabase CLI account, so no remote link, migration, or query was attempted.
- Pooler prepared-statement prohibition: local transaction pooler requires a tenant identifier but allowed the tested `PREPARE/EXECUTE` sequence; this required gate is not satisfied.
- Production/staging observation and backup/restore are not run.
