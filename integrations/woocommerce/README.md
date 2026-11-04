# WooCommerce sales integration — test branch

This branch is for a read-only WooCommerce integration. Do not put API keys in GitHub, browser JavaScript, or query strings.

## First connection

1. WooCommerce → Settings → Advanced → REST API → Add key.
2. Description: Box Packer Sales Test. Permissions: **Read**.
3. Store the Consumer Key and Consumer Secret as Cloudflare Worker secrets `WC_CONSUMER_KEY` and `WC_CONSUMER_SECRET`.
4. Set `WC_BASE_URL` to `https://www.gunpowderstudios.co.uk`.
5. Have the Worker call `/wp-json/wc/v3/orders?per_page=10&page=1` over HTTPS with Basic Auth, server-side only.
6. Do not expose raw orders or personal customer data to a public browser. The Worker should return only aggregated, authorised sales totals.
7. Start with a read-only sample of ten recent orders. Exclude pending, failed, cancelled orders from paid-sales totals; handle refunds and tax explicitly.
8. Reconcile order totals against WooCommerce exports. WooCommerce order totals are not necessarily bank payouts; bank proceeds require payment-provider settlement data.

## Before deployment

- Protect the Box Packer hostname and sales API using Cloudflare Access.
- Verify that GitHub Pages' direct `github.io` address cannot bypass the intended privacy controls; consider private hosting on Cloudflare Pages if necessary.
- Never commit credentials or customer-identifying data.
- Preserve the existing Sales dashboard on `main` until test reconciliation passes.
