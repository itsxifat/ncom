# Deploying NCOM

Single-VPS production setup: Caddy terminates TLS and reverse-proxies one Next.js
process; Postgres and Redis run in Docker on loopback.

## Why Caddy with on-demand TLS

Tenants bring arbitrary custom domains. A static certificate cannot cover a name
we do not know at deploy time, and a `*.enfinito.cloud` wildcard covers only our
own zone — never a tenant's domain, and only over DNS-01, which would mean
keeping a registrar API token with zone-write access on this box.

On-demand issuance asks the app before every ACME order:

```
handshake for shop.acme.com
  -> GET 127.0.0.1:3000/api/internal/tls-check?key=…&domain=shop.acme.com
       200  -> Caddy orders a certificate over HTTP-01
       403  -> handshake refused, no order
```

`isCertifiableHostname` (in `src/server/services/domainService.ts`) answers yes
only for the platform host, `sites.<root>`, a subdomain matching a real store, or
a custom domain that has already passed the TXT challenge. That gate is load
bearing: without it, anyone pointing DNS at this IP can provoke certificate
orders until the Let's Encrypt weekly limit is gone and no real tenant can
onboard.

## First run

```bash
scp deploy/provision.sh deploy/Caddyfile deploy/ncom.service root@<ip>:/root/
ssh root@<ip> 'ROOT_DOMAIN=enfinito.cloud ACME_EMAIL=you@example.com \
  ADMIN_BOOTSTRAP_EMAIL=itsxifat22@gmail.com bash /root/provision.sh'
```

Then, on the server, fill the two EnCDN values in `/srv/ncom/.env.production` —
`src/lib/env.ts` validates them at boot, so the app will not start while they are
empty. Everything else is generated.

Release from your workstation:

```bash
./deploy/deploy.sh
```

## DNS

```
A   enfinito.cloud         -> 72.60.104.105
A   *.enfinito.cloud       -> 72.60.104.105     (tenant subdomains)
A   sites.enfinito.cloud   -> 72.60.104.105     (what tenants CNAME to)
```

`cdn.enfinito.cloud` is unaffected. Tenants adding a custom domain get their
instructions from the dashboard: a `_ncom-challenge` TXT record plus a CNAME to
`sites.enfinito.cloud`.

Set `ROOT_DOMAIN` once, in `.env.production`. It drives tenant subdomains, the
CNAME target shown in the UI, and which hostnames get certificates.

## Security notes

- **The root password used to set this up is in a chat transcript — rotate it.**
  Then install a key and turn passwords off:
  `ssh-copy-id root@<ip>`, confirm key login works in a _second_ terminal before
  closing the first, then set `PasswordAuthentication no` in
  `/etc/ssh/sshd_config` and `systemctl restart ssh`.
- **Never use the repo-root `docker-compose.yml` on this box.** It binds Postgres
  to `0.0.0.0` with the password `ncom`. `deploy/docker-compose.prod.yml` binds
  loopback and takes the generated password.
- `ADMIN_BOOTSTRAP_EMAIL` must be set before the site is publicly reachable. The
  first account to register claims `SUPER_ADMIN` permanently; the env var
  restricts that claim to one address.
- `.env.production` holds every secret and is never overwritten by a re-run of
  `provision.sh`. Back it up.

## Operating

```bash
systemctl status ncom
journalctl -u ncom -f                     # app logs
journalctl -u caddy -f | grep -i acme     # certificate issuance
docker compose -f deploy/docker-compose.prod.yml ps
```

Certificate not issuing for a tenant domain — check the gate directly:

```bash
source /srv/ncom/.env.production
curl -s -o /dev/null -w '%{http_code}\n' \
  "http://127.0.0.1:3000/api/internal/tls-check?key=$TLS_CHECK_SECRET&domain=shop.acme.com"
```

`403` means the app does not consider that hostname ours — usually the domain is
still `PENDING` because the TXT challenge has not been verified in the dashboard.

## Backups

Not yet configured. At minimum, a nightly `pg_dump` off-box:

```bash
docker compose -f /srv/ncom/deploy/docker-compose.prod.yml exec -T postgres \
  pg_dump -U ncom ncom | gzip > ncom-$(date +%F).sql.gz
```
