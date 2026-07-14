// Extract text of an element excluding any child composite elements (to avoid duplicate text in slides)
function getCleanText(el, excludeSelector) {
  // If the element doesn't contain any nested composite elements, use live innerText directly
  if (!el.querySelector(excludeSelector)) {
    return el.innerText.trim();
  }
  // Otherwise, perform recursive node text extraction to avoid detached innerText issues
  let text = "";
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      text += child.textContent;
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      if (child.matches(excludeSelector) || child.querySelector(excludeSelector)) {
        continue;
      }
      text += getCleanText(child, excludeSelector);
    }
  }
  return text.trim();
}

function extractArticle() {
  const title = document.querySelector('h1')?.innerText || document.title;
  
  // Find the primary article container to narrow down search space
  const container = document.querySelector('article') || 
                    document.querySelector('main') || 
                    document.querySelector('[role="main"]') || 
                    document.querySelector('.post-content') ||
                    document.querySelector('.article-content') ||
                    document.body;

  // Clutter selectors to filter out (sidebars, footers, comments, recommendation grids)
  const excludeSelector = 'footer, header, aside, nav, .comments, .comment, .reply, .recommendations, .related, .sidebar, #comments, .post-footer, .subscription-widget-wrap, .comments-section, .post-comments';

  // Selectors for composite blocks that should be read as a single unified slide
  const compositeSelector = 'blockquote, [class*="tweet" i], [class*="twitter" i], [class*="embed" i]';

  // Extract semantic content elements in order from the main container
  const rawItems = Array.from(container.querySelectorAll(`h1, h2, h3, p, li, figure, img, ${compositeSelector}`));
  
  const seenTexts = new Set();
  const items = [];

  for (const el of rawItems) {
    // Skip elements that are inside header, footer, comments, or sidebars
    if (el.closest(excludeSelector)) continue;

    const isCompositeElement = el.matches(compositeSelector);

    // Check if the current element is nested inside a composite block (like a tweet wrapper)
    const isNestedInsideComposite = el.parentElement && el.parentElement.closest(compositeSelector);
    if (isNestedInsideComposite) {
      continue;
    }

    // Check if the current element is a child inside a normal semantic block (like a paragraph inside a list item)
    // If it is, and this element is NOT a composite block itself, we skip it to prevent double rendering
    const semanticSelector = 'h1, h2, h3, p, li';
    const parentSemantic = el.parentElement ? el.parentElement.closest(semanticSelector) : null;
    if (parentSemantic && !isCompositeElement) {
      continue;
    }

    // Skip elements that are hidden (display: none or height/width is 0)
    const isVisible = el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0;
    if (!isVisible) continue;

    // Get text content, excluding nested composite blocks
    const text = getCleanText(el, compositeSelector);

    // Skip duplicate texts to prevent repeating desktop/mobile templates or TOC headers
    if (seenTexts.has(text)) continue;

    const tagName = el.tagName.toLowerCase();

    // Handle images and figures as full-screen image slides
    if (tagName === "figure" || tagName === "img") {
      // Skip img elements nested inside a figure (the figure itself will be processed)
      if (tagName === "img" && el.closest("figure")) continue;

      const imgEl = tagName === "figure" ? el.querySelector("img") : el;
      if (!imgEl) continue;

      const src = imgEl.src || imgEl.dataset.src || imgEl.getAttribute("data-lazy-src");
      if (!src) continue;

      // Skip tiny images (icons, avatars — under 100px in natural size)
      if (imgEl.naturalWidth > 0 && imgEl.naturalWidth < 100) continue;

      const caption = el.querySelector("figcaption")?.innerText.trim() ||
                      imgEl.alt?.trim() || "";

      if (seenTexts.has(src)) continue;
      seenTexts.add(src);
      items.push({ type: "image", src, text: caption });
      continue;
    }

    // Determine semantic type
    let type = "p";
    if (tagName === "h1" || tagName === "h2" || tagName === "h3") {
      type = tagName;
    } else if (isCompositeElement) {
      type = "blockquote";
    } else if (tagName === "li") {
      const parent = el.parentElement;
      if (parent && parent.tagName.toLowerCase() === "ol") {
        const siblings = Array.from(parent.querySelectorAll(':scope > li'));
        const index = siblings.indexOf(el) + 1;
        seenTexts.add(text);
        items.push({ type: "li", text: `${index}. ${text}` });
        continue;
      } else {
        seenTexts.add(text);
        items.push({ type: "li", text: `• ${text}` });
        continue;
      }
    }

    // Apply length filters (short stubs are filtered out)
    if (type.startsWith("h") && text.length <= 5) continue;
    if (!type.startsWith("h") && text.length <= 20) continue;

    seenTexts.add(text);
    items.push({ type, text });
  }

  return { title, items };
}

// Listen for background requests
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "ping") {
    sendResponse(true);
  } else if (request.action === "extract") {
    sendResponse(extractArticle());
  }
});

// Mark script as loaded
window.__focusReaderLoaded = true;
