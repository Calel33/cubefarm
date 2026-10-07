// Types for cloudflareTunnelSteps.mjs (plain JavaScript, so the tunnel helper runs without a build or tsx).

export const MINIMUM_VERSION: string;
export function parseTunnelArgs(argv: string[]): { mode: 'dev' | 'prod' | null; help: boolean };
export function parseVersion(text: string | null | undefined): [number, number, number] | null;
export function isVersionAtLeast(installed: [number, number, number], minimum: [number, number, number]): boolean;
export function parseAllowedEmails(raw: string | null | undefined): string[];
export function originPort(mode: 'dev' | 'prod', env?: Record<string, string | undefined>): number;
export function prerequisite(mode: 'dev' | 'prod', port: number): string;
export function tunnelArgs(origin: string, emails: string[]): string[];
