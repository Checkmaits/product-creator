import { HtmlToShopifyRichText } from "./HtmlToShopifyRichText.js";
import ennisImages from "./ennis_images.json" with {type: "json"};

export async function getProductDetails(catalogId) {
  const response = await fetch(`https://apirest.3dcart.com/3DCartWebAPI/v2/Products/${catalogId}`, {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      SecureURL: process.env.SHIFT4SHOP_API_SECURE_URL,
      PrivateKey: process.env.SHIFT4SHOP_API_PRIVATE_KEY,
      Token: process.env.SHIFT4SHOP_API_TOKEN,
    },
  });

  const data = (await response.json())[0];
  return {
    id: data.SKUInfo.CatalogID,
    name: data.SKUInfo.Name,
    sku: data.SKUInfo.SKU,
    cost: data.SKUInfo.Cost,
    price: data.SKUInfo.Price,
    image: `https://jtsoutdoorfabrics.com/${data.MainImageFile}`,
    color: "",
    discontinued: false,
  };
}

export async function createProduct(product) {
  const ennisImage = getEnnisImage(product.sku);
  console.log(ennisImage);

  const response = await fetch(`${process.env.SHOPIFY_API_REQUEST_URL}/products.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": process.env.SHOPIFY_API_TOKEN,
    },
    body: JSON.stringify({
      product: {
        title: product.name,
        body_html: product.description,
        vendor: product.vendor,
        product_type: product.type,
        images: [{ src: ennisImage ? ennisImage : product.image, alt: `${product.name} Image` }],
        variants: [
          {
            sku: product.sku,
            cost: product.cost,
            price: product.price,
            inventory_policy: "deny",
            inventory_management: "shopify",
          },
        ],
      },
    }),
  });
  if (!response.ok) throw new Error(`Failed to create product: ${response.statusText}`);

  const shopifyProduct = (await response.json()).product;
  const updateResponse = await fetch(`${process.env.SHOPIFY_API_REQUEST_URL}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": process.env.SHOPIFY_API_TOKEN,
    },
    body: JSON.stringify({
      query: `
      mutation UpdateProduct(
  $id: ID!
  $category: ID!
  $collections: [ID!]
  $seoTitle: String!
  $seoDescription: String!
  $specifications: String!
  $summary: String!
  $color: String!
  $application: String!
  $material: String!
  $width: String!
  $discontinued: String!
) {
  productUpdate(
    input: {
      id: $id
      category: $category
      collectionsToJoin: $collections
      seo: { title: $seoTitle, description: $seoDescription }
      metafields: [
        { namespace: "custom", key: "specifications", type: "rich_text_field", value: $specifications }
        { namespace: "custom", key: "summary", type: "rich_text_field", value: $summary }
        { namespace: "product", key: "color", type: "list.single_line_text_field", value: $color }
        { namespace: "product", key: "application", type: "list.single_line_text_field", value: $application }
        { namespace: "product", key: "material", type: "list.single_line_text_field", value: $material }
        { namespace: "product", key: "width", type: "list.single_line_text_field", value: $width }
        { namespace: "product", key: "discontinued", type: "boolean", value: $discontinued }
      ]
    }
  ) {
    product {
      id
      title
    }
    userErrors {
      field
      message
    }
  }
}
`,
      variables: {
        id: `gid://shopify/Product/${shopifyProduct.id}`,
        category: "gid://shopify/TaxonomyCategory/ae-2-1-2-14-2",
        collections: product.collections.split("|").map((collection) => `gid://shopify/Collection/${collection}`),
        seoTitle: product.seoTitle,
        seoDescription: product.seoMetaDescription,
        specifications: HtmlToShopifyRichText.convert(product.specifications),
        summary: HtmlToShopifyRichText.convert(`<p>${product.summary}</p>`),
        color: JSON.stringify(product.color.split("|")),
        application: JSON.stringify(product.application.split("|")),
        material: JSON.stringify(product.material.split("|")),
        width: JSON.stringify(product.width.split("|")),
        discontinued: `${product.discontinued}`,
      },
    }),
  });

  if (!updateResponse.ok) throw new Error(`Failed to update product: ${updateResponse.statusText}`);

  return shopifyProduct;
}

export function getEnnisImage(sku) {
  const found = ennisImages.find((i) => i.sku === sku);
  return found && found.ennis_image !== "-" ? found.ennis_image : null;
}