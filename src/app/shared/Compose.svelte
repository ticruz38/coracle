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
  export let element: HTMLElement
</script>

<div class="flex w-full">
  <div bind:this={element} style={$$props.style} class="w-full" />
  <slot name="addon" />
</div>
