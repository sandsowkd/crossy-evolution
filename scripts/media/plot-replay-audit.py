"""Publication artifact from raw full-population replay evidence, with no smoothing."""
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter
report = json.loads(Path('public/replay-audit/results.json').read_text())
rows = report['generations']
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 10, 'axes.spines.top': False, 'axes.spines.right': False})
fig, axes = plt.subplots(2, 1, figsize=(12, 7.8), sharex=True, layout='constrained')
fig.set_facecolor('#f7f5ec')
for ax, metric, title, color in zip(axes, ['mean', 'maximum'], ['Population average across all eight maps', 'Best chicken score across all eight maps'], ['#37684b', '#a36a28']):
    ax.set_facecolor('#fffdf5')
    ax.plot([r['generation'] for r in rows], [r[metric] for r in rows], color=color, linewidth=1.7)
    ax.set_title(title, loc='left', fontweight='bold', pad=10)
    ax.set_ylabel('Forward rows')
    ax.yaxis.set_major_formatter(FuncFormatter(lambda x, _: f'{x:,.0f}'))
    ax.grid(axis='y', color='#dce1d5')
    ax.set_xlim(1, 150)
    ax.set_ylim(bottom=0)
    ax.axvspan(85, 86, color='#f3d66d', alpha=.28)
    ax.scatter([85,86], [rows[84][metric],rows[85][metric]], color=color, zorder=4)
axes[1].set_xlabel('Displayed generation (curated source populations)')
axes[1].set_xticks([1,25,50,75,85,100,125,150])
fig.suptitle(f'Crossy Evolution · Variant 1 replay audit\n150 generations · 8 identical seeded maps · {report["episodes"]:,} full chicken episodes', fontsize=15, fontweight='bold')
fig.supxlabel('Actual uncapped viewing-rule scores. Raw variance is retained. This is not a single continuous training history.', fontsize=9, color='#647160')
fig.savefig('public/replay-audit/progression.png', dpi=170, facecolor=fig.get_facecolor())
fig.savefig('public/replay-audit/progression.pdf', facecolor=fig.get_facecolor())
