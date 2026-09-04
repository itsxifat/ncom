/**
 * Proves neither catalogue can crowd the other out of a list.
 *
 * A workspace sells from two places, and almost every screen in the dashboard
 * asks for "the products" as one fixed-size list. The failure this guards
 * against is quiet and total: concatenate the local half first, cut the result
 * at the requested size, and the merchant's entire website disappears the day
 * their own catalogue reaches that size. Nothing errors. The products page keeps
 * showing both, because it pages differently — so the report is "I can see them
 * in Products but not when I try to pick one", with no failure anywhere to look
 * at.
 *
 * That is exactly what happened to an Elysium workspace holding 322 of its own
 * rows against a picker asking for 200.
 *
 *   DATABASE_URL=…/scratch AUTH_SECRET=… pnpm check:catalog-merge
 *
 * It creates one throwaway organisation, uses it, and deletes it.
 */

import { createServer, type Server } from 'node:http'
import { createHmac, randomUUID } from 'node:crypto'
import { prisma } from '@/server/db/client'
import { listProducts, searchProducts } from '@/server/catalog/source'
import { encryptSecret } from '@/lib/crypto'

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

// ── A website with a lot of products ─────────────────────────────────────

function remoteProduct(index: number) {
  return {
    id: `r-${index}`,
    handle: `their-product-${index}`,
    title: `Their Product ${index}`,
    status: 'active',
    variants: [
      {
        id: `rv-${index}`,
        title: 'Default Title',
        sku: `THEIRS-${index}`,
        price: 1000 + index,
        options: [],
      },
    ],
  }
}

const REMOTE = Array.from({ length: 120 }, (_unused, index) =>
  remoteProduct(index)
)

interface Shop {
  server: Server
  baseUrl: string
  secret: string
  keyId: string
  /** Whether the connector claims it can search. */
  searchable: boolean
}

