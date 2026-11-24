"""Publish a frozen Variant 1 snapshot and a hash delta without replacing old data.

Run `python3 scripts/data/package-variant-one-final.py package`, then `verify`, then
`upload`, then `publish <final-commit-sha>`. Upload preserves a draft until the
explicit publish command. No training or
model selection occurs here. The old release and all source data stay intact.
"""
from __future__ import annotations

import csv
import datetime as dt
import gzip
import hashlib
import json
import pathlib
import shutil
import subprocess
import sys
import tarfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
TAG = "variant-1-final-2026-11-21"
REPO = "sandsowkd/crossy-evolution"
BASE_TAG = "training-snapshot-2026-11-21"
BASE = ROOT / ".publication" / BASE_TAG
OUT = ROOT / ".publication" / TAG
REPORT = ROOT / "results" / f"published-{TAG}"
FINAL = ROOT / "results/variant-1/final"
MAX_ASSET_BYTES = 1_500_000_000
MEDIA = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".mp4", ".mov", ".mp3", ".wav", ".m4a", ".ogg", ".obj", ".ttf", ".otf"}


def digest(path: pathlib.Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def dump(path: pathlib.Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n")


def gh(*args: str):
    return json.loads(subprocess.check_output(["gh", *args], text=True, cwd=ROOT))


def current_files() -> list[pathlib.Path]:
    files = []
    for directory in [ROOT / "results", ROOT / "public/training-cohorts"]:
        for path in sorted(directory.rglob("*")):
            if not path.is_file() or REPORT in path.parents or path.name.endswith(".tmp"):
                continue
            if path.is_symlink():
                raise RuntimeError(f"Unexpected symlink in training data: {path}")
            if path.suffix.lower() not in MEDIA:
                files.append(path)
    # Distribution metadata includes the curated highlight timeline as well as
    # the demo and complete native checkpoint; artwork lives outside this set.
    files.extend(path for path in sorted((ROOT / "public").glob("*.json")) if path.is_file())
    return sorted(files)


def record(path: pathlib.Path) -> dict:
    return {"path": path.relative_to(ROOT).as_posix(), "bytes": path.stat().st_size, "sha256": digest(path)}


def write_csv(path: pathlib.Path, rows: list[dict], fields: list[str]) -> None:
    with path.open("w", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def reports() -> dict:
    selected = json.loads((FINAL / "selected.json").read_text())
    checkpoint = json.loads((FINAL / "checkpoint.json").read_text())
    freeze = json.loads((FINAL / "freeze.json").read_text())
    evaluation = json.loads((FINAL / "evaluation.json").read_text())
    verification = json.loads((FINAL / "verification.json").read_text())
    summary = json.loads((FINAL / "training-summary.json").read_text())
    assert checkpoint["generation"] == selected["generation"] == 150
    assert selected["genome"]["id"] == 14920
    assert digest(FINAL / "checkpoint.json") == freeze["checkpointSha256"]
    assert checkpoint["config"]["simulation"].get("eagle") is None
    assert len(selected["episodes"]) == 768 and len(evaluation["episodes"]["neat"]) == 512
    archives = sorted((FINAL / "generations").glob("*.json.gz"))
    assert [p.name for p in archives] == [f"{i:05}.json.gz" for i in range(1, 151)]
    for path in archives:
        with gzip.open(path, "rt") as stream:
            population = json.load(stream)["contenders"]
        assert len(population) == 100 and len({g["id"] for g in population}) == 100
        if path.name == "00150.json.gz":
            assert any(g["id"] == 14920 for g in population)
    final_rows = [{"policy": policy, **episode} for policy, episodes in evaluation["episodes"].items() for episode in episodes]
    write_csv(REPORT / "final-map-outcomes.csv", final_rows, ["policy", "seed", "score", "ticks", "deathReason", "fitness"])
    write_csv(REPORT / "development-map-outcomes.csv", selected["episodes"], ["seed", "score", "ticks", "deathReason", "fitness"])
    write_csv(REPORT / "traffic-blind-map-outcomes.csv", verification["trafficPositionBlindEpisodes"], ["seed", "score", "ticks", "deathReason", "fitness"])
    write_csv(REPORT / "training-generations.csv", summary["history"], ["generation", "meanRow", "maxRow", "bestFitness", "meanFitness", "evalRow", "species", "nodes", "connections"])
    lineage = []
    cursor = FINAL
    visited = set()
    while cursor.exists() and cursor not in visited:
        visited.add(cursor)
        paths = {name: cursor / name for name in ["selected.json", "training-summary.json", "summary.json", "freeze.json", "provenance.json"]}
        metadata = {name: json.loads(path.read_text()) for name, path in paths.items() if path.exists()}
        selection = metadata.get("selected.json", {})
        training = metadata.get("training-summary.json", metadata.get("summary.json", {}))
        ancestry = selection.get("ancestry") or training.get("ancestry")
        provenance = metadata.get("provenance.json", {})
        if not ancestry and isinstance(provenance.get("source"), str):
            ancestry = {"source": provenance["source"], "edge": "frozen-copy provenance alias"}
        if not ancestry and isinstance(provenance.get("archiveDirectory"), str):
            archive_directory = pathlib.Path(provenance["archiveDirectory"])
            ancestry = {"source": archive_directory.parent.as_posix(), "edge": "frozen archive provenance alias",
                        "selectedGeneration": selection.get("generation"), "selectedGenome": selection.get("genome", {}).get("id")}
        lineage.append({"path": cursor.relative_to(ROOT).as_posix(), "selectedGenerationAtCapture": selection.get("generation"),
                        "selectedGenomeAtCapture": selection.get("genome", {}).get("id"), "ancestry": ancestry, "provenance": provenance,
                        "metadataFiles": [record(path) for path in paths.values() if path.exists()]})
        if not isinstance(ancestry, dict) or not ancestry.get("source"):
            break
        cursor = ROOT / ancestry["source"]
        assert cursor.is_relative_to(ROOT / "results")
    dump(REPORT / "lineage.json", {"chain": lineage,
        "accounting": "Ancestry edges preserve their recorded requested identities. Mutable source selections at capture can differ. Frozen copies and cumulative warm starts are not additional independent training; no grand total is inferred."})
    result = {"generation": 150, "genome": 14920, "population": 100, "fullPopulations": 150,
              "developmentMaps": 768, "developmentMean": selected["meanRow"],
              "finalSuite": evaluation["suite"], "finalMaps": 512, "finalSummary": evaluation["summary"]["neat"],
              "finalMeanBootstrap95": verification["meanBootstrap95"],
              "trafficBlindMean": verification["trafficPositionBlindMean"],
              "trainingEpisodesInThisBranch": summary["trainingEpisodes"],
              "validationEpisodesReportedByBranch": summary["validationEpisodes"],
              "rules": checkpoint["config"]["simulation"],
              "policySha256": freeze["policySha256"], "checkpointSha256": freeze["checkpointSha256"],
              "finalOutcomeRows": len(final_rows), "referenceArtworkIncluded": False,
              "note": "Frozen historical Variant 1 is roads-only and eagle-free. New eagle rules are a separate later configuration and do not reinterpret these outcomes."}
    dump(REPORT / "summary.json", result)
    return result


def package() -> None:
    OUT.mkdir(parents=True, exist_ok=False)
    REPORT.mkdir(parents=True, exist_ok=True)
    started = dt.datetime.now(dt.timezone.utc).isoformat()
    baseline, baseline_assets = {}, []
    remote = gh("api", f"repos/{REPO}/releases/tags/{BASE_TAG}")
    remote_assets = {a["name"]: a for a in remote["assets"]}
    for manifest in sorted(BASE.glob("*.manifest.json")):
        remote_asset = remote_assets[manifest.name]
        assert remote_asset["digest"] == "sha256:" + digest(manifest)
        baseline_assets.append({"name": manifest.name, "sha256": digest(manifest), "url": remote_asset["browser_download_url"]})
        for entry in json.loads(manifest.read_text()):
            previous = baseline.get(entry["path"])
            assert previous is None or previous == entry
            baseline[entry["path"]] = entry
    result = reports()
    files = current_files()
    initial_stats = {str(p): (p.stat().st_size, p.stat().st_mtime_ns) for p in files}
    print(f"Hashing {len(files)} current training files against {len(baseline)} published paths", flush=True)
    current = [record(path) for path in files]
    changes = [entry for entry in current if baseline.get(entry["path"]) != entry]
    final_prefix = FINAL.relative_to(ROOT).as_posix() + "/"
    full_final = [entry for entry in current if entry["path"].startswith(final_prefix)]
    delta = [entry for entry in changes if not entry["path"].startswith(final_prefix)]
    removed = sorted(set(baseline) - {entry["path"] for entry in current})
    dump(OUT / "current-training.manifest.json", current)
    dump(OUT / "baseline-manifests.json", {"release": remote["html_url"], "manifests": baseline_assets})
    dump(OUT / "removed-since-snapshot.json", {"paths": removed, "note": "Historical files absent at this capture remain preserved in the original release; restoration does not automatically delete them."})
    snapshot = OUT / "snapshot"
    for entry in full_final + delta:
        source, destination = ROOT / entry["path"], snapshot / entry["path"]
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
        assert digest(destination) == entry["sha256"]
    # Readable supplement tables are also restored alongside the native model.
    report_entries = []
    report_data_files = {"final-map-outcomes.csv", "development-map-outcomes.csv", "traffic-blind-map-outcomes.csv",
                         "training-generations.csv", "lineage.json", "summary.json"}
    for source in sorted(REPORT.iterdir()):
        if source.is_file() and source.name in report_data_files:
            entry = record(source)
            destination = snapshot / entry["path"]
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, destination)
            report_entries.append(entry)
    assert files == current_files(), "Training file set changed during capture"
    assert all(initial_stats[str(p)] == (p.stat().st_size, p.stat().st_mtime_ns) for p in files), "Training files changed during capture"
    inventory = {"tag": TAG, "capturedFrom": started, "capturedTo": dt.datetime.now(dt.timezone.utc).isoformat(),
                 "baselineRelease": remote["html_url"], "summary": result,
                 "currentEligibleFiles": len(current), "unchangedPublishedFiles": len(current) - len(changes),
                 "newOrChangedFiles": len(changes), "removedHistoricalPaths": len(removed),
                 "excluded": ["reference artwork", "local images/audio/video/fonts/models", "temporary files", "this report's self-referential inventory"],
                 "archives": []}
    for label, entries in [("variant-1-final", full_final + report_entries), ("post-snapshot-delta", delta)]:
        dump(OUT / f"{label}.manifest.json", entries)
        archive = OUT / f"{label}.tar.gz"
        with tarfile.open(archive, "w:gz", compresslevel=1) as stream:
            for entry in entries:
                stream.add(snapshot / entry["path"], arcname=entry["path"], recursive=False)
        assets = [archive]
        if archive.stat().st_size > MAX_ASSET_BYTES:
            assets = []
            with archive.open("rb") as stream:
                index = 1
                while data := stream.read(MAX_ASSET_BYTES):
                    part = OUT / f"{archive.name}.part-{index:03}"
                    part.write_bytes(data)
                    assets.append(part)
                    index += 1
            archive.unlink()
        inventory["archives"].append({"group": label, "files": len(entries), "uncompressedBytes": sum(e["bytes"] for e in entries),
            "assets": [{"file": p.name, "bytes": p.stat().st_size, "sha256": digest(p)} for p in assets]})
        print(f"Packaged {label}: {len(entries)} files; {sum(p.stat().st_size for p in assets):,} compressed bytes", flush=True)
    dump(OUT / "inventory.json", inventory)
    dump(REPORT / "inventory.json", inventory)
    notes = f"""# Variant 1 final data — November 21, 2026

Frozen generation 150, genome 14920: development mean {result['developmentMean']:.8f} on 768 maps; independent FB closing-test mean {result['finalSummary']['meanRow']:.8f}, median {result['finalSummary']['medianRow']}, and {result['finalSummary']['atLeast1000']:.1%} scores >=1000 over 512 maps at 600 seconds. This historical model is roads-only and eagle-free. New eagle rules are a later configuration.

`variant-1-final.tar.gz` contains the exact native checkpoint, all 150 complete populations of 100 actual genomes, selected weights, freeze/evaluation/replay verification, lineage metadata and CSV tables ({result['finalOutcomeRows']} final policy/map outcomes, 768 selected development outcomes, and 512 traffic-blind diagnostic outcomes). No further training or model selection occurred during packaging. Native checkpoint SHA256: `{result['checkpointSha256']}`.

`post-snapshot-delta` contains every eligible new or changed training-data file relative to the per-file manifests of [the original dated snapshot]({remote['html_url']}). Unchanged historical files stay in that original release. Full final and delta archives have no overlapping paths. Together with the original snapshot, they preserve this final capture; `current-training.manifest.json` gives every captured eligible file's SHA256. Historical paths absent now are listed separately and are not deleted automatically. Repeated frozen copies, inherited states and cumulative histories must not be summed as independent training.

## Restore safely

Download assets into a separate directory. Run `shasum -a256 -c SHA256SUMS`. If an archive has numeric `.part-001` files, concatenate its parts in numeric order before extraction. Restore the original snapshot first if you want the complete historical data, then extract this supplement into that fresh clone with `tar -xzf variant-1-final.tar.gz -C /path/to/clone` and `tar -xzf post-snapshot-delta.tar.gz -C /path/to/clone`. The full-final archive also works independently for the final native state and its 150 populations. Do not extract into a working training directory; changed paths intentionally supersede dated versions.

The isolated `public/training-cohorts/variant-1/final/` gallery and distribution checkpoint are included in the delta. The frozen source checkpoint keeps its original bytes; viewer copies may use namespace and content-hash references. To resume natively, import `results/variant-1/final/checkpoint.json` into the compatible application or use `Trainer.restore(parseCheckpoint(...))`. Exact continuation state and sensor/training parameters are preserved.

No upstream art, screenshots, local media, fonts or meshes are included. `npm ci && npm run setup:assets && npm run dev` installs the compatible code's dependencies and fetches hash-verified original assets locally. This data release grants no additional third-party artwork rights.
"""
    (OUT / "RELEASE_NOTES.md").write_text(notes)
    (REPORT / "RESTORE.md").write_text(notes)
    with (OUT / "SHA256SUMS").open("w") as stream:
        for path in sorted(OUT.iterdir()):
            if path.is_file() and path.name != "SHA256SUMS":
                stream.write(f"{digest(path)}  {path.name}\n")
    print(f"Package complete: {OUT}", flush=True)


def verify() -> None:
    inventory = json.loads((OUT / "inventory.json").read_text())
    for line in (OUT / "SHA256SUMS").read_text().splitlines():
        expected, name = line.split("  ", 1)
        assert digest(OUT / name) == expected, name
    checked = 0
    for group in inventory["archives"]:
        assets = [OUT / a["file"] for a in group["assets"]]
        if len(assets) == 1 and assets[0].name.endswith(".tar.gz"):
            archive = assets[0]
        else:
            archive = OUT / f"{group['group']}.verify.tar.gz"
            with archive.open("wb") as destination:
                for part in assets:
                    with part.open("rb") as source:
                        shutil.copyfileobj(source, destination)
        expected = {entry["path"]: entry for entry in json.loads((OUT / f"{group['group']}.manifest.json").read_text())}
        seen = set()
        with tarfile.open(archive, "r:gz") as stream:
            for member in stream:
                assert member.isfile() and member.name in expected and member.name not in seen
                entry = expected[member.name]
                assert member.size == entry["bytes"]
                with stream.extractfile(member) as source:
                    assert hashlib.file_digest(source, "sha256").hexdigest() == entry["sha256"], member.name
                seen.add(member.name)
        assert seen == set(expected)
        checked += len(seen)
        if archive.name.endswith(".verify.tar.gz"):
            archive.unlink()
    dump(REPORT / "archive-verification.json", {"filesVerifiedInsideArchives": checked, "archiveAssetChecksumsMatch": True,
        "allPerFileSHA256Match": True, "verifiedAt": dt.datetime.now(dt.timezone.utc).isoformat()})
    print(f"Verified asset checksums and all {checked} archived files byte for byte", flush=True)


def verify_remote(release: dict) -> list[dict]:
    local = {p.name: p for p in OUT.iterdir() if p.is_file()}
    assert set(local) == {a["name"] for a in release["assets"]}
    for asset in release["assets"]:
        path = local[asset["name"]]
        assert asset["state"] == "uploaded" and asset["size"] == path.stat().st_size
        assert asset["digest"] == "sha256:" + digest(path), asset["name"]
    return [{"name": a["name"], "bytes": a["size"], "sha256": a["digest"], "url": a["browser_download_url"]} for a in release["assets"]]


def upload() -> None:
    verify()
    subprocess.run(["gh", "auth", "status"], cwd=ROOT, check=True)
    existing = subprocess.run(["gh", "release", "view", TAG, "--repo", REPO, "--json", "tagName"], cwd=ROOT, capture_output=True)
    if existing.returncode == 0:
        raise RuntimeError("New release already exists; refusing to overwrite or replace any asset")
    target = gh("api", f"repos/{REPO}/commits/main")["sha"]
    assets = [str(p) for p in sorted(OUT.iterdir()) if p.is_file()]
    subprocess.run(["gh", "release", "create", TAG, "--repo", REPO, "--target", target,
                    "--title", "Variant 1 final — full native state and post-snapshot data",
                    "--notes-file", str(OUT / "RELEASE_NOTES.md"), "--draft"], cwd=ROOT, check=True)
    subprocess.run(["gh", "release", "upload", TAG, "--repo", REPO, *assets], cwd=ROOT, check=True)
    release = next(r for r in gh("api", f"repos/{REPO}/releases?per_page=100") if r["tag_name"] == TAG)
    verification = {"release": release["html_url"], "releaseId": release["id"], "targetCommit": target,
        "draft": True, "remoteAssetDigestsMatch": True, "assets": verify_remote(release),
        "verifiedAt": dt.datetime.now(dt.timezone.utc).isoformat()}
    assert release["draft"]
    dump(REPORT / "draft-upload-verification.json", verification)
    print("Draft uploaded and verified; awaiting final code commit before publication", flush=True)


def publish() -> None:
    target = sys.argv[2] if len(sys.argv) > 2 else gh("api", f"repos/{REPO}/commits/main")["sha"]
    assert len(target) == 40 and all(c in "0123456789abcdef" for c in target)
    release = next(r for r in gh("api", f"repos/{REPO}/releases?per_page=100") if r["tag_name"] == TAG)
    assert release["draft"], "Refusing to edit an already published release"
    verify_remote(release)
    # Draft tags normally do not exist yet. Never silently move an existing tag.
    ref = subprocess.run(["gh", "api", f"repos/{REPO}/git/ref/tags/{TAG}"], cwd=ROOT, text=True, capture_output=True)
    if ref.returncode == 0:
        assert json.loads(ref.stdout)["object"]["sha"] == target, "Existing new tag points elsewhere; explicit review required"
    subprocess.run(["gh", "release", "edit", TAG, "--repo", REPO, "--target", target], cwd=ROOT, check=True)
    subprocess.run(["gh", "release", "edit", TAG, "--repo", REPO, "--draft=false", "--latest=false"], cwd=ROOT, check=True)
    release = gh("api", f"repos/{REPO}/releases/tags/{TAG}")
    assert not release["draft"]
    assert release["target_commitish"] == target
    assert gh("api", f"repos/{REPO}/git/ref/tags/{TAG}")["object"]["sha"] == target
    verification = {"release": release["html_url"], "releaseId": release["id"], "targetCommit": target,
        "remoteAssetDigestsMatch": True, "assets": verify_remote(release),
        "verifiedAt": dt.datetime.now(dt.timezone.utc).isoformat()}
    dump(REPORT / "remote-verification.json", verification)
    dump(OUT.parent / f"{TAG}-remote-verification.json", verification)
    print(release["html_url"], flush=True)


if __name__ == "__main__":
    command = sys.argv[1] if len(sys.argv) > 1 else "package"
    {"package": package, "verify": verify, "upload": upload, "publish": publish}[command]()
