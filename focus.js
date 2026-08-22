// focus.js
let slides = [];
let currentIndex = 0;
let startX = 0;
let startY = 0;

// ── Autoplay state ──────────────────────────────────────────
let isPlaying = false;
let autoplayTimer = null;
let wpm = 350;

// ── Read-along state ────────────────────────────────────────
// Read-along darkens one word at a time at the current WPM instead of
// swapping the whole slide at once. Unread words sit dimmed; the word
// you are on and everything behind it is at full contrast.
let readAlong = true;
let theme = "dark";
let wordEls = [];
let wordIndex = 0;
let wordTimer = null;

function saveSettings() {
  try {
    chrome.storage.local.set({ frSettings: { readAlong, theme, wpm } });
  } catch (_) { /* storage unavailable, settings just will not persist */ }
}

function applyTheme() {
  document.documentElement.dataset.theme = theme;
  document.body.dataset.theme = theme;
  const btn = document.getElementById("theme-btn");
  if (btn) btn.textContent = theme === "paper" ? "◐" : "◑";
  fitText();
}

// ── Fill-the-sheet type ──────────────────────────────────────
// Paper theme sets type as large as the slide will allow rather than at a
// fixed scale, so a short line lands like the poster it is and a dense one
// steps down only as far as it has to. Binary search on font size, nine
// passes, which settles well inside a frame.
const FIT_CEILING = {
  "text-h1": 132,
  "text-h2": 120,
  "text-h3": 104,
  "text-xlarge": 128,
  "text-medium": 112,
  "text-small": 84,
  "text-blockquote": 76
};

function fitCeiling(textEl) {
  for (const cls in FIT_CEILING) {
    if (textEl.classList.contains(cls)) return FIT_CEILING[cls];
  }
  return 96;
}

function fitText() {
  const textEl = document.getElementById("slide-text");
  const containerEl = document.getElementById("slide-container");
  if (!textEl || !containerEl) return;

  if (theme !== "paper" || textEl.style.display === "none") {
    textEl.style.fontSize = "";
    return;
  }

  const avail = containerEl.clientHeight - 80; // container's 40px top/bottom padding
  if (avail <= 0) return;

  let lo = 18;
  let hi = fitCeiling(textEl);
  let best = lo;
  // Each pass is a forced synchronous reflow of a very large text node, and
  // this runs on every slide change. Seven passes lands inside 1px of the
  // answer, which is all the trailing Math.floor keeps anyway.
  for (let i = 0; i < 7; i++) {
    const mid = (lo + hi) / 2;
    textEl.style.fontSize = mid + "px";
    if (textEl.scrollHeight <= avail) { best = mid; lo = mid; } else { hi = mid; }
  }
  textEl.style.fontSize = Math.floor(best) + "px";
}

function updateReadAlongBtn() {
  const btn = document.getElementById("read-btn");
  if (!btn) return;
  btn.classList.toggle("active", readAlong);
  btn.title = readAlong ? "Read-along on (R)" : "Read-along off (R)";
}

