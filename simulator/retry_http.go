package main

import (
	"fmt"
	"net/http"
)

// retryResponse is the body of every answer from the retry endpoint, success
// or not, so a script can decode one shape and branch on Error.
//
//	202 Accepted        the retry is queued; Attempt is the attempt it will run.
//	                    Accepted, not done: only the event stream confirms it.
//	404 Not Found       Error "unknown_step" (or the run does not exist)
//	409 Conflict        Error "not_failed": Status/Attempt say what the step is
//	                    doing now. Status "pending" means a retry is already queued,
//	                    so repeating a call is safe.
//	422 Unprocessable   Error "not_retryable": Fault says why retrying cannot help
type retryResponse struct {
	RunID   string     `json:"run_id"`
	StepID  string     `json:"step_id"`
	Status  string     `json:"status,omitempty"`
	Attempt int        `json:"attempt,omitempty"`
	Error   string     `json:"error,omitempty"`
	Message string     `json:"message"`
	Fault   *StepError `json:"fault,omitempty"`
}

func handleRetry(w http.ResponseWriter, _ *http.Request, run *Run, stepID string) {
	outcome, step := run.ClaimRetry(stepID)
	code, body := describeRetry(outcome, step)
	body.RunID, body.StepID = run.ID, stepID
	writeJSON(w, code, body)
}

// describeRetry turns a ClaimRetry decision into a status code and body.
func describeRetry(outcome retryOutcome, s Step) (int, retryResponse) {
	switch outcome {
	case retryClaimed:
		return http.StatusAccepted, retryResponse{
			Status: StatusPending, Attempt: s.Attempt + 1,
			Message: fmt.Sprintf("Retry queued as attempt %d.", s.Attempt+1),
		}
	case retryUnknownStep:
		return http.StatusNotFound, retryResponse{
			Error: "unknown_step", Message: "This run has no step with that id.",
		}
	case retryNotRetryable:
		return http.StatusUnprocessableEntity, retryResponse{
			Status: s.Status, Attempt: s.Attempt, Error: "not_retryable", Fault: s.Error,
			Message: "The instrument reports this fault will recur on retry. Fix the cause first.",
		}
	default: // retryNotFailed
		return http.StatusConflict, retryResponse{
			Status: s.Status, Attempt: s.Attempt, Error: "not_failed",
			Message: fmt.Sprintf("Step is %s, not failed; there is nothing to retry.", s.Status),
		}
	}
}
