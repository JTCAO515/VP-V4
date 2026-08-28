# AI-48 synthetic quota-exhaustion trace

With a fixture limit of two per-user attempts and one per-user/per-task attempt, the first task is
admitted, its immediate replay returns `BUDGET_EXHAUSTED`, a second task is admitted, and a third task
returns `BUDGET_EXHAUSTED`. These are in-process test fixtures, not production quota values.
