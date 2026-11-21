/**
 * Full-screen "rotate your phone" notice. Visibility is driven purely by the
 * `orientation: portrait` media query in overlay.css, so it reacts instantly.
 */
export function RotateOverlay() {
  return (
    <div class="rotate-overlay" role="alert">
      <span class="rotate-overlay__glyph" aria-hidden="true">
        📱↻
      </span>
      <span>Rotate your phone</span>
    </div>
  );
}
