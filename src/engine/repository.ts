import {throttle} from "throttle-debounce"
import {derived} from "svelte/store"
import {identity, batch, partition, first} from "@welshman/lib"
import {Repository, Relay, matchFilters, getIdAndAddress, getIdFilters} from "@welshman/util"
import type {Filter, TrustedEvent} from "@welshman/util"
import {custom} from "src/util/misc"

export const repository = new Repository()

export const relay = new Relay(repository)

// Sync to/from repository via a custom store
export const events = {
  _subs: [],
  _onUpdate: throttle(300, () => {
    const $events = repository.dump()

    for (const sub of events._subs) {
      sub($events)
    }
  }),
  get: () => repository.dump(),
  set: (events: TrustedEvent[]) => repository.load(events),
  subscribe: f => {
    events._subs.push(f)

    if (events._subs.length === 1) {
      repository.on("update", events._onUpdate)
    }

    return () => {
      events._subs = events._subs.filter(x => x !== f)

      if (events._subs.length === 0) {
        repository.off("update", events._onUpdate)
      }
    }
  },
}

export const deriveEventsMapped = <T>({
  filters,
  eventToItem,
  itemToEvent,
  includeDeleted = false,
}: {
  filters: Filter[]
  eventToItem: (event: TrustedEvent) => T
  itemToEvent: (item: T) => TrustedEvent
  includeDeleted?: boolean
}) =>
  custom<T[]>(setter => {
    let data = repository.query(filters, {includeDeleted}).map(eventToItem).filter(identity)

    setter(data)

    const onUpdate = batch(300, (updates: {added: TrustedEvent[]; removed: Set<string>}[]) => {
      const removed = new Set(updates.flatMap(r => Array.from(r.removed)))
      const added = updates.flatMap(r => r.added)

      let dirty = false
      for (const event of added) {
        if (matchFilters(filters, event)) {
          const item = eventToItem(event)

          if (item) {
            dirty = true
            data.push(item)
          }
        }
      }

      if (!includeDeleted && removed.size > 0) {
        const [deleted, ok] = partition(
          (item: T) => getIdAndAddress(itemToEvent(item)).some(id => removed.has(id)),
          data,
        )

        if (deleted.length > 0) {
          dirty = true
          data = ok
        }
      }

      if (dirty) {
        if (new Set(data.map(item => itemToEvent(item).id)).size < data.length) {
          console.error(`Duplicate records found:`, data, updates)
        }

        setter(data)
      }
    })

    repository.on("update", onUpdate)

    return () => repository.off("update", onUpdate)
  })

export const deriveEvents = (opts: {filters: Filter[]; includeDeleted?: boolean}) =>
  deriveEventsMapped<TrustedEvent>({...opts, eventToItem: identity, itemToEvent: identity})

export const deriveEvent = (idOrAddress: string) =>
  derived(deriveEvents({filters: getIdFilters([idOrAddress]), includeDeleted: true}), first)