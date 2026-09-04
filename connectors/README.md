# Reference connectors

Working implementations of the product source contract. Copy one onto the
merchant's own site, fill in the credentials NCOM generated, and their catalogue
is live on every landing page. Nothing is copied into NCOM — these files are
asked, and they answer.

| Directory      | For                                | Notes                                                                                                                                                                                        |
| -------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `woocommerce/` | WordPress + WooCommerce            | Drop-in plugin. No SQL to write; reads through Woo's own product API, so prices, stock and tax display match the shop exactly. Implements `reserve`/`release` via `wc_update_product_stock`. |
| `php/`         | Any PHP shop with a MySQL database | Plain PDO. Rename the columns at the top of `shape_product` and it works. `reserve` is off until you have checked it against your own stock model.                                           |
| `node/`        | Any Node stack                     | An Express router plus a four-function `store` object you write. Everything else — signing, routing, shaping — is done.                                                                      |

The contract itself is in [`../docs/product-source.md`](../docs/product-source.md).
Read §3 (authentication) and §5 (the product shape) before adapting any of these
to another platform; everything else in them is mechanical.

**Before going live**, whichever you start from:

1. The endpoint must be HTTPS and reachable from the public internet.
2. `NCOM_KEY_ID` and `NCOM_SECRET` come from NCOM → Settings → Product source,
   and the secret is shown exactly once.
3. Do not claim `reserve` in `/ping` until it really holds stock. NCOM tells the
   merchant which mode they are in, and a false claim turns a clear warning into
   an unexplained checkout failure.
4. Never return cost prices. There is no field for them and nothing needs them.
