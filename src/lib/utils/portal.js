/** Move element to document.body so fixed overlays sit above header/sidebar. */
export function portal(node) {
  document.body.appendChild(node);
  return {
    destroy() {
      if (node.parentNode === document.body) {
        document.body.removeChild(node);
      }
    },
  };
}
