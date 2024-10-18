<script lang="ts">
  import {nip19} from "nostr-tools"
  import {throttle} from "throttle-debounce"
  import {createEventDispatcher, onMount} from "svelte"
  import {whereEq} from "ramda"
  import {ctx, last, partition} from "@welshman/lib"
  import {displayProfileByPubkey, profileSearch} from "@welshman/app"
  import PersonBadge from "src/app/shared/PersonBadge.svelte"
  import Suggestions from "src/partials/Suggestions.svelte"
  import {userFollows, createPeopleLoader, getSetting} from "src/engine"
  import type {Readable} from "svelte/store"
  import {createEditor, Editor, SvelteNodeViewRenderer} from "svelte-tiptap"
  import StarterKit from "@tiptap/starter-kit"
  import {NostrExtension} from "nostr-editor"
  import {signer} from "@welshman/app"
  import PersonLink from "src/app/shared/PersonLink.svelte"
  import NoteContentTopic from "src/app/shared/NoteContentTopic.svelte"

  export let onSubmit
  export let autofocus = false
  export let placeholder = null
  export let hostLimit = 1
  export let editor: Readable<Editor>

  let contenteditable, suggestions

  let element: HTMLDivElement

  onMount(() => {
    const urls = getSetting("nip96_urls").slice(0, hostLimit)
    editor = createEditor({
      autofocus,
      element: element,
      editorProps: {
        attributes: {
          placeholder,
        },
      },
      extensions: [
        StarterKit,
        NostrExtension.configure({
          extend: {
            nprofile: {addNodeView: () => SvelteNodeViewRenderer(PersonLink)},
          },
          tag: true,
          image: {
            defaultUploadUrl: urls[0],
            defaultUploadType: "nip96",
          },
          video: {
            defaultUploadUrl: urls[0],
            defaultUploadType: "nip96",
          },
          fileUpload: {
            immediateUpload: true,
            sign: async event => {
              return $signer.sign(event)
            },
            onDrop() {
              console.log("onDrop")
            },
            onComplete() {
              console.log("onComplete")
            },
          },
          link: {autolink: true},
        }),
      ],
      content: "",
    })
  })

  const dispatch = createEventDispatcher()

  const {loading: loadingPeople, load: loadPeople} = createPeopleLoader({
    shouldLoad: (term: string) => term.startsWith("@"),
    onEvent: () => applySearch(getInfo().word),
  })

  const pubkeyEncoder = {
    encode: pubkey => {
      const relays = ctx.app.router.FromPubkeys([pubkey]).getUrls()
      const nprofile = nip19.nprofileEncode({pubkey, relays})

      return "nostr:" + nprofile
    },
    decode: link => {
      // @ts-ignore
      return nip19.decode(last(link.split(":"))).data.pubkey
    },
  }

  const applySearch = throttle(300, (word: string) => {
    let results = []
    if (word.length > 1 && word.startsWith("@")) {
      const [followed, notFollowed] = partition(
        pubkey => $userFollows.has(pubkey),
        $profileSearch.searchValues(word.slice(1)),
      )

      results = followed.concat(notFollowed)
    }

    suggestions.setData(results)
  })

  const getInfo = () => {
    const selection = window.getSelection()
    const {focusNode: node, focusOffset: offset} = selection
    const textBeforeCursor = node.textContent.slice(0, offset)
    const word = last(textBeforeCursor.trim().split(/\s+/))

    return {selection, node, offset, word}
  }

  const autocomplete = ({pubkey = null, force = false} = {}) => {
    let completed = false

    const {selection, node, offset, word} = getInfo()

    const annotate = (prefix, text, value) => {
      const adjustedOffset = offset - word.length + prefix.length

      // Space includes a zero-width space to avoid having the cursor end up inside
      // mention span on backspace, and a space for convenience in composition.
      const space = document.createTextNode("\u200B\u00A0")
      const spaceSpan = document.createElement("span")
      const span = document.createElement("span")

      spaceSpan.append(space)

      span.classList.add("underline")
      span.dataset.coracle = JSON.stringify({prefix, value})
      span.innerText = text

      // Remove our partial mention text
      selection.setBaseAndExtent(node, adjustedOffset, node, offset)
      selection.deleteFromDocument()

      // Add the span and space
      selection.getRangeAt(0).insertNode(span)
      selection.collapse(span.nextSibling, 0)
      span.insertAdjacentElement("afterend", spaceSpan)
      selection.collapse(spaceSpan.nextSibling, 0)

      completed = true
    }

    // Mentions
    if ((force || word.length > 1) && word.startsWith("@") && pubkey) {
      annotate("@", displayProfileByPubkey(pubkey).trim(), pubkeyEncoder.encode(pubkey))
    }

    // Topics
    if ((force || word.length > 1) && word.startsWith("#")) {
      console.log("hash")
      annotate("#", word.slice(1), word.slice(1))
    }

    suggestions.setData([])

    return completed
  }

  const onKeyDown = e => {
    if (e.code === "Enter" && (e.ctrlKey || e.metaKey)) {
      return onSubmit()
    }

    // Don't close a modal, submit the form, or lose focus
    if (["Escape", "Tab"].includes(e.code)) {
      e.preventDefault()
      e.stopPropagation()
    }

    // If we have suggestions, re-route keyboard commands
    if (["Enter", "ArrowUp", "ArrowDown"].includes(e.code) && suggestions.get()) {
      e.preventDefault()
    }

    // Enter adds a newline, so do it on key down
    if (["Enter"].includes(e.code)) {
      autocomplete({pubkey: suggestions.get()})
    }

    // Only autocomplete topics on space
    if (["Space"].includes(e.code)) {
      if (autocomplete()) {
        e.preventDefault()
      }
    }
  }

  const onKeyUp = e => {
    const {word} = getInfo()

    // Populate search data
    loadPeople(word)
    applySearch(word)

    if (["Tab"].includes(e.code)) {
      // autocomplete({pubkey: suggestions.get()})
    }

    if (["Escape", "Space"].includes(e.code)) {
      suggestions.clear()
    }

    if (e.code === "ArrowUp") {
      suggestions.prev()
    }

    if (e.code === "ArrowDown") {
      suggestions.next()
    }

    dispatch("keyup", e)
  }

  export const mention = pubkey => {
    $editor.commands.insertNProfile({nprofile: pubkeyEncoder.encode(pubkey)})
  }

  const createNewLines = (n = 1) => {
    const div = document.createElement("div")

    div.innerHTML = "<br>".repeat(n)

    return div
  }

  export const clear = () => {
    const input = contenteditable.getInput()

    input.innerHTML = ""

    contenteditable.onInput()
  }

  export const nevent = text => {
    $editor.commands.insertNEvent(text)
  }

  export const write = text => {
    $editor.commands.insertContent(text)
  }

  export const newlines = n => {
    const selection = window.getSelection()
    const newLines = createNewLines(2)

    selection.getRangeAt(0).insertNode(newLines)
    selection.collapse(newLines, 2)

    contenteditable.onInput()
  }

  export const parse = () => {
    return $editor.getText()
  }
</script>

<div class="flex w-full">
  <!-- <ContentEditable
    {autofocus}
    {placeholder}
    style={$$props.style}
    class={$$props.class}
    bind:this={contenteditable}
    on:keydown={onKeyDown}
    on:keyup={onKeyUp} /> -->
  <div bind:this={element} class="w-full" on:keydown={onKeyDown} on:keyup={onKeyUp} />
  <slot name="addon" />
</div>

<Suggestions
  bind:this={suggestions}
  select={pubkey => {
    autocomplete({pubkey})
  }}
  loading={$loadingPeople}>
  <div slot="item" let:item>
    <PersonBadge inert pubkey={item} />
  </div>
</Suggestions>
