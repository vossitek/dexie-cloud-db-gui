<script lang="ts">
  import type { JsonValue } from '../../shared/contracts';
  import { formatJson } from '../lib/json';
  let { value }: { value: JsonValue } = $props();
  const text = $derived(formatJson(value));
</script>

<label class="small muted" for="record-json">Complete record JSON</label>
<textarea id="record-json" readonly value={text} spellcheck="false" wrap="soft"
></textarea>

<style>
  textarea {
    display: block;
    width: 100%;
    height: min(60dvh, 32rem);
    min-height: 12rem;
    margin-top: var(--space-2);
    padding: var(--space-4);
    resize: vertical;
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    background: var(--color-surface);
    color: var(--color-text);
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 0.8125rem;
    line-height: 1.6;
  }
</style>
