# The overlay's live capture is backed by the Meeting record; Meeting Memory is per Meeting

The overlay remains the live UI during a conversation, because it is the discreet window people keep up during a real interview. Starting capture there, or starting an Assessment (which captures no audio), creates a Meeting with a type and title instead of a standalone overlay conversation. This reuses the Meeting lifecycle, the speaker-labelled transcript and the summary as the store for Meeting Memory. Stopping capture pauses the Meeting; only an explicit End ends it.

Meeting Memory is scoped to a single Meeting and is never carried into another one automatically. The only path across Meetings is the Candidate choosing "Save as knowledge", which turns an ended Interview or Assessment into a Recap Knowledge Document. This keeps claims from one interview from leaking into an unrelated one.

## Considered Options

- **Mic capture and labels in the overlay's own conversation store**: rejected, because it would duplicate what the Meeting record already models.
- **Auto-answers on the Meetings page**: rejected, because that page is a full dashboard window, not suitable to keep up during a live interview.
- **Memory that carries across Meetings automatically**: rejected, because stale or unrelated claims would appear in the wrong interview.
