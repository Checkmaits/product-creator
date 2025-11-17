# Product Creator

A simple web app that allows for simple migration of products from Shift4Shop to Shopify.

# 🚀 Overview

This app allows everyone on the JT’s team help with the Shopify migration. Shift4Shop exposes each product’s CatalogID on category pages, making it easy to parse the HTML, collect the IDs, and fetch the product data. It then asks for key inputs—such as the new naming format, vendor, description template, and metafields (SEO, color, specifications, etc.)—and applies those settings to every product in the category. It then migrates them using the provided template, ensuring all fabric products follow a consistent structure across the Shopify catalog.

# 🖥️ Technologies Used

1. Express.js — The entire app is encompassed inside of an Express app. Shift4Shop's API only allows fetching from a server-side environment.
2. Vue.js (CDN) — The frontend is written in Vue.js (included via a CDN). This allows near-full Vue.js functionality without having two seperate apps.
3. REST + GraphQL — Shopify's REST Admin API is quite limited nowadays. The apps uses a combination of both REST (for product creation) and GraphQL for SEO and metafield updates.
