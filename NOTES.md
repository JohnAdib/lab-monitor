# Notes

**Time spent:** about 2–3 hours. Most of it went into understanding the code, how
the pieces connect and how the lab works, then several rounds of back-and-forth
with AI to build and check it.

## How it fits together

- The browser loads the snapshot, then opens the socket with `resume_from` set to the
  snapshot's `seq`.
- The server replays what the client missed, then goes live.
- If the missed events were evicted, the server first sends
  `{type: "gap", from, earliest}`.

What the banner says, from most to least serious:

| Status | When | Shown to the user |
| --- | --- | --- |
| `gap` | The server said events were evicted (sticky; a reconnect does not clear it) | Red: which events were lost |
| `stale` | Socket closed, or an event is missing (more than 5 later events, or a run-level event, arrived after it) | Amber: disconnected, or which event is missing |
| `connecting` | A run exists but the socket has not opened yet | Grey |
| `live` | Socket open and nothing missing | No banner |

The retry endpoint, `POST /runs/{id}/steps/{step}/retry`, gives one body shape for
every answer:

| Code | `error` | Meaning |
| --- | --- | --- |
| 202 | – | Queued. `attempt` is the attempt it will run. Accepted, not done: only events confirm it |
| 404 | `unknown_step` | No such step (or run) |
| 409 | `not_failed` | `status`/`attempt` say what the step is doing now. `pending` means a retry is already queued, so repeating a call is safe |
| 422 | `not_retryable` | `fault` holds the instrument's reason. Retrying will not help |

## 1. What I deliberately did not build, and why

| Not built | Why |
| --- | --- |
| History beyond the replay buffer | The brief asks that loss be admitted, not prevented. The gap frame and red banner do that |
| Time-based detection of a lost event | It would need a clock in the reducer. Counting keeps it pure and testable |
| Changes to the provided timeline | A bar whose `finished` fell in a gap can run into the next bar on its lane. I would not invent an end time; the right fix is visual (fade it once the next attempt starts) |
| Fixes to the chaos knobs in `ws.go` | The shared reorder queue can mix runs and strand the last event. It simulates a network, so I left it. The client ignores other runs' events |
| Bar click-through, "copy details", run history, auth | Useful, but none changes whether a scientist can understand a failure and act on it |

## 2. Where the state layer is most likely to break

- **A quiet stream after a lost event.** With fewer than 5 events after it and no
  run-level event, the screen stays live until more arrive.
- **Snapshots only hold each step's current attempt.** After a reload, an earlier
  failed attempt that was retried is gone.
- **A simulator restart.** It reuses run ids and restarts `seq`. Pressing Start
  always opens a fresh stream (found by testing, fixed test-first). A page left open
  across a restart can still attach to a new run with the same id and drop its early
  events as duplicates. There is no stream epoch to tell them apart.
- **Validation is shape-only.** A well-formed event with a wrong `at` is drawn
  where it says.

## 3. An event arrives for a step I have never seen

If it has the full event shape and belongs to the current run, it becomes a new
attempt (`stepId#attempt`) and is merged like any other. I trust what the instrument
reported over the workflow I expected.

| Case | Result |
| --- | --- |
| Known device | Drawn on that device's lane |
| Unknown device | Kept in the state with no lane to draw on. If it fails, it still shows in the failure panel |
| Malformed frame, or another run's event | Ignored; the state is unchanged |

## 4. Before an integrator builds on the event contract and the endpoint

| Change | Leave alone |
| --- | --- |
| Document the gap frame and add it to the types | `seq` monotonic per run |
| Add a stream id or epoch next to `seq` | `at` as wall-clock time |
| Put `step_id` on `run.blocked` | `retryable` as the instrument's call |
| An optional `expected_attempt` on retry, so a delayed duplicate cannot claim a later failure | The open `context` map |
| Publish the list of `error.code` values | One response shape for every retry answer |

## Design decisions

- **Order-free merge.** Events apply on arrival and merge order-free: a field, once
  reported, is kept, and status only moves forward. Sequence tracking is separate.
  A lost event never freezes the screen and is never hidden.
- **Resuming.** The client resumes from its last *contiguous* seq, so a reconnect
  also asks for the missing event.
- **Slow viewers.** A viewer that stops reading is disconnected, never blocked on and
  never silently skipped. It reconnects and resumes.
- **The retry claim.** Retryability is decided under the same lock as the claim. A
  failure without error detail stays retryable; only `retryable: false` is refused.
- **The failure screen.** The 202 shows "waiting for the instrument to start attempt
  N", and only the stream clears the card. A retried failure is history, not a call
  to action. When retrying cannot help, the card gives guidance instead of a button.

## Feedback on the exercise

It was interesting, and different from the usual. Having to understand the context
first, how the lab and its instruments actually work, was a good way into the
problem.

## AI use

Claude Code, working test-first (TDD), with Codex as an advisor. I used AI to
understand the code structure, then to write the tests for each fix, then the fix
itself, then a final round of polish.
