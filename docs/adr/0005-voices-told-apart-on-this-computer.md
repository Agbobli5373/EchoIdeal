# Voices are told apart on this computer, with a model downloaded on first use

Each line of the other side gets a voice fingerprint on the Candidate's computer: the WeSpeaker ResNet34 model (trained on VoxCeleb, CC BY 4.0), run in pure Rust by `tract`, on the middle 2 seconds of the line. A line whose fingerprint is close enough (cosine 0.5) to a Voice's profile, the sum of its lines' fingerprints, is that Voice; any other line starts a new one. Speech under a second is too short to tell and counts as whoever spoke last. Profiles belong to one Meeting and are never matched across Meetings.

The model (about 25 MB) is not bundled: the app downloads it from the sherpa-onnx GitHub release the first time a Meeting starts with Voices on, and checks its SHA-256 before use. Until it's there, the other side is one speaker, as before.

This amends [0003](0003-searched-documents-with-optional-embeddings.md)'s choice not to ship a model: that was about the installer's size, which stays the same, and no provider offers voice fingerprints that could be matched line by line.

## Considered Options

- **A cloud speech provider's diarization (Deepgram, AssemblyAI, gpt-4o-transcribe-diarize)**: only for users of that provider, and labels from separate requests don't correspond, so lines would still need matching.
- **Bundling the model in the installer**: works offline from the first launch, but makes every download about 25 MB bigger for a feature not everyone needs.
- **ONNX Runtime (`ort`)**: faster, but ships a native library of its own on every platform; `tract` is pure Rust.
- **Remembering Voices across Meetings**: would name recurring people automatically, but keeps biometric data between Meetings; left out.

## Consequences

Voices will sometimes split one person in two or mix up similar voices, especially over compressed call audio; the Candidate fixes this by merging Voices or moving a line. The threshold was set with text-to-speech voices, not recorded calls. Dev builds optimise the model's engine (`[profile.dev.package.tract-*]`), or fingerprints take seconds.
