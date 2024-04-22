import {nth, inc} from "ramda"
import {Tags} from "@welshman/util"
import type {Event} from "src/engine/events/model"
import {topics} from "./state"

export const addTopic = (e, name) => {
  if (name) {
    const topic = topics.key(name.toLowerCase())

    topic.merge({
      count: inc(topic.get()?.count || 0),
      last_seen: e.created_at,
    })
  }
}

export const processTopics = (e: Event) => {
  const tagTopics = Tags.fromEvent(e).topics().valueOf()
  const contentTopics = Array.from(e.content.toLowerCase().matchAll(/#(\w{2,100})/g)).map(nth(1))

  for (const name of tagTopics.concat(contentTopics)) {
    addTopic(e, name)
  }
}
