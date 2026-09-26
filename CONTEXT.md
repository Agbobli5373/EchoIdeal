# EchoIdeal

A desktop assistant that listens to a live conversation and suggests what the user should say next. Interviews are the primary scenario; other meetings use the same mechanisms.

## Language

### People

**Candidate**:
The person using EchoIdeal during an Interview or Assessment, who receives Suggested Answers. In General Meetings the same person is shown as "You".
_Avoid_: Interviewee, user (in interview context)

**Interviewer**:
The other party in an Interview, who asks questions and follow-ups. In other Meetings the other party is shown as "Them". When several people interview together, each is a Voice.
_Avoid_: Speaker, system audio

**Voice**:
One person on the other side of a Meeting, told apart from the others by how they sound, and shown as Interviewer 1, 2… (Them 1, 2… in other Meetings) in the order they first speak. The Candidate can name a Voice, merge two that are the same person, or move a line to another Voice. Voices belong to one Meeting only.
_Avoid_: Speaker ID, diarization label, voiceprint

### Knowledge

**Knowledge Document**:
A text document the Candidate provides (an uploaded file, an image converted to text, or pasted text) whose content the AI treats as facts about the Candidate and their situation, such as a CV, a job description or a prepared story, or as reference material they chose, such as a manual. It is the only source of facts about the Candidate, but never limits answers to general questions.
_Avoid_: Context, attachment, file, resume box

**Active Knowledge**:
The Knowledge Documents currently switched on; the only documents the AI draws on when suggesting answers.
_Avoid_: Knowledge base, selected files

**Knowledge Budget**:
The maximum combined size of Active Knowledge sent with each question: documents sent in full, plus a fixed room for passages once any document is a Searched Document. A document that would exceed it cannot be sent in full.
_Avoid_: Limit, context window

**Searched Document**:
An Active Knowledge Document too large for the Knowledge Budget, switched on so that each question sends only its passages that best match the question, rather than its full text. Requires an Embeddings Provider.
_Avoid_: RAG, vector store, indexed file

**Embeddings Provider**:
The optional service, separate from the AI provider, that turns passages of Searched Documents and each question into vectors so matching passages can be found.
_Avoid_: Vector provider, search provider

**Recap**:
A Knowledge Document generated from an ended Interview or Assessment. An Interview Recap lists the facts, numbers and stories the Candidate committed to and the topics the Interviewer probed; an Assessment Recap lists each problem and the solution submitted.
_Avoid_: Summary, transcript export, meeting summary

### Meetings

**Meeting**:
One live conversation or test EchoIdeal assists with, from start to end; pausing capture does not end it. Every Meeting is an Interview, an Assessment or a General Meeting.
_Avoid_: Session, call, conversation

**Interview**:
A Meeting of the Interview type, in which the Candidate is being interviewed by the Interviewer.
_Avoid_: Interview session

**Assessment**:
A Meeting of the Assessment type: a screen-only test with no Interviewer speaking, where Suggested Answers are solutions to submit.
_Avoid_: Test, coding challenge, online assessment

**General Meeting**:
A Meeting of the General type: any captured conversation that is neither an Interview nor an Assessment.
_Avoid_: Normal meeting, conversation

**Meeting Memory**:
What has been said out loud or shown on screen so far in the current Meeting, which the AI uses to answer follow-ups consistently.
_Avoid_: Interview Memory, history, chat history, context

**Memory Budget**:
The maximum size of Meeting Memory kept word for word; older exchanges beyond it are condensed into a running summary.
_Avoid_: History limit, window

**Screen Capture**:
A screenshot the Candidate takes on demand during a Meeting; it counts as something shown in the Meeting and is kept in Meeting Memory as a transcription of what was on screen.
_Avoid_: Attachment, image, screenshot request

**Private Request**:
A typed question the Candidate sends to the AI during a Meeting; it uses Active Knowledge and Meeting Memory but is not added to Meeting Memory.
_Avoid_: Chat message, manual question

### Answers

**Suggested Answer**:
What EchoIdeal proposes the Candidate say or submit in response to the Interviewer or an Assessment.
_Avoid_: Response, reply, AI answer

**Spoken Answer**:
What the Candidate actually said, transcribed from their microphone; it takes precedence over the Suggested Answer in Meeting Memory.
_Avoid_: User message, mic transcript

**Echo**:
The other side's voice picked up by the Candidate's microphone from their speakers, while they are talking; it is cancelled from the microphone where the app can, and whatever is left is dropped instead of becoming a Spoken Answer.
_Avoid_: Bleed, duplicate line

**Ungrounded Answer**:
A Suggested Answer that needs facts about the Candidate (experience, projects, numbers, background) which neither Active Knowledge (for a Searched Document, the passages sent with that question) nor Meeting Memory provides, shown with a visible marker; general, technical and world questions are never Ungrounded, even when Active Knowledge doesn't cover them.
_Avoid_: Fallback answer, generic answer

**Web Search**:
An optional search of the internet before answering a question the Candidate types or a screen they send, including every Suggested Answer in an Assessment, switched on or off by the Candidate. Automatic answers to what the Interviewer says don't search. Its results inform facts about the world (documentation, definitions, current information) alongside Active Knowledge, but never facts about the Candidate.
_Avoid_: Internet mode, browsing, online search

**Discrepancy**:
A point where the Candidate's Spoken Answer contradicts their Active Knowledge; Suggested Answers stay consistent with what was said, and the Discrepancy is shown privately to the Candidate.
_Avoid_: Conflict, mismatch
