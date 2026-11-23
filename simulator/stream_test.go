package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// ---------------------------------------------------------------------------
// TASK 1 -- the stream is resumable.
// ---------------------------------------------------------------------------

func TestSeqIsAssignedAndMonotonic(t *testing.T) {
	st := NewStream(64)
	_, live, _, cancel := st.Subscribe(0)
	defer cancel()

	for i := 0; i < 5; i++ {
		st.Publish(Event{RunID: "r-1", Type: EventStepStarted})
	}

	var last uint64
	for i := 0; i < 5; i++ {
		e := recv(t, live)
		if e.Seq == 0 {
			t.Fatal("event has no sequence number")
		}
		if e.Seq <= last {
			t.Fatalf("seq %d did not advance past %d", e.Seq, last)
		}
		last = e.Seq
	}
	if got := st.Watermark(); got != last {
		t.Errorf("Watermark() = %d, want %d", got, last)
	}
}

func TestResumeReturnsExactlyTheGap(t *testing.T) {
	st := NewStream(64)
	for i := 0; i < 10; i++ {
		st.Publish(Event{RunID: "r-1", Type: EventStepStarted})
	}

	backlog, _, gap, cancel := st.Subscribe(4)
	defer cancel()

	if gap {
		t.Fatal("buffer holds 64 and only 10 were published, so nothing was evicted")
	}
	if len(backlog) != 6 {
		t.Fatalf("backlog = %d events, want 6 (seq 5 through 10)", len(backlog))
	}
	for i, e := range backlog {
		if want := uint64(i + 5); e.Seq != want {
			t.Errorf("backlog[%d].Seq = %d, want %d", i, e.Seq, want)
		}
	}
}

func TestEvictedCursorReportsGap(t *testing.T) {
	st := NewStream(4)
	for i := 0; i < 20; i++ {
		st.Publish(Event{RunID: "r-1", Type: EventStepStarted})
	}

	_, _, gap, cancel := st.Subscribe(1)
	defer cancel()

	if !gap {
		t.Fatal("resumed from seq 1 with a 4-event buffer holding 17-20; want gap")
	}
}

// One viewer that stops reading must not take the run down with it, and must
// not be left with a hole it cannot see.
//
// There is more than one defensible answer here. Blocking is not one of them.
func TestOneStalledViewerDoesNotBreakTheRun(t *testing.T) {
	const total = 2000

	st := NewStream(4096)

	// A viewer that reads everything.
	_, healthy, _, cancelHealthy := st.Subscribe(0)
	defer cancelHealthy()
	seen := make(chan int, 1)
	go func() {
		n := 0
		for range healthy {
			n++
			if n == total {
				seen <- n
				return
			}
		}
		seen <- n
	}()

	// A viewer that opened the page and walked away. It never reads.
	_, stalled, _, cancelStalled := st.Subscribe(0)
	defer cancelStalled()

	done := make(chan struct{})
	go func() {
		for i := 0; i < total; i++ {
			st.Publish(Event{RunID: "r-1", Type: EventStepStarted})
		}
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("publishing stalled: one viewer that stopped reading has blocked the whole run")
	}

	select {
	case n := <-seen:
		if n != total {
			t.Fatalf("the healthy viewer got %d of %d events", n, total)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("the healthy viewer never caught up")
	}

	// Now look at what the stalled viewer was left holding. Either it is still
	// whole, or it was disconnected and can resume. What it must not be is
	// quietly missing events with no way to find out.
	var got []Event
	disconnected := false
drain:
	for {
		select {
		case e, ok := <-stalled:
			if !ok {
				disconnected = true
				break drain
			}
			got = append(got, e)
		default:
			break drain
		}
	}
	if disconnected {
		return // told it lost its place; it can reconnect with resume_from
	}
	for i, e := range got {
		if want := uint64(i + 1); e.Seq != want {
			t.Fatalf("the stalled viewer holds seq %d at position %d (want %d) and was never told: "+
				"events were dropped silently", e.Seq, i, want)
		}
	}
}

// The endpoint has to work. What it looks like is your call -- this checks what
// it does, not what it returns.
func TestRetryEndpointRetriesTheStep(t *testing.T) {
	srv := NewServer(Config{ReplayBufferSize: 64})
	ts := httptest.NewServer(srv.Routes())
	defer ts.Close()

	var created struct {
		ID string `json:"id"`
	}
	res, err := http.Post(ts.URL+"/runs", "application/json", nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.NewDecoder(res.Body).Decode(&created); err != nil {
		t.Fatal(err)
	}
	res.Body.Close()

	run := srv.run(created.ID)
	run.Mu.Lock()
	run.Steps["warm_reagent_plate"].Status = StatusFailed
	run.Steps["warm_reagent_plate"].Attempt = 1
	run.Mu.Unlock()

	post := func(step string) int {
		r, err := http.Post(ts.URL+"/runs/"+created.ID+"/steps/"+step+"/retry", "application/json", nil)
		if err != nil {
			t.Fatal(err)
		}
		defer r.Body.Close()
		return r.StatusCode
	}

	if code := post("warm_reagent_plate"); code >= 400 {
		t.Fatalf("retrying a failed step returned %d; an operator has to be able to do this", code)
	}
	if s, _ := run.Step("warm_reagent_plate"); s.Status != StatusPending {
		t.Fatalf("after a retry the step is %q, want pending so the engine picks it up", s.Status)
	}

	// A step that is not failed must not be quietly restarted.
	post("fill_sample_plate")
	if s, _ := run.Step("fill_sample_plate"); s.Status != StatusPending || s.Attempt != 0 {
		t.Fatalf("retrying a step that never failed changed it to %q attempt %d", s.Status, s.Attempt)
	}
}

func recv(t *testing.T, ch <-chan Event) Event {
	t.Helper()
	select {
	case e, ok := <-ch:
		if !ok {
			t.Fatal("stream closed")
		}
		return e
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for an event")
		return Event{}
	}
}
