/**
 * Proves a connector's cold start costs a moment, not the order form.
 *
 * Real shops do this. `elysium-lifestyle.bd` answers in 60–180ms warm, and the
 * first call after an idle spell blows straight past a four-second budget —
 * measured live as one request at 4.07s followed by four at 0.12s. When the
 * losing request was the one `getPublicOffers` makes, the landing page rendered
 * `catalogUnavailable` and replaced its whole order form with "Ordering is
 * unavailable for a moment." The page still returned 200, so nothing looked
 * broken from outside.
 *
 * Raising the timeout only makes that failure slower. Retrying fixes it,
 * because the abandoned first request is what woke the server up.
 *
 * The line this file exists to hold is *which* calls may be retried. `/reserve`
 * takes a merchant's stock, and the contract asks implementations to be
 * idempotent on `orderRef` without requiring it — so a retried reserve can sell
 * the last shirt twice. That is a worse bug than the one being fixed, and it is
 * the kind that gets added later by someone making retries "consistent".
 *
 *   DATABASE_URL=… AUTH_SECRET=… pnpm check:cold-start
 *
 * No database: this drives the fetch client directly against a fake website.
 */

import { createServer, type Server } from 'node:http'
import { createHmac } from 'node:crypto'
import { catalogFetch, type CatalogTarget } from '@/server/catalog/client'
import { isCatalogError } from '@/server/catalog/errors'

let failures = 0

function check(condition: boolean, message: string) {
  if (condition) console.log(`  \x1b[32m✓\x1b[0m ${message}`)
  else {
    failures += 1
    console.log(`  \x1b[31m✗\x1b[0m ${message}`)
  }
}

function section(title: string) {
  console.log(`\n\x1b[1m${title}\x1b[0m`)
}

const SECRET = 'ncomsec_coldstart'
const TIMEOUT_MS = 600

/**
 * A website that is slow exactly once per path, the way a container that has to
 * wake up is slow exactly once.
 */
