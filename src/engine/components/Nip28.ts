import {find, last, pick, uniq} from "ramda"
import {tryJson, fuzzy, now} from "src/util/misc"
import {Tags, appDataKeys, channelAttrs} from "src/util/nostr"
import type {Channel, Message} from "src/engine/types"
import {collection, derived} from "../util/store"

const messageIsNew = ({last_checked, last_received, last_sent}: Channel) =>
  last_received > Math.max(last_sent || 0, last_checked || 0)

export class Nip28 {
  static contributeState() {
    const channels = collection<Channel>("id")
    const messages = collection<Message>("id")

    const hasNewMessages = derived(
      channels,
      find(e => {
        return e.type === "public" && e.joined > 0 && messageIsNew(e)
      })
    )

    return {channels, messages, hasNewMessages}
  }

  static contributeSelectors({Nip28}) {
    const getSearchChannels = channels =>
      channels.derived($channels => {
        return fuzzy($channels, {
          keys: ["name", {name: "about", weight: 0.5}],
          threshold: 0.3,
        })
      })

    const searchChannels = getSearchChannels(Nip28.channels)

    return {messageIsNew, getSearchChannels, searchChannels}
  }

  static initialize({Events, Nip28, Keys, Crypt}) {
    Events.addHandler(40, e => {
      const channel = Nip28.channels.key(e.id).get()

      if (e.created_at < channel?.updated_at) {
        return
      }

      const content = tryJson(() => pick(channelAttrs, JSON.parse(e.content)))

      if (!content?.name) {
        return
      }

      Nip28.channels.key(e.id).merge({
        type: "public",
        pubkey: e.pubkey,
        updated_at: now(),
        hints: Tags.from(e).relays(),
        ...content,
      })
    })

    Events.addHandler(41, e => {
      const channelId = Tags.from(e).getMeta("e")

      if (!channelId) {
        return
      }

      const channel = Nip28.channels.key(channelId).get()

      if (e.created_at < channel?.updated_at) {
        return
      }

      if (e.pubkey !== channel?.pubkey) {
        return
      }

      const content = tryJson(() => pick(channelAttrs, JSON.parse(e.content)))

      if (!content?.name) {
        return
      }

      Nip28.channels.key(channelId).merge({
        pubkey: e.pubkey,
        updated_at: now(),
        hints: Tags.from(e).relays(),
        ...content,
      })
    })

    Events.addHandler(30078, async e => {
      if (Tags.from(e).getMeta("d") === appDataKeys.NIP28_LAST_CHECKED) {
        await tryJson(async () => {
          const payload = await Crypt.decryptJson(e.content)

          for (const key of Object.keys(payload)) {
            // Backwards compat from when we used to prefix id/pubkey
            const id = last(key.split("/"))
            const channel = Nip28.channels.key(id).get()
            const last_checked = Math.max(payload[id], channel?.last_checked || 0)

            // A bunch of junk got added to this setting. Integer keys, settings, etc
            if (isNaN(last_checked) || last_checked < 1577836800) {
              continue
            }

            Nip28.channels.key(id).merge({last_checked})
          }
        })
      }
    })

    Events.addHandler(30078, async e => {
      if (Tags.from(e).getMeta("d") === appDataKeys.NIP28_ROOMS_JOINED) {
        await tryJson(async () => {
          const channelIds = await Crypt.decryptJson(e.content)

          // Just a bug from when I was building the feature, remove someday
          if (!Array.isArray(channelIds)) {
            return
          }

          Nip28.channels.get().forEach(channel => {
            if (channel.joined && !channelIds.includes(channel.id)) {
              Nip28.channels.key(channel.id).merge({joined: false})
            } else if (!channel.joined && channelIds.includes(channel.id)) {
              Nip28.channels.key(channel.id).merge({joined: true})
            }
          })
        })
      }
    })

    Events.addHandler(42, e => {
      if (Nip28.messages.key(e.id).exists()) {
        return
      }

      const tags = Tags.from(e)
      const channelId = tags.getMeta("e")

      if (!channelId) {
        return
      }

      const channel = Nip28.channels.key(channelId).get()
      const hints = uniq(tags.relays().concat(channel?.hints || []))

      Nip28.messages.key(e.id).merge({
        channel: channelId,
        pubkey: e.pubkey,
        created_at: e.created_at,
        content: e.content,
        tags: e.tags,
      })

      if (e.pubkey === Keys.pubkey.get()) {
        Nip28.channels.key(channelId).merge({last_sent: e.created_at, hints})
      } else {
        Nip28.channels.key(channelId).merge({last_received: e.created_at, hints})
      }
    })
  }
}
