"""Launch prepared, bounded native runs once and attach one auditing monitor."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys


def now():
    return datetime.now(timezone.utc).isoformat()


def immutable_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x") as stream:
        json.dump(value, stream, indent=2)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("runs", nargs="+")
    args = parser.parse_args()
    assert not args.manifest.exists(), "Use a new launch manifest"
    assert len(args.runs) == len(set(args.runs)), "Duplicate run ID"
    workspace = Path.cwd().resolve()
    node = shutil.which("node")
    assert node
    files = sorted([*Path("src/core").glob("*.ts"), *Path("src/evolution").glob("*.ts"),
                    Path("scripts/continue-variant-two.ts")])
    code_hash = hashlib.sha256("\n".join(
        f"{path.as_posix()}:{hashlib.sha256(path.read_bytes()).hexdigest()}" for path in files).encode()).hexdigest()
    processes = subprocess.run(["ps", "-axo", "pid=,command="], capture_output=True, text=True, check=True).stdout
    for run in args.runs:
        assert run.startswith("transfer-") and all(c.isalnum() or c == "-" for c in run)
        directory = Path("results/variants/variant-2") / run
        protocol = json.loads((directory / "protocol.json").read_text())
        assert protocol["codeSha256"] == code_hash, f"Source version changed: {run}"
        assert not (directory / "HEAD.json").exists(), f"Run already initialized: {run}"
        assert not (directory / "trainer.lock.json").exists(), f"Run already locked: {run}"
        assert f"scripts/continue-variant-two.ts run --run={run}" not in processes, f"Already running: {run}"
        source = Path(protocol["parent"]["snapshotFile"])
        assert hashlib.sha256(source.read_bytes()).hexdigest() == protocol["parent"]["snapshotSha256"]
        assert protocol["generationCap"] > protocol["initialGeneration"]
    manifest = {"workspace": str(workspace), "node": node, "startedAt": now(), "runs": [], "finalMapsOpened": False}
    launched = []
    try:
        for run in args.runs:
            directory = Path("results/variants/variant-2") / run
            command = [node, "--import", "tsx", "scripts/continue-variant-two.ts", "run", f"--run={run}"]
            with (directory / "training.log").open("ab", buffering=0) as stream:
                process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=stream,
                                           stderr=subprocess.STDOUT, cwd=workspace, start_new_session=True)
            launched.append(process)
            manifest["runs"].append({"run": run, "pid": process.pid, "startedAt": now(), "command": command})
        immutable_json(args.manifest, manifest)
        with (args.manifest.parent / "monitor.log").open("ab", buffering=0) as stream:
            monitor = subprocess.Popen([sys.executable, "scripts/watch-variant-two-training.py", str(args.manifest)],
                                       stdin=subprocess.DEVNULL, stdout=stream, stderr=subprocess.STDOUT,
                                       cwd=workspace, start_new_session=True)
        immutable_json(args.manifest.parent / "monitor-process.json", {"pid": monitor.pid, "startedAt": now()})
    except Exception:
        for process in launched:
            if process.poll() is None:
                process.terminate()
        raise
    print(json.dumps({"manifest": str(args.manifest), "monitorPid": monitor.pid,
                      "runs": [{"run": job["run"], "pid": job["pid"]} for job in manifest["runs"]]}))


if __name__ == "__main__":
    main()
