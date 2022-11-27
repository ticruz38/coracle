Bugs

- [ ] Pagination
- [ ] Improve data loading. Ditch nostr-tools, or use eose

Features

- [x] Chat
- [x] Threads/social
- [ ] Followers
- [ ] Server discovery
- [ ] Favorite chat rooms

Nostr implementation comments

- [ ] It's impossible to get deletes for an event's replies/mentions in one query, since deletes can't tag anything other than what is to be deleted.
- [ ] Recursive queries are really painful, e.g. to get all notes for an account, you need to 1. get the account's notes, then get everything with those notes in their tags, then get deletions for those.
- [ ] The limit of 3 channels makes things difficult. I want to show a modal without losing all the state in the background. I am reserving one channel for one-off recursive queries.
- [ ] Why no spaces in names? Seems user hostile