function startShop(
  options: { coldMs?: number; alwaysSlow?: boolean } = {}
): Promise<{
  server: Server
  baseUrl: string
  hits: () => Record<string, number>
}> {
  const hits: Record<string, number> = {}

  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(chunk as Buffer)
    const raw = Buffer.concat(chunks).toString('utf8')

    const header = request.headers['x-ncom-signature']
    const timestamp = /t=(\d+)/.exec(String(header))?.[1] ?? ''
    const given = /v1=([a-f0-9]+)/.exec(String(header))?.[1] ?? ''
    const expected = createHmac('sha256', SECRET)
      .update(`${timestamp}.${raw}`)
      .digest('hex')

    const path = (request.url ?? '').split('?')[0]
    hits[path] = (hits[path] ?? 0) + 1

    // Every attempt is verified. A retry that replayed the first attempt's
    // headers would be sending a stale timestamp inside a signed payload, and
    // this is where that shows up.
    if (given !== expected) {
      response.writeHead(401).end('{"error":"bad signature"}')
      return
    }

    // Cold on the first call to this path, warm after — the shape being fixed.
    // `alwaysSlow` is the other case: a site that is not warming up, it is just
    // down, and must not be asked over and over.
    if (options.alwaysSlow || hits[path] === 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, options.coldMs ?? 2000)
      )
    }

    response
      .writeHead(200, { 'content-type': 'application/json' })
      .end(JSON.stringify({ ok: true, warm: hits[path] > 1 }))
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${port}`,
        hits: () => ({ ...hits }),
      })
    })
  })
}

function target(baseUrl: string): CatalogTarget {
  return {
    baseUrl,
    keyId: 'ncomcat_test',
    secret: SECRET,
    timeoutMs: TIMEOUT_MS,
    capabilities: {
      products: true,
      stock: true,
      search: true,
      categories: true,
      reserve: true,
      release: true,
    },
  }
}

async function main() {
  console.log('\x1b[1mCold start — who gets a second chance?\x1b[0m')

  {
    section('A read survives it')

    const shop = await startShop()
    try {
      const payload = (await catalogFetch(target(shop.baseUrl), {
        method: 'GET',
        path: '/products',
      })) as { warm?: boolean }

      check(true, 'GET /products came back instead of throwing')
      check(payload.warm === true, 'and it was the warm attempt that answered')
      check(
        shop.hits()['/products'] === 2,
        `the site saw exactly two attempts (saw ${shop.hits()['/products']})`
      )
    } catch (error) {
      check(
        false,
        `GET /products still failed: ${error instanceof Error ? error.message : String(error)}`
      )
    } finally {
      shop.server.close()
    }
  }

  {
    section('So does a stock read, which is a POST')

    const shop = await startShop()
    try {
      await catalogFetch(target(shop.baseUrl), {
        method: 'POST',
        path: '/stock',
        body: { ids: ['v1'] },
        replayable: true,
      })
      check(true, 'POST /stock came back')
      check(
        shop.hits()['/stock'] === 2,
        `two attempts (saw ${shop.hits()['/stock']})`
      )
    } catch (error) {
      check(
        false,
        `POST /stock failed: ${error instanceof Error ? error.message : String(error)}`
      )
    } finally {
      shop.server.close()
    }
  }

  {
    section('A reservation does not — it would sell the shirt twice')

    const shop = await startShop()
    try {
      await catalogFetch(target(shop.baseUrl), {
        method: 'POST',
        path: '/reserve',
        body: { orderRef: 'cart-1', lines: [{ variantId: 'v1', quantity: 1 }] },
      })
      check(false, 'POST /reserve was retried — it must not be')
    } catch (error) {
      check(
        isCatalogError(error) && error.failure === 'timeout',
        'it failed honestly as a timeout'
      )
      check(
        shop.hits()['/reserve'] === 1,
        `the merchant's site was asked exactly once (saw ${shop.hits()['/reserve']})`
      )
    } finally {
      shop.server.close()
    }

    const releaseShop = await startShop()
    try {
      await catalogFetch(target(releaseShop.baseUrl), {
        method: 'POST',
        path: '/release',
        body: { orderRef: 'cart-1', lines: [{ variantId: 'v1', quantity: 1 }] },
      })
      check(false, 'POST /release was retried — it must not be')
    } catch {
      check(
        releaseShop.hits()['/release'] === 1,
        `and /release likewise (saw ${releaseShop.hits()['/release']})`
      )
    } finally {
      releaseShop.server.close()
    }
  }

  {
    section('A site that is simply down is not hammered')

    // Slow on every attempt: nothing here is a warm-up, it is just broken.
    const shop = await startShop({ coldMs: 10_000, alwaysSlow: true })
    const started = Date.now()

    try {
      await catalogFetch(target(shop.baseUrl), {
        method: 'GET',
        path: '/products',
      })
      check(false, 'it should have failed')
    } catch (error) {
      const elapsed = Date.now() - started
      check(
        isCatalogError(error) && error.failure === 'timeout',
        'it gives up and reports a timeout'
      )
      check(
        shop.hits()['/products'] === 2,
        `after two attempts and no more (saw ${shop.hits()['/products']})`
      )
      check(
        elapsed < TIMEOUT_MS * 2 + 600,
        `within twice the configured budget (${elapsed}ms of ${TIMEOUT_MS * 2}ms + delay)`
      )
    } finally {
      shop.server.close()
    }
  }

  {
    section('A refusal is taken at its word')

    const server = createServer((_request, response) => {
      hits += 1
      response.writeHead(401).end('{"error":"nope"}')
    })
    let hits = 0

    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', () => resolve())
    )
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0

    try {
      await catalogFetch(target(`http://127.0.0.1:${port}`), {
        method: 'GET',
        path: '/products',
      })
      check(false, 'a 401 should not have succeeded')
    } catch (error) {
      check(
        isCatalogError(error) && error.failure === 'unauthorized',
        'a wrong key fails as unauthorized'
      )
      check(hits === 1, `and is not asked twice (saw ${hits})`)
    } finally {
      server.close()
    }
  }

  console.log(
    failures === 0
      ? '\n\x1b[32mPassed\x1b[0m — reads recover, stock movements stay exactly once.\n'
      : `\n\x1b[31m${failures} failed\x1b[0m\n`
  )

  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
