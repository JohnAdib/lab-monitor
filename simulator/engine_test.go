package main

import (
	"testing"
	"time"
)

// The engine is provided. This test documents what a clean run emits, and it
// should pass before you change anything.
func TestCleanRunShape(t *testing.T) {
	st := NewStream(256)
	r := NewRun("r-1", defaultWorkflow, st, "")

	_, live, _, cancel := st.Subscribe(0)
	defer cancel()

	var got []Event
	done := make(chan struct{})
	go func() {
		for e := range live {
			got = append(got, e)
			if e.Type == EventRunCompleted {
				close(done)
				return
			}
		}
	}()

	r.Start()
	select {
	case <-done:
	case <-time.After(30 * time.Second):
		t.Fatal("run did not complete")
	}

	counts := map[string]int{}
	for _, e := range got {
		counts[e.Type]++
	}
	if counts[EventStepFinished] != len(defaultWorkflow) {
		t.Errorf("finished = %d, want %d", counts[EventStepFinished], len(defaultWorkflow))
	}
	if counts[EventStepDispatched] != len(defaultWorkflow) {
		t.Errorf("dispatched = %d, want %d", counts[EventStepDispatched], len(defaultWorkflow))
	}
	// fill_buffer_plate and warm_reagent_plate each find their device busy.
	if counts[EventStepRefused] != 2 {
		t.Errorf("refused = %d, want 2", counts[EventStepRefused])
	}

	// No device may run two steps at once.
	occupied := map[string]string{}
	for _, e := range got {
		switch e.Type {
		case EventStepStarted:
			if prev, busy := occupied[e.DeviceID]; busy {
				t.Errorf("%s started %s while still running %s", e.DeviceID, e.StepID, prev)
			}
			occupied[e.DeviceID] = e.StepID
		case EventStepFinished, EventStepFailed:
			delete(occupied, e.DeviceID)
		}
	}
}

// A failed step blocks the run rather than ending it, so an operator can retry.
func TestFailureBlocksRun(t *testing.T) {
	st := NewStream(256)
	r := NewRun("r-1", defaultWorkflow, st, "warm_reagent_plate")

	_, live, _, cancel := st.Subscribe(0)
	defer cancel()

	blocked := make(chan struct{})
	go func() {
		for e := range live {
			if e.Type == EventRunBlocked {
				close(blocked)
				return
			}
		}
	}()

	r.Start()
	select {
	case <-blocked:
	case <-time.After(30 * time.Second):
		t.Fatal("run did not block after a step failed")
	}

	s, _ := r.Step("warm_reagent_plate")
	if s.Status != StatusFailed {
		t.Errorf("warm_reagent_plate = %q, want failed", s.Status)
	}
}
