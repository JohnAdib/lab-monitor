package main

import "testing"

func publishN(st *Stream, n int) {
	for i := 0; i < n; i++ {
		st.Publish(Event{RunID: "r-1", Type: EventStepStarted})
	}
}

func TestWatermark_FreshStream_IsZero(t *testing.T) {
	if got := NewStream(4).Watermark(); got != 0 {
		t.Fatalf("Watermark() = %d before any event, want 0", got)
	}
}

func TestSubscribe_FreshStreamFromZero_HasNoBacklogAndNoGap(t *testing.T) {
	backlog, _, gap, cancel := NewStream(4).Subscribe(0)
	defer cancel()
	if gap || len(backlog) != 0 {
		t.Fatalf("backlog=%d gap=%v, want 0 and false", len(backlog), gap)
	}
}

func TestSubscribe_CursorAtWatermark_HasNoBacklogAndNoGap(t *testing.T) {
	st := NewStream(4)
	publishN(st, 10)
	backlog, _, gap, cancel := st.Subscribe(10)
	defer cancel()
	if gap || len(backlog) != 0 {
		t.Fatalf("backlog=%d gap=%v, want 0 and false", len(backlog), gap)
	}
}

func TestSubscribe_CursorJustBeforeOldestHeld_IsACleanResume(t *testing.T) {
	st := NewStream(4)
	publishN(st, 20) // holds 17-20
	backlog, _, gap, cancel := st.Subscribe(16)
	defer cancel()
	if gap || len(backlog) != 4 || backlog[0].Seq != 17 {
		t.Fatalf("gap=%v backlog=%v, want no gap and [17..20]", gap, seqs(backlog))
	}
}

func TestSubscribe_EvictedCursor_ReportsGapAndReplaysEverythingHeld(t *testing.T) {
	st := NewStream(4)
	publishN(st, 20)
	backlog, _, gap, cancel := st.Subscribe(15)
	defer cancel()
	if !gap || len(backlog) != 4 || backlog[0].Seq != 17 {
		t.Fatalf("gap=%v backlog=%v, want gap and [17..20]", gap, seqs(backlog))
	}
}

func TestSubscribe_BacklogThenLive_DeliversEveryEventExactlyOnce(t *testing.T) {
	st := NewStream(8)
	publishN(st, 3)
	backlog, live, _, cancel := st.Subscribe(1)
	defer cancel()
	publishN(st, 1)
	got := append(seqs(backlog), recv(t, live).Seq)
	if len(got) != 3 || got[0] != 2 || got[1] != 3 || got[2] != 4 {
		t.Fatalf("delivered %v, want [2 3 4]", got)
	}
}

func TestPublish_SubscriberTooFarBehind_IsDisconnectedNotSilentlyDropped(t *testing.T) {
	st := NewStream(4)
	_, stalled, _, cancel := st.Subscribe(0)
	defer cancel()
	publishN(st, minLiveBuffer+1)

	var last uint64
	for e := range stalled { // ends only because the stream closed it
		if e.Seq != last+1 {
			t.Fatalf("held seq %d after %d: events were skipped silently", e.Seq, last)
		}
		last = e.Seq
	}
	if last != minLiveBuffer {
		t.Fatalf("stalled viewer held up to %d before disconnect, want %d", last, minLiveBuffer)
	}
}

func TestCancel_AfterStreamDisconnectedTheSubscriber_DoesNotPanic(t *testing.T) {
	st := NewStream(4)
	_, _, _, cancel := st.Subscribe(0)
	publishN(st, minLiveBuffer+1)
	cancel()
	cancel()
}
