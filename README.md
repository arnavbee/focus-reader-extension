# Focus Reader

Focus Reader is a lightweight, premium Manifest V3 Chrome Extension designed to eliminate reading distractions. It dynamically extracts target articles, filters out clutter (ads, popups, grids, and tracking scripts), and renders paragraphs as a clean sequence of slides inside a sandboxed viewport.

---

## Key Features

*   **Slide-by-Slide Viewport**: Displays one paragraph or thought at a time to keep your eyes focused and minimize line-tracking strain.
*   **Autoplay Teleprompter**: Automates slide advancement based on a custom Words-Per-Minute (WPM) delay calculation.
*   **Visual Timing Progress**: Includes a linear timer bar at the bottom edge showing when the next slide will arrive.
*   **Dynamic Font Scaling**: Automatically scales viewport typography dynamically based on paragraph length.
*   **Keyboard Navigation**: Native controls:
    *   `ArrowRight` / `Space` / `ArrowDown` &rarr; Next slide
    *   `ArrowLeft` / `ArrowUp` &rarr; Previous slide
    *   `P` &rarr; Toggle Autoplay
    *   `Esc` / `F` &rarr; Exit Focus Mode
*   **Media Support**: Formats figures and blockquotes as clean, isolated layout slides.

---

## File Structure

*   `manifest.json`: Configuration and permissions declaration.
*   `background.js`: Service worker listening for action clicks.
*   `content.js`: Scraper script statically injected to parse target DOM nodes.
*   `focus.html` / `focus.js` / `focus.css`: Viewport markup, logic, and styling.

---

## Installation & Development

1.  Clone this repository or download the source files:
    ```bash
    git clone https://github.com/arnavbee/focus-reader-extension.git
    ```
2.  Open **Google Chrome** and navigate to **`chrome://extensions/`**.
3.  In the top-right corner, toggle **Developer mode** to **ON**.
4.  In the top-left, click **Load unpacked**.
5.  Select the `focus-reader-extension` directory.
6.  Open any online article (e.g., Substack or Wikipedia) and click the Focus Reader icon in your extension bar to start reading!
