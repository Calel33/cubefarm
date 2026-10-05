// The server room's own log lines for the wall CRT (LogCrt.tsx): sessions starting, ending and failing as the racks
// see them, and the power meter's changes. System lines only: names, floors and states, never a terminal's text.

export interface RoomLogLine {
  at: number;
  text: string;
  tone: 'good' | 'bad' | 'info';
}

const KEEP = 40;
const lines: RoomLogLine[] = [];
const listeners = new Set<() => void>();

export function logRoom(text: string, tone: RoomLogLine['tone'] = 'info', at = Date.now()) {
  lines.push({ at, text, tone });
  if (lines.length > KEEP) lines.splice(0, lines.length - KEEP);
  for (const fn of listeners) fn();
}

export const roomLog = (): readonly RoomLogLine[] => lines;

export function onRoomLog(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** The room was left: its log starts afresh next time. */
export function clearRoomLog() {
  lines.length = 0;
}
