import { useEffect, useRef } from 'react';

// The street's parts each take their own share of E (and of window.__swarmStreet): the truck, the tree, the bus, the
// lunch crowd. Street.tsx hands every op to the part that registered its name ('lunch:id:60' goes to 'lunch' with
// 'id:60'), and gathers the parts' reports for the probe. Like roof/roofOps.ts.

const ops = new Map<string, (arg: string) => void>();
const reports = new Map<string, () => unknown>();

/** Takes the op `name` while mounted (the latest `fn`, so it may close over render state). */
export function useStreetOp(name: string, fn: (arg: string) => void) {
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => {
    const run = (arg: string) => latest.current(arg);
    ops.set(name, run);
    return () => {
      if (ops.get(name) === run) ops.delete(name);
    };
  }, [name]);
}

/** Adds `name` to the probe's report while mounted. */
export function useStreetReport(name: string, fn: () => unknown) {
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => {
    const run = () => latest.current();
    reports.set(name, run);
    return () => {
      if (reports.get(name) === run) reports.delete(name);
    };
  }, [name]);
}

/** Runs 'name' or 'name:arg'. */
export function runStreetOp(op: string) {
  const i = op.indexOf(':');
  ops.get(i < 0 ? op : op.slice(0, i))?.(i < 0 ? '' : op.slice(i + 1));
}

export const streetReport = (): Record<string, unknown> => Object.fromEntries([...reports].map(([k, f]) => [k, f()]));
