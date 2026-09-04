<?php
/**
 * NCOM product source connector — plain PHP + PDO.
 *
 * Drop this on your own site, point NCOM at the URL it answers on, and your
 * catalogue is live on every landing page. Nothing is copied into NCOM; this
 * file is asked, and it answers.
 *
 * Deploy: put it anywhere your web server executes PHP, e.g.
 *   https://yourshop.com/ncom/v1/index.php
 * with a rewrite so /ncom/v1/products reaches it, or simply use
 *   https://yourshop.com/ncom/v1/index.php
 * as the base URL — NCOM appends /products, /stock and so on either way.
 *
 * Then edit the CONFIG block: your database, your table and column names, and
 * the key id and secret NCOM showed you when you connected.
 *
 * The contract this implements is documented at docs/product-source.md.
 *
 * Requires PHP 8.1 or newer (the `never` return type). On 8.0, change those two
 * declarations to `void` and it runs unchanged.
 */

declare(strict_types=1);

// ── CONFIG ───────────────────────────────────────────────────────────────

const DB_DSN  = 'mysql:host=127.0.0.1;dbname=shop;charset=utf8mb4';
const DB_USER = 'shop_readonly';
const DB_PASS = '';

/** From NCOM → Settings → Product source. Shown once. */
const NCOM_KEY_ID = 'ncomcat_replace_me';
const NCOM_SECRET = 'ncomsec_replace_me';

/** Where your product images are served from, if the column holds a path. */
const IMAGE_BASE = 'https://yourshop.com/uploads/';
/** Your public product page, for the "edit on your website" link. */
const PRODUCT_URL = 'https://yourshop.com/product/';

/** ISO 4217. Must match the currency of the NCOM workspace. */
const CURRENCY = 'BDT';

/**
 * Turn this on once /reserve below matches how your shop really moves stock.
 *
 * With it off, NCOM checks stock before an order and does not hold it, so two
 * shoppers can take the same last unit. With it on, your database decides who
 * gets it. Do not claim it until it is true — see docs/product-source.md §4.
 */
const SUPPORTS_RESERVE = false;

// ── Request plumbing ─────────────────────────────────────────────────────

header('Content-Type: application/json; charset=utf-8');

$rawBody = file_get_contents('php://input') ?: '';

verify_signature($rawBody);

$path = trim(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '', '/');
// Everything after the script name is the endpoint: /ncom/v1/products/42 with
// this file at /ncom/v1/index.php leaves "products/42".
$script = trim(dirname($_SERVER['SCRIPT_NAME'] ?? ''), '/');
if ($script !== '' && str_starts_with($path, $script)) {
    $path = trim(substr($path, strlen($script)), '/');
}
$segments = $path === '' ? [] : explode('/', $path);
$endpoint = $segments[0] ?? '';

$db = new PDO(DB_DSN, DB_USER, DB_PASS, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);

try {
    switch ($endpoint) {
        case 'ping':
            send(ping());
            break;

        case 'products':
            if (isset($segments[1]) && $segments[1] !== '') {
                $product = load_product($db, urldecode($segments[1]));
                if ($product === null) {
                    http_response_code(404);
                    send(['error' => 'not_found']);
                }
                send(['product' => $product]);
            }
            send(list_products($db));
            break;

        case 'stock':
            send(['stock' => stock_for($db, json_ids($rawBody))]);
            break;

        case 'categories':
            send(['categories' => categories($db)]);
            break;

        case 'reserve':
            send(reserve($db, json_decode($rawBody, true) ?: []));
            break;

        case 'release':
            send(release($db, json_decode($rawBody, true) ?: []));
            break;

        default:
            http_response_code(404);
            send(['error' => 'unknown_endpoint']);
    }
} catch (Throwable $e) {
    // Never leak a stack trace or an SQL string to the caller. NCOM shows this
    // message to the merchant in the connection panel.
    error_log('[ncom] ' . $e->getMessage());
    http_response_code(500);
    send(['error' => 'server_error']);
}

// ── Auth ─────────────────────────────────────────────────────────────────

/**
 * Verifies the signature NCOM sent, or exits 401.
 *
 * Signed over "<timestamp>.<raw body>" — the empty string for a GET. Compared
 * with hash_equals rather than ===, because a byte-by-byte comparison that
 * returns early leaks how much of a guess was right.
 */
function verify_signature(string $body): void
{
    $key = request_header('X-NCOM-Key');
    $signature = request_header('X-NCOM-Signature');

    if (!hash_equals(NCOM_KEY_ID, $key)) {
        deny('unknown key');
    }

    $parts = [];
    foreach (explode(',', $signature) as $piece) {
        $bits = explode('=', trim($piece), 2);
        if (count($bits) === 2) {
            $parts[$bits[0]] = $bits[1];
        }
    }

    $timestamp = (int) ($parts['t'] ?? 0);
    $provided = (string) ($parts['v1'] ?? '');

    // Five minutes either way. A captured request stops working; a server whose
    // clock is wrong fails loudly here rather than mysteriously later.
    if ($timestamp === 0 || abs(time() - $timestamp) > 300) {
        deny('stale timestamp');
    }

    $expected = hash_hmac('sha256', $timestamp . '.' . $body, NCOM_SECRET);

    if (!hash_equals($expected, $provided)) {
        deny('bad signature');
    }
}

