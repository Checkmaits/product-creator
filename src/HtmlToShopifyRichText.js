// Ported version of https://github.com/webfoo/html-to-shopify-rich-text
// Big thanks to this guy for making this, it's pretty great

// HtmlToShopifyRichText.js
// dom-setup.js (or at top of HtmlToShopifyRichText.js)
import { JSDOM } from "jsdom";
import createDOMPurify from "dompurify";

const jsdom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
const { window } = jsdom;

// Make browser-like globals available in Node
global.window = window;
global.document = window.document;
global.DOMParser = window.DOMParser;
global.Node = window.Node;

// Optional: DOMPurify support (your code already checks `typeof DOMPurify !== "undefined"`)
global.DOMPurify = createDOMPurify(window);

class InvalidHtmlError extends Error {
  constructor(message) {
    super(message);
    this.name = "InvalidHtmlError";
  }
}

class ConversionError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "ConversionError";
    if (cause) this.cause = cause;
  }
}

class JsonEncodingError extends Error {
  constructor(message) {
    super(message);
    this.name = "JsonEncodingError";
  }
}

class HtmlToShopifyRichText {
  static SUPPORTED_HEADINGS = ["h1", "h2", "h3", "h4", "h5", "h6"];
  static BLOCK_ELEMENTS = ["heading", "list", "paragraph"];
  static INLINE_ELEMENTS = ["text", "link", "bold", "italic"];
  static SUPPORTED_INLINE_TAGS = ["strong", "b", "em", "i", "a"];
  static SUPPORTED_LIST_TAGS = ["ul", "ol"];
  static SUPPORTED_BOLD_TAGS = ["strong", "b"];
  static SUPPORTED_ITALIC_TAGS = ["em", "i"];

  /**
   * Convert HTML content to Shopify Rich Text format
   * @param {string} html
   * @returns {string} JSON string
   */
  static convert(html) {
    if (!html || html.trim() === "") {
      throw new InvalidHtmlError("HTML content cannot be empty");
    }

    // Remove comments before validation
    html = html.replace(/<!--.*?-->/gs, "");

    // Basic malformed HTML checks
    const openCount = (html.match(/</g) || []).length;
    const closeCount = (html.match(/>/g) || []).length;
    if (openCount !== closeCount) {
      throw new InvalidHtmlError("Malformed HTML: Unmatched angle brackets");
    }

    // Check for unclosed / mismatched tags (very naive, like in PHP)
    const tagRegex = /<(\/)?([a-zA-Z0-9]+)[^>]*>/g;
    const stack = [];
    let match;

    while ((match = tagRegex.exec(html)) !== null) {
      const isClosing = match[1] === "/";
      const tag = match[2].toLowerCase();

      if (!isClosing) {
        stack.push(tag);
      } else {
        const last = stack.pop();
        if (!last || last !== tag) {
          throw new InvalidHtmlError("Malformed HTML: Unclosed or mismatched tags");
        }
      }
    }

    if (stack.length > 0) {
      throw new InvalidHtmlError("Malformed HTML: Unclosed tags");
    }

    // Check for invalid tag syntax
    if (/<[^a-zA-Z/!]/.test(html)) {
      throw new InvalidHtmlError("Malformed HTML: Invalid tag syntax");
    }

    // Check for links without href before other validations
    if (/<a(?![^>]*href=)[^>]*>/i.test(html)) {
      throw new ConversionError("Link element missing href attribute");
    }

    const sanitized = HtmlToShopifyRichText.sanitizeHtml(html);

    try {
      // Wrap sanitized body content into full HTML for DOM parsing
      const fullHtml = `<!DOCTYPE html><html><body>${sanitized}</body></html>`;
      const parser = new DOMParser();
      const doc = parser.parseFromString(fullHtml, "text/html");
      const body = doc.body;

      const document = {
        type: "root",
        children: [],
      };

      let currentParagraph = null;

      // If there's no wrapping element, wrap the content in a paragraph
      if (body.children.length === 0 && body.textContent.trim() !== "") {
        const text = body.textContent.trim();
        document.children.push({
          type: "paragraph",
          children: [{ type: "text", value: text }],
        });
      } else {
        for (const child of body.children) {
          const converted = HtmlToShopifyRichText.convertElement(child);
          if (converted !== null && converted !== undefined) {
            currentParagraph = HtmlToShopifyRichText.handleConvertedElement(converted, document, currentParagraph);
          }
        }

        if (currentParagraph && Array.isArray(currentParagraph.children) && currentParagraph.children.length) {
          document.children.push(currentParagraph);
        }
      }

      // If no children were added, add an empty paragraph
      if (!document.children.length) {
        document.children.push({
          type: "paragraph",
          children: [],
        });
      }

      let json;
      try {
        json = JSON.stringify(document);
      } catch (e) {
        throw new JsonEncodingError(`Failed to encode document to JSON: ${e.message}`);
      }

      // Validate JSON by parsing
      try {
        JSON.parse(json);
      } catch (e) {
        throw new JsonEncodingError("Generated JSON is invalid");
      }

      return json;
    } catch (e) {
      if (e instanceof ConversionError || e instanceof InvalidHtmlError || e instanceof JsonEncodingError) {
        throw e;
      }
      throw new ConversionError(`Failed to convert HTML: ${e.message}`, e);
    }
  }

