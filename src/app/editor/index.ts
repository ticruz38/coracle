import type {Writable} from "svelte/store"
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
  FileUploadExtension,
} from "nostr-editor"
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
import {uploadFiles, asInline} from "./util"

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
  loading: Writable<boolean>
  getPubkeyHints: (pubkey: string) => string[]
  element?: HTMLElement
  submitOnEnter?: boolean
  defaultUploadUrl?: string
  autofocus?: boolean
}

export const getModifiedHardBreakExtension = () =>
  HardBreakExtension.extend({
    addKeyboardShortcuts() {
      return {
        "Shift-Enter": () => this.editor.commands.setHardBreak(),
        "Mod-Enter": () => this.editor.commands.setHardBreak(),
        Enter: () => {
          if (this.editor.getText().trim()) {
            uploadFiles(this.editor)

            return true
          }

          return false
        },
      }
    },
  })

export const getEditorOptions = ({
  submit,
  loading,
  getPubkeyHints,
  submitOnEnter,
  element,
  defaultUploadUrl = "https://nostr.build",
  autofocus = false,
}: EditorOptions) => ({
  autofocus,
  element,
  content: "",
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
    submitOnEnter ? getModifiedHardBreakExtension() : HardBreakExtension,
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
      immediateUpload: false,
      sign: (event: StampedEvent) => {
        loading.set(true)
        return signer.get()!.sign(event)
      },
      onComplete: () => {
        loading.set(false)
        submit()
      },
    }),
  ],
})
