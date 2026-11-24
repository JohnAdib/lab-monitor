# My prompts

The prompts I gave Claude Code while working on this, in order. Edited and
condensed for readability. Claude's replies are not included.

---

**1.** These two folders contain the same exercise, one in Go and one in Python.

- Check these two: are they exactly identical, the same codebase?
- What is this codebase doing? What is the test?
- What needs to change?
- How much work and time do I need, and how much of it is backend and how much
  frontend?

I'd like to pick Go. First do the investigation and come back with how much is
frontend, how much is backend, and everything around it. I'll decide afterwards.

**2.** Let's try the Go one. Run the project. I want to see in the browser what
the UI looks like.

**3.** What is this UI? Why is the timing moving?

**4.** Is it expected to move like that? When I press the button and start the
run, nothing happens. Is that expected, or is it broken?

**5.** Let's plan what we need to do to fix this. Tell me exactly what the
exercise asks and what we can do to achieve it. Follow these:

- Separation of concerns and clean code, on both frontend and backend
- No more than 100 lines per file, if possible
- Helper functions, and custom hooks and multiple components where needed, in
  the right folders with the right names
- Go best practice

Make sure everything is tested, especially around each fix.

**6.** There are two problems, so we fix both. Tell me which files you're going to
change, and run the whole thing once to see how it looks. I want 100% test
coverage for whatever we work on, and TDD. No over-the-top code generation: we only
do what they ask.

**7.** Draft the answers in `NOTES.md`; I'll read it and make sure I can answer
every question myself.

Make sure we solve everything the exercise asks. Watch for traps in the
questions, understand exactly what each problem is and solve it properly. Use
Codex as an advisor and decide the details together. Update the plan based on
this, then start and do the whole thing.

**8.** It says "Disconnected. This screen is not being updated", but the timeline
keeps moving. Is that expected?

**9.** I clicked Start a run, then ran the scenario command, and now it says
"Disconnected". Investigate whether that's a bug.

**10.** There's a red box when I run, and then it says disconnected again. If it's
disconnected, why do the seconds keep going? Should we fix it?

For the notes: the time spent was roughly 2–3 hours, understanding the code and
how the pieces connect, then several rounds of back-and-forth with AI. Use tables
where they help. My feedback: it was interesting and different, and understanding
the context of how the lab works was a good way in.

**11.** The README says no diagrams in the notes, so remove it. Keep the AI section
short: Claude Code, TDD, and Codex as an advisor. I used AI to understand the code
structure, then to write the test for each fix, then the fix, then a final round of
polish.

Do the final check on everything: the code, the docs, and that it all works. This
is the last chance to find a problem. Make sure the bugs are fixed properly, that
we haven't introduced new ones, and that we didn't fall into a trap.

**12.** Are you done with all of the tests and the final verification? Double-check
it with Codex as an advisor.
