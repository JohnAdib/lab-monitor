package main

import "sync"

// minLiveBuffer is the smallest per-subscriber queue. A subscriber that falls
// further behind than max(minLiveBuffer, replay size) is disconnected.
const minLiveBuffer = 256

// Stream carries one run's events to connected browsers.
//
// Every event gets a monotonic Seq and is kept in a bounded replay buffer, so a
// client that reconnects with resume_from=N is sent what it missed before it
// goes live. When the buffer no longer holds N+1, Subscribe reports a gap.
type Stream struct {
	mu      sync.Mutex
	seq     uint64
	buf     *replayBuffer
	subs    map[int]chan Event
	nextID  int
	liveCap int
}

func NewStream(bufSize int) *Stream {
	return &Stream{
		buf:     newReplayBuffer(bufSize),
		subs:    map[int]chan Event{},
		liveCap: max(bufSize, minLiveBuffer),
	}
}

// Publish numbers e, records it for replay, and delivers it to every
// subscriber. It never blocks: a subscriber whose queue is full is
// disconnected, so it reconnects and resumes instead of silently missing events.
func (s *Stream) Publish(e Event) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.seq++
	e.Seq = s.seq
	s.buf.push(e)
	for id, ch := range s.subs {
		select {
		case ch <- e:
		default:
			s.removeLocked(id)
		}
	}
}

// Subscribe registers a listener that resumes after resumeFrom.
//
// The backlog is copied and the listener registered under one lock, so no event
// can fall between the two. gap reports that events after resumeFrom were
// evicted; the backlog then starts at the oldest event still held.
func (s *Stream) Subscribe(resumeFrom uint64) (backlog []Event, ch <-chan Event, gap bool, cancel func()) {
	s.mu.Lock()
	defer s.mu.Unlock()

	id := s.nextID
	s.nextID++
	c := make(chan Event, s.liveCap)
	s.subs[id] = c

	return s.buf.since(resumeFrom), c, s.buf.lostAfter(resumeFrom), func() {
		s.mu.Lock()
		defer s.mu.Unlock()
		s.removeLocked(id)
	}
}

// Watermark is the Seq of the most recent published event, 0 before any.
func (s *Stream) Watermark() uint64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.seq
}

// removeLocked is the only place a subscriber channel is closed, so a
// disconnect followed by cancel can never close it twice. Caller holds mu.
func (s *Stream) removeLocked(id int) {
	if ch, ok := s.subs[id]; ok {
		delete(s.subs, id)
		close(ch)
	}
}
