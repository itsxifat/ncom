<?php
/**
 * Plugin Name: NCOM Product Source
 * Description: Lets NCOM read this shop's products, prices and stock live. Nothing is copied out; NCOM asks, this plugin answers.
 * Version:     1.0.0
 * Requires PHP: 8.0
 * Author:      NCOM
 *
 * Install: drop this file in wp-content/plugins/ncom-connector/ and activate it.
 *
 * Then, in NCOM → Settings → Product source, enter:
 *
 *   https://yourshop.com/wp-json/ncom/v1
 *
 * and paste the key id and secret it shows you into wp-config.php:
 *
 *   define('NCOM_KEY_ID', 'ncomcat_…');
 *   define('NCOM_SECRET', 'ncomsec_…');
 *
 * That is the whole installation. No sync, no cron, no importer.
 *
 * The contract this implements is documented at docs/product-source.md.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

add_action('rest_api_init', static function (): void {
    $auth = ['permission_callback' => 'ncom_verify_request'];

    register_rest_route('ncom/v1', '/ping', $auth + [
        'methods' => 'GET',
        'callback' => 'ncom_ping',
    ]);

    register_rest_route('ncom/v1', '/products', $auth + [
        'methods' => 'GET',
        'callback' => 'ncom_products',
    ]);

    register_rest_route('ncom/v1', '/products/(?P<key>[^/]+)', $auth + [
        'methods' => 'GET',
        'callback' => 'ncom_product',
    ]);

    register_rest_route('ncom/v1', '/stock', $auth + [
        'methods' => 'POST',
        'callback' => 'ncom_stock',
    ]);

    register_rest_route('ncom/v1', '/categories', $auth + [
        'methods' => 'GET',
        'callback' => 'ncom_categories',
    ]);

    register_rest_route('ncom/v1', '/reserve', $auth + [
        'methods' => 'POST',
        'callback' => 'ncom_reserve',
    ]);

    register_rest_route('ncom/v1', '/release', $auth + [
        'methods' => 'POST',
        'callback' => 'ncom_release',
    ]);
});

// ── Authentication ───────────────────────────────────────────────────────

/**
 * Verifies NCOM's signature over `${timestamp}.${raw body}`.
 *
 * WordPress hands the raw body back via WP_REST_Request::get_body(), which is
 * what has to be signed — a re-encoded array would produce different bytes and
 * therefore a different HMAC.
 */
function ncom_verify_request(WP_REST_Request $request): bool
{
    if (!defined('NCOM_KEY_ID') || !defined('NCOM_SECRET')) {
        error_log('[ncom] NCOM_KEY_ID / NCOM_SECRET are not defined in wp-config.php');
        return false;
    }

    if (!hash_equals((string) NCOM_KEY_ID, (string) $request->get_header('x-ncom-key'))) {
        return false;
    }

    $parts = [];
    foreach (explode(',', (string) $request->get_header('x-ncom-signature')) as $piece) {
        $bits = explode('=', trim($piece), 2);
        if (count($bits) === 2) {
            $parts[$bits[0]] = $bits[1];
        }
    }

    $timestamp = (int) ($parts['t'] ?? 0);

    // Five minutes either way: a captured request stops working, and a server
    // with a wrong clock fails here rather than mysteriously later.
    if ($timestamp === 0 || abs(time() - $timestamp) > 300) {
        return false;
    }

    $expected = hash_hmac(
        'sha256',
        $timestamp . '.' . (string) $request->get_body(),
        (string) NCOM_SECRET
    );

    return hash_equals($expected, (string) ($parts['v1'] ?? ''));
}

// ── Endpoints ────────────────────────────────────────────────────────────

function ncom_ping(): array
{
    return [
        'ok' => true,
        'contract' => '1',
        'platform' => 'woocommerce/' . (defined('WC_VERSION') ? WC_VERSION : '?'),
        'currency' => get_woocommerce_currency(),
        'capabilities' => [
            'products' => true,
            'stock' => true,
            'search' => true,
            'categories' => true,
            // WooCommerce already knows how to hold stock, so there is no
            // reason not to claim these: wc_update_product_stock is the same
            // conditional decrement the shop's own checkout uses.
            'reserve' => true,
            'release' => true,
        ],
    ];
}

/**
 * A page of products.
 *
 * `ids` comes first because it is what NCOM sends on every render of a landing
 * page whose offer names specific products. Ignoring it would make that offer
 * appear to sell whatever happened to be on page one.
 */
