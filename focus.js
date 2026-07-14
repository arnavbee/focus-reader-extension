// focus.js
let slides = [];
let currentIndex = 0;
let startX = 0;
let startY = 0;

// ── Autoplay state ──────────────────────────────────────────
let isPlaying = false;
let autoplayTimer = null;
let wpm = 350;

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

function scheduleNextSlide() {
  if (!isPlaying) return;
  const slide = slides[currentIndex];
  const delay = getSlideDelay(slide?.text || '');
  animateTimerBar(delay);
  autoplayTimer = setTimeout(() => {
    if (!isPlaying) return;
    if (currentIndex >= slides.length - 1) {
      stopAutoplay();
      return;
    }
    currentIndex++;
    renderSlide('next');
    scheduleNextSlide();
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
  clearTimerBar();
  updatePlayBtn();
}

function toggleAutoplay() {
  isPlaying ? stopAutoplay() : startAutoplay();
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

document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get("activeArticle", (data) => {
    if (data.activeArticle) {
      console.log("Focus Reader Debug - Loaded Article Data:", data.activeArticle);
      if (data.activeArticle.items) {
        console.table(data.activeArticle.items);
      }
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
  document.addEventListener("click", handleClick);

  // Play button click
  document.getElementById("play-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleAutoplay();
  });

  // Speed slider
  const slider = document.getElementById("speed-slider");
  const wpmLabel = document.getElementById("wpm-label");
  slider?.addEventListener("input", () => {
    wpm = parseInt(slider.value, 10);
    wpmLabel.textContent = `${wpm} wpm`;
    // If playing, restart timer with new speed for current slide
    if (isPlaying) {
      if (autoplayTimer) { clearTimeout(autoplayTimer); autoplayTimer = null; }
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

  // Toggle between image mode and text mode
  if (slide.type === "image") {
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
  textEl.innerText = slide.text;
  
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
  textEl.className = `slide-text ${typeClass} ${direction === "prev" ? "animate-prev" : "animate-next"}`;

  progressEl.innerText = `${currentIndex + 1} / ${slides.length}`;
  
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
  } else if (e.key === "Escape") {
    stopAutoplay();
    window.close();
  } else if (e.key === "p" || e.key === "P") {
    toggleAutoplay();
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
