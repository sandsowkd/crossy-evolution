"""Count selected warm-start phase generations, not duplicate artifacts/search work."""
import json,pathlib,sys
root=pathlib.Path('results/variants/variant-1')
plan=json.loads((root/'closeout-plan.json').read_text())
source=sys.argv[1] if len(sys.argv)>1 else plan.get('selectedSource','results/experiments/frozen-development/restart-052')
read=lambda p:json.loads(pathlib.Path(p).read_text())
phases=[];visited=set()

def visit(directory, selected_generation=None, selected_genome=None):
 p=pathlib.Path(directory)
 if (p/'freeze.json').exists():
  f=read(p/'freeze.json');return visit(f['source'],selected_generation if selected_generation is not None else f['selectedGeneration'],selected_genome if selected_genome is not None else f['selectedGenome'])
 s=read(p/'selected.json');g=selected_generation if selected_generation is not None else s['generation'];key=(str(p),g)
 assert key not in visited;visited.add(key)
 if str(p)=='results/continued':
  phases.append({'phase':'binary original and continuation','source':str(p),'selectedGeneration':g,'note':'Cumulative native position; do not add initial300 again.'});return
 if str(p).startswith('results/experiments/wide-candidates/'):
  return visit(s['source'],g,selected_genome or s['genome']['id'])
 if (p/'ancestor-selected.json').exists():
  a=read(p/'ancestor-selected.json');summary=read(p/'training-summary.json');visit(summary['ancestry']['source'],a['generation'],a['genome']['id'])
 elif s.get('ancestry',{}).get('source'):
  a=s['ancestry'];visit(a['source'],a.get('selectedGeneration'),a.get('selectedGenome'))
 elif str(p)=='results/experiments/trajectory/warm-v3-100':
  a=read(p/'training-summary.json')['ancestry'];visit(a['source'],a['inheritedGeneration'],a['inheritedGenome'])
 elif (p/'provenance.json').exists():
  a=read(p/'provenance.json')
  if 'source' in a:return visit(a['source'],g,selected_genome)
  if 'archiveDirectory' in a:return visit(str(pathlib.Path(a['archiveDirectory']).parent),g,selected_genome)
  raise RuntimeError(f'Cannot reconstruct selected lineage from {p}')
 else:raise RuntimeError(f'Unknown ancestry for {p}')
 if g>0:phases.append({'source':str(p),'selectedGeneration':g,'selectedGenome':selected_genome or s['genome']['id']})

visit(source)
result={'status':'final' if plan.get('status') in ['model-frozen','assessment-complete-report-pending','complete'] else 'provisional-until-existing-final-runs-complete','selectedSource':source,'selectedModelLineageGenerations':sum(p['selectedGeneration']for p in phases),'phases':phases,'interpretation':'Selected phase positions along successive warm starts; NEAT crossover has a population ancestry graph. This is not the total parameter search, a single-parent mutation count, or the sum of duplicated/cumulative histories.'}
(root/'lineage.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
