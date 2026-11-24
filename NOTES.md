# Notes

**Time spent:** about 2–3 hours. Most of it went into understanding the code, how
the pieces connect and how the lab works, then several rounds of back-and-forth
with AI to build and check it.

## How it works

- The browser loads the snapshot, then opens the socket with `resume_from` set to
  its `seq`. The server replays what was missed, then goes live. If those events
  were evicted, it first sends `{type: "gap", from, earliest}`.
- Events apply on arrival and merge order-free: a field, once reported, is kept,
  and status only moves forward. Sequence tracking is separate, and the client
  resumes from its last *contiguous* seq, so a lost event never freezes the screen.
- A viewer that stops reading is disconnected, never blocked on. It reconnects and
  resumes.

| Banner | When |
| --- | --- |
| `gap` (red) | The server said events were evicted. Sticky across reconnects |
| `stale` (amber) | Socket closed, or an event is missing and either more than 5 later events or a run-level event have arrived |
| `connecting` | A run exists but the socket is not open yet |
| `live` | No banner |

| Retry answer | Meaning |
| --- | --- |
| 202 | Queued; `attempt` is the attempt it will run. Only events confirm it |
| 404 `unknown_step` | No such step. An unknown run returns the starter's `{"error":"no such run"}` |
| 409 `not_failed` | `status` and `attempt` say what the step is doing. `pending` with attempt ≥ 1 means a retry is already queued |
| 422 `not_retryable` | `fault` holds the instrument's reason |

On screen, a 202 shows "waiting for the instrument to start attempt N", and only
the stream clears the card. A failure that was retried, or overtaken by a completed
run, is history. When retrying cannot help, the card explains that the run cannot
continue and the cause must be fixed first.

## 1. What I did not build

- **History beyond the buffer.** The brief asks that loss be admitted, not prevented.
- **Time-based hole detection.** It needs a clock in the reducer. Counting keeps it
  pure.
- **Timeline changes.** A bar whose `finished` fell in a gap can run into the next
  bar on its lane. I would not invent an end time.
- **Bar click-through, run history, auth.** None of them changes whether a
  scientist can act on a failure.

## 2. Where the state layer breaks

- **A hole with 5 or fewer events after it and no run-level event** stays "live".
- **Snapshots hold only each step's current attempt,** so an earlier failure can
  be missing after a reload.
- **A page left open across a simulator restart** can attach to a new run with the
  same id and drop its early events. There is no stream epoch.

## 3. An event for a step I have never seen

If it is well formed and from this run, it becomes a new attempt and is drawn on
its device's lane. On an unknown device it has no lane, but a failure there still
shows in the failure panel. Malformed frames and other runs' events are ignored.

## 4. Before an integrator builds on it

| Change | Leave alone |
| --- | --- |
| Document the gap frame and add it to the types | `seq` monotonic per run |
| Add a stream epoch next to `seq` | `at` as wall-clock time |
| Put `step_id` on `run.blocked` | `retryable` as the instrument's call |
| Optional `expected_attempt` on retry | The open `context` map |
| One error shape, run 404 included | One response shape for retry |

## Feedback on the exercise

It was interesting, and different from the usual. Having to understand the context
first, how the lab and its instruments actually work, was a good way into the
problem.

## AI use

Claude Code, working test-first (TDD), with Codex as an advisor. I used AI to
understand the code structure, then to write the tests for each fix, then the fix
itself, then a final round of polish.
My prompts are in `ai/prompts.md`.
