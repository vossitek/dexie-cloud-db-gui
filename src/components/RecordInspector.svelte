<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { DatabaseRecord } from '../../shared/contracts';
  import JsonValue from './JsonValue.svelte';
  let {
    record,
    tableName,
    opener,
    onclose,
  }: {
    record: DatabaseRecord;
    tableName: string;
    opener: HTMLElement;
    onclose: () => void;
  } = $props();
  let dialog: HTMLDialogElement | undefined;
  let closeButton: HTMLButtonElement | undefined;

  function closed() {
    const returnTo = opener;
    onclose();
    void tick().then(() => {
      if (returnTo.isConnected) returnTo.focus();
    });
  }

  function containFocus(event: KeyboardEvent) {
    if (event.key !== 'Tab' || !dialog) return;
    const controls = dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), textarea:not(:disabled)',
    );
    const first = controls[0];
    const last = controls[controls.length - 1];
    const active = dialog.ownerDocument.activeElement;
    if (!first || !last) return;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  onMount(() => {
    // Native modality makes the background inert and handles Escape.
    // https://html.spec.whatwg.org/multipage/interactive-elements.html#the-dialog-element
    dialog?.showModal();
    closeButton?.focus();
    return () => dialog?.close();
  });
</script>

<dialog
  bind:this={dialog}
  aria-labelledby="inspector-title"
  aria-describedby="inspector-description"
  aria-modal="true"
  onkeydown={containFocus}
  onclose={closed}
>
  <header>
    <div>
      <h2 id="inspector-title">Record details</h2>
      <p class="small muted">{tableName} · Read only</p>
    </div>
    <button
      class="action-button"
      type="button"
      aria-label="Close inspector"
      bind:this={closeButton}
      onclick={() => dialog?.close()}
    >
      Close
    </button>
  </header>
  <div class="inspector-content">
    <p id="inspector-description" class="small muted">
      All returned properties are shown, including type markers and blob
      references.
    </p>
    <JsonValue value={record} />
  </div>
</dialog>

<style>
  dialog {
    width: min(56rem, calc(100vw - 2 * var(--space-4)));
    max-height: calc(100dvh - 2 * var(--space-4));
    padding: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    background: var(--color-surface);
    color: var(--color-text);
  }
  dialog::backdrop {
    background: rgb(32 41 54 / 45%);
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-4);
    padding: var(--space-4);
    border-bottom: 1px solid var(--color-border);
  }
  header div {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  h2 {
    font-size: 1.125rem;
    margin-bottom: var(--space-1);
  }
  .inspector-content {
    padding: var(--space-4);
  }
  #inspector-description {
    margin-bottom: var(--space-4);
  }
</style>
