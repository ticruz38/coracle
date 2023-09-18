import {partition, uniqBy, identity, pluck, sortBy, without, any, prop, assoc} from "ramda"
import {ensurePlural, seconds, doPipe, batch} from "hurdak"
import {now, race} from "src/util/misc"
import {findReplyId} from "src/util/nostr"
import type {DisplayEvent, Event, Filter} from "src/engine2/model"
import {writable} from "src/engine2/util/store"
import {getUrls} from "src/engine2/queries"
import {subscribe} from "./subscription"
import {MultiCursor} from "./cursor"
import {getIdFilters} from "./filter"
import {load} from "./load"

export type FeedOpts = {
  relays: string[]
  filters: Filter[]
  depth?: number
  onEvent?: (e: Event) => void
  shouldListen?: boolean
  shouldLoadParents?: boolean
}

export class FeedLoader {
  since = now()
  stopped = false
  subs: Array<{close: () => void}> = []
  buffer = writable<Event[]>([])
  notes = writable<DisplayEvent[]>([])
  parents = new Map<string, DisplayEvent>()
  deferred: Event[] = []
  cursor: MultiCursor
  ready: Promise<void>

  constructor(readonly opts: FeedOpts) {
    const urls = getUrls(opts.relays)

    // No point in subscribing if we have an end date
    if (opts.shouldListen && !any(prop("until"), ensurePlural(opts.filters) as any[])) {
      this.addSubs([
        subscribe({
          relays: urls,
          filters: opts.filters.map(assoc("since", this.since)),
          onEvent: batch(1000, (events: Event[]) => {
            this.loadParents(events)
            this.buffer.update($buffer => $buffer.concat(events))
          }),
        }),
      ])
    }

    this.cursor = new MultiCursor({
      relays: opts.relays,
      filters: opts.filters,
      onEvent: batch(100, this.loadParents),
    })

    const subs = this.cursor.load(50)

    this.addSubs(subs)

    // Wait until a good number of subscriptions have completed to reduce the chance of
    // out of order notes
    this.ready = race(0.2, pluck("result", subs))
  }

  loadParents = notes => {
    const parentIds = notes.map(findReplyId).filter(identity)

    load({
      relays: this.opts.relays,
      filters: getIdFilters(parentIds),
      onEvent: e => this.parents.set(e.id, e),
    })
  }

  // Control

  addSubs(subs) {
    for (const sub of ensurePlural(subs)) {
      this.subs.push(sub)

      sub.on("close", () => {
        this.subs = without([sub], this.subs)
      })
    }
  }

  stop() {
    this.stopped = true

    for (const sub of this.subs) {
      sub.close()
    }
  }

  // Feed building

  buildFeedChunk = (notes: Event[]) => {
    const seen = new Set(pluck("id", this.notes.get()))
    const parents = []

    return sortBy(
      (e: DisplayEvent) => -e.created_at,
      uniqBy(
        prop("id"),
        notes
          .filter(e => {
            const parentId = findReplyId(e)

            // If we've seen this note or its parent, don't add it again
            if (seen.has(e.id) || seen.has(parentId)) {
              return false
            }

            // If we have a parent, show that instead, with replies grouped underneath
            const parent = this.parents.get(parentId)

            if (parent && !seen.has(findReplyId(parent))) {
              if (!parent.replies) {
                parent.replies = []
              }

              parent.replies.push(e)

              parents.push(parent)

              return false
            }

            return true
          })
          .concat(parents)
          .map((e: DisplayEvent) => {
            if (e.replies) {
              e.replies = uniqBy(prop("id"), e.replies)
            }

            return e
          })
      )
    )
  }

  addToFeed = (notes: Event[]) => {
    this.notes.update($notes => uniqBy(prop("id"), $notes.concat(this.buildFeedChunk(notes))))
  }

  subscribe = f => this.notes.subscribe(f)

  // Loading

  async load(n) {
    await this.ready

    const [subs, notes] = this.cursor.take(n)
    const deferred = this.deferred.splice(0)

    this.addSubs(subs)

    const ok = doPipe(notes.concat(deferred), [this.deferOrphans, this.deferAncient])

    this.addToFeed(ok)
  }

  loadBuffer() {
    this.buffer.update($buffer => {
      this.addToFeed($buffer)

      return []
    })
  }

  deferOrphans = (notes: Event[]) => {
    // If something has a parent id but we haven't found the parent yet, skip it until we have it.
    const [defer, ok] = partition(e => {
      const parentId = findReplyId(e)

      return parentId && !this.parents.get(parentId)
    }, notes)

    setTimeout(() => this.addToFeed(defer), 1500)

    return ok
  }

  deferAncient = (notes: Event[]) => {
    // Sometimes relays send very old data very quickly. Pop these off the queue and re-add
    // them after we have more timely data. They still might be relevant, but order will still
    // be maintained since everything before the cutoff will be deferred the same way.
    const since = now() - seconds(6, "hour")
    const [defer, ok] = partition(e => e.created_at < since, notes)

    setTimeout(() => this.addToFeed(defer), 4000)

    return ok
  }
}