/**
 * One request header, however this server exposes them.
 *
 * `getallheaders()` is missing under some nginx + php-fpm builds, where headers
 * arrive as `HTTP_X_NCOM_KEY` in $_SERVER instead. Reading both is two lines
 * and saves an afternoon.
 */
function request_header(string $name): string
{
    if (function_exists('getallheaders')) {
        $headers = array_change_key_case(getallheaders() ?: [], CASE_LOWER);
        if (isset($headers[strtolower($name)])) {
            return (string) $headers[strtolower($name)];
        }
    }

    $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    return (string) ($_SERVER[$key] ?? '');
}

function deny(string $why): never
{
    error_log('[ncom] refused: ' . $why);
    http_response_code(401);
    echo json_encode(['error' => 'unauthorized']);
    exit;
}

function send(array $payload): never
{
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function json_ids(string $body): array
{
    $decoded = json_decode($body, true);
    $ids = is_array($decoded) && isset($decoded['ids']) ? $decoded['ids'] : [];
    return array_values(array_filter(array_map('strval', (array) $ids)));
}

// ── Endpoints ────────────────────────────────────────────────────────────

function ping(): array
{
    return [
        'ok' => true,
        'contract' => '1',
        'platform' => 'php/pdo',
        'currency' => CURRENCY,
        'capabilities' => [
            'products' => true,
            'stock' => true,
            'search' => true,
            'categories' => true,
            'reserve' => SUPPORTS_RESERVE,
            'release' => SUPPORTS_RESERVE,
        ],
    ];
}

/**
 * A page of products.
 *
 * `ids` is the parameter that matters most: it is how NCOM re-reads the exact
 * products a saved offer names, on every render of that landing page. A
 * connector that ignores it makes an offer appear to sell the wrong things.
 *
 * Paging is by row id rather than OFFSET, so a product sold mid-scan does not
 * shift the page under the cursor.
 */
function list_products(PDO $db): array
{
    $limit = max(1, min(100, (int) ($_GET['limit'] ?? 24)));
    $cursor = (string) ($_GET['cursor'] ?? '');
    $search = trim((string) ($_GET['q'] ?? ''));
    $category = (string) ($_GET['category'] ?? '');
    $status = (string) ($_GET['status'] ?? 'active');
    $ids = array_values(array_filter(explode(',', (string) ($_GET['ids'] ?? ''))));

    $where = ['1=1'];
    $params = [];

    if ($ids) {
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $where[] = "p.id IN ($placeholders)";
        $params = array_merge($params, $ids);
    } else {
        if ($status !== 'any') {
            $where[] = 'p.is_published = 1';
        }
        if ($search !== '') {
            $where[] = '(p.title LIKE ? OR p.sku LIKE ?)';
            $params[] = '%' . $search . '%';
            $params[] = '%' . $search . '%';
        }
        if ($category !== '') {
            $where[] = 'p.category_id = ?';
            $params[] = $category;
        }
        if ($cursor !== '') {
            $where[] = 'p.id > ?';
            $params[] = $cursor;
        }
    }

    $sql = 'SELECT * FROM products p WHERE ' . implode(' AND ', $where)
         . ' ORDER BY p.id ASC LIMIT ' . ($limit + 1);

    $statement = $db->prepare($sql);
    $statement->execute($params);
    $rows = $statement->fetchAll();

    $hasMore = count($rows) > $limit;
    $rows = array_slice($rows, 0, $limit);

    $products = array_map(fn(array $row) => shape_product($db, $row), $rows);

    return [
        'products' => $products,
        'nextCursor' => $hasMore && $rows ? (string) end($rows)['id'] : null,
    ];
}

function load_product(PDO $db, string $idOrHandle): ?array
{
    $statement = $db->prepare(
        'SELECT * FROM products WHERE id = ? OR slug = ? LIMIT 1'
    );
    $statement->execute([$idOrHandle, $idOrHandle]);
    $row = $statement->fetch();

    return $row ? shape_product($db, $row) : null;
}

/**
 * One product row, in the shape NCOM reads.
 *
 * Rename the columns on the right to match your schema; nothing else here
 * needs to change. Money may be a decimal string ("1250.00") or an integer
 * `priceCents` — pick whichever your column already holds.
 */
function shape_product(PDO $db, array $row): array
{
    $variants = $db->prepare(
        'SELECT * FROM product_variants WHERE product_id = ? ORDER BY position ASC'
    );
    $variants->execute([$row['id']]);
    $variantRows = $variants->fetchAll();

    $images = $db->prepare(
        'SELECT * FROM product_images WHERE product_id = ? ORDER BY position ASC'
    );
    $images->execute([$row['id']]);

    return [
        'id' => (string) $row['id'],
        'handle' => (string) ($row['slug'] ?? $row['id']),
        'title' => (string) $row['title'],
        'description' => $row['description'] ?? null,
        'status' => ((int) ($row['is_published'] ?? 1)) === 1 ? 'active' : 'draft',
        'vendor' => $row['brand'] ?? null,
        'categoryId' => isset($row['category_id']) ? (string) $row['category_id'] : null,
        'url' => PRODUCT_URL . ($row['slug'] ?? $row['id']),
        'images' => array_map(
            fn(array $image) => [
                'url' => absolute_url((string) $image['path']),
                'alt' => $image['alt'] ?? null,
            ],
            $images->fetchAll()
        ),
        // A shop with no variant table can delete this block, put `price`,
        // `sku` and `available` on the product itself, and NCOM will synthesise
        // a single variant whose id is the product's own id.
        'variants' => array_map(fn(array $variant) => [
            'id' => (string) $variant['id'],
            'title' => (string) ($variant['title'] ?? 'Default Title'),
            'sku' => $variant['sku'] ?? null,
            'price' => (string) $variant['price'],
            'compareAtPrice' => $variant['compare_at_price'] ?? null,
            'options' => array_values(array_filter([
                $variant['option1'] ?? null,
                $variant['option2'] ?? null,
                $variant['option3'] ?? null,
            ])),
            // null here would mean "we do not count this line", which is a
            // different statement from zero. Send the number if you have one.
            'available' => isset($variant['stock']) ? (int) $variant['stock'] : null,
            'policy' => ($variant['allow_backorder'] ?? 0) ? 'continue' : 'deny',
            'requiresShipping' => true,
            'weightGrams' => (int) ($variant['weight_grams'] ?? 0),
        ], $variantRows),
    ];
}

function absolute_url(string $path): string
{
    return str_starts_with($path, 'http') ? $path : IMAGE_BASE . ltrim($path, '/');
}

/**
 * Stock for a set of variant ids.
 *
 * The hot endpoint: called on every cart render and again inside every
 * checkout. Keep it to one indexed query.
 */
function stock_for(PDO $db, array $ids): array
{
    if (!$ids) {
        return [];
    }

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $statement = $db->prepare(
        "SELECT id, stock, allow_backorder FROM product_variants WHERE id IN ($placeholders)"
    );
    $statement->execute($ids);

    return array_map(fn(array $row) => [
        'id' => (string) $row['id'],
        'available' => $row['stock'] === null ? null : (int) $row['stock'],
        'policy' => ($row['allow_backorder'] ?? 0) ? 'continue' : 'deny',
    ], $statement->fetchAll());
}

function categories(PDO $db): array
{
    $rows = $db->query(
        'SELECT id, name, slug, parent_id FROM categories ORDER BY name ASC'
    )->fetchAll();

    return array_map(fn(array $row) => [
        'id' => (string) $row['id'],
        'name' => (string) $row['name'],
        'handle' => (string) ($row['slug'] ?? $row['id']),
        'parentId' => isset($row['parent_id']) ? (string) $row['parent_id'] : null,
    ], $rows);
}

/**
 * Holds units for an order.
 *
 * The conditional UPDATE is the whole point: it compiles to
 * "take n if there are n", under the row lock, so two checkouts racing for the
 * last unit cannot both succeed. Reading the stock first and then writing it —
 * the obvious implementation — is exactly how a shop oversells.
 *
 * Set SUPPORTS_RESERVE to true only once this matches how your shop really
 * moves stock.
 */
function reserve(PDO $db, array $payload): array
{
    if (!SUPPORTS_RESERVE) {
        http_response_code(404);
        return ['error' => 'not_implemented'];
    }

    $lines = $payload['lines'] ?? [];
    $rejected = [];

    $db->beginTransaction();
    try {
        $take = $db->prepare(
            'UPDATE product_variants SET stock = stock - :quantity
              WHERE id = :id AND (stock IS NULL OR stock >= :quantity OR allow_backorder = 1)'
        );

        foreach ($lines as $line) {
            $take->execute([
                'id' => (string) $line['variantId'],
                'quantity' => (int) $line['quantity'],
            ]);

            if ($take->rowCount() === 0) {
                $rejected[] = [
                    'variantId' => (string) $line['variantId'],
                    'reason' => 'Not enough stock left',
                ];
            }
        }

        if ($rejected) {
            $db->rollBack();
            return ['ok' => false, 'rejected' => $rejected];
        }

        $db->commit();
        return ['ok' => true];
    } catch (Throwable $e) {
        $db->rollBack();
        throw $e;
    }
}

/** Gives units back: a cancellation, a return, a checkout that failed. */
function release(PDO $db, array $payload): array
{
    if (!SUPPORTS_RESERVE) {
        http_response_code(404);
        return ['error' => 'not_implemented'];
    }

    $give = $db->prepare(
        'UPDATE product_variants SET stock = stock + :quantity WHERE id = :id'
    );

    foreach ($payload['lines'] ?? [] as $line) {
        $give->execute([
            'id' => (string) $line['variantId'],
            'quantity' => (int) $line['quantity'],
        ]);
    }

    return ['ok' => true];
}
