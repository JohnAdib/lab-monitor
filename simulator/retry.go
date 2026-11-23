package main

import (
	"encoding/json"
	"net/http"
)

// ClaimRetry is provided. It moves a failed step back to pending so the engine
// dispatches it again, and reports what the next attempt will be.
//
// The decision and the state change are one critical section on purpose: two
// callers racing for the same failed step would otherwise both find it failed,
// and one failure would become two attempts. The transition itself is the
// claim -- the first caller moves the step out of failed and everyone else
// fails their own guard.
func (r *Run) ClaimRetry(stepID string) (attempt int, ok bool) {
	r.Mu.Lock()
	defer r.Mu.Unlock()

	s, exists := r.Steps[stepID]
	if !exists || s.Status != StatusFailed {
		return 0, false
	}
	s.Status = StatusPending
	s.refused = false
	s.StartedAt, s.EndedAt, s.Error = nil, nil, nil

	// The engine increments Attempt when it dispatches, so report the next one
	// rather than incrementing here.
	return s.Attempt + 1, true
}

// ---------------------------------------------------------------------------
// THIS IS THE EXERCISE. See "Make a failure actionable" in README.md.
// ---------------------------------------------------------------------------
//
// The endpoint two different callers need: a scientist clicking a button, and
// an integrator's script that has just noticed a run is blocked.
//
// Nobody has specified it. Status codes, response body, what a second identical
// call does, what a caller is told when the step cannot be retried -- all
// yours. `writeJSON(w, code, body)` is in http.go if you want it.
//
// The route is wired in http.go and the browser calls it through
// web/src/lib/api.ts. Change either if your design wants a different shape.
//
// TODO(candidate): implement.
func handleRetry(w http.ResponseWriter, req *http.Request, run *Run, stepID string) {
	writeJSON(w, http.StatusNotImplemented, map[string]any{"error": "not implemented"})
}

var _ = json.Marshal
