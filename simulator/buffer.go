package main

import "sort"

// replayBuffer holds the most recent events, oldest first, up to a fixed
// capacity. Seq values inside it are strictly increasing. Not safe for
// concurrent use: Stream guards it with its own mutex.
type replayBuffer struct {
	capacity int
	events   []Event
}

func newReplayBuffer(capacity int) *replayBuffer {
	return &replayBuffer{capacity: max(capacity, 1)}
}

// push appends e and evicts the oldest event once the buffer is full.
func (b *replayBuffer) push(e Event) {
	if len(b.events) == b.capacity {
		b.events = b.events[1:] // append reallocates when needed, so this does not grow forever
	}
	b.events = append(b.events, e)
}

// since returns a copy of every held event with Seq > seq.
func (b *replayBuffer) since(seq uint64) []Event {
	i := sort.Search(len(b.events), func(i int) bool { return b.events[i].Seq > seq })
	return append([]Event(nil), b.events[i:]...)
}

// lostAfter reports whether the event right after seq was evicted, meaning a
// reader at seq can no longer be brought up to date from this buffer.
func (b *replayBuffer) lostAfter(seq uint64) bool {
	return len(b.events) > 0 && b.events[0].Seq-1 > seq
}
