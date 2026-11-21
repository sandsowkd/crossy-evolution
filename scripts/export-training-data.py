"""Capture native data without interrupting trainers; prepare GitHub Release downloads."""
import csv, datetime, hashlib, json, os, pathlib, shutil, tarfile, time
ROOT = pathlib.Path.cwd()
OUT = ROOT / '.publication/training-snapshot-2026-11-21'
SNAP = OUT / 'snapshot'
REPORT = ROOT / 'results/published-2026-11-21'
OUT.mkdir(parents=True, exist_ok=True)
SNAP.mkdir(exist_ok=False)
REPORT.mkdir(exist_ok=True)
started = datetime.datetime.now(datetime.timezone.utc).isoformat()

def copy(source, destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    if source.suffix == '.gz': os.link(source, destination)
    else: shutil.copyfile(source, destination)

for directory in ['results', 'public/training-cohorts']:
    for source in sorted((ROOT / directory).rglob('*')):
        if not source.is_file() or source.name.endswith('.tmp') or REPORT in source.parents: continue
        copy(source, SNAP / source.relative_to(ROOT))
# Recapture coherent metadata and any newly completed populations for active runs.
for source in sorted((ROOT / 'results/experiments/average').iterdir()):
    names = ['checkpoint.json', 'selected.json', 'training-summary.json']
    if not all((source / name).exists() for name in names): continue
    for attempt in range(12):
        blobs = {name: (source / name).read_bytes() for name in names}
        if not all((source / name).read_bytes() == blob for name, blob in blobs.items()): continue
        cp, selected, summary = [json.loads(blobs[name]) for name in names]
        if summary['generations'] != cp['generation'] or selected['generation'] > cp['generation']:
            time.sleep(.1)
            continue
        for name, blob in blobs.items(): (SNAP / source.relative_to(ROOT) / name).write_bytes(blob)
        for record in cp['history']:
            if record.get('cohortFile'):
                archive = source / 'generations' / pathlib.Path(record['cohortFile']).name
                target = SNAP / archive.relative_to(ROOT)
                if not target.exists(): copy(archive, target)
        break
    else: raise RuntimeError(f'Cannot capture coherent native state: {source.name}')
finished = datetime.datetime.now(datetime.timezone.utc).isoformat()
print('Snapshot captured', started, finished, flush=True)
rows, generations = [], []
for source in sorted((SNAP / 'results').rglob('training-summary.json')):
    relative = source.relative_to(SNAP)
    if any(p in ['frozen','releases','frozen-development','previews','freeze-verification','final-guard-verification','unused-overrun'] or p.startswith('completed-') or p == 'objective-comparison-50' or 'ancestor' in p for p in relative.parts): continue
    data = json.loads(source.read_text())
    config = data.get('config', {})
    if not config and (source.parent / 'checkpoint.json').exists(): config = json.loads((source.parent / 'checkpoint.json').read_text()).get('config', {})
    history = data.get('history', [])
    selected = json.loads((source.parent / 'selected.json').read_text()) if (source.parent / 'selected.json').exists() else {}
    rows.append(dict(run=str(relative.parent), generations=data.get('generations',data.get('generation',len(history))),population=config.get('population',data.get('population','')),maps_per_chicken=config.get('trainingSeeds',data.get('trainingSeeds','')),reported_training_episodes=data.get('trainingEpisodes',''),selected_generation=selected.get('generation',data.get('selectedGeneration','')),selected_mean_rows=selected.get('meanRow',data.get('selectedMeanRow','')),horizon_ticks=config.get('simulation',{}).get('maxTicks',''),observation_version=config.get('observationVersion',''),ancestry=json.dumps(data.get('ancestry',selected.get('ancestry',{})),separators=(',',':'))))
    for h in history:
        generations.append(dict(run=str(relative.parent),generation=h['generation'],population_mean_rows=h.get('meanRow',''),best_fitness=h.get('bestFitness',''),monitor_rows=h.get('evalRow',''),species=h.get('species',''),hidden_nodes=h.get('nodes',''),enabled_connections=h.get('connections','')))
for name, data in [('training-runs.csv', rows),('generations.csv', generations)]:
    with (REPORT / name).open('w', newline='') as f:
        writer=csv.DictWriter(f, fieldnames=list(data[0])); writer.writeheader(); writer.writerows(data)
eval_data=json.loads((SNAP/'results/frozen/further-1335-restart038/evaluation.json').read_text())
with (REPORT/'final-map-outcomes.csv').open('w',newline='') as f:
    writer=csv.writer(f);writer.writerow(['policy','seed','score','ticks','death_reason','fitness'])
    for policy, episodes in eval_data['episodes'].items():
        for e in episodes:writer.writerow([policy,e['seed'],e['score'],e['ticks'],e['deathReason'],e['fitness']])
restarts=json.loads((SNAP/'results/experiments/wide-restarts/summary.json').read_text())
(REPORT/'restart-rounds.json').write_text(json.dumps(restarts,indent=2)+'\n')
inventory=dict(captureStarted=started,captureFinished=finished,reportRuns=len(rows),generationRows=len(generations),verifiedFinalMean=eval_data['summary']['neat']['meanRow'],strongestProtectedDevelopment={'path':'results/experiments/frozen-development/lookahead-memory-g100','meanRows':1363.3411458333333,'generation':100,'population':100,'trainingMaps':32,'newBranchTrainingEpisodes':320000},accounting='Rows describe saved branch checkpoints and reported episode positions. Inherited search, cumulative continuations, frozen copies and interrupted compute must not be added indiscriminately; no grand total is claimed. Each average run has coherent checkpoint/selection/summary metadata. This is a capture interval, not one globally simultaneous snapshot. Extra uncheckpointed populations remain raw evidence.',referenceArtworkIncluded=False,finalSuite='F9 historical; FA unopened and reserved until frozen development mean >=1450',archives=[])
import subprocess,sys
subprocess.run([sys.executable,'scripts/package-training-snapshot.py',str(OUT),started,finished],check=True)
print('Export complete',len(rows),'run summaries',len(generations),'generation rows',flush=True)
