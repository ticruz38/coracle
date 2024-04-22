import {now} from "@welshman/lib"
import type {Filter} from "@welshman/util"
import {Tags, getIdFilters} from "@welshman/util"
import {seconds, batch, doPipe} from "hurdak"
import {pluck, uniq, max, slice, filter, without, sortBy} from "ramda"
import {updateIn} from "src/util/misc"
import {noteKinds, giftWrapKinds, repostKinds, reactionKinds} from "src/util/nostr"
import type {Event} from "src/engine/events/model"
import {env} from "src/engine/session/state"
import {session} from "src/engine/session/derived"
import {updateSession} from "src/engine/session/commands"
import {_events} from "src/engine/events/state"
import {events, isEventMuted} from "src/engine/events/derived"
import {getUserCommunities} from "src/engine/groups/utils"
import {hints} from "src/engine/relays/utils"
import {loadPubkeys, load, subscribe, subscribePersistent} from "src/engine/network/utils"

const onNotificationEvent = batch(300, (chunk: Event[]) => {
  const kinds = getNotificationKinds()
  const $isEventMuted = isEventMuted.get()
  const events = chunk.filter(e => kinds.includes(e.kind) && !$isEventMuted(e))
  const eventsWithParent = chunk.filter(e => Tags.fromEvent(e).parent())
  const pubkeys = uniq(pluck("pubkey", events))

  for (const pubkey of pubkeys) {
    updateSession(
      pubkey,
      updateIn("notifications_last_synced", (t: number) =>
        pluck("created_at", events)
          .concat(t || 0)
          .reduce(max, 0),
      ),
    )
  }

  loadPubkeys(pubkeys)

  if (eventsWithParent.length > 0) {
    const relays = hints.merge(eventsWithParent.map(hints.EventParents)).getUrls()
    const ids = eventsWithParent.flatMap(e => Tags.fromEvent(e).replies().values().valueOf())

    load({
      relays,
      filters: getIdFilters(ids),
      onEvent: e => _events.update($events => $events.concat(e)),
    })
  }

  _events.mapStore.update($m => {
    for (const e of events) {
      $m.set(e.id, e)
    }

    return $m
  })
})

export const getNotificationKinds = () =>
  without(env.get().ENABLE_ZAPS ? [] : [9735], [
    ...noteKinds,
    ...reactionKinds,
    ...giftWrapKinds,
    4,
  ])

const getEventIds = (pubkey: string) =>
  doPipe(events.get(), [
    filter((e: Event) => noteKinds.includes(e.kind) && e.pubkey === pubkey),
    sortBy((e: Event) => -e.created_at),
    slice(0, 256),
    pluck("id"),
  ])

export const loadNotifications = () => {
  const kinds = getNotificationKinds()
  const cutoff = now() - seconds(30, "day")
  const {pubkey, notifications_last_synced = 0} = session.get()
  const since = Math.max(cutoff, notifications_last_synced - seconds(6, "hour"))
  const eventIds = getEventIds(pubkey)

  const filters = [
    {kinds, "#p": [pubkey], since},
    {kinds, "#e": eventIds, since},
    {kinds, authors: [pubkey], since},
  ]

  return subscribe({
    filters,
    timeout: 15000,
    skipCache: true,
    closeOnEose: true,
    relays: hints.ReadRelays().getUrls(),
    onEvent: onNotificationEvent,
  })
}

export const listenForNotifications = async () => {
  const since = now() - 30
  const $session = session.get()
  const eventIds = getEventIds($session.pubkey)
  const addrs = getUserCommunities($session)

  const filters: Filter[] = [
    // Mentions
    {kinds: noteKinds, "#p": [$session.pubkey], limit: 1, since},
    // Messages/groups
    {kinds: [4, ...giftWrapKinds], "#p": [$session.pubkey], limit: 1, since},
  ]

  // Communities
  if (addrs.length > 0) {
    filters.push({kinds: [...noteKinds, ...repostKinds], "#a": addrs, limit: 1, since})
  }

  // Replies
  if (eventIds.length > 0) {
    filters.push({kinds: noteKinds, "#e": eventIds, limit: 1, since})
  }

  // Only grab one event from each category/relay so we have enough to show
  // the notification badges, but load the details lazily
  subscribePersistent({
    filters,
    timeout: 30_000,
    skipCache: true,
    relays: hints.ReadRelays().getUrls(),
    onEvent: onNotificationEvent,
  })
}
