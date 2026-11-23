package main

import "sync"

// Stream carries run events to connected browsers.
//
// ---------------------------------------------------------------------------
// THIS IS THE EXERCISE. See TASK 1 in README.md.
// ---------------------------------------------------------------------------
//
// What it does today: hands each event to whoever is connected at that instant.
// Nothing else. No sequence number, no history, nothing to come back to.
//
// So a browser that loses its connection for ten seconds loses ten seconds of
// the run permanently, and cannot tell that it did. It also cannot tell a
// duplicate from a new event, or notice that two arrived in the wrong order.
//
// Your job is to make the stream resumable:
//
//   - give every event a monotonic Seq, assigned here
//   - keep the recent past in a bounded buffer
//   - serve Subscribe(resumeFrom) from that buffer, then go live
//   - report gap == true when resumeFrom is older than anything you still hold
//   - return a real Watermark so a snapshot can say where it sits in the stream
//
// Add whatever else you need. Keep the four signatures below -- the tests call
// them -- but nothing stops you adding more.
//

type Stream struct {
	mu     sync.Mutex
	subs   map[int]chan Event
	nextID int
}

func NewStream(bufSize int) *Stream {
	// TODO(candidate): bufSize is the replay buffer capacity, and nothing reads
	// it yet. Deciding what happens when it fills is part of the exercise.
	_ = bufSize
	return &Stream{subs: map[int]chan Event{}}
}

// Publish delivers an event to every current subscriber.
//
// TODO(candidate): assign e.Seq here, and record the event so it can be
// replayed. Note who else may be inside this type at the same moment.
func (s *Stream) Publish(e Event) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, ch := range s.subs {
		select {
		case ch <- e:
		default: // subscriber is not keeping up; drop rather than stall the run
		}
	}
}

// Subscribe registers a listener.
//
// backlog is written to the socket before ch is drained. gap reports that the
// requested position can no longer be served.
//
// TODO(candidate): backlog and gap are always empty and false. Both are yours.
func (s *Stream) Subscribe(resumeFrom uint64) (backlog []Event, ch <-chan Event, gap bool, cancel func()) {
	s.mu.Lock()
	defer s.mu.Unlock()

	_ = resumeFrom

	id := s.nextID
	s.nextID++
	c := make(chan Event, 256)
	s.subs[id] = c

	return nil, c, false, func() {
		s.mu.Lock()
		defer s.mu.Unlock()
		delete(s.subs, id)
		close(c)
	}
}

// Watermark is the sequence number of the most recent published event. The
// snapshot handler puts it in its response so a client knows where the
// snapshot sits relative to the stream.
//
// TODO(candidate): always 0 today, which tells a client nothing.
func (s *Stream) Watermark() uint64 {
	return 0
}
