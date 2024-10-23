import {nprofileEncode} from "nostr-tools/nip19"
import {SvelteNodeViewRenderer} from "svelte-tiptap"
import Code from "@tiptap/extension-code"
import CodeBlock from "@tiptap/extension-code-block"
import Document from "@tiptap/extension-document"
import Dropcursor from "@tiptap/extension-dropcursor"
import Gapcursor from "@tiptap/extension-gapcursor"
import History from "@tiptap/extension-history"
import Paragraph from "@tiptap/extension-paragraph"
import Text from "@tiptap/extension-text"
import HardBreakExtension from "@tiptap/extension-hard-break"
import {
  Bolt11Extension,
  NProfileExtension,
  NEventExtension,
  NAddrExtension,
  ImageExtension,
  VideoExtension,
  TagExtension,
} from "nostr-editor"
import {ctx} from "@welshman/lib"
import type {StampedEvent} from "@welshman/util"
import {signer, profileSearch} from "@welshman/app"
import {createSuggestions} from "./Suggestions"
import {LinkExtension} from "./LinkExtension"
import EditMention from "./EditMention.svelte"
import EditEvent from "./EditEvent.svelte"
import EditBolt11 from "./EditBolt11.svelte"
import EditMedia from "./EditMedia.svelte"
import EditLink from "./EditLink.svelte"
import Suggestions from "./Suggestions.svelte"
import SuggestionProfile from "./SuggestionProfile.svelte"
import {asInline} from "./util"
import {WordCount} from "./wordcounts"
import {FileUploadExtension} from "./FileUpload"
import {getSetting} from "src/engine"

export {
  createSuggestions,
  LinkExtension,
  EditMention,
  EditEvent,
  EditBolt11,
  EditMedia,
  EditLink,
  Suggestions,
}
export * from "./util"

type EditorOptions = {
  submit: () => void
  getPubkeyHints?: (pubkey: string) => string[]
  element?: HTMLElement
  submitOnEnter?: boolean
  defaultUploadUrl?: string
  autofocus?: boolean
  content?: string
}

export type EditorImage = {
  src: string
  sha256: string
}

export const getModifiedHardBreakExtension = (submit: () => void) =>
  HardBreakExtension.extend({
    addKeyboardShortcuts() {
      return {
        "Shift-Enter": () => this.editor.commands.setHardBreak(),
        "Mod-Enter": () => this.editor.commands.setHardBreak(),
        Enter: () => {
          if (this.editor.getText().trim()) {
            submit()
            return true
          }

          return false
        },
      }
    },
  })

export const getEditorOptions = ({
  submit,
  getPubkeyHints = (pubkey: string) => ctx.app.router.WriteRelays().getUrls(),
  submitOnEnter,
  element,
  defaultUploadUrl = getSetting("nip96_urls").slice(0, 1)[0] || "https://nostr.build",
  autofocus = false,
  content = "",
}: EditorOptions) => ({
  autofocus,
  element,
  content,
  extensions: [
    Code,
    CodeBlock,
    Document,
    Dropcursor,
    Gapcursor,
    History,
    Paragraph,
    Text,
    TagExtension,
    WordCount,
    submitOnEnter ? getModifiedHardBreakExtension(submit) : HardBreakExtension,
    LinkExtension.extend({addNodeView: () => SvelteNodeViewRenderer(EditLink)}),
    Bolt11Extension.extend(asInline({addNodeView: () => SvelteNodeViewRenderer(EditBolt11)})),
    NProfileExtension.extend({
      addNodeView: () => SvelteNodeViewRenderer(EditMention),
      addProseMirrorPlugins() {
        return [
          createSuggestions({
            char: "@",
            name: "nprofile",
            editor: this.editor,
            search: profileSearch,
            select: (pubkey: string, props: any) => {
              const relays = getPubkeyHints(pubkey)
              const nprofile = nprofileEncode({pubkey, relays})

              return props.command({pubkey, nprofile, relays})
            },
            suggestionComponent: SuggestionProfile,
            suggestionsComponent: Suggestions,
          }),
        ]
      },
    }),
    NEventExtension.extend(asInline({addNodeView: () => SvelteNodeViewRenderer(EditEvent)})),
    NAddrExtension.extend(asInline({addNodeView: () => SvelteNodeViewRenderer(EditEvent)})),
    ImageExtension.extend(
      asInline({addNodeView: () => SvelteNodeViewRenderer(EditMedia)}),
    ).configure({defaultUploadUrl, defaultUploadType: "nip96"}),
    VideoExtension.extend(
      asInline({addNodeView: () => SvelteNodeViewRenderer(EditMedia)}),
    ).configure({defaultUploadUrl, defaultUploadType: "nip96"}),
    FileUploadExtension.configure({
      immediateUpload: true,
      sign: (event: StampedEvent) => {
        return signer.get()!.sign(event)
      },
    }),
  ],
})