function ncom_products(WP_REST_Request $request): array
{
    $ids = array_values(array_filter(explode(',', (string) $request->get_param('ids'))));
    $limit = min(100, max(1, (int) ($request->get_param('limit') ?: 24)));
    $cursor = (int) $request->get_param('cursor');

    $args = [
        'limit' => $limit,
        'orderby' => 'ID',
        'order' => 'ASC',
        'status' => $request->get_param('status') === 'any'
            ? ['publish', 'draft', 'private']
            : ['publish'],
    ];

    if ($ids) {
        $args['include'] = array_map('intval', $ids);
        $args['limit'] = count($ids);
    } else {
        if ($cursor > 0) {
            // Keyset paging: a product sold mid-scan must not shift the page
            // under the cursor, which is exactly what OFFSET would allow.
            add_filter('woocommerce_product_data_store_cpt_get_products_query', 'ncom_after_id', 10, 2);
            $args['ncom_after_id'] = $cursor;
        }
        if ($search = $request->get_param('q')) {
            $args['s'] = (string) $search;
        }
        if ($category = $request->get_param('category')) {
            $args['category'] = [ncom_category_slug((int) $category)];
        }
    }

    $products = wc_get_products($args);
    remove_filter('woocommerce_product_data_store_cpt_get_products_query', 'ncom_after_id', 10);

    $shaped = array_map('ncom_shape_product', $products);
    $last = end($products);

    return [
        'products' => $shaped,
        'nextCursor' => count($products) === $limit && $last ? (string) $last->get_id() : null,
    ];
}

/** Turns the `ncom_after_id` arg into a real WP_Query clause. */
function ncom_after_id(array $query, array $args): array
{
    if (!empty($args['ncom_after_id'])) {
        $query['post__not_in'] = [];
        $query['date_query'] = [];
        add_filter('posts_where', static function (string $where) use ($args): string {
            global $wpdb;
            return $where . $wpdb->prepare(" AND {$wpdb->posts}.ID > %d ", (int) $args['ncom_after_id']);
        });
    }
    return $query;
}

function ncom_product(WP_REST_Request $request)
{
    $key = urldecode((string) $request['key']);

    $product = is_numeric($key)
        ? wc_get_product((int) $key)
        : wc_get_product(wc_get_product_id_by_sku($key) ?: ncom_id_by_slug($key));

    // 404 is an answer, not a failure: NCOM marks the offer unavailable rather
    // than breaking the landing page it sits on.
    if (!$product) {
        return new WP_Error('not_found', 'No such product', ['status' => 404]);
    }

    return ['product' => ncom_shape_product($product)];
}

/**
 * Stock for a list of variation (or simple product) ids.
 *
 * The hot endpoint — called on every cart render and again inside every
 * checkout — so it reads the product objects and nothing else.
 */
function ncom_stock(WP_REST_Request $request): array
{
    $body = json_decode((string) $request->get_body(), true) ?: [];
    $stock = [];

    foreach ((array) ($body['ids'] ?? []) as $id) {
        $product = wc_get_product((int) $id);
        if (!$product) {
            continue;
        }

        $stock[] = [
            'id' => (string) $id,
            // null is "we do not count this", which is a different statement
            // from zero — Woo's manage_stock off means exactly that.
            'available' => $product->managing_stock()
                ? (int) $product->get_stock_quantity()
                : ($product->is_in_stock() ? null : 0),
            'policy' => $product->backorders_allowed() ? 'continue' : 'deny',
        ];
    }

    return ['stock' => $stock];
}

function ncom_categories(): array
{
    $terms = get_terms(['taxonomy' => 'product_cat', 'hide_empty' => false]);
    if (is_wp_error($terms)) {
        return ['categories' => []];
    }

    return [
        'categories' => array_map(static fn(WP_Term $term): array => [
            'id' => (string) $term->term_id,
            'name' => $term->name,
            'handle' => $term->slug,
            'parentId' => $term->parent ? (string) $term->parent : null,
            'count' => (int) $term->count,
        ], $terms),
    ];
}

/**
 * Holds units for an order.
 *
 * `wc_update_product_stock` with 'decrease' is the same call Woo's own checkout
 * makes, so a reservation and a shop sale move the identical number by the
 * identical path. The availability check before it is the refusal.
 */
function ncom_reserve(WP_REST_Request $request): array
{
    $body = json_decode((string) $request->get_body(), true) ?: [];
    $rejected = [];
    $taken = [];

    foreach ((array) ($body['lines'] ?? []) as $line) {
        $product = wc_get_product((int) ($line['variantId'] ?? 0));
        $quantity = max(1, (int) ($line['quantity'] ?? 1));

        if (!$product) {
            $rejected[] = ['variantId' => (string) ($line['variantId'] ?? ''), 'reason' => 'No longer sold'];
            continue;
        }

        if (!$product->is_in_stock() || !$product->has_enough_stock($quantity)) {
            $rejected[] = [
                'variantId' => (string) $product->get_id(),
                'reason' => sprintf('Only %s left', (string) $product->get_stock_quantity()),
            ];
            continue;
        }

        wc_update_product_stock($product, $quantity, 'decrease');
        $taken[] = [$product, $quantity];
    }

    // All or nothing: a bundle half-reserved is a bundle the merchant cannot
    // ship, so anything already taken goes back before answering.
    if ($rejected) {
        foreach ($taken as [$product, $quantity]) {
            wc_update_product_stock($product, $quantity, 'increase');
        }
        return ['ok' => false, 'rejected' => $rejected];
    }

    return ['ok' => true];
}

