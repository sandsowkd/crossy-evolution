import { sitePath } from "./site-path";
import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from "react";

export function HomeIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m3 10 9-7 9 7M6 8v13h5v-7h2v7h5V8" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="miter" /></svg>;
}

function SettingsIcon() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 3-.6 3-2 .9-2.7-1-2 3.5L4 11v2l-2.3 1.6 2 3.5 2.8-1 2 .9.5 3h4l.6-3 2-.9 2.7 1 2-3.5L18 13v-2l2.3-1.6-2-3.5-2.8 1-2-.9-.5-3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><circle cx="11" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" /></svg>;
}

/** Shared compact chrome for the finished replay and the original inspector. */
export function ReplayButtons({onSettings, onHelp, settingsOpen = false, helpOpen = false}: {
  onSettings: () => void; onHelp?: () => void; settingsOpen?: boolean; helpOpen?: boolean;
}) {
  const id = useId();
  return <div className="replay-menu-buttons">
    <span className="replay-action"><a href={sitePath()} aria-label="Back to Home" aria-describedby={`${id}-home`}><HomeIcon /></a><span id={`${id}-home`} role="tooltip">Back to Home</span></span>
    <span className="replay-action"><button type="button" aria-label="Replay settings" aria-describedby={`${id}-settings`} aria-haspopup="dialog" aria-expanded={settingsOpen} onClick={onSettings}><SettingsIcon /></button><span id={`${id}-settings`} role="tooltip">Replay settings</span></span>
    {onHelp && <span className="replay-action"><button type="button" aria-label="Replay help" aria-describedby={`${id}-help`} aria-haspopup="dialog" aria-expanded={helpOpen} onClick={onHelp}>?</button><span id={`${id}-help`} role="tooltip">Replay help</span></span>}
  </div>;
}

/** Only dismiss a real backdrop click, not empty space inside the dialog. */
export function closeOnBackdrop(event: MouseEvent<HTMLDialogElement>, onClose: () => void) {
  if (event.target !== event.currentTarget) return;
  const box = event.currentTarget.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
}

export function ReplayHelpDialog({title, children, onClose, closeLabel = "Close replay help", className = ""}: {title: string; children: ReactNode; onClose: () => void; closeLabel?: string; className?: string}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const element = dialog.current!;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    element.showModal();
    return () => { element.close(); if (trigger?.isConnected) trigger.focus({preventScroll: true}); };
  }, []);
  return <dialog ref={dialog} className={`replay-help-dialog ${className}`} aria-labelledby={id}
    onClick={event => closeOnBackdrop(event, onClose)} onCancel={event => {event.preventDefault(); onClose();}}>
    <div className="replay-help-heading"><h1 id={id}>{title}</h1><button type="button" aria-label={closeLabel} onClick={onClose}>×</button></div>
    <div className="replay-help-body">{children}</div>
  </dialog>;
}