  /**
   * Handle a converted element and update the document structure
   * @param {Object|Object[]} converted
   * @param {Object} document
   * @param {Object|null} currentParagraph
   * @returns {Object|null} updated currentParagraph
   */
  static handleConvertedElement(converted, document, currentParagraph) {
    if (typeof converted !== "object" || converted === null) {
      throw new ConversionError("Converted element must be an object or array");
    }

    // Single element with type
    if (!Array.isArray(converted) && converted.type) {
      if (HtmlToShopifyRichText.BLOCK_ELEMENTS.includes(converted.type)) {
        if (currentParagraph && currentParagraph.children && currentParagraph.children.length) {
          document.children.push(currentParagraph);
          currentParagraph = null;
        }
        document.children.push(converted);
      } else if (HtmlToShopifyRichText.INLINE_ELEMENTS.includes(converted.type)) {
        if (!currentParagraph) {
          currentParagraph = {
            type: "paragraph",
            children: [],
          };
        }
        currentParagraph.children.push(converted);
      } else {
        throw new ConversionError(`Unsupported element type: ${converted.type}`);
      }

      return currentParagraph;
    }

    // Array of inline elements
    if (!currentParagraph) {
      currentParagraph = {
        type: "paragraph",
        children: [],
      };
    }

    for (const item of converted) {
      if (!item) continue;
      if (typeof item !== "object" || !item.type) {
        throw new ConversionError("Invalid converted item structure");
      }
      currentParagraph.children.push(item);
    }

    return currentParagraph;
  }

  /**
   * Sanitize HTML content before conversion
   * @param {string} html
   * @returns {string}
   */
  static sanitizeHtml(html) {
    try {
      const openCount = (html.match(/</g) || []).length;
      const closeCount = (html.match(/>/g) || []).length;
      if (openCount !== closeCount) {
        throw new InvalidHtmlError("Malformed HTML: Unmatched angle brackets");
      }

      // Wrap into a full document
      const fullHtml = `<!DOCTYPE html><html><body>${html}</body></html>`;

      let purified = fullHtml;

      // If DOMPurify is available, use it with a strict config
      if (typeof DOMPurify !== "undefined") {
        purified = DOMPurify.sanitize(fullHtml, {
          ALLOWED_TAGS: ["h1", "h2", "h3", "h4", "h5", "h6", "p", "ul", "ol", "li", "a", "strong", "b", "em", "i"],
          ALLOWED_ATTR: ["href", "title"],
          FORBID_TAGS: ["script", "style"],
        });
      } else {
        // Fallback: strip script and style tags, leave the rest
        purified = fullHtml.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
      }

      const parser = new DOMParser();
      const doc = parser.parseFromString(purified, "text/html");
      const bodyContent = doc.body.innerHTML || "";

      return bodyContent.trim();
    } catch (e) {
      if (e instanceof InvalidHtmlError) throw e;
      throw new InvalidHtmlError(`Failed to sanitize HTML: ${e.message}`);
    }
  }

  /**
   * Convert a DOM node (Element or Text) to Shopify Rich Text structures
   * @param {Node} node
   * @returns {Object[]} array of inline elements
   */
  static convertNode(node) {
    const result = [];

    try {
      // Text node
      if (node.nodeType === Node.TEXT_NODE) {
        let text = node.nodeValue;
        if (text && text.trim() !== "") {
          text = text.replace(/\s+/g, " ");
          result.push({ type: "text", value: text });
        }
        return result;
      }

      const childNodes = node.childNodes;

      for (let i = 0; i < childNodes.length; i++) {
        const childNode = childNodes[i];
        const converted = HtmlToShopifyRichText.convertElement(childNode);

        if (converted !== null && converted !== undefined) {
          if (Array.isArray(converted) && !converted.type) {
            for (const item of converted) {
              result.push(item);
            }
          } else {
            result.push(converted);
          }
        }
      }

      // Whitespace normalization (similar to PHP)
      const normalizedResult = [];
      let lastTextIndex = -1;

      for (let i = 0; i < result.length; i++) {
        const item = result[i];

        if (item.type === "text") {
          let value = item.value;

          // Normalize multiple spaces
          value = value.replace(/\s+/g, " ");

          // Trim at start/end of sequence
          if (i === 0) value = value.replace(/^\s+/, "");
          if (i === result.length - 1) value = value.replace(/\s+$/, "");

          if (lastTextIndex !== -1 && value.trim() !== "") {
            const lastValue = normalizedResult[lastTextIndex].value;
            if (!lastValue.endsWith(" ") && !value.startsWith(" ")) {
              normalizedResult[lastTextIndex].value = lastValue.replace(/\s+$/, "") + " ";
            }
          }

          if (value.trim() !== "") {
            item.value = value;
            normalizedResult.push(item);
            lastTextIndex = normalizedResult.length - 1;
          }
        } else {
          if (lastTextIndex !== -1) {
            const lastValue = normalizedResult[lastTextIndex].value;
            if (!lastValue.endsWith(" ")) {
              normalizedResult[lastTextIndex].value = lastValue.replace(/\s+$/, "") + " ";
            }
          }
          normalizedResult.push(item);
          lastTextIndex = -1;
        }
      }

      return normalizedResult;
    } catch (e) {
      throw new ConversionError("Failed to convert node: " + e.message, e);
    }
  }