/** Gives units back: a cancellation, a return, a checkout that failed. */
function ncom_release(WP_REST_Request $request): array
{
    $body = json_decode((string) $request->get_body(), true) ?: [];

    foreach ((array) ($body['lines'] ?? []) as $line) {
        $product = wc_get_product((int) ($line['variantId'] ?? 0));
        if ($product) {
            wc_update_product_stock($product, max(1, (int) ($line['quantity'] ?? 1)), 'increase');
        }
    }

    return ['ok' => true];
}

// ── Shaping ──────────────────────────────────────────────────────────────

/**
 * One WooCommerce product in the shape NCOM reads.
 *
 * Variable products send their variations; simple products send one variant
 * whose id is the product's own id, which is exactly what NCOM would synthesise
 * anyway — being explicit here keeps stock lookups pointed at a real Woo object.
 *
 * Prices are the ones a customer pays, tax included if the shop is configured
 * that way, because that is the number the landing page shows and charges.
 */
function ncom_shape_product(WC_Product $product): array
{
    $variants = [];

    if ($product->is_type('variable')) {
        foreach ($product->get_children() as $childId) {
            $variation = wc_get_product($childId);
            if ($variation) {
                $variants[] = ncom_shape_variant($variation);
            }
        }
    } else {
        $variants[] = ncom_shape_variant($product);
    }

    $images = [];
    foreach (array_merge([$product->get_image_id()], $product->get_gallery_image_ids()) as $imageId) {
        $url = $imageId ? wp_get_attachment_image_url((int) $imageId, 'full') : '';
        if ($url) {
            $images[] = [
                'url' => $url,
                'alt' => get_post_meta((int) $imageId, '_wp_attachment_image_alt', true) ?: null,
            ];
        }
    }

    $categoryIds = $product->get_category_ids();

    return [
        'id' => (string) $product->get_id(),
        'handle' => $product->get_slug(),
        'title' => $product->get_name(),
        'description' => wp_strip_all_tags($product->get_short_description() ?: $product->get_description()),
        'status' => $product->get_status() === 'publish' ? 'active' : 'draft',
        'productType' => $product->get_type(),
        'tags' => wp_get_post_terms($product->get_id(), 'product_tag', ['fields' => 'names']),
        'categoryId' => $categoryIds ? (string) $categoryIds[0] : null,
        'categoryIds' => array_map('strval', $categoryIds),
        'url' => get_permalink($product->get_id()),
        'images' => $images,
        'variants' => $variants,
    ];
}

function ncom_shape_variant(WC_Product $product): array
{
    return [
        'id' => (string) $product->get_id(),
        'title' => $product->is_type('variation')
            ? implode(' / ', array_filter(array_values($product->get_variation_attributes())))
            : 'Default Title',
        'sku' => $product->get_sku() ?: null,
        // wc_get_price_to_display honours the shop's tax display setting, which
        // is what a customer is quoted on the shop's own pages.
        'price' => (string) wc_get_price_to_display($product),
        'compareAtPrice' => $product->get_sale_price()
            ? (string) wc_get_price_to_display($product, ['price' => $product->get_regular_price()])
            : null,
        'available' => $product->managing_stock()
            ? (int) $product->get_stock_quantity()
            : ($product->is_in_stock() ? null : 0),
        'policy' => $product->backorders_allowed() ? 'continue' : 'deny',
        'requiresShipping' => !$product->is_virtual(),
        'weightGrams' => (int) round(wc_get_weight((float) ($product->get_weight() ?: 0), 'g')),
        'imageUrl' => ($id = $product->get_image_id())
            ? (wp_get_attachment_image_url((int) $id, 'full') ?: null)
            : null,
    ];
}

function ncom_id_by_slug(string $slug): int
{
    $posts = get_posts([
        'name' => $slug,
        'post_type' => 'product',
        'post_status' => ['publish', 'draft', 'private'],
        'numberposts' => 1,
    ]);
    return $posts ? (int) $posts[0]->ID : 0;
}

function ncom_category_slug(int $termId): string
{
    $term = get_term($termId, 'product_cat');
    return $term instanceof WP_Term ? $term->slug : '';
}
