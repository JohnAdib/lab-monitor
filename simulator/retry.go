package main

// retryOutcome is what ClaimRetry decided. The HTTP layer maps it to a status
// code; the decision itself lives here so it is made under one lock.
type retryOutcome int

const (
	retryClaimed      retryOutcome = iota // the step is pending again
	retryUnknownStep                      // no such step in this run
	retryNotFailed                        // nothing to retry: queued, running or done
	retryNotRetryable                     // the instrument said retrying will not help
)

// ClaimRetry moves a failed step back to pending so the engine dispatches it
// again, and returns a copy of the step as the decision left it.
//
// The decision and the state change are one critical section on purpose: two
// callers racing for the same failed step would otherwise both find it failed,
// and one failure would become two attempts. The transition itself is the
// claim -- the first caller moves the step out of failed and everyone else
// fails their own guard. Retryability is checked inside the same lock, so a
// caller can never claim a newer failure than the one it looked at.
//
// A failure with no error detail is treated as retryable: only an instrument
// that explicitly says retrying will not help is refused.
func (r *Run) ClaimRetry(stepID string) (retryOutcome, Step) {
	r.Mu.Lock()
	defer r.Mu.Unlock()

	s, exists := r.Steps[stepID]
	switch {
	case !exists:
		return retryUnknownStep, Step{}
	case s.Status != StatusFailed:
		return retryNotFailed, *s
	case s.Error != nil && !s.Error.Retryable:
		return retryNotRetryable, *s
	}
	s.Status = StatusPending
	s.refused = false
	s.StartedAt, s.EndedAt, s.Error = nil, nil, nil
	if r.Status == "blocked" {
		r.Status = "running" // the operator acted; settleLocked re-blocks if it fails again
	}
	// The engine increments Attempt when it dispatches, so the copy still
	// carries the attempt that failed.
	return retryClaimed, *s
}
