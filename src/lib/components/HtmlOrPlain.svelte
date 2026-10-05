<script>
  import DOMPurify from "dompurify";

  /** Renders Quill HTML when present; keeps old plain-text values readable. */
  export let value = "";
  /** Prefer "div" for lists/paragraphs (needed for PDF/print). */
  export let tag = "div";
  let className = "";
  export { className as class };

  const PURIFY = {
    USE_PROFILES: { html: true },
    ALLOWED_TAGS: [
      "p", "br", "div", "span",
      "strong", "b", "em", "i", "u", "s", "strike",
      "ol", "ul", "li",
      "h1", "h2", "h3", "h4", "h5", "h6",
      "a", "blockquote", "pre", "sub", "sup",
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "class"],
  };

  function isHtml(str) {
    return str ? /<[a-z][\s\S]*>/i.test(str) : false;
  }

  $: html = isHtml(value);
  // Block tags inside <span> break list layout in print — force div for HTML.
  $: el = html ? "div" : tag;
  $: safe = html ? DOMPurify.sanitize(value ?? "", PURIFY) : "";
</script>

{#if value}
  {#if html}
    <svelte:element this={el} class="html-or-plain rich {className}">{@html safe}</svelte:element>
  {:else}
    <svelte:element this={el} class="html-or-plain plain {className}">{value}</svelte:element>
  {/if}
{/if}

<style>
  .html-or-plain.rich {
    display: block;
    line-height: 1.45;
  }
  .html-or-plain :global(p) {
    margin: 0 0 0.35em;
  }
  .html-or-plain :global(p:last-child) {
    margin-bottom: 0;
  }
  .html-or-plain :global(ol),
  .html-or-plain :global(ul) {
    margin: 0.25em 0 0.35em;
    padding-left: 1.4em;
    list-style-position: outside;
  }
  .html-or-plain :global(ol) {
    list-style-type: decimal;
  }
  .html-or-plain :global(ul) {
    list-style-type: disc;
  }
  .html-or-plain :global(li) {
    margin: 0.15em 0;
    display: list-item;
  }
  .html-or-plain :global(li > p) {
    margin: 0;
  }
  .html-or-plain :global(strong),
  .html-or-plain :global(b) {
    font-weight: 700;
  }
  .html-or-plain :global(em),
  .html-or-plain :global(i) {
    font-style: italic;
  }
  .html-or-plain :global(u) {
    text-decoration: underline;
  }
  .html-or-plain :global(s),
  .html-or-plain :global(strike) {
    text-decoration: line-through;
  }
  .html-or-plain :global(a) {
    color: inherit;
    text-decoration: underline;
  }
  .plain {
    white-space: pre-wrap;
  }
</style>
