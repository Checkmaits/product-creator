import * as cheerio from "cheerio";
import { getProductDetails, createProduct } from "./utils.js";

export async function fetchProducts(req, res, next) {
  const link = req.query.link;
  if (!link) return res.status(400).json({ message: "Missing required 'link' query parameter" });

  const response = await fetch(link, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!response.ok)
    return res.status(response.status).json({ message: `Failed to fetch products: ${response.statusText}` });

  const catalogIds = [];
  const $ = cheerio.load(await response.text());
  $(".product-item").each((i, el) => {
    const catalogId = $(el).attr("data-catalogid");
    if (catalogId) catalogIds.push(catalogId);
  });

  const products = await Promise.all(catalogIds.map((catalogId) => getProductDetails(catalogId)));
  return res.status(200).json({ message: `${products.length} products retrieved successfully`, data: products });
}

export async function createProducts(req, res, next) {
  const products = [];
  try {
    for (const product of req.body.products) products.push(await createProduct(product));
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }

  return res.status(200).json({ message: `${products.length} products created successfully`, data: products });
}