function startShop(searchable: boolean): Promise<Shop> {
  const secret = `ncomsec_${randomUUID().replace(/-/g, '')}`
  const keyId = `ncomcat_${randomUUID().slice(0, 8)}`

  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(chunk as Buffer)
    const raw = Buffer.concat(chunks).toString('utf8')

    const header = request.headers['x-ncom-signature']
    if (typeof header !== 'string') {
      response.writeHead(401).end('{"error":"unsigned"}')
      return
    }
    const timestamp = /t=(\d+)/.exec(header)?.[1] ?? ''
    const given = /v1=([a-f0-9]+)/.exec(header)?.[1] ?? ''
    if (
      given !==
      createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex')
    ) {
      response.writeHead(401).end('{"error":"bad signature"}')
      return
    }

    const url = new URL(request.url ?? '/', 'http://localhost')
    const send = (payload: unknown) =>
      response
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify(payload))

    if (url.pathname.endsWith('/ping')) {
      send({
        contract: '1',
        platform: 'fake/1.0',
        currency: 'BDT',
        capabilities: {
          products: true,
          stock: true,
          search: searchable,
          categories: false,
          reserve: false,
          release: false,
        },
      })
      return
    }

    if (url.pathname.includes('/products')) {
      const q = url.searchParams.get('q')
      const limit = Number(url.searchParams.get('limit') ?? '24')
      const matching = q
        ? REMOTE.filter((product) =>
            product.title.toLowerCase().includes(q.toLowerCase())
          )
        : REMOTE
      send({
        products: matching.slice(0, limit),
        next_cursor: null,
        total: matching.length,
      })
      return
    }

    response.writeHead(404).end('{"error":"not found"}')
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${port}`,
        secret,
        keyId,
        searchable,
      })
    })
  })
}

async function createWorkspace(
  shop: Shop,
  localProducts: number
): Promise<string> {
  const suffix = randomUUID().slice(0, 8)

  const organization = await prisma.organization.create({
    data: { name: `Merge check ${suffix}`, slug: `merge-check-${suffix}` },
    select: { id: true },
  })

  await prisma.catalogConnection.create({
    data: {
      organizationId: organization.id,
      baseUrl: shop.baseUrl,
      keyId: shop.keyId,
      secret: encryptSecret(shop.secret),
      timeoutMs: 5000,
      contractVersion: '1',
      capabilities: {
        products: true,
        stock: true,
        search: shop.searchable,
        categories: false,
        reserve: false,
        release: false,
      },
    },
  })

  for (let index = 0; index < localProducts; index += 1) {
    await prisma.product.create({
      data: {
        organizationId: organization.id,
        title: `Our Product ${index}`,
        handle: `our-product-${index}-${suffix}`,
        status: 'ACTIVE',
        variants: {
          create: {
            title: 'Default Title',
            sku: `OURS-${index}-${suffix}`,
            priceCents: 500 + index,
          },
        },
      },
    })
  }

  return organization.id
}

const isLocal = (product: { source: string }) => product.source === 'LOCAL'
const isRemote = (product: { source: string }) => product.source === 'REMOTE'

async function main() {
  console.log('\x1b[1mCan one catalogue crowd out the other?\x1b[0m')

  // The reported case: more of our own products than the picker asks for.
  {
    section('60 local products, a picker asking for 60')

    const shop = await startShop(false)
    const organizationId = await createWorkspace(shop, 60)

    try {
      const found = await searchProducts(organizationId, '', {
        limit: 60,
        includeDrafts: true,
      })

      const local = found.filter(isLocal).length
      const remote = found.filter(isRemote).length

      check(
        remote > 0,
        `the merchant's website is represented (${remote} of ${found.length})` +
          (remote === 0
            ? ' — every picker in the dashboard would be blind to it'
            : '')
      )
      check(local > 0, `so is our own catalogue (${local} of ${found.length})`)
      check(
        found.length <= 60,
        `and the list is still the size that was asked for (${found.length})`
      )
      check(
        found.filter(isLocal).every((_p, index) => isLocal(found[index])),
        'our own products come first, where a merchant looks for them'
      )
    } finally {
      await prisma.organization.delete({ where: { id: organizationId } })
      shop.server.close()
    }
  }

  // The other end: nothing of our own. The remote half must take the lot.
  {
    section('No local products at all')

    const shop = await startShop(false)
    const organizationId = await createWorkspace(shop, 0)

    try {
      const found = await searchProducts(organizationId, '', { limit: 40 })
      check(
        found.length === 40 && found.every(isRemote),
        `the whole list is theirs (${found.length} of 40)`
      )
    } finally {
      await prisma.organization.delete({ where: { id: organizationId } })
      shop.server.close()
    }
  }

  // And the reverse: a small remote catalogue must not cost the local half its
  // slots either.
  {
    section('Few of theirs match, many of ours')

    const shop = await startShop(true)
    const organizationId = await createWorkspace(shop, 30)

    try {
      // "Product 1" matches 30 of ours and a handful of theirs.
      const found = await searchProducts(organizationId, 'Product 1', {
        limit: 40,
      })
      check(
        found.filter(isLocal).length > 10,
        `our matches are not cut down to half the list (${found.filter(isLocal).length} local)`
      )
      check(
        found.filter(isRemote).length > 0,
        `theirs still appear (${found.filter(isRemote).length} remote)`
      )
    } finally {
      await prisma.organization.delete({ where: { id: organizationId } })
      shop.server.close()
    }
  }

  // The products page pages differently and must keep showing both — this is
  // the screen that made the bug invisible.
  {
    section('The products page shows both')

    const shop = await startShop(false)
    const organizationId = await createWorkspace(shop, 60)

    try {
      const page = await listProducts(organizationId, {
        limit: 50,
        includeDrafts: true,
      })
      check(
        page.products.some(isLocal) && page.products.some(isRemote),
        `both halves are on the first page (${page.products.filter(isLocal).length} local, ${page.products.filter(isRemote).length} remote)`
      )
    } finally {
      await prisma.organization.delete({ where: { id: organizationId } })
      shop.server.close()
    }
  }

  console.log(
    failures === 0
      ? '\n\x1b[32mPassed\x1b[0m — both catalogues survive every list.\n'
      : `\n\x1b[31m${failures} failed\x1b[0m\n`
  )

  await prisma.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (error) => {
  console.error(error)
  await prisma.$disconnect()
  process.exit(1)
})
