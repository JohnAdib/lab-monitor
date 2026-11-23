package main

import (
	"sync"
	"time"
)

const tickInterval = 100 * time.Millisecond

// Step statuses. A step is dispatched before it is running: the command has
// been sent to the instrument but the instrument has not confirmed yet.
const (
	StatusPending    = "pending"
	StatusDispatched = "dispatched"
	StatusRunning    = "running"
	StatusDone       = "done"
	StatusFailed     = "failed"
)

type Step struct {
	ID        string   `json:"id"`
	DeviceID  string   `json:"device_id"`
	DependsOn []string `json:"depends_on"`
	Status    string   `json:"status"`
	Attempt   int      `json:"attempt"`

	// Wall-clock, so a snapshot alone is enough to draw the timeline.
	StartedAt *time.Time `json:"started_at"`
	EndedAt   *time.Time `json:"ended_at"`
	// Set while Status is failed, so a client that joins late still knows why.
	Error *StepError `json:"error"`

	duration time.Duration
	ticksLef int
	refused  bool // refusal already announced for this attempt
}

type Run struct {
	ID     string `json:"id"`
	Status string `json:"status"`

	// Mu guards Steps and busy. It is exported because retry.go needs to make
	// a decision and a state change without another caller slipping between
	// them. The accessor methods below each take it for a single operation.
	Mu    sync.Mutex       `json:"-"`
	Steps map[string]*Step `json:"steps"`

	busy    map[string]string // device id -> step id currently occupying it
	stream  *Stream
	started bool
	failAt  string // FAIL_STEP: fails once, on attempt 1
}

func NewRun(id string, defs []StepDef, stream *Stream, failAt string) *Run {
	r := &Run{
		ID:     id,
		Status: "created",
		Steps:  map[string]*Step{},
		busy:   map[string]string{},
		stream: stream,
		failAt: failAt,
	}
	for _, d := range defs {
		r.Steps[d.ID] = &Step{
			ID: d.ID, DeviceID: d.DeviceID, DependsOn: d.DependsOn,
			Status: StatusPending, Attempt: 0, duration: d.Duration,
		}
	}
	return r
}

// Step returns a copy of one step. Each call takes and releases Mu.
func (r *Run) Step(id string) (Step, bool) {
	r.Mu.Lock()
	defer r.Mu.Unlock()
	s, ok := r.Steps[id]
	if !ok {
		return Step{}, false
	}
	return *s, true
}

// SetStatus writes one step's status. Each call takes and releases Mu.
func (r *Run) SetStatus(id, status string) {
	r.Mu.Lock()
	defer r.Mu.Unlock()
	if s, ok := r.Steps[id]; ok {
		s.Status = status
	}
}

func (r *Run) Start() {
	r.Mu.Lock()
	if r.started {
		r.Mu.Unlock()
		return
	}
	r.started = true
	r.Status = "running"
	r.Mu.Unlock()
	go r.loop()
}

func (r *Run) loop() {
	t := time.NewTicker(tickInterval)
	defer t.Stop()
	for range t.C {
		if r.tick() {
			return
		}
	}
}

// tick advances every step by one interval and returns true when the run is
// over. Events are collected under the lock and published after it is
// released, so a slow subscriber cannot stall the engine.
func (r *Run) tick() (done bool) {
	var out []Event

	r.Mu.Lock()
	for _, s := range r.Steps {
		switch s.Status {
		case StatusDispatched:
			s.Status = StatusRunning
			s.ticksLef = int(s.duration / tickInterval)
			now := time.Now().UTC()
			s.StartedAt, s.EndedAt = &now, nil
			out = append(out, r.ev(EventStepStarted, s, nil))
		case StatusRunning:
			s.ticksLef--
			if s.ticksLef > 0 {
				continue
			}
			delete(r.busy, s.DeviceID)
			now := time.Now().UTC()
			s.EndedAt = &now
			if s.ID == r.failAt && s.Attempt == 1 {
				s.Status = StatusFailed
				s.Error = faultFor(s.DeviceID, s.ID)
				out = append(out, r.ev(EventStepFailed, s, s.Error))
			} else {
				s.Status = StatusDone
				s.Error = nil
				out = append(out, r.ev(EventStepFinished, s, nil))
			}
		}
	}
	out = append(out, r.dispatchReadyLocked()...)
	out = append(out, r.settleLocked()...)
	done = r.Status == "completed"
	r.Mu.Unlock()

	for _, e := range out {
		r.stream.Publish(e)
	}
	return done
}

// dispatchReadyLocked sends every step whose dependencies are met to its
// device, and announces a refusal for those whose device is already occupied.
// Caller holds Mu.
func (r *Run) dispatchReadyLocked() []Event {
	var out []Event
	for _, id := range orderedIDs(r.Steps) {
		s := r.Steps[id]
		if s.Status != StatusPending || !r.readyLocked(s) {
			continue
		}
		if _, occupied := r.busy[s.DeviceID]; occupied {
			if !s.refused {
				s.refused = true
				out = append(out, r.evAttempt(EventStepRefused, s, s.Attempt+1, nil))
			}
			continue
		}
		r.busy[s.DeviceID] = s.ID
		s.Attempt++
		s.Status = StatusDispatched
		s.refused = false
		out = append(out, r.ev(EventStepDispatched, s, nil))
	}
	return out
}

func (r *Run) readyLocked(s *Step) bool {
	for _, dep := range s.DependsOn {
		if d, ok := r.Steps[dep]; !ok || d.Status != StatusDone {
			return false
		}
	}
	return true
}

// settleLocked ends the run when everything is done, or blocks it when a
// failure means nothing further can happen without an operator. Caller holds Mu.
func (r *Run) settleLocked() []Event {
	if r.Status != "running" && r.Status != "blocked" {
		return nil
	}
	allDone, anyFailed, anyActive := true, false, false
	for _, s := range r.Steps {
		switch s.Status {
		case StatusDone:
		case StatusFailed:
			allDone, anyFailed = false, true
		default:
			allDone = false
			if s.Status != StatusPending || r.readyLocked(s) {
				anyActive = true
			}
		}
	}
	switch {
	case allDone && r.Status != "completed":
		r.Status = "completed"
		return []Event{{RunID: r.ID, Type: EventRunCompleted, At: time.Now().UTC()}}
	case anyFailed && !anyActive && r.Status != "blocked":
		r.Status = "blocked"
		return []Event{{RunID: r.ID, Type: EventRunBlocked, At: time.Now().UTC()}}
	}
	return nil
}

func (r *Run) ev(kind string, s *Step, stepErr *StepError) Event {
	return r.evAttempt(kind, s, s.Attempt, stepErr)
}

func (r *Run) evAttempt(kind string, s *Step, attempt int, stepErr *StepError) Event {
	return Event{
		RunID: r.ID, Type: kind, StepID: s.ID, Attempt: attempt,
		DeviceID: s.DeviceID, At: time.Now().UTC(), Error: stepErr,
	}
}
