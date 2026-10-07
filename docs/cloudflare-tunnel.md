# Remote access with a Cloudflare tunnel

A Cloudflare **Quick Tunnel** gives your local office a temporary public HTTPS address
(`https://<name>.trycloudflare.com`) so you can reach it from another device. The tunnel runs on the
office's PC and connects *out* to Cloudflare; the office itself keeps listening on `127.0.0.1` only.

A Quick Tunnel is **unauthenticated by default**. cubefarm's helper always requires an email allow
list, so visitors must sign in with a one-time PIN before anything reaches the office. This requires
`cloudflared` **2026.9.3 or newer**, the release that added `--allowed-mail`.

Two npm aliases do the work. Both run the same cross-platform Node helper
(`scripts/cloudflare-tunnel.mjs`), so the commands are identical on Windows, macOS and Linux:

| Mode | Command | Tunnels |
| --- | --- | --- |
| Development | `npm run tunnel:dev` | Vite on `127.0.0.1:5317` (default) |
| Production | `npm run tunnel:prod` | the Node server on `127.0.0.1:4317` (default) |

The helper **does not start the office**. Start the app in the mode you want, then start the tunnel.

## What you need

- `cloudflared` 2026.9.3+ on your `PATH` (below).
- The app already running — dev or production (below).
- `SWARM_TUNNEL_ALLOWED_EMAILS` set to the address(es) you'll sign in with.

## Install or upgrade cloudflared

Check what you have:

```sh
cloudflared --version
```

You want `2026.9.3` or newer — the helper refuses to start below it.

**Windows.** cloudflared does **not** auto-update, so install or upgrade explicitly. With winget:

```powershell
winget install -e --id Cloudflare.cloudflared
winget upgrade -e --id Cloudflare.cloudflared
```

