<style>
  img.loading {
    animation: blurPulse 1.5s infinite;
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
  import type {NodeViewProps} from "@tiptap/core"
  import {NodeViewWrapper} from "svelte-tiptap"
  import cx from "classnames"

  export let node: NodeViewProps["node"]
  export let selected: NodeViewProps["selected"]
</script>

<!-- this component display image or videos only, the filter is made by tiptap -->
<NodeViewWrapper class={cx("link-content inline", {"link-content-selected": selected})}>
  {#if node.attrs.file.type?.includes("video")}
    <video controls autoplay src={node?.attrs?.src} class="max-h-96 object-contain object-center" />
  {:else}
    <img
      alt="Link preview"
      src={node?.attrs?.src}
      class:loading={node.attrs.uploading}
      class="max-h-96 object-contain object-center" />
  {/if}
</NodeViewWrapper>
