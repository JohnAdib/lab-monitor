package main

import "testing"

func seqs(events []Event) []uint64 {
	out := make([]uint64, len(events))
	for i, e := range events {
		out[i] = e.Seq
	}
	return out
}

func filled(capacity int, upTo uint64) *replayBuffer {
	b := newReplayBuffer(capacity)
	for s := uint64(1); s <= upTo; s++ {
		b.push(Event{Seq: s})
	}
	return b
}

func TestReplayBuffer_WhenFull_EvictsOldestFirst(t *testing.T) {
	got := seqs(filled(3, 5).since(0))
	if len(got) != 3 || got[0] != 3 || got[2] != 5 {
		t.Fatalf("held %v, want [3 4 5]", got)
	}
}

func TestReplayBuffer_Since_ReturnsOnlyLaterEvents(t *testing.T) {
	if got := seqs(filled(8, 5).since(3)); len(got) != 2 || got[0] != 4 {
		t.Fatalf("since(3) = %v, want [4 5]", got)
	}
}

func TestReplayBuffer_Since_ReturnsACopyTheCallerCannotCorrupt(t *testing.T) {
	b := filled(8, 2)
	b.since(0)[0].Seq = 99
	if got := b.since(0)[0].Seq; got != 1 {
		t.Fatalf("buffer changed through the returned slice: first seq = %d", got)
	}
}

func TestReplayBuffer_LostAfter_IsFalseWhenNextEventIsStillHeld(t *testing.T) {
	if filled(4, 20).lostAfter(16) { // holds 17-20
		t.Fatal("cursor 16 with 17 still held is a clean resume, not a gap")
	}
}

func TestReplayBuffer_LostAfter_IsTrueWhenNextEventWasEvicted(t *testing.T) {
	if !filled(4, 20).lostAfter(15) { // 16 is gone
		t.Fatal("cursor 15 with 16 evicted must report a gap")
	}
}

func TestReplayBuffer_LostAfter_IsFalseWhenEmpty(t *testing.T) {
	if newReplayBuffer(4).lostAfter(0) {
		t.Fatal("an empty buffer has lost nothing")
	}
}

func TestReplayBuffer_NonPositiveCapacity_StillKeepsLatestEvent(t *testing.T) {
	if got := seqs(filled(0, 3).since(0)); len(got) != 1 || got[0] != 3 {
		t.Fatalf("capacity 0 held %v, want [3]", got)
	}
}