Without winget, download `cloudflared-windows-amd64.exe` (or the `.msi`) from the
[cloudflared releases page](https://github.com/cloudflare/cloudflared/releases/latest), rename it to
`cloudflared.exe` and put it on your `PATH`.

**macOS / Linux.** Download the current binary from the
[cloudflared releases page](https://github.com/cloudflare/cloudflared/releases/latest) (or
`brew install cloudflared` on macOS) and put it on your `PATH`. The helper also finds a `cloudflared`
binary in a local `cloudflared/` folder next to the repo.

## How the email gate works

With `--allowed-mail`, Cloudflare puts a sign-in page in front of the tunnel at
`login.trycloudflare.com`: a visitor enters an allowed email, receives a one-time PIN by email, and
only then reaches the office. Sessions last up to about four hours, and the allow list lives inside
the `cloudflared` process — so **restarting the tunnel is how you change who can get in**. No
Cloudflare account or domain is needed. The helper prints the allow-list *count* (never the
addresses), so you can confirm the gate is on.

## Development

`npm run dev` starts two things: Vite on `SWARM_CLIENT_PORT` (default **5317**) and the Node
API/WebSocket server on `SWARM_PORT` (default **4317**), with Vite proxying `/api` and `/ws` to the
Node server internally. **Only Vite is tunneled** — the proxy keeps API and WebSocket traffic on
loopback, and Vite accepts the tunnel hostname through a narrow `allowedHosts` entry.

1. Start the app and leave it running:

   ```sh
   npm run dev
   ```

2. In another terminal, allow your email(s) and start the tunnel:

   ```sh
   # PowerShell
   $env:SWARM_TUNNEL_ALLOWED_EMAILS = 'you@example.com,teammate@example.com'
   # macOS / Linux shells
   export SWARM_TUNNEL_ALLOWED_EMAILS='you@example.com,teammate@example.com'

   npm run tunnel:dev
   ```

3. Open the printed `https://<name>.trycloudflare.com` URL and sign in with an allowed email; the
   one-time PIN takes you to the office.

For a quick look with fake data, `npm run demo` starts the same dev stack with fake GitHub and fake
agents — useful for trying the tunnel without touching a real office.

## Production

`npm run build` typechecks, builds the client to `dist/` and the server to `dist-server/`. `npm start`
runs the Node server, which serves the built client from `dist/` **and** the API/WebSockets, all on
`SWARM_PORT` (default **4317**) — one origin, so only that port is tunneled.

1. Build, then start the app and leave it running:

   ```sh
   npm run build
   npm start
   ```

2. In another terminal:

   ```sh
   # PowerShell
   $env:SWARM_TUNNEL_ALLOWED_EMAILS = 'you@example.com,teammate@example.com'
   # macOS / Linux shells
   export SWARM_TUNNEL_ALLOWED_EMAILS='you@example.com,teammate@example.com'

   npm run tunnel:prod
   ```

Dev tunnels the live Vite server (HMR); production tunnels the built app. Both keep the office on
loopback.

## The environment variable

| Variable | Required | What it does |
| --- | --- | --- |
| `SWARM_TUNNEL_ALLOWED_EMAILS` | Yes | Comma-separated email addresses allowed through the tunnel. Empty or unset → the helper refuses to start. |
| `SWARM_CLIENT_PORT` | No | Port Vite listens on in dev (default `5317`). |
| `SWARM_PORT` | No | Port the Node server listens on (default `4317`). |

Set it in the terminal you run the helper from, as shown above. Nothing is written to disk, and the
helper never prints the addresses.

## The URL is temporary

A Quick Tunnel address **changes every time you start the tunnel** — there is no stable bookmark.
Copy the fresh URL each time (and update the office's **Office address for links** if you use it). It
only works while `cloudflared` runs. Quick Tunnels are for testing and development: no uptime
guarantee, up to 200 in-flight requests (more get HTTP 429), and no server-sent events.

## Stopping the tunnel

Press **Ctrl+C** in the tunnel window. The helper stops `cloudflared` and prints `Tunnel stopped.`
The office keeps running — stop it separately when you're done.

## Safety: never expose the real office without the email gate

The office listens on `127.0.0.1` only, on purpose: it can start agents that run commands on your PC.
A tunnel is only as safe as the sign-in in front of it.

- **Reachability is not authentication.** A Quick Tunnel URL is reachable by anyone who has it; the
  `--allowed-mail` one-time PIN is the only thing between a stranger and your office. The helper always
  passes it and refuses to run with an empty allow list.
- **If your installed `cloudflared` cannot enforce `--allowed-mail`** (older than 2026.9.3), the
  helper stops rather than starting an unprotected tunnel. Upgrade, or — if you must test now — tunnel
  only a **disposable demo office** (`npm run demo`, fake GitHub and fake agents), never a real one.
- Use an address you control and can receive mail at. Share the URL only with the people on the allow
  list.

## Firewall

The tunnel needs outbound QUIC/UDP on port **7844** to Cloudflare. If a firewall or antivirus blocks
`cloudflared` outbound, the tunnel won't establish (its startup log reports quic connectivity).

## Troubleshooting

| Symptom | Meaning | Fix |
| --- | --- | --- |
| `cloudflared was not found on PATH or in ./cloudflared.` | The helper can't find the binary. | Install it (above), then reopen your terminal so `PATH` refreshes. |
| `cloudflared <x.y.z> is too old; --allowed-mail needs >= 2026.9.3.` | The installed version predates the email gate. | Upgrade (winget on Windows: `winget upgrade -e --id Cloudflare.cloudflared`), or download the current release. |
| `SWARM_TUNNEL_ALLOWED_EMAILS is empty.` | No allow list set. | Set it, then retry. PowerShell: `$env:SWARM_TUNNEL_ALLOWED_EMAILS = 'you@example.com'`; macOS/Linux: `export SWARM_TUNNEL_ALLOWED_EMAILS='you@example.com'`. |
| `WARNING: nothing is listening on 127.0.0.1:<port> yet.` | The app isn't running, or is on another port. | Start the app for that mode first; check `SWARM_CLIENT_PORT` / `SWARM_PORT`. |

## Later: a stable address with a named tunnel and Access

Quick Tunnels are deliberately temporary. For a fixed hostname and a dashboard-managed policy, move
to a **Named Tunnel** with **Cloudflare Access**: you'll need a Cloudflare account and a domain, a
tunnel route pointing at `http://localhost:4317`, and an Access application with an **Allow → Emails**
policy (or a One-time PIN identity provider). The policy then lives in your account, survives
restarts and supports identity-provider groups — unlike a Quick Tunnel, whose allow list is
per-process.

## Note on development HMR over the tunnel

Remote HMR through the tunnel has not been verified in a real browser yet. If a remote browser shows
Vite's "Direct websocket connection fallback" error, add the minimal `server.ws` block to
`vite.config.ts` (for example `ws: { clientPort: 5317 }`, keeping `strictPort: true`). Normal local
HMR is unaffected.