  /**
   * Convert a single DOM element to Shopify Rich Text format
   * @param {Node} node
   * @returns {Object|Object[]|null}
   */
  static convertElement(node) {
    const nodeType = node.nodeType;
    const nodeName = nodeType === Node.TEXT_NODE ? "#text" : (node.nodeName || "").toLowerCase();

    // Text node
    if (nodeName === "#text") {
      const text = node.nodeValue;
      if (text && text.trim() !== "") {
        return { type: "text", value: text };
      }
      return null;
    }

    // Headings
    if (HtmlToShopifyRichText.SUPPORTED_HEADINGS.includes(nodeName)) {
      const level = parseInt(nodeName.slice(1), 10);
      const children = HtmlToShopifyRichText.convertNode(node);
      if (children.length) {
        return {
          type: "heading",
          level,
          children,
        };
      }
      return null;
    }

    // Lists
    if (HtmlToShopifyRichText.SUPPORTED_LIST_TAGS.includes(nodeName)) {
      const children = [];
      node.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE && child.nodeValue.trim() === "") return;
        if (child.nodeType !== Node.ELEMENT_NODE || child.nodeName.toLowerCase() !== "li") return;

        const liChildren = HtmlToShopifyRichText.convertNode(child);
        if (liChildren.length) {
          children.push({
            type: "list-item",
            children: liChildren,
          });
        }
      });

      if (children.length) {
        return {
          type: "list",
          listType: nodeName === "ul" ? "unordered" : "ordered",
          children,
        };
      }
      return null;
    }

    // List items (if directly encountered)
    if (nodeName === "li") {
      const children = HtmlToShopifyRichText.convertNode(node);
      if (children.length) {
        return {
          type: "list-item",
          children,
        };
      }
      return null;
    }

    // Links
    if (nodeName === "a") {
      const href = node.getAttribute("href");
      if (!href) {
        throw new ConversionError("Link element missing href attribute");
      }
      const children = HtmlToShopifyRichText.convertNode(node);
      if (children.length) {
        return {
          type: "link",
          url: href,
          title: node.getAttribute("title") || null,
          children,
        };
      }
      return null;
    }

    // Bold
    if (HtmlToShopifyRichText.SUPPORTED_BOLD_TAGS.includes(nodeName)) {
      const children = HtmlToShopifyRichText.convertNode(node);
      if (!children.length) return null;

      for (const child of children) {
        if (child.type === "text") {
          child.bold = true;
          if (child.italic) {
            // Keep both flags; ordering doesn't matter in JS
            const { value } = child;
            delete child.value;
            delete child.bold;
            delete child.italic;
            child.value = value;
            child.bold = true;
            child.italic = true;
          }
        }
      }

      return children;
    }

    // Italic
    if (HtmlToShopifyRichText.SUPPORTED_ITALIC_TAGS.includes(nodeName)) {
      const children = HtmlToShopifyRichText.convertNode(node);
      if (!children.length) return null;

      for (const child of children) {
        if (child.type === "text") {
          child.italic = true;
          if (child.bold) {
            const { value } = child;
            delete child.value;
            delete child.bold;
            delete child.italic;
            child.value = value;
            child.bold = true;
            child.italic = true;
          }
        }
      }

      return children;
    }

    // Paragraphs
    if (nodeName === "p") {
      const children = HtmlToShopifyRichText.convertNode(node);
      if (children.length) {
        return {
          type: "paragraph",
          children,
        };
      }
      return null;
    }

    // Unsupported elements: process children only
    return HtmlToShopifyRichText.convertNode(node);
  }
}

// Optional: ES module exports
export { HtmlToShopifyRichText, InvalidHtmlError, ConversionError, JsonEncodingError };

// Or CommonJS:
// module.exports = { HtmlToShopifyRichText, InvalidHtmlError, ConversionError, JsonEncodingError };
