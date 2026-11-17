# Local controller connection

The static app reaches an existing Node bridge on port 8788. The bridge already
listens on all local IPv4 interfaces. Wi-Fi band selection does not require a
second server or a separate device protocol.

`shared/local-control-v1.js` is shared by the home nebula and the local-control entry pages.
It checks only these known destinations, concurrently:

- `5damideMac-mini.local:8788` (Mac's configured local hostname)
- `192.168.1.136:8788` (verified Mac Wi-Fi address on 2026-11-04)
- `192.168.1.105:8788` (previous address)

Discovery uses only `GET /api/ping`, requires HTTP success and the exact payload
`ok: true, service: "lw5-local-control"`, and expires after 3.5 seconds, including
response body parsing. It does not scan the subnet or call device/status APIs.
Cancellation settles the operation and invalidates late results. A recent
navigation attempt in localStorage is no longer treated as proof of connectivity.
The service marker identifies the expected application; it is not authentication.

If browser mixed-content or local-network policy prevents discovery, native
top-level links remain available. Direct entry defaults to the verified `.136`
address; connection help also provides the hostname and previous address. A
6-second handoff timer restores retry feedback while this page remains loaded.
It cannot override a browser-owned navigation/error screen. Back/foreground and
network events invalidate old state, and returning home never auto-redirects back.
Help links cancel pending automatic navigation; hidden pages cannot auto-handoff.

Boundaries: mDNS was not resolvable from the inspected Mac during diagnosis.
Its availability from the phone is unverified. The two IP fallbacks are known
addresses, not a guarantee for arbitrary future DHCP addresses. Separate/guest
networks, AP isolation and unavailable multicast/DNS cannot be repaired by this
frontend. No router, proxy, firewall, CORS, listening scope or bridge changes are
part of this patch. No public tunnel is created. Device commands are not replayed.

The home screen's `中控静音` entry opens `smart-home/panel-mute.html`, which uses
the same discovery and direct-navigation fallbacks for `/panel-mute`. Discovering
the bridge does not establish the panel's connectivity or mute state. The entry
page always leaves device state unknown and never sends a mute command; the
local page must check device support and read actual state before offering control.

The small bulb directly above the supplements button opens a modal and discovers
the bridge only after a real user click. The home page sends no lighting API
request. It navigates in the same window to `/lights-on#start=<requestId>` using
the discovered origin, or the existing direct-navigation fallback when HTTPS
blocks discovery. The ID is `<13-digit timestamp>-<crypto.randomUUID()>`, is
created only by that click, and is fresh for 60 seconds. All manual fallback
links preserve the same ID. Expired links are disabled; starting again requires
closing the modal and clicking the bulb. Closing, Escape, backgrounding before
handoff, or going offline cancels pending discovery/navigation. Page load,
reload, and returning from browser history never create an attempt or navigate.
The local page continues the real per-light progress, with server-side task
deduplication; finding the bridge is never presented as successful lighting.

The connection modal and local progress page share the `lights-on-universe.js`
Canvas renderer and its CSS. It animates a gold accretion disk, nine confirmed-light
nodes, localized impact waves and a sun only after the job succeeds. The renderer
never fetches or sends commands; counts and completion come from job snapshots.
Reduced-motion mode renders a static scene; hidden or closed scenes stop animation.
The local bridge embeds copies of these two assets so the LAN page works without
loading scripts from the public site. Keep those copies identical when deploying.

This release uses cache `lw5-home-v67-lights-cosmos` and precaches the
bulb module, universe renderer and styles. Publish the HTML, modules and worker together, then reload/update the
installed PWA. The existing GitHub Pages site deploys the repository root from `main`.

Hardware-isolated checks (no real LAN or cloud requests):

```sh
node --test tests/local-control.test.cjs tests/home-update.test.cjs tests/service-worker.test.cjs
node --test tests/local-control-browser.cjs
node --test tests/lights-on-browser.cjs
node --test tests/lights-universe-browser.cjs
node --test --test-name-pattern='all everyday screens|shared feedback' tests/app-ux.cjs
```

The browser tests use a temporary headless profile and intercept every request;
local destination pages are inert mock HTML. No real controller page is loaded.
Actual iPhone/PWA behavior and 2.4 GHz to 5 GHz connectivity remain unverified.