// Per-word dwell time. Base is one word at the chosen WPM, then long words
// get a little more and punctuation buys a breath, which is what stops the
// highlight feeling metronomic.
function wordDelay(word) {
  const base = 60000 / wpm;
  let d = base;
  if (word.length > 7) d *= 1.25;
  if (word.length > 12) d *= 1.15;
  if (/[,;:)—–]["'”’)\]]?$/.test(word)) d += base * 0.45;
  if (/[.!?]["'”’)\]]?$/.test(word)) d += base * 0.8;
  return Math.max(70, d);
}

function slideWordsDuration() {
  if (wordEls.length === 0) return 0;
  let total = 0;
  for (const el of wordEls) total += wordDelay(el.textContent);
  return total + tailDwell();
}

// A beat at the end of a slide so the last word is actually seen before the
// deck moves on.
function tailDwell() {
  return Math.max(260, (60000 / wpm) * 1.5);
}

function getSlideDelay(text) {
  const words = (text || '').split(/\s+/).filter(w => w.length > 0).length || 5;
  return Math.max(1200, Math.round((words / wpm) * 60000));
}

function animateTimerBar(duration) {
  const bar = document.getElementById('timer-bar');
  if (!bar) return;
  bar.style.transition = 'none';
  bar.style.width = '0%';
  void bar.offsetWidth; // force reflow
  bar.style.transition = `width ${duration}ms linear`;
  bar.style.width = '100%';
}

function clearTimerBar() {
  const bar = document.getElementById('timer-bar');
  if (!bar) return;
  bar.style.transition = 'none';
  bar.style.width = '0%';
}

function advanceOrStop() {
  if (currentIndex >= slides.length - 1) {
    stopAutoplay();
    return;
  }
  currentIndex++;
  renderSlide('next');
  scheduleNextSlide();
}

// Word-by-word walk through the current slide.
function stepWord() {
  if (!isPlaying || !readAlong) return;
  if (wordIndex >= wordEls.length) {
    wordTimer = setTimeout(() => { if (isPlaying) advanceOrStop(); }, tailDwell());
    return;
  }
  const el = wordEls[wordIndex];
  if (wordIndex > 0) wordEls[wordIndex - 1].classList.remove('now');
  el.classList.add('read', 'now');
  wordIndex++;
  wordTimer = setTimeout(stepWord, wordDelay(el.textContent));
}

function clearWordTimer() {
  if (wordTimer) { clearTimeout(wordTimer); wordTimer = null; }
}

function scheduleNextSlide() {
  if (!isPlaying) return;
  clearWordTimer();

  const slide = slides[currentIndex];

  // Read-along handles its own advance once the last word has been lit.
  if (readAlong && wordEls.length > 0) {
    const textEl = document.getElementById('slide-text');
    if (textEl) textEl.classList.add('reading');
    const remaining = wordEls.slice(wordIndex).reduce((t, el) => t + wordDelay(el.textContent), 0);
    animateTimerBar(remaining + tailDwell());
    stepWord();
    return;
  }

  const delay = getSlideDelay(slide?.text || '');
  animateTimerBar(delay);
  autoplayTimer = setTimeout(() => {
    if (!isPlaying) return;
    advanceOrStop();
  }, delay);
}

function startAutoplay() {
  isPlaying = true;
  updatePlayBtn();
  scheduleNextSlide();
}

function stopAutoplay() {
  isPlaying = false;
  if (autoplayTimer) { clearTimeout(autoplayTimer); autoplayTimer = null; }
  clearWordTimer();
  clearTimerBar();
  revealAllWords();
  updatePlayBtn();
}

// Pausing shows the whole slide. Half a paragraph in ghost grey is useless
// to read from, and the word position is kept so resuming picks up cleanly.
function revealAllWords() {
  const textEl = document.getElementById('slide-text');
  if (textEl) textEl.classList.remove('reading');
}

function toggleAutoplay() {
  isPlaying ? stopAutoplay() : startAutoplay();
}

function toggleReadAlong() {
  readAlong = !readAlong;
  updateReadAlongBtn();
  saveSettings();
  if (isPlaying) {
    clearWordTimer();
    if (autoplayTimer) { clearTimeout(autoplayTimer); autoplayTimer = null; }
    if (!readAlong) revealAllWords();
    scheduleNextSlide();
  }
}

function toggleTheme() {
  theme = theme === "paper" ? "dark" : "paper";
  applyTheme();
  saveSettings();
}

function updatePlayBtn() {
  const btn = document.getElementById('play-btn');
  if (!btn) return;
  btn.textContent = isPlaying ? '⏸' : '▶';
  btn.classList.toggle('playing', isPlaying);
}

function resetAutoplayTimer() {
  // Called on manual navigation while autoplay is active — restart the timer for the new slide
  if (!isPlaying) return;
  if (autoplayTimer) { clearTimeout(autoplayTimer); autoplayTimer = null; }
  clearWordTimer();
  scheduleNextSlide();
}
// ─────────────────────────────────────────────────────────────

// Split text into chunks of ~200 characters (roughly 3 lines) on sentence/word boundaries
function chunkText(text, maxChars = 200) {
  if (text.trim().length <= maxChars) {
    return [text.trim()];
  }

  // Split into sentences using a regex that captures the punctuation and spaces
  const sentences = [];
  const regex = /[^.!?]+[.!?]+(?:\s+|$)/g;
  let match;
  let lastIndex = 0;

  while ((match = regex.exec(text)) !== null) {
    const s = match[0].trim();
    // If the previous sentence was just a number (like "1."), prepend it to this sentence instead of keeping it separate
    if (sentences.length > 0 && sentences[sentences.length - 1].match(/^\d+\.$/)) {
      sentences[sentences.length - 1] = sentences[sentences.length - 1] + " " + s;
    } else {
      sentences.push(s);
    }
    lastIndex = regex.lastIndex;
  }

  // If there's remaining text at the end without punctuation, capture it
  if (lastIndex < text.length) {
    const remaining = text.substring(lastIndex).trim();
    if (remaining) {
      if (sentences.length > 0 && sentences[sentences.length - 1].match(/^\d+\.$/)) {
        sentences[sentences.length - 1] = sentences[sentences.length - 1] + " " + remaining;
      } else {
        sentences.push(remaining);
      }
    }
  }

  if (sentences.length === 0) {
    sentences.push(text.trim());
  }

  const chunks = [];
  let currentChunk = "";

  for (let sentence of sentences) {
    sentence = sentence.trim();
    if (!sentence) continue;

    if (currentChunk.length + sentence.length + 1 <= maxChars) {
      currentChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence;
    } else {
      if (currentChunk) chunks.push(currentChunk);

      // If a single sentence is longer than maxChars, chunk it by words
      if (sentence.length > maxChars) {
        const words = sentence.split(/\s+/);
        let wordChunk = "";
        for (const word of words) {
          if (wordChunk.length + word.length + 1 <= maxChars) {
            wordChunk = wordChunk ? `${wordChunk} ${word}` : word;
          } else {
            if (wordChunk) chunks.push(wordChunk);
            wordChunk = word;
          }
        }
        currentChunk = wordChunk;
      } else {
        currentChunk = sentence;
      }
    }
  }
  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}

// Rebuild the slide as individual word spans, keeping the original
// whitespace as text nodes so pre-wrap blockquotes keep their line breaks.
function buildWords(container, text) {
  container.textContent = "";
  wordEls = [];
  const parts = String(text == null ? "" : text).split(/(\s+)/);
  for (const part of parts) {
    if (!part) continue;
    if (/^\s+$/.test(part)) {
      container.appendChild(document.createTextNode(part));
    } else {
      const span = document.createElement("span");
      span.className = "w";
      span.textContent = part;
      container.appendChild(span);
      wordEls.push(span);
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get(["activeArticle", "frSettings"], (data) => {
    const s = data.frSettings;
    if (s) {
      if (typeof s.readAlong === "boolean") readAlong = s.readAlong;
      if (s.theme === "paper" || s.theme === "dark") theme = s.theme;
      if (typeof s.wpm === "number") wpm = s.wpm;
    }
    applyTheme();
    updateReadAlongBtn();

    const slider = document.getElementById("speed-slider");
    const wpmLabel = document.getElementById("wpm-label");
    if (slider) slider.value = String(wpm);
    if (wpmLabel) wpmLabel.textContent = `${wpm} wpm`;

    if (data.activeArticle) {
      const { title, items, paragraphs } = data.activeArticle;

      // Match document title with the original article title
      if (title) {
        document.title = title;
      }

      // Start with title slide
      slides = [{ type: "h1", text: title }];

      if (items && items.length > 0) {
        // Process structured items
        items.forEach(item => {
          if (item.type.startsWith("h") || item.type === "blockquote" || item.type === "image") {
            // Headings, quotes, and images are never chunked — show as single slides
            slides.push({ type: item.type, text: item.text, src: item.src || null });
          } else {
            // Split paragraphs by newlines and chunk them
            const textChunks = item.text
              .split(/\n+/)
              .map(t => t.trim())
              .filter(t => t.length > 10)
              .flatMap(t => chunkText(t, 200));

            textChunks.forEach(chunk => {
              slides.push({ type: "p", text: chunk });
            });
          }
        });
      } else if (paragraphs && paragraphs.length > 0) {
        // Fallback to legacy plain strings
        const processedParagraphs = paragraphs
          .flatMap(p => p.split(/\n+/))
          .map(p => p.trim())
          .filter(p => p.length > 20)
          .flatMap(p => chunkText(p, 200));

        processedParagraphs.forEach(p => {
          slides.push({ type: "p", text: p });
        });
      }

      currentIndex = 0;
      renderSlide("next");
    }
  });

  document.addEventListener("mousedown", (e) => {
    startX = e.clientX;
    startY = e.clientY;
  });
  document.addEventListener("keydown", handleKey);
  window.addEventListener("resize", fitText);
  document.addEventListener("click", handleClick);

  // Play button click
  document.getElementById("play-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleAutoplay();
  });

  document.getElementById("read-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleReadAlong();
  });

  document.getElementById("theme-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleTheme();
  });

  // Speed slider
  const slider = document.getElementById("speed-slider");
  const wpmLabel = document.getElementById("wpm-label");
  slider?.addEventListener("input", () => {
    wpm = parseInt(slider.value, 10);
    wpmLabel.textContent = `${wpm} wpm`;
    saveSettings();
    // If playing, restart timer with new speed for current slide
    if (isPlaying) {
      if (autoplayTimer) { clearTimeout(autoplayTimer); autoplayTimer = null; }
      clearWordTimer();
      scheduleNextSlide();
    }
  });
});

function renderSlide(direction = "next") {
  if (slides.length === 0) return;

  const textEl = document.getElementById("slide-text");
  const imgEl = document.getElementById("slide-img");
  const captionEl = document.getElementById("slide-caption");
  const progressEl = document.getElementById("progress");
  const containerEl = document.getElementById("slide-container");

  const slide = slides[currentIndex];

  // Every new slide starts unread
  clearWordTimer();
  wordIndex = 0;

  // Toggle between image mode and text mode
  if (slide.type === "image") {
    wordEls = [];
    textEl.style.display = "none";
    captionEl.style.display = "none";

    // Hide the image immediately so the old src never flashes
    imgEl.style.opacity = "0";
    imgEl.style.display = "block";
    imgEl.alt = slide.text || "";
    captionEl.innerText = slide.text || "";

    // Only reveal and animate once the new image is fully loaded
    imgEl.onload = () => {
      imgEl.style.opacity = "";
      imgEl.classList.remove("animate-next", "animate-prev");
      void imgEl.offsetWidth;
      imgEl.className = `slide-img ${direction === "prev" ? "animate-prev" : "animate-next"}`;
      if (slide.text) captionEl.style.display = "block";
    };
    imgEl.onerror = () => {
      // If the image fails to load, skip it silently
      imgEl.style.display = "none";
    };

    imgEl.src = slide.src; // Set src last so onload fires correctly
    progressEl.innerText = `${currentIndex + 1} / ${slides.length}`;
    if (containerEl) containerEl.scrollTop = 0;
    return;
  }

  // Text mode
  textEl.style.display = "";
  imgEl.style.display = "none";
  captionEl.style.display = "none";
  buildWords(textEl, slide.text);

  // Paragraph size styles
  let typeClass = "";
  if (slide.type === "h1") {
    typeClass = "text-h1";
  } else if (slide.type === "h2") {
    typeClass = "text-h2";
  } else if (slide.type === "h3") {
    typeClass = "text-h3";
  } else if (slide.type === "blockquote") {
    typeClass = "text-blockquote";
  } else {
    const len = slide.text.length;
    if (len < 80) {
      typeClass = "text-xlarge";
    } else if (len < 240) {
      typeClass = "text-medium";
    } else {
      typeClass = "text-small";
    }
  }

  // Remove previous animation classes
  textEl.classList.remove("animate-next", "animate-prev");

  // Force reflow to restart CSS animation
  void textEl.offsetWidth;

  // Re-apply classes with the updated direction animation
  const readingClass = (isPlaying && readAlong && wordEls.length > 0) ? " reading" : "";
  textEl.className = `slide-text ${typeClass} ${direction === "prev" ? "animate-prev" : "animate-next"}${readingClass}`;

  progressEl.innerText = `${currentIndex + 1} / ${slides.length}`;

  fitText();

  // Reset scroll to top on new slide
  if (containerEl) {
    containerEl.scrollTop = 0;
  }
}

function handleKey(e) {
  if (e.key === "ArrowRight" || e.key === " ") {
    if (currentIndex < slides.length - 1) {
      currentIndex++;
      renderSlide("next");
      resetAutoplayTimer();
    }
  } else if (e.key === "ArrowLeft") {
    if (currentIndex > 0) {
      currentIndex--;
      renderSlide("prev");
      resetAutoplayTimer();
    }
  } else if (e.key === "Escape" || e.key === "f" || e.key === "F") {
    stopAutoplay();
    window.close();
  } else if (e.key === "p" || e.key === "P") {
    toggleAutoplay();
  } else if (e.key === "r" || e.key === "R") {
    toggleReadAlong();
  } else if (e.key === "t" || e.key === "T") {
    toggleTheme();
  }
}

function handleClick(e) {
  // Ignore clicks on control panels or interactive elements
  if (e.target.closest(".controls") || e.target.closest("button") || e.target.closest("a")) return;

  // Detect drag distance (to differentiate text selection from navigation clicks)
  const deltaX = Math.abs(e.clientX - startX);
  const deltaY = Math.abs(e.clientY - startY);

  // If user moved the mouse more than 6px, assume they are highlighting/dragging text
  if (deltaX > 6 || deltaY > 6) {
    return; // Allow the selection highlight to remain, do not navigate
  }

  // Otherwise, clear any accidental word selection caused by clicking
  window.getSelection().removeAllRanges();

  const clickX = e.clientX;
  const width = window.innerWidth;

  // Right half advances, Left half rewinds
  if (clickX > width / 2) {
    if (currentIndex < slides.length - 1) {
      currentIndex++;
      renderSlide("next");
      resetAutoplayTimer();
    }
  } else {
    if (currentIndex > 0) {
      currentIndex--;
      renderSlide("prev");
      resetAutoplayTimer();
    }
  }
}
