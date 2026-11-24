"""Audit bounded native trainers; never launch trainers or open final maps.

Run with a launch manifest containing an array of {run, pid} objects.
Audits are serialized so best-development publication cannot race.
"""
import argparse
import json
import os
import signal
from pathlib import Path
import subprocess
import sys
import time
from datetime import datetime, timezone


def write_json(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2))
    temporary.replace(path)


def now():
    return datetime.now(timezone.utc).isoformat()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--every", type=int, default=32)
    args = parser.parse_args()
    assert args.every >= 8 and args.every % 8 == 0
    manifest = json.loads(args.manifest.read_text())
    root = Path(manifest["workspace"])
    assert root.resolve() == Path.cwd().resolve()
    node = manifest["node"]
    status_path = args.manifest.parent / "monitor-status.json"
    lock = args.manifest.parent / "monitor.lock.json"
    if lock.exists():
        previous = json.loads(lock.read_text())
        try:
            os.kill(previous["pid"], 0)
        except ProcessLookupError:
            lock.unlink()
        else:
            raise RuntimeError("A monitor already owns this batch")
    descriptor = os.open(lock, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as stream:
        json.dump({"pid": os.getpid(), "startedAt": now()}, stream)
    try:
        while True:
            states = []
            for job in manifest["runs"]:
                run = job["run"]
                assert run.startswith("transfer-") and all(c.isalnum() or c == "-" for c in run)
                directory = Path(".archive/results/variant-2") / run
                protocol = json.loads((directory / "protocol.json").read_text())
                command = subprocess.run(["ps", "-p", str(job["pid"]), "-o", "command="],
                                         capture_output=True, text=True, check=False).stdout
                live = f"scripts/training/continue-variant-two.ts run --run={run}" in command
                head = json.loads((directory / "HEAD.json").read_text()) if (directory / "HEAD.json").exists() else None
                generation = head["generation"] if head else protocol["initialGeneration"]
                snapshot_path = directory / "snapshots" / f"{generation:05d}.json"
                migration_file = directory / "checkpoint-migration-request.json"
                checkpoint_limit = protocol.get("nativeCheckpointMaxCharacters", 128_000_000)
                checkpoint_guard = 100_000_000 if checkpoint_limit == 128_000_000 else int(checkpoint_limit * .78)
                if live and head and snapshot_path.stat().st_size >= checkpoint_guard and not migration_file.exists():
                    # Stop at a completed boundary with room under this protocol's native parser limit.
                    # A later versioned continuation can upgrade storage without losing a generation.
                    write_json(migration_file, {"requestedAt": now(), "generation": generation,
                                               "snapshotBytes": snapshot_path.stat().st_size,
                                               "reason": f"Migrate checkpoint storage before the {checkpoint_limit} character parser limit",
                                               "remainingPlannedGenerations": protocol["generationCap"] - generation,
                                               "preserveNativePopulationRngInnovationsAndSpecies": True})
                    os.kill(job["pid"], signal.SIGTERM)
                audit_files = list(directory.glob("candidate-audit-[0-9][0-9][0-9][0-9][0-9].json"))
                last_audited = max((int(file.stem.rsplit("-", 1)[1]) for file in audit_files),
                                   default=protocol["initialGeneration"])
                state = {"run": run, "pidAtLaunch": job["pid"], "processAlive": live,
                         "committedGeneration": generation, "generationCap": protocol["generationCap"],
                         "lastAuditedGeneration": last_audited}
                if migration_file.exists():
                    state["checkpointMigrationRequired"] = str(migration_file)
                if head and generation > last_audited and (generation - last_audited >= args.every or not live):
                    log = directory / "audit-monitor.log"
                    with log.open("a") as stream:
                        result = subprocess.run([node, "--import", "tsx", "scripts/evaluation/audit-variant-two-contenders.ts",
                                                 str(directory), "--publish"], stdout=stream, stderr=subprocess.STDOUT,
                                                check=False)
                    state["lastAuditExitCode"] = result.returncode
                    if result.returncode:
                        state["error"] = f"Candidate audit failed; see {log}"
                if not live:
                    native_status = json.loads((directory / "status.json").read_text()) if (directory / "status.json").exists() else {}
                    state["nativeStatus"] = native_status.get("status", "missing")
                    handoff_path = directory / "continuation-handoff.json"
                    handoff = json.loads(handoff_path.read_text()) if handoff_path.exists() else None
                    valid_handoff = bool(handoff and head and
                                         handoff.get("sourceCommittedGeneration") == generation and
                                         handoff.get("sourceSnapshotSha256") == head["snapshotSha256"] and
                                         handoff.get("nextRun", "").startswith("transfer-"))
                    if valid_handoff:
                        state["continuedAs"] = handoff["nextRun"]
                    if generation < protocol["generationCap"] and not migration_file.exists() and not valid_handoff:
                        state["error"] = "Trainer stopped before its budget; inspect before resuming"
                    elif not (directory / "verification.json").exists():
                        with (directory / "verify-monitor.log").open("a") as stream:
                            result = subprocess.run([node, "--import", "tsx", "scripts/training/continue-variant-two.ts", "verify",
                                                     f"--run={run}"], stdout=stream, stderr=subprocess.STDOUT, check=False)
                        state["verificationExitCode"] = result.returncode
                        if result.returncode:
                            state["error"] = "Checkpoint/population/replay verification failed"
                states.append(state)
            finished = all(not state["processAlive"] for state in states)
            status = "watching-native-trainers"
            if finished:
                status = "checkpoint-migration-required" if any(s.get("checkpointMigrationRequired") for s in states) else "finished-bounded-batch"
            write_json(status_path, {"updatedAt": now(), "status": status,
                                     "runs": states, "bestDevelopment": json.loads(Path(".archive/results/variant-2/best-development.json").read_text()),
                                     "finalMapsOpened": False})
            if finished:
                return 1 if any(state.get("error") for state in states) else 0
            time.sleep(30)
    finally:
        lock.unlink(missing_ok=True)


if __name__ == "__main__":
    sys.exit(main())
