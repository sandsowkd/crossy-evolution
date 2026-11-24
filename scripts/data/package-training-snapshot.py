"""Package an already captured snapshot, splitting release assets below1.5GB."""
import csv,hashlib,json,pathlib,sys,tarfile
out=pathlib.Path(sys.argv[1]);snap=out/'snapshot';report=pathlib.Path('results/published-2026-11-21')
started,finished=sys.argv[2:4]
rows=list(csv.DictReader((report/'training-runs.csv').open()))
inventory=dict(captureStarted=started,captureFinished=finished,reportRuns=len(rows),generationRows=sum(1 for _ in (report/'generations.csv').open())-1,verifiedFinalMean=1261.072265625,strongestProtectedDevelopment={'path':'.archive/results/variant-1/experiments/frozen-development/lookahead-memory-g100','meanRows':1363.3411458333333,'generation':100,'population':100,'trainingMaps':32,'newBranchTrainingEpisodes':320000},accounting='No grand total: inherited search, cumulative continuations, frozen copies and interrupted work have separate accounting. Each average run has a coherent checkpoint/selection/summary. The overall snapshot has a capture interval. Extra uncheckpointed populations remain raw evidence.',referenceArtworkIncluded=False,finalSuite='F9 historical; FA unopened, frozen development threshold1450',archives=[])
for source,label in [(snap/'.archive/results/variant-1/experiments/average','average-runs'),(snap/'.archive/results/variant-1/experiments','other-experiments'),(snap/'results','historical-and-verified'),(snap/'public/training-cohorts','population-galleries')]:
 archive=out/f'{label}.tar.gz'
 files=[p for p in sorted(source.rglob('*')) if p.is_file() and not(label=='other-experiments' and 'average' in p.relative_to(source).parts[:1]) and not(label=='historical-and-verified' and 'experiments' in p.relative_to(source).parts[:1])]
 manifest=[{'path':str(p.relative_to(snap)),'bytes':p.stat().st_size,'sha256':hashlib.file_digest(p.open('rb'),'sha256').hexdigest()}for p in files]
 if not archive.exists():
  with tarfile.open(archive,'w:gz',compresslevel=1) as tar:
   for p in files:tar.add(p,arcname=str(p.relative_to(snap)),recursive=False)
 (out/f'{label}.manifest.json').write_text(json.dumps(manifest,separators=(',',':'))+'\n')
 assets=[]
 if archive.stat().st_size>1_500_000_000:
  with archive.open('rb') as source_file:
   index=1
   while True:
    data=source_file.read(1_500_000_000)
    if not data:break
    part=out/f'{label}.tar.gz.part-{index:03d}';part.write_bytes(data);assets.append(part);index+=1
  archive.unlink()
 else:assets=[archive]
 entry={'group':label,'files':len(files),'assets':[{'file':p.name,'bytes':p.stat().st_size,'sha256':hashlib.file_digest(p.open('rb'),'sha256').hexdigest()}for p in assets]}
 inventory['archives'].append(entry);print('Ready',entry,flush=True)
(report/'inventory.json').write_text(json.dumps(inventory,indent=2)+'\n');(out/'inventory.json').write_text(json.dumps(inventory,indent=2)+'\n')
with (out/'SHA256SUMS').open('w') as f:
 for p in sorted(out.iterdir()):
  if p.is_file() and p.name!='SHA256SUMS':f.write(f'{hashlib.file_digest(p.open("rb"),"sha256").hexdigest()}  {p.name}\n')
print('Packaging complete',flush=True)
