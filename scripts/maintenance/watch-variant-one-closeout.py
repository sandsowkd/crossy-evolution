"""Wait for the explicitly bounded final training, then freeze/assess; never trains."""
import datetime,json,pathlib,subprocess,time
root=pathlib.Path('results/variants/variant-1')
for attempt in range(960):
 lines=subprocess.check_output(['ps','-axo','pid=,command='],text=True).splitlines()
 active=[line for line in lines if len(line.split(None,1))==2 and line.split(None,1)[1].split()[0].endswith('/node') and ' --require ' in line and any(x in line for x in ['scripts/train-','scripts/training/resume-restart.ts','scripts/evaluation/audit-contenders.ts'])]
 if not active:
  print(datetime.datetime.now(datetime.timezone.utc).isoformat(),'All native training/audits exited; starting guarded closure.',flush=True)
  subprocess.run(['npx','tsx','scripts/training/close-variant-one.ts'],check=True)
  print('ASSESSMENT COMPLETE. Concise final report, data supplement and automation shutdown pending.',flush=True)
  break
 if attempt%20==0:print(datetime.datetime.now(datetime.timezone.utc).isoformat(),len(active),'authorized native jobs still finishing',flush=True)
 time.sleep(15)
else:raise RuntimeError('Final batch did not exit within four hours; inspect actual processes before any recovery.')
