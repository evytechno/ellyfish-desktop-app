<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';

  export let value = '';         // HTML string (two-way bindable via on:change)
  export let placeholder = 'Enter description…';
  export let height = '180px';
  export let disabled = false;

  const dispatch = createEventDispatcher();

  let editorEl;
  let quill;
  let _skipUpdate = false;

  onMount(async () => {
    const Quill = (await import('quill')).default;

    quill = new Quill(editorEl, {
      theme: 'snow',
      placeholder,
      readOnly: disabled,
      modules: {
        toolbar: [
          [{ header: [1, 2, 3, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['link'],
          ['clean'],
        ],
      },
    });

    // Set initial content
    if (value) {
      quill.clipboard.dangerouslyPasteHTML(value);
    }

    // Emit changes upward
    quill.on('text-change', () => {
      if (_skipUpdate) return;
      const html = quill.root.innerHTML;
      // Treat empty editor as empty string
      value = html === '<p><br></p>' ? '' : html;
      dispatch('change', value);
    });
  });

  // Sync external value changes into editor (e.g. when form resets or data loads)
  $: if (quill && !_skipUpdate) {
    const currentHtml = quill.root.innerHTML;
    const incomingHtml = value || '';
    const normalised = currentHtml === '<p><br></p>' ? '' : currentHtml;
    if (normalised !== incomingHtml) {
      _skipUpdate = true;
      quill.clipboard.dangerouslyPasteHTML(incomingHtml);
      _skipUpdate = false;
    }
  }

  $: if (quill) quill.enable(!disabled);

  onDestroy(() => { quill = null; });
</script>

<div class="quill-wrapper" style="--qh:{height};">
  <div bind:this={editorEl}></div>
</div>

<style>
  @import 'quill/dist/quill.snow.css';

  .quill-wrapper :global(.ql-container) {
    height: var(--qh);
    font-size: 13px;
    font-family: inherit;
    border-bottom-left-radius: 6px;
    border-bottom-right-radius: 6px;
  }
  .quill-wrapper :global(.ql-toolbar) {
    border-top-left-radius: 6px;
    border-top-right-radius: 6px;
    background: #f8f9fa;
  }
  .quill-wrapper :global(.ql-editor) {
    min-height: var(--qh);
    max-height: calc(var(--qh) * 2);
    overflow-y: auto;
  }
  .quill-wrapper :global(.ql-editor.ql-blank::before) {
    font-style: normal;
    color: #adb5bd;
    font-size: 13px;
  }
</style>
