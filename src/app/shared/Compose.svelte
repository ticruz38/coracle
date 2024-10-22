<style>
  :global(.lazy-image) {
    animation: blurPulse 1.5s infinite;
  }

  :global(a[data-type="tag"]) {
    text-decoration: underline;
  }

  @keyframes blurPulse {
    0% {
      filter: blur(0px);
    }
    50% {
      filter: blur(15px);
    }
    100% {
      filter: blur(0px);
    }
  }
</style>

<script lang="ts">
  import cx from "classnames"
  import {onDestroy} from "svelte"
  import {Editor} from "svelte-tiptap"

  export let element: HTMLElement
  export let editor: Editor

  onDestroy(() => editor?.destroy())
</script>

<div class="flex w-full">
  <div bind:this={element} style={$$props.style} class={cx($$props.class, "w-full")} />
  <slot name="addon" />
</div>
