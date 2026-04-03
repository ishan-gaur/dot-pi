# Ray on Clusters

- **Ray `/tmp` disk space**: Ray defaults to `/tmp/ray/` for session data, object spilling, and logs. On shared cluster nodes, `/tmp` fills up quickly for large jobs (e.g., 1000-environment parallel evals). Fix: `export RAY_TMPDIR=/path/to/shared/storage/tmp/ray` before launching. Symptom: `OSError: [Errno 28] No space left on device` partway through the job, no output saved.
