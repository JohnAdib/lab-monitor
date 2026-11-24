# Notes

> DRAFT. Rewrite in your own words before submitting. You will be asked about
> every line. Fill in the two placeholders marked TODO.

**Time spent:** TODO (roughly how long you actually spent).

## 1. What I deliberately did not build, and why

- **History beyond the replay buffer.** A client that is away longer than the buffer
  gets told (gap frame, red banner) instead of getting the events back. Persisting
  every event would solve it, but the brief asks that loss be admitted, not prevented.
- **Time-based detection of a lost event.** A hole is reported after more than 5
  events arrive beyond it, or as soon as a run-level event (`run.blocked`,
  `run.completed`) arrives beyond it. A deadline would also catch a quiet stream,
  but it needs a clock in the reducer. Counting keeps the reducer pure and testable.
- **Changes to the provided timeline.** A bar whose `finished` fell in a gap is
  drawn up to "now", so it can run into the next bar on the same lane. I did not
  invent an end time to stop that. The fix is a visual one: fade the bar after the
  next attempt on that device starts.
- **Fixes to the chaos knobs in `ws.go`.** The reorder queue (`s.held`) is shared by
  every socket, so it can hand one run's events to another viewer and can hold the
  last event forever. It simulates a network, so I left it as provided. The client
  ignores events whose `run_id` is not the current run.
- **Extras on the failure screen:** clicking a bar for details, a "copy details for
  support" button, run history, and auth. Each would be useful. None changes whether
  a scientist can understand a failure and act on it.

## 2. Where the state layer is most likely to break

- **A quiet stream after a lost event.** With fewer than 5 events after it and no
  run-level event, the screen stays "live" until more arrive.
- **The snapshot only holds each step's current attempt.** After a reload, an earlier
  failed attempt that was retried is gone from the screen.
- **A simulator restart.** It resets `seq` to 1, but a client still holding
  `lastSeq = 40` treats the new events as duplicates. The stream has no epoch or id
  to say "this is a new stream".
- **Event validation is shape-only.** A well-formed event with a wrong `at` (a
  timestamp from the past) is drawn where it says.

## 3. An event arrives for a step I have never seen

If the frame has the full event shape and belongs to the current run, it becomes a
new attempt keyed `stepId#attempt`, merged like any other. I trust what the
instrument reported rather than the workflow I expected.

- **Known device:** the attempt is drawn on that device's lane.
- **Unknown device:** the attempt stays in the state but has no lane to be drawn
  on, because lanes are the fixed `DEVICES` list. If it fails, it still shows in the
  failure panel, since that reads every attempt.
- **Malformed frame or another run's event:** ignored, and the state is unchanged.

## 4. Before an integrator builds on the event contract and the retry endpoint

**Change:**

- **Document the gap frame and add it to the types.** Today it is the only frame
  that is not an event, and `types.ts` does not mention it.
- **Add a stream id or epoch next to `seq`,** so a restart cannot look like
  duplicates.
- **Say which step blocked the run.** `run.blocked` carries no `step_id`.
- **Add an optional `expected_attempt` to the retry request.** A delayed duplicate
  from a script could otherwise claim a *later* failure of the same step.
- **Publish the list of `error.code` values,** while keeping `context` open.

**Leave alone:**

- `seq` monotonic per run.
- `at` as wall-clock time.
- `retryable` as the instrument's call.
- The open `context` map.
- The retry response: one body shape for every answer (202 queued, 404, 409 with the
  current status so repeating a call is safe, 422 with the fault). A script only
  needs to branch on `error`.

## Design decisions worth asking me about

- **Order-free merge.** Events are applied the moment they arrive and merged
  order-free (a field, once reported, is kept; status only moves forward). Sequence
  tracking is separate. That way a lost event never freezes the screen, and it is
  never hidden either.
- **Resuming.** The client resumes from its last *contiguous* seq, so a reconnect
  also asks the server for the event it is missing.
- **Slow viewers.** A viewer that stops reading is disconnected, never blocked on
  and never silently skipped. It reconnects and resumes.
- **The retry claim.** `ClaimRetry` decides retryability under the same lock as the
  claim. A failure with no error detail stays retryable; only `retryable: false` is
  refused.
- **After clicking Retry.** The 202 shows "waiting for the instrument to start
  attempt N". Only the event stream clears the card. A failure that was already
  retried is history, not a call to action.

## Feedback on the exercise

TODO: your own opinion. Some facts from setting it up, to react to or drop:

- The README says the gap frame's shape "is yours", but the provided tests already
  require `{type: 'gap', from, earliest}`.
- On Windows, the check scripts need `python3`, which is only a Microsoft Store stub
  there. The browser checks are hard-wired to port 3000.
- `go test -race` needs cgo, which means a C compiler on Windows.
- The provided tests were precise and caught real mistakes, such as a too-small live
  channel dropping the healthy viewer.

## AI use

I used Claude Code to implement this, test-first, and a second model (through the
Codex CLI) to review the plan and hunt for traps. The conversations are in `ai/`.
TODO: export them there, and say here if you removed anything.
