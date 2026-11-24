"""Plot raw comparable replay measurements; never smooth or invent scores."""
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter
report=json.loads(Path('public/variant-2/replay-audit/results.json').read_text())
rows=report['generations']
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'axes.spines.top':False,'axes.spines.right':False})
fig,axes=plt.subplots(2,1,figsize=(12,7.6),sharex=True,layout='constrained')
fig.set_facecolor('#f7f5ec')
for ax,metric,title,color in zip(axes,['mean','maximum'],['Population average on the same eight maps','Highest chicken score on those eight maps'],['#37684b','#a36a28']):
 ax.set_facecolor('#fffdf5');ax.plot([r['generation'] for r in rows],[r[metric] for r in rows],color=color,linewidth=1.8)
 ax.set_title(title,loc='left',fontweight='bold',pad=10);ax.set_ylabel('Forward rows');ax.set_ylim(bottom=0);ax.set_xlim(1,150)
 ax.yaxis.set_major_formatter(FuncFormatter(lambda x,_:f'{x:,.0f}'));ax.grid(axis='y',color='#dce1d5')
 for generation in [1,5,50,85,100,150]:ax.scatter([generation],[rows[generation-1][metric]],color=color,s=20,zorder=4)
axes[1].set_xticks([1,25,50,75,100,125,150]);axes[1].set_xlabel('Display generation (authentic curated populations)')
fig.suptitle(f'Variant 2 · From first steps to the final flock\n150 saved populations ·8 identical maps ·{report["episodes"]:,} evaluation episodes',fontsize=15,fontweight='bold')
fig.supxlabel('Raw V4 replay scores;600-second limit. Separate experiments and transfers are preserved in source metadata. No new training.',fontsize=9,color='#647160')
fig.savefig('public/variant-2/replay-audit/progression.png',dpi=170,facecolor=fig.get_facecolor())
fig.savefig('public/variant-2/replay-audit/progression.pdf',facecolor=fig.get_facecolor())
fig.savefig('docs/media/variant-2-progression.png',dpi=170,facecolor=fig.get_facecolor())
