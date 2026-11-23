package main

import (
	"encoding/json"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"
)

type Server struct {
	mu       sync.Mutex
	runs     map[string]*Run
	order    []string
	streams  map[string]*Stream // one per run: a viewer of r-1 must not see r-2
	cfg      Config
	held     []Event
	openFrom time.Time // SOCKET_REJECT_MS: refuse sockets until this moment
}

func NewServer(cfg Config) *Server {
	return &Server{runs: map[string]*Run{}, streams: map[string]*Stream{}, cfg: cfg}
}

func (s *Server) streamFor(runID string) *Stream {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.streams[runID]
}

func (s *Server) Routes() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"status": "ok",
			// What the knobs are set to. The scripts read this so they can warn
			// you when a check is about to fail for a reason you switched on.
			"config": map[string]any{
				"fail_step":          s.cfg.FailStep,
				"reorder_pct":        s.cfg.ReorderPct,
				"duplicate_pct":      s.cfg.DuplicatePct,
				"socket_kill_ms":     s.cfg.SocketKillMS,
				"socket_reject_ms":   s.cfg.SocketRejectMS,
				"replay_buffer_size": s.cfg.ReplayBufferSize,
			},
		})
	})
	mux.HandleFunc("GET /workflows", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"steps": defaultWorkflow, "devices": devices})
	})
	mux.HandleFunc("GET /runs", s.listRuns)
	mux.HandleFunc("POST /runs", s.createRun)
	mux.HandleFunc("GET /runs/{id}", s.snapshot)
	mux.HandleFunc("POST /runs/{id}/start", s.startRun)
	mux.HandleFunc("POST /runs/{id}/steps/{stepID}/retry", s.retry)
	mux.HandleFunc("GET /ws", s.serveWS)
	return mux
}

func (s *Server) run(id string) *Run {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.runs[id]
}

func (s *Server) listRuns(w http.ResponseWriter, _ *http.Request) {
	s.mu.Lock()
	out := make([]map[string]string, 0, len(s.order))
	for _, id := range s.order {
		out = append(out, map[string]string{"id": id, "status": s.runs[id].Status})
	}
	s.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{"runs": out})
}

func (s *Server) createRun(w http.ResponseWriter, _ *http.Request) {
	s.mu.Lock()
	id := "r-" + itoa(len(s.order)+1)
	stream := NewStream(s.cfg.ReplayBufferSize)
	r := NewRun(id, defaultWorkflow, stream, s.cfg.FailStep)
	s.streams[id] = stream
	s.runs[id] = r
	s.order = append(s.order, id)
	s.mu.Unlock()
	writeJSON(w, http.StatusCreated, map[string]string{"id": id})
}

func (s *Server) startRun(w http.ResponseWriter, req *http.Request) {
	r := s.run(req.PathValue("id"))
	if r == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "no such run"})
		return
	}
	r.Start()
	writeJSON(w, http.StatusAccepted, map[string]string{"id": r.ID, "status": "running"})
}

// snapshot is the projection a client loads before it subscribes.
//
// The seq field is the stream watermark: the position in the event stream that
// this snapshot reflects. A client reads it and subscribes with
// ?resume_from=<seq>, so the replay covers exactly the window between the two
// and nothing is lost or applied twice.
//
// Provided, and it will keep reporting 0 until Stream.Watermark does something.
func (s *Server) snapshot(w http.ResponseWriter, req *http.Request) {
	r := s.run(req.PathValue("id"))
	if r == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "no such run"})
		return
	}
	seq := s.streamFor(r.ID).Watermark()

	r.Mu.Lock()
	steps := make([]Step, 0, len(r.Steps))
	for _, id := range orderedIDs(r.Steps) {
		steps = append(steps, *r.Steps[id])
	}
	status := r.Status
	r.Mu.Unlock()

	writeJSON(w, http.StatusOK, map[string]any{
		"seq": seq,
		"run": map[string]any{"id": r.ID, "status": status, "steps": steps},
	})
}

func (s *Server) retry(w http.ResponseWriter, req *http.Request) {
	r := s.run(req.PathValue("id"))
	if r == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "no such run"})
		return
	}
	handleRetry(w, req, r, req.PathValue("stepID"))
}

func writeJSON(w http.ResponseWriter, code int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(body)
}

func orderedIDs(m map[string]*Step) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Slice(out, func(i, j int) bool { return defIndex(out[i]) < defIndex(out[j]) })
	return out
}

func defIndex(id string) int {
	for i, d := range defaultWorkflow {
		if d.ID == id {
			return i
		}
	}
	return len(defaultWorkflow)
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b strings.Builder
	digits := []byte{}
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	b.Write(digits)
	return b.String()
}
