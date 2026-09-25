# The microphone is captured by the app and cleaned of Echo, with system audio as the reference

On Windows, the Candidate's microphone is captured natively rather than by the WebView. Each 10 ms of it goes through an echo canceller (WebRTC's AEC3, via the pure-Rust `sonora` crate) whose reference is the system audio already captured for the other side, then through speech detection (`earshot`); each utterance is sent to the frontend to be transcribed as before. The microphone is held back 200 ms because system audio reaches the app after its echo reaches the microphone, and echo can only be cancelled once its reference has been seen. Where native capture isn't available (macOS and Linux for now, or if it fails to start), the WebView records the microphone as before.

The Echo filter on transcribed text stays as a backstop: a laptop speaker distorts, and some echo survives cancelling.

## Considered Options

- **The WebView's own echo cancelling (`getUserMedia` `echoCancellation`)**: it only removes audio the WebView itself plays; the other side is played by the meeting app, so it removes nothing that matters.
- **Only filtering transcribed text (the Echo filter)**: kept, but it can't split a line where the Candidate talks over the other side, and it costs a transcription per echoed line.
- **The operating system's communications echo cancelling**: depends on the device driver, differs per platform, and changes the meeting app's audio too.
- **A virtual microphone (like Krisp)**: needs a driver install.
- **C++ WebRTC bindings (`webrtc-audio-processing`)**: the same algorithm, but a C++ build on every platform; `sonora` is pure Rust.

## Consequences

System audio must keep flowing through quiet stretches, so the Windows capture no longer stops after 3 seconds without sound. The reference is kept frame for frame in line with the microphone: gaps shorter than 200 ms are late audio still on its way and are waited for, and only longer gaps (nothing playing) are filled with silence.
