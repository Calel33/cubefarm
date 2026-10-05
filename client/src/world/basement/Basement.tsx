import { useEffect, useMemo, useRef, useState } from 'react';
import { useRenderPaused } from '../../perf';
import { useStore } from '../../store';
import { Elevator } from '../Elevator';
import { basementPlan, mountBasement } from './basementState';
import { Keeper } from './Keeper';
import { LogCrt } from './LogCrt';
import { machineReport, setMachinesQuiet, startMachines, stopMachines, type MachineSource } from './machineSfx';
import { PowerWall } from './PowerWall';
import { Racks, type RackReport } from './Racks';
import { room } from './roomClock';
import { clearRoomLog } from './roomLog';
import { RoomLights } from './RoomLights';
import { Room } from './Room';

// The basement server room, the elevator's B stop (layout.ts has its numbers and colliders): a rack for every agent's
// session in rows by floor (and a small one per preview server), the terminal keeper with a cable to every live CLI,
// Claude's usage as the power meter on the west wall, the office log on a wall CRT, and the machines' hum. Its code is
// fetched as the elevator heads down and it's mounted only while you're here, so the floors above never pay for it.

export default function Basement() {
  // the plan is worked out again on every agents' change, but the room only rebuilds when a rack comes, goes or moves
  const key = useStore((s) => basementPlan(s).key);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plan = useMemo(() => basementPlan(), [key]);
  const [clis, setClis] = useState(0);
  const source = useRef<MachineSource | null>(null);
  const racks = useRef<(() => RackReport) | null>(null);

  // the machines hum while you're here, and hush behind a panel, the phone or a ride in the elevator
  const paused = useRenderPaused();
  const away = useStore((s) => s.travel !== null || s.overlay !== null);
  useEffect(() => {
    const live: MachineSource = {
      count: () => source.current?.count() ?? 0,
      spot: (i) => source.current!.spot(i),
      power: (i) => source.current?.power(i) ?? 0,
      audible: (i) => source.current?.audible(i) ?? false,
    };
    startMachines(live);
    return () => {
      stopMachines();
      clearRoomLog();
    };
  }, []);
  useEffect(() => setMachinesQuiet(paused || away), [paused, away]);

  useEffect(
    () =>
      mountBasement(() => {
        const r = racks.current?.();
        return { racks: r?.racks ?? {}, keeper: { liveClis: r?.liveClis ?? 0 }, lcdPaints: r?.lcdPaints ?? 0, lights: { level: Math.round(room.level * 100) / 100, emergency: Math.round(room.emergency * 100) / 100 }, sound: machineReport() };
      }),
    [],
  );

  return (
    <group>
      <Room rows={plan.rows} />
      <Elevator floorLabel="▼ B · Server room" accent="#4ea8ff" />
      <RoomLights />
      <Racks plan={plan} source={source} report={racks} onClis={setClis} />
      <Keeper clis={clis} />
      <PowerWall />
      <LogCrt />
    </group>
  );
}
