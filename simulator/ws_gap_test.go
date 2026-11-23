package main

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

// frame decodes either an event or a gap notice; Type tells them apart.
type frame struct {
	Type     string `json:"type"`
	Seq      uint64 `json:"seq"`
	From     uint64 `json:"from"`
	Earliest uint64 `json:"earliest"`
}

// resumeAt publishes `published` events on a run whose buffer holds two, then
// opens a socket resuming from `from` and returns the first `n` frames.
func resumeAt(t *testing.T, published int, from uint64, n int) []frame {
	t.Helper()
	srv := NewServer(Config{ReplayBufferSize: 2})
	ts := httptest.NewServer(srv.Routes())
	t.Cleanup(ts.Close)
	rec := httptest.NewRecorder()
	srv.createRun(rec, nil)
	stream := srv.streamFor("r-1")
	publishN(stream, published)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	url := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws?run_id=r-1&resume_from=" + strconv.FormatUint(from, 10)
	conn, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.CloseNow()

	out := make([]frame, n)
	for i := range out {
		_, b, err := conn.Read(ctx)
		if err != nil {
			t.Fatal(err)
		}
		_ = json.Unmarshal(b, &out[i])
	}
	return out
}

func TestServeWS_UnservableResume_SendsGapFrameBeforeTheReplay(t *testing.T) {
	got := resumeAt(t, 5, 1, 3) // buffer holds 4-5; 2-3 are gone
	if got[0].Type != "gap" || got[0].From != 1 || got[0].Earliest != 4 {
		t.Fatalf("first frame = %+v, want gap from 1 earliest 4", got[0])
	}
	if got[1].Seq != 4 || got[2].Seq != 5 {
		t.Fatalf("replay = %d,%d after the gap, want 4,5", got[1].Seq, got[2].Seq)
	}
}

func TestServeWS_CleanResume_SendsNoGapFrame(t *testing.T) {
	got := resumeAt(t, 5, 3, 1)
	if got[0].Type == "gap" || got[0].Seq != 4 {
		t.Fatalf("first frame = %+v, want event 4 and no gap", got[0])
	}
}
