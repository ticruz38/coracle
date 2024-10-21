<script lang="ts">
  import type {NodeViewProps} from "@tiptap/core"
  import {NodeViewWrapper} from "svelte-tiptap"
  import {displayUrl} from "@welshman/lib"
  import Anchor from "src/partials/Anchor.svelte"

  export let node: NodeViewProps["node"]
  export let selected: NodeViewProps["selected"]
</script>

<NodeViewWrapper class="inline-block">
  <Anchor
    modal
    underline
    stopPropagation
    class="overflow-hidden text-ellipsis whitespace-nowrap underline"
    externalHref={node.attrs.url}>
    {displayUrl(node.attrs.url)}
  </Anchor>
</NodeViewWrapper>
