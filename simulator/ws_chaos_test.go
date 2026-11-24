package main

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func TestReorderChaos_TwoViewers_EachGetsEveryEventOfItsOwn(t *testing.T) {
	srv := NewServer(Config{ReplayBufferSize: 64, ReorderPct: 100})
	ts := httptest.NewServer(srv.Routes())
	t.Cleanup(ts.Close)
	srv.createRun(httptest.NewRecorder(), nil)
	stream := srv.streamFor("r-1")

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	url := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws?run_id=r-1&resume_from=0"
	var viewers []*websocket.Conn
	for i := 0; i < 2; i++ {
		conn, _, err := websocket.Dial(ctx, url, nil)
		if err != nil {
			t.Fatal(err)
		}
		defer conn.CloseNow()
		viewers = append(viewers, conn)
	}
	waitForSubscribers(t, stream, 2)
	publishN(stream, 4) // reorder holds pairs and releases them backwards

	for i, conn := range viewers {
		got := make([]int, 4)
		for j := range got {
			_, b, err := conn.Read(ctx)
			if err != nil {
				t.Fatalf("viewer %d: %v after %v", i, err, got[:j])
			}
			var e Event
			_ = json.Unmarshal(b, &e)
			got[j] = int(e.Seq)
		}
		sort.Ints(got)
		if got[0] != 1 || got[1] != 2 || got[2] != 3 || got[3] != 4 {
			t.Fatalf("viewer %d got seqs %v, want each of 1-4 once", i, got)
		}
	}
}

// The reorder knob delays events; it must not keep one forever. With an odd
// count the last event used to wait for a partner that never came, so a run's
// final run.completed never reached the screen.
func TestReorderChaos_OddNumberOfEvents_TheLastOneStillArrives(t *testing.T) {
	srv := NewServer(Config{ReplayBufferSize: 64, ReorderPct: 100})
	ts := httptest.NewServer(srv.Routes())
	t.Cleanup(ts.Close)
	srv.createRun(httptest.NewRecorder(), nil)
	stream := srv.streamFor("r-1")

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(ts.URL, "http")+"/ws?run_id=r-1&resume_from=0", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.CloseNow()
	waitForSubscribers(t, stream, 1)
	publishN(stream, 3)

	for i := 0; i < 3; i++ {
		if _, _, err := conn.Read(ctx); err != nil {
			t.Fatalf("received %d of 3 events: %v", i, err)
		}
	}
}

func waitForSubscribers(t *testing.T, st *Stream, n int) {
	t.Helper()
	for deadline := time.Now().Add(2 * time.Second); time.Now().Before(deadline); {
		st.mu.Lock()
		have := len(st.subs)
		st.mu.Unlock()
		if have == n {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("never saw %d subscribers", n)
}
