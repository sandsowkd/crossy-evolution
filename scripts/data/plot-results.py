"""Render result figures from the released map outcomes. No model evaluation."""
import csv,json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'axes.spines.top':False,'axes.spines.right':False,'axes.titleweight':'bold','figure.dpi':120})
out=Path('docs/results/figures');out.mkdir(parents=True,exist_ok=True)
green='#276749';orange='#ad632b';muted='#66716b'
def load(p):return json.loads(Path(p).read_text())
def finish(fig,name):
 fig.savefig(out/(name+'.png'),dpi=170,bbox_inches='tight',facecolor='white');fig.savefig(out/(name+'.pdf'),bbox_inches='tight',facecolor='white');plt.close(fig)
def ecdf(ax,values,label,color):
 x=np.sort(values);ax.step(x,np.arange(1,len(x)+1)/len(x),where='post',label=label,color=color,lw=2)
 ax.set(xlabel='Furthest row reached',ylabel='Share of maps');ax.set_ylim(0,1.02);ax.grid(alpha=.18);ax.legend(frameon=False,loc='lower right')
v1=load('results/variant-1/final/evaluation.json');final=[r['score'] for r in v1['episodes']['neat']];previous=[r['score'] for r in v1['episodes']['previousPublished']]
fig,axes=plt.subplots(1,2,figsize=(11,3.6),layout='constrained');ecdf(axes[0],previous,'Previous policy',orange);ecdf(axes[0],final,'Final policy',green);axes[0].set_title('Scores on 512 held-out maps',loc='left')
delta=np.array(final)-np.array(previous);axes[1].hist(delta,bins=30,color=green,alpha=.85);axes[1].axvline(0,color='#444',lw=1);axes[1].axvline(delta.mean(),color=orange,lw=2,label=f'Mean gain: {delta.mean():.2f}');axes[1].set(title='Paired change on the same maps',xlabel='Final score − previous score',ylabel='Maps');axes[1].legend(frameon=False);finish(fig,'variant-1-evaluation')
main=load('results/variant-2/final/main/evaluation.json');peak=load('results/variant-2/final/peak/evaluation.json')
a=[r['score'] for r in main['confirmationEpisodes']];b=[r['score'] for r in peak['episodes']]
fig,axes=plt.subplots(1,2,figsize=(11,3.6),layout='constrained');ecdf(axes[0],b,'Separate peak policy',orange);ecdf(axes[0],a,'Default final policy',green);axes[0].set_title('Scores on 256 development maps',loc='left')
labels=['car','water','train','eagle','bounds','timeout'];y=np.arange(len(labels));axes[1].barh(y-.18,[main['metrics']['deaths'].get(k,0) for k in labels],height=.34,color=green,label='Default');axes[1].barh(y+.18,[peak['metrics']['deaths'].get(k,0) for k in labels],height=.34,color=orange,label='Separate peak');axes[1].set_yticks(y,labels);axes[1].invert_yaxis();axes[1].set(xlabel='Maps',title='How each run ended');axes[1].legend(frameon=False);finish(fig,'variant-2-evaluation')
for variant in [1,2]:
 d=load(f'results/variant-{variant}/replays/results.json');rows=d.get('generations',d.get('results'))
 fig,axes=plt.subplots(2,1,figsize=(10,5.6),sharex=True,layout='constrained')
 for ax,metric,title,color in zip(axes,['mean','maximum'],['Population average','Highest individual score'],[green,orange]):
  ax.plot([r['generation'] for r in rows],[r[metric] for r in rows],lw=1.7,color=color);ax.set_title(title,loc='left');ax.set_ylabel('Forward rows');ax.set_ylim(bottom=0);ax.grid(axis='y',alpha=.18)
 axes[1].set(xlabel='Replay gallery index',xlim=(1,150));axes[1].set_xticks([1,25,50,75,100,125,150]);fig.suptitle(f'Variant {variant}: complete populations on the same eight maps',fontsize=13,fontweight='bold');finish(fig,f'variant-{variant}-replays')
 if variant==2:
  import shutil
  shutil.copy2(out/'variant-2-replays.png','public/variant-2/replay-audit/progression.png');shutil.copy2(out/'variant-2-replays.pdf','public/variant-2/replay-audit/progression.pdf');shutil.copy2(out/'variant-2-replays.png','docs/media/variant-2-progression.png')
last=load('results/variant-2/studies/continuation-416-448/comparison.json')['comparisons'];fields=['study','profile','family','initialPopulationMean','populationMean','populationMeanDelta','minimumPolicyMeanDelta']
with Path('results/variant-2/studies/final-batch.csv').open('w') as f:
 w=csv.DictWriter(f,fieldnames=fields,lineterminator="\n");w.writeheader();w.writerows({k:r[k] for k in fields} for r in last)
fig,ax=plt.subplots(figsize=(10,4.2),layout='constrained');names=['Exact','Weight 0','Weight 5','Weight 20','RNG AP','RNG AQ','RNG AR','RNG AS','Floor exact'];y=np.arange(9)
ax.barh(y-.18,[r['populationMeanDelta'] for r in last],height=.34,color=green,label='Population mean');ax.barh(y+.18,[r['minimumPolicyMeanDelta'] for r in last],height=.34,color=orange,label='Lowest policy mean');ax.set_yticks(y,names);ax.invert_yaxis();ax.axvline(0,color='#444',lw=1);ax.set(xlabel='Change in rows from the actual starting population',title='Variant 2: final 32-generation continuation batch');ax.legend(frameon=False,loc='lower left');ax.grid(axis='x',alpha=.16);finish(fig,'variant-2-final-batch')
print('Rendered five figures from released evaluations and replay measurements.')
