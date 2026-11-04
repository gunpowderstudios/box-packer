// Box Packer WooCommerce test — deploy behind Cloudflare Access.
// Keep WC_CONSUMER_KEY and WC_CONSUMER_SECRET in Worker secrets only.
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const allowedOrigin = origin === "https://gunpowderstudios.github.io" ? origin : null;
    const cors = allowedOrigin ? {"Access-Control-Allow-Origin":allowedOrigin,"Access-Control-Allow-Credentials":"true","Vary":"Origin"} : {};
    if (request.method === "OPTIONS" && new URL(request.url).pathname === "/") return new Response(null,{status:204,headers:{...cors,"Access-Control-Allow-Methods":"GET, OPTIONS","Access-Control-Allow-Headers":"Content-Type","Access-Control-Max-Age":"3600"}});
    const json = (value, status = 200) => new Response(JSON.stringify(value), {
      status, headers: {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff",...cors}
    });
    if (request.method !== "GET" || new URL(request.url).pathname !== "/")
      return json({error:"Not found"},404);
    if (!env.WC_BASE_URL || !env.WC_CONSUMER_KEY || !env.WC_CONSUMER_SECRET)
      return json({error:"Missing WooCommerce configuration"},500);
    const auth = "Basic " + btoa(env.WC_CONSUMER_KEY + ":" + env.WC_CONSUMER_SECRET);
    const groups = new Map(), products = new Map(), months = new Map(), productMonths = new Map();
    const amount = v => Math.round(Number(v || 0) * 100);
    const money = cents => Number((cents / 100).toFixed(2));
    let scanned = 0, included = 0, complete = false;
    try {
      for (let page = 1; page <= 50; page++) {
        const endpoint = new URL("/wp-json/wc/v3/orders",env.WC_BASE_URL);
        endpoint.searchParams.set("per_page","100");
        endpoint.searchParams.set("page",String(page));
        endpoint.searchParams.set("orderby","date");
        endpoint.searchParams.set("order","desc");
        const response = await fetch(endpoint,{headers:{Authorization:auth,Accept:"application/json"}});
        if (!response.ok) return json({error:"WooCommerce API error",page,status:response.status},502);
        const orders = await response.json();
        if (!Array.isArray(orders)) return json({error:"Unexpected WooCommerce response"},502);
        scanned += orders.length;
        for (const o of orders) {
          if (!["processing","completed"].includes(o.status)) continue;
          included++;
          const currency = o.currency || "UNKNOWN";
          const month = (o.date_created || "").slice(0,7);
          if (!groups.has(currency)) groups.set(currency,{currency,orders:0,units:0,orderTotalCents:0,discountsCents:0,shippingCents:0,taxCents:0});
          const g = groups.get(currency);
          g.orders++;g.orderTotalCents+=amount(o.total);g.discountsCents+=amount(o.discount_total);
          g.shippingCents+=amount(o.shipping_total);g.taxCents+=amount(o.total_tax);
          const mk = month+"|"+currency;
          if (month && !months.has(mk)) months.set(mk,{month,currency,orders:0,units:0,orderTotalCents:0});
          if (month) {const m=months.get(mk);m.orders++;m.orderTotalCents+=amount(o.total);}
          for (const item of o.line_items || []) {
            const id = Number(item.product_id||0), variationId=Number(item.variation_id||0);
            const key = [currency,id,variationId,item.sku||"",item.name||""].join("|");
            if (!products.has(key)) products.set(key,{productId:id,variationId,sku:item.sku||"",name:item.name||"Unnamed product",currency,units:0,lineTotalCents:0});
            const p=products.get(key), qty=Number(item.quantity||0);
            p.units+=qty;p.lineTotalCents+=amount(item.total);g.units+=qty;
            if (month) { const pmKey=month+"|"+key; if(!productMonths.has(pmKey))productMonths.set(pmKey,{month,productId:id,variationId,sku:item.sku||"",name:item.name||"Unnamed product",currency,units:0,lineTotalCents:0}); const pm=productMonths.get(pmKey);pm.units+=qty;pm.lineTotalCents+=amount(item.total); }
            if (month) months.get(mk).units+=qty;
          }
        }
        if (orders.length < 100) {complete=true;break;}
      }
      if (!complete) return json({connected:true,complete:false,error:"More than 5000 orders; use scheduled import",ordersScanned:scanned},422);
      const currencies=[...groups.values()].map(({orderTotalCents,discountsCents,shippingCents,taxCents,...g})=>({...g,orderTotal:money(orderTotalCents),discounts:money(discountsCents),shipping:money(shippingCents),tax:money(taxCents)}));
      const result={schema:"box-packer-woocommerce-v2",connected:true,complete:true,source:"WooCommerce",generatedAt:new Date().toISOString(),ordersScanned:scanned,paidStatusOrders:included,currencies,
        products:[...products.values()].map(({lineTotalCents,...p})=>({...p,lineTotal:money(lineTotalCents)})).sort((a,b)=>b.units-a.units),
        months:[...months.values()].map(({orderTotalCents,...m})=>({...m,orderTotal:money(orderTotalCents)})).sort((a,b)=>b.month.localeCompare(a.month)),
        productMonths:[...productMonths.values()].map(({lineTotalCents,...p})=>({...p,lineTotal:money(lineTotalCents)})),
        notes:["Only processing and completed orders","Refunds not reconciled","Currencies not converted","Order totals include shipping and tax where charged","Not bank proceeds"]};
      return json(result);
    } catch {return json({error:"WooCommerce fetch failed"},500);}
  }
};
