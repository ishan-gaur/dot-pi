# SLURM Environment

Cluster info and gotchas for SLURM job submission.

- General-purpose submit script: `~/slurm/run_python.sh` — supports `--uv` and `--conda <env>` modes
- Usage: `bash ~/slurm/run_python.sh --uv examples/trpb_linear_probe.py --device cuda`
- Output goes to `~/slurm/output/<job_name>.out` / `.err`
- Single node with 4x NVIDIA RTX 6000 Ada (49GB each), 128 CPUs, 500GB RAM, partition=long
- **`run_python.sh` path resolution** — `PROJECT_DIR` is derived from `dirname(script)/..`. When script is nested (e.g. `examples/finetune_esm3/script.py`), the PROJECT_DIR ends up as `examples/` not the repo root. Use absolute paths: `bash ~/slurm/run_python.sh --uv "$(pwd)/path/to/script.py"`
- **stdout buffering** — Python's stdout is block-buffered when redirected to SLURM log files. Add `sys.stdout.reconfigure(line_buffering=True)` at the start of `main()` to see output in real-time via `tail`.
