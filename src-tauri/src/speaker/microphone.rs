// The Candidate's microphone, captured natively so Echo can be cancelled before
// speech is detected. Without headphones the microphone also hears the other side
// through the speakers; system audio (what the speakers play) is the reference the
// echo canceller subtracts. What is left goes through speech detection, and each
// utterance is sent to the frontend as a 16 kHz WAV.
//
// Native capture is Windows-only for now; elsewhere the frontend records the
// microphone itself, and the pipeline goes unused.
#![cfg_attr(not(target_os = "windows"), allow(dead_code, unused_imports))]
use earshot::Detector;
use once_cell::sync::Lazy;
use serde::Serialize;
use sonora::config::{EchoCanceller, NoiseSuppression};
use sonora::{AudioProcessing, Config, StreamConfig};
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tracing::{error, warn};

pub const OUTPUT_RATE: u32 = 16_000;
const OUTPUT_FRAME: usize = (OUTPUT_RATE / 100) as usize;

// System audio reaches the app after its echo reaches the microphone, and echo can
// only be cancelled once its reference has been seen. Holding the microphone back
// this long puts the reference first.
const MIC_DELAY_FRAMES: usize = 20;
// The echo canceller's starting guess of how far the reference leads its echo: the
// hold above, less system audio's own lag. It measures the real delay itself.
const STREAM_DELAY_MS: i32 = 150;

// System audio that arrives this much later than its place on the timeline, whose
// time was already filled with silence, is trimmed.
const REFERENCE_JITTER_MS: f64 = 30.0;
// System audio sends nothing while nothing plays. After this long without it, the
// speakers are silent and the reference is filled with silence to keep up.
const REFERENCE_IDLE_MS: f64 = 200.0;

// What is left of the echo after cancelling is far quieter than what the speakers
// played; the Candidate speaking into their microphone is not. Speech this much
// quieter than the reference, while the speakers played, is leftover echo.
const ECHO_MARGIN_DB: f32 = 20.0;
// Below this the speakers count as silent.
const REFERENCE_PLAYING_DB: f32 = -50.0;

// Speech detection runs on 16 ms frames.
const VAD_FRAME: usize = 256;
const VAD_FRAME_MS: u64 = 16;
const VOICE_SCORE: f32 = 0.5;
const PRE_ROLL_FRAMES: usize = 20;
const END_SILENCE_FRAMES: usize = 50;
const KEEP_SILENCE_FRAMES: usize = 12;
const MIN_VOICE_FRAMES: usize = 10;
const MAX_UTTERANCE_FRAMES: usize = 30_000 / VAD_FRAME_MS as usize;

const RECENT_SPEECH: usize = 20;
// Reference levels kept, one per 10 ms frame.
const REFERENCE_LEVELS_KEPT: usize = 6000;

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn power(samples: &[f32]) -> f32 {
    samples.iter().map(|s| s * s).sum::<f32>() / samples.len().max(1) as f32
}

fn power_db(power: f32) -> f32 {
    10.0 * power.max(1e-12).log10()
}

/// Whether speech at `speech_db` is what is left of the echo of speakers playing at
/// `reference_db`, rather than the Candidate.
fn is_leftover_echo(speech_db: f32, reference_db: f32) -> bool {
    reference_db > REFERENCE_PLAYING_DB && speech_db < reference_db - ECHO_MARGIN_DB
}

/// Speech the microphone heard, cleaned of Echo, at 16 kHz.
pub struct Utterance {
    pub samples: Vec<f32>,
    /// When it ended, in milliseconds since the Unix epoch.
    pub ended_at_ms: u64,
    // Mean power of its voiced frames.
    voiced_power: f32,
}

/// How loud an utterance was, against what the speakers played meanwhile.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeechLevel {
    pub duration_ms: u64,
    /// Its voiced frames after echo cancelling, in dBFS.
    pub speech_db: f32,
    /// The reference while it was spoken, in dBFS (very low when nothing played).
    pub reference_db: f32,
    /// Dropped as leftover echo.
    pub echo: bool,
}

/// How well the echo canceller is doing, from its own statistics.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EchoStats {
    /// How much the echo canceller removed, in dB.
    pub echo_return_loss_enhancement: Option<f64>,
    /// How much quieter the echo is than the reference, before cancelling, in dB.
    pub echo_return_loss: Option<f64>,
    /// The delay it found between the reference and its echo.
    pub delay_ms: Option<i32>,
    /// Reference frames given to the echo canceller.
    pub reference_frames: u64,
    /// Silence filled in while nothing played, and late system audio left out
    /// because its time had already been filled.
    pub silence_filled_ms: u64,
    pub reference_trimmed_ms: u64,
    /// Utterances dropped as leftover echo.
    pub dropped_as_echo: u64,
    /// The latest utterances' levels, newest last.
    pub recent_speech: Vec<SpeechLevel>,
}

// Maps microphone samples to wall-clock time, re-anchoring if the device drifts or drops audio.
struct MicClock {
    rate: f64,
    base_ms: f64,
    samples: u64,
}

impl MicClock {
    fn new(rate: u32) -> Self {
        Self {
            rate: rate as f64,
            base_ms: 0.0,
            samples: 0,
        }
    }

    fn arrived(&mut self, count: usize, at_ms: u64) {
        self.samples += count as u64;
        let expected = self.base_ms + self.samples as f64 * 1000.0 / self.rate;
        if self.base_ms == 0.0 || (at_ms as f64 - expected).abs() > 300.0 {
            self.base_ms = at_ms as f64 - self.samples as f64 * 1000.0 / self.rate;
        }
    }

    // When sample `index` (counted from the start) was captured.
    fn time_of(&self, index: u64) -> u64 {
        (self.base_ms + index as f64 * 1000.0 / self.rate) as u64
    }
}

// Finds utterances in cleaned 16 kHz audio.
struct SpeechDetector {
    detector: Box<Detector>,
    pre_roll: VecDeque<Vec<f32>>,
    speech: Vec<f32>,
    in_speech: bool,
    voice_frames: usize,
    silence_frames: usize,
    last_voice_end_ms: u64,
    voiced_power: f32,
}

impl SpeechDetector {
    fn new() -> Self {
        Self {
            detector: Detector::default_boxed(),
            pre_roll: VecDeque::with_capacity(PRE_ROLL_FRAMES),
            speech: Vec::new(),
            in_speech: false,
            voice_frames: 0,
            silence_frames: 0,
            last_voice_end_ms: 0,
            voiced_power: 0.0,
        }
    }

    fn push(&mut self, frame: &[f32], end_ms: u64) -> Option<Utterance> {
        let clamped: Vec<f32> = frame.iter().map(|s| s.clamp(-1.0, 1.0)).collect();
        let voiced = self.detector.predict_f32(&clamped) >= VOICE_SCORE;

        if !self.in_speech {
            if voiced {
                self.in_speech = true;
                self.voice_frames = 1;
                self.silence_frames = 0;
                self.last_voice_end_ms = end_ms;
                self.voiced_power = power(&clamped);
                self.speech = self.pre_roll.drain(..).flatten().collect();
                self.speech.extend_from_slice(&clamped);
            } else {
                if self.pre_roll.len() == PRE_ROLL_FRAMES {
                    self.pre_roll.pop_front();
                }
                self.pre_roll.push_back(clamped);
            }
            return None;
        }

        self.speech.extend_from_slice(&clamped);
        if voiced {
            self.voice_frames += 1;
            self.silence_frames = 0;
            self.last_voice_end_ms = end_ms;
            self.voiced_power += power(&clamped);
        } else {
            self.silence_frames += 1;
        }

        let too_long = self.speech.len() >= MAX_UTTERANCE_FRAMES * VAD_FRAME;
        if self.silence_frames < END_SILENCE_FRAMES && !too_long {
            return None;
        }

        // End of speech: keep a little of the silence after it.
        let trailing = self.silence_frames.saturating_sub(KEEP_SILENCE_FRAMES) * VAD_FRAME;
        self.speech.truncate(self.speech.len().saturating_sub(trailing));
        let kept_silence = self.silence_frames.min(KEEP_SILENCE_FRAMES) as u64;
        let utterance = (self.voice_frames >= MIN_VOICE_FRAMES).then(|| Utterance {
            samples: std::mem::take(&mut self.speech),
            ended_at_ms: self.last_voice_end_ms + kept_silence * VAD_FRAME_MS,
            voiced_power: self.voiced_power / self.voice_frames as f32,
        });
        self.speech.clear();
        self.in_speech = false;
        self.voice_frames = 0;
        self.silence_frames = 0;
        utterance
    }
}

/// Cancels Echo from the microphone using system audio as the reference, then finds
/// speech in what is left. Feed it both streams as they arrive, with arrival times.
pub struct MicPipeline {
    apm: AudioProcessing,
    mic_rate: u32,
    reference_rate: u32,
    clock: MicClock,
    mic_pending: Vec<f32>,
    mic_frames_taken: u64,
    delayed: VecDeque<(Vec<f32>, u64)>,
    reference_pending: Vec<f32>,
    // Where the reference given so far ends on the timeline, in ms since the epoch,
    // and when system audio last arrived.
    reference_end_ms: Option<f64>,
    last_reference_ms: Option<f64>,
    // When each reference frame ended, and its power.
    reference_levels: VecDeque<(f64, f32)>,
    cleaned: Vec<f32>,
    speech: SpeechDetector,
    stats: EchoStats,
    #[cfg(test)]
    output: Vec<f32>,
}

fn build_apm(mic_rate: u32, reference_rate: u32) -> AudioProcessing {
    let config = Config {
        echo_canceller: Some(EchoCanceller::default()),
        noise_suppression: Some(NoiseSuppression::default()),
        ..Default::default()
    };
    AudioProcessing::builder()
        .config(config)
        .capture_config(StreamConfig::new(mic_rate, 1))
        .render_config(StreamConfig::new(reference_rate, 1))
        .build()
}

impl MicPipeline {
    pub fn new(mic_rate: u32) -> Self {
        // Until system audio arrives, the reference is silence at a common rate.
        let reference_rate = 48_000;
        Self {
            apm: build_apm(mic_rate, reference_rate),
            mic_rate,
            reference_rate,
            clock: MicClock::new(mic_rate),
            mic_pending: Vec::new(),
            mic_frames_taken: 0,
            delayed: VecDeque::with_capacity(MIC_DELAY_FRAMES + 1),
            reference_pending: Vec::new(),
            reference_end_ms: None,
            last_reference_ms: None,
            reference_levels: VecDeque::new(),
            cleaned: Vec::new(),
            speech: SpeechDetector::new(),
            stats: EchoStats::default(),
            #[cfg(test)]
            output: Vec::new(),
        }
    }

    pub fn stats(&self) -> EchoStats {
        self.stats.clone()
    }

    fn ms_per_reference_sample(&self) -> f64 {
        1000.0 / self.reference_rate as f64
    }

    /// Adds system audio (what the speakers played, in mono) that arrived at `arrived_ms`.
    pub fn reference(&mut self, samples: &[f32], sample_rate: u32, arrived_ms: u64) {
        if sample_rate != self.reference_rate {
            self.reference_rate = sample_rate;
            self.reference_pending.clear();
            self.reference_end_ms = None;
            self.last_reference_ms = None;
            self.apm = build_apm(self.mic_rate, sample_rate);
        }
        let per_sample = self.ms_per_reference_sample();
        let start = arrived_ms as f64 - samples.len() as f64 * per_sample;
        let flowing = self
            .last_reference_ms
            .is_some_and(|last| arrived_ms as f64 - last < REFERENCE_IDLE_MS);
        self.last_reference_ms = Some(arrived_ms as f64);
        let end = *self.reference_end_ms.get_or_insert(start);
        let gap = start - end;

        let mut samples = samples;
        if gap > 0.0 && !flowing {
            // The first audio after a quiet stretch goes exactly where it belongs; while
            // audio flows, a later arrival is only a delay, and it follows on.
            self.push_reference_silence(gap);
        } else if gap < -REFERENCE_JITTER_MS {
            // It arrived so late that its time was already filled with silence.
            let skip = ((-gap / per_sample) as usize).min(samples.len());
            self.stats.reference_trimmed_ms += (skip as f64 * per_sample) as u64;
            samples = &samples[skip..];
        }
        self.push_reference(samples);
    }

    fn push_reference_silence(&mut self, ms: f64) {
        let count = (ms / self.ms_per_reference_sample()).round() as usize;
        self.stats.silence_filled_ms += ms as u64;
        self.push_reference(&vec![0.0; count]);
    }

    fn push_reference(&mut self, samples: &[f32]) {
        let per_sample = self.ms_per_reference_sample();
        let end = self.reference_end_ms.unwrap_or(0.0) + samples.len() as f64 * per_sample;
        self.reference_end_ms = Some(end);
        self.reference_pending.extend_from_slice(samples);

        let size = (self.reference_rate / 100) as usize;
        while self.reference_pending.len() >= size {
            let frame: Vec<f32> = self.reference_pending.drain(..size).collect();
            let frame_end = end - self.reference_pending.len() as f64 * per_sample;
            self.feed_reference_frame(&frame, frame_end);
        }
    }

    fn feed_reference_frame(&mut self, frame: &[f32], end_ms: f64) {
        self.stats.reference_frames += 1;
        self.reference_levels.push_back((end_ms, power(frame)));
        if self.reference_levels.len() > REFERENCE_LEVELS_KEPT {
            self.reference_levels.pop_front();
        }
        let mut out = vec![0.0; frame.len()];
        let config = StreamConfig::new(self.reference_rate, 1);
        if let Err(e) =
            self.apm
                .process_render_f32_with_config(&[frame], &config, &config, &mut [&mut out])
        {
            warn!("Echo canceller rejected the reference: {:?}", e);
        }
    }

    /// Adds microphone audio that arrived at `arrived_ms`, and returns any utterances that ended.
    pub fn microphone(&mut self, samples: &[f32], arrived_ms: u64) -> Vec<Utterance> {
        self.clock.arrived(samples.len(), arrived_ms);
        self.mic_pending.extend_from_slice(samples);

        let mic_frame = (self.mic_rate / 100) as usize;
        let mut utterances = Vec::new();
        while self.mic_pending.len() >= mic_frame {
            let frame: Vec<f32> = self.mic_pending.drain(..mic_frame).collect();
            self.mic_frames_taken += 1;
            let end_ms = self.clock.time_of(self.mic_frames_taken * mic_frame as u64);

            // Keep the reference up with the microphone while nothing plays.
            let now = end_ms as f64;
            let caught_up = now - REFERENCE_JITTER_MS;
            match self.reference_end_ms {
                None => self.reference_end_ms = Some(caught_up),
                Some(end) if now - end > REFERENCE_IDLE_MS => {
                    self.push_reference_silence(caught_up - end)
                }
                Some(_) => {}
            }

            self.delayed.push_back((frame, end_ms));
            if self.delayed.len() > MIC_DELAY_FRAMES {
                let (frame, end_ms) = self.delayed.pop_front().unwrap();
                utterances.extend(self.process_capture(&frame, end_ms));
            }
        }
        utterances
    }

    fn process_capture(&mut self, frame: &[f32], end_ms: u64) -> Vec<Utterance> {
        let _ = self.apm.set_stream_delay_ms(STREAM_DELAY_MS);
        let mut out = vec![0.0; OUTPUT_FRAME];
        if let Err(e) = self.apm.process_capture_f32_with_config(
            &[frame],
            &StreamConfig::new(self.mic_rate, 1),
            &StreamConfig::new(OUTPUT_RATE, 1),
            &mut [&mut out],
        ) {
            warn!("Echo canceller rejected microphone audio: {:?}", e);
            return Vec::new();
        }

        if self.mic_frames_taken % 100 == 0 {
            let s = self.apm.statistics();
            self.stats.echo_return_loss_enhancement = s.echo_return_loss_enhancement;
            self.stats.echo_return_loss = s.echo_return_loss;
            self.stats.delay_ms = s.delay_ms;
        }

        #[cfg(test)]
        self.output.extend_from_slice(&out);
        self.cleaned.extend_from_slice(&out);
        let mut utterances = Vec::new();
        while self.cleaned.len() >= VAD_FRAME {
            let vad_frame: Vec<f32> = self.cleaned.drain(..VAD_FRAME).collect();
            let behind = (self.cleaned.len() as u64 * 1000) / OUTPUT_RATE as u64;
            if let Some(u) = self.speech.push(&vad_frame, end_ms.saturating_sub(behind)) {
                if !self.drop_leftover_echo(&u) {
                    utterances.push(u);
                }
            }
        }
        utterances
    }

    // The reference's level over a stretch of the timeline, in dBFS.
    fn reference_db_between(&self, from_ms: f64, to_ms: f64) -> f32 {
        let levels: Vec<f32> = self
            .reference_levels
            .iter()
            .filter(|(end, _)| *end >= from_ms && *end <= to_ms)
            .map(|(_, level)| *level)
            .collect();
        power_db(levels.iter().sum::<f32>() / levels.len().max(1) as f32)
    }

    // Records the utterance's level and says whether it is leftover echo.
    fn drop_leftover_echo(&mut self, utterance: &Utterance) -> bool {
        let duration_ms = utterance.samples.len() as u64 * 1000 / OUTPUT_RATE as u64;
        let end = utterance.ended_at_ms as f64;
        let speech_db = power_db(utterance.voiced_power);
        let reference_db = self.reference_db_between(end - duration_ms as f64 - 100.0, end + 100.0);
        let echo = is_leftover_echo(speech_db, reference_db);

        if echo {
            self.stats.dropped_as_echo += 1;
        }
        self.stats.recent_speech.push(SpeechLevel {
            duration_ms,
            speech_db,
            reference_db,
            echo,
        });
        if self.stats.recent_speech.len() > RECENT_SPEECH {
            self.stats.recent_speech.remove(0);
        }
        echo
    }
}

enum Input {
    Reference {
        samples: Vec<f32>,
        sample_rate: u32,
        arrived_ms: u64,
    },
    Microphone {
        samples: Vec<f32>,
        arrived_ms: u64,
    },
}

struct Running {
    session: u64,
    stop: Arc<AtomicBool>,
    input: Sender<Input>,
}

static NEXT_SESSION: AtomicU64 = AtomicU64::new(1);
static MICROPHONE: Lazy<Mutex<Option<Running>>> = Lazy::new(|| Mutex::new(None));
static STATS: Lazy<Mutex<Option<EchoStats>>> = Lazy::new(|| Mutex::new(None));

/// Buffers system audio into 10 ms frames for the echo canceller, while the
/// microphone is being captured.
pub struct ReferenceTap {
    sample_rate: u32,
    buffer: Vec<f32>,
}

impl ReferenceTap {
    pub fn new(sample_rate: u32) -> Self {
        Self {
            sample_rate,
            buffer: Vec::with_capacity((sample_rate / 100) as usize),
        }
    }

    pub fn extend(&mut self, samples: &[f32]) {
        self.buffer.extend_from_slice(samples);
        let frame = (self.sample_rate / 100) as usize;
        if self.buffer.len() < frame {
            return;
        }
        let samples = std::mem::take(&mut self.buffer);
        if let Ok(guard) = MICROPHONE.lock() {
            if let Some(running) = guard.as_ref() {
                let _ = running.input.send(Input::Reference {
                    samples,
                    sample_rate: self.sample_rate,
                    arrived_ms: now_ms(),
                });
            }
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MicrophoneSpeech {
    audio: String,
    ended_at: u64,
    duration_ms: u64,
}

fn run_pipeline(app: AppHandle, mic_rate: u32, input: Receiver<Input>) {
    let mut pipeline = MicPipeline::new(mic_rate);
    let mut since_stats = 0usize;
    while let Ok(message) = input.recv() {
        let utterances = match message {
            Input::Reference {
                samples,
                sample_rate,
                arrived_ms,
            } => {
                pipeline.reference(&samples, sample_rate, arrived_ms);
                continue;
            }
            Input::Microphone {
                samples,
                arrived_ms,
            } => pipeline.microphone(&samples, arrived_ms),
        };

        since_stats += 1;
        if since_stats >= 50 || !utterances.is_empty() {
            since_stats = 0;
            if let Ok(mut stats) = STATS.lock() {
                *stats = Some(pipeline.stats());
            }
        }

        for utterance in utterances {
            let audio = super::commands::normalize_audio_level(&utterance.samples, 0.1);
            match super::commands::samples_to_wav_b64(OUTPUT_RATE, &audio) {
                Ok(audio) => {
                    let duration_ms = utterance.samples.len() as u64 * 1000 / OUTPUT_RATE as u64;
                    let _ = app.emit(
                        "microphone-speech-detected",
                        MicrophoneSpeech {
                            audio,
                            ended_at: utterance.ended_at_ms,
                            duration_ms,
                        },
                    );
                }
                Err(e) => error!("Failed to encode microphone speech: {}", e),
            }
        }
    }
}

// Stops the capture `session`, or any capture when it's None.
fn stop_running(session: Option<u64>) {
    if let Ok(mut guard) = MICROPHONE.lock() {
        if guard
            .as_ref()
            .is_some_and(|running| session.is_none_or(|s| s == running.session))
        {
            if let Some(running) = guard.take() {
                running.stop.store(true, Ordering::Release);
            }
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MicrophoneCapture {
    /// Pass this to `stop_microphone_capture`, so a late stop can't end a newer capture.
    session: u64,
    sample_rate: u32,
}

/// Starts capturing the microphone with Echo cancelled, sending each utterance as a
/// `microphone-speech-detected` event. Fails where native capture isn't available,
/// and the frontend then records the microphone itself.
#[tauri::command]
pub async fn start_microphone_capture(
    app: AppHandle,
    device_id: Option<String>,
) -> Result<MicrophoneCapture, String> {
    #[cfg(target_os = "windows")]
    {
        stop_running(None);
        let stop = Arc::new(AtomicBool::new(false));
        let (input, receiver) = mpsc::channel();
        let (ready, ready_rx) = mpsc::channel();

        let capture_stop = stop.clone();
        let capture_input = input.clone();
        std::thread::Builder::new()
            .name("echoideal-microphone".into())
            .spawn(move || {
                super::windows::capture_microphone(device_id, capture_stop, ready, |samples| {
                    let _ = capture_input.send(Input::Microphone {
                        samples,
                        arrived_ms: now_ms(),
                    });
                });
            })
            .map_err(|e| format!("Failed to start the microphone: {}", e))?;

        let mic_rate = ready_rx
            .recv_timeout(Duration::from_secs(5))
            .map_err(|_| "The microphone didn't start in time".to_string())?
            .map_err(|e| format!("Failed to open the microphone: {}", e))?;

        std::thread::Builder::new()
            .name("echoideal-echo-canceller".into())
            .spawn(move || run_pipeline(app, mic_rate, receiver))
            .map_err(|e| format!("Failed to start echo cancelling: {}", e))?;

        if let Ok(mut stats) = STATS.lock() {
            *stats = None;
        }
        let session = NEXT_SESSION.fetch_add(1, Ordering::Relaxed);
        let replaced = MICROPHONE
            .lock()
            .map_err(|e| format!("Failed to store microphone state: {}", e))?
            .replace(Running {
                session,
                stop,
                input,
            });
        // Two starts at once: the one stored first is stopped.
        if let Some(old) = replaced {
            old.stop.store(true, Ordering::Release);
        }
        Ok(MicrophoneCapture {
            session,
            sample_rate: mic_rate,
        })
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, device_id);
        Err("Echo-cancelled microphone capture isn't available on this platform yet".into())
    }
}

#[tauri::command]
pub fn stop_microphone_capture(session: Option<u64>) {
    stop_running(session);
}

/// The echo canceller's latest statistics, while the microphone is captured.
#[tauri::command]
pub fn get_microphone_echo_stats() -> Option<EchoStats> {
    STATS.lock().ok().and_then(|stats| stats.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    const START_MS: u64 = 1_000_000;

    // A deterministic noise source shaped into bursts, standing in for speech.
    fn bursts(len: usize, rate: u32, seed: u32) -> Vec<f32> {
        let mut x = seed;
        (0..len)
            .map(|i| {
                x ^= x << 13;
                x ^= x >> 17;
                x ^= x << 5;
                let noise = (x as f32 / u32::MAX as f32) * 2.0 - 1.0;
                let t = i as f32 / rate as f32;
                let envelope = if (t * 2.0).fract() < 0.6 { 0.3 } else { 0.0 };
                noise * envelope
            })
            .collect()
    }

    struct Scenario {
        with_reference: bool,
        // System audio is sent this many frames at a time, up to `jitter` frames late.
        burst: usize,
        jitter: usize,
        // Nothing plays, and system audio sends nothing, between these seconds.
        silent: Option<(f32, f32)>,
    }

    const PLAIN: Scenario = Scenario {
        with_reference: true,
        burst: 1,
        jitter: 0,
        silent: None,
    };

    // The microphone hears the far end 60 ms after it plays, at half level; system
    // audio reports it 50 ms after that. Returns the cleaned output.
    fn run(far: &[f32], rate: u32, scenario: &Scenario) -> (Vec<f32>, EchoStats) {
        let mut far = far.to_vec();
        let frame = (rate / 100) as usize;
        let silent_range = scenario.silent.map(|(from, to)| {
            (
                (from * rate as f32) as usize / frame * frame,
                (to * rate as f32) as usize / frame * frame,
            )
        });
        if let Some((from, to)) = silent_range {
            far[from..to].iter_mut().for_each(|s| *s = 0.0);
        }
        let echo_delay = rate as usize * 60 / 1000;
        let reference_lag = rate as usize * 50 / 1000;
        let mic: Vec<f32> = (0..far.len())
            .map(|i| if i >= echo_delay { far[i - echo_delay] * 0.5 } else { 0.0 })
            .collect();

        let mut pipeline = MicPipeline::new(rate);
        let mut sent = 0;
        let mut seed = 3u32;
        for (n, chunk) in mic.chunks(frame).enumerate() {
            let now = START_MS + (n as u64 + 1) * 10;
            seed = seed.wrapping_mul(1_103_515_245).wrapping_add(12_345);
            let late = if scenario.jitter > 0 {
                (seed >> 16) as usize % (scenario.jitter + 1)
            } else {
                0
            };
            // System audio reported by now, sent a burst at a time.
            let available = (n * frame).saturating_sub(reference_lag + late * frame);
            if scenario.with_reference && available >= sent + scenario.burst * frame {
                let upto = available - available % frame;
                match silent_range {
                    // While nothing plays, system audio sends nothing at all.
                    Some((from, to)) if sent >= from && upto <= to => {}
                    Some((from, to)) if sent < to && upto > from => {
                        let (a, b) = (sent.max(from), upto.min(to));
                        if sent < a {
                            pipeline.reference(&far[sent..a], rate, now);
                        }
                        if b < upto {
                            pipeline.reference(&far[b..upto], rate, now);
                        }
                    }
                    _ => pipeline.reference(&far[sent..upto], rate, now),
                }
                sent = upto;
            }
            pipeline.microphone(chunk, now);
        }
        let stats = pipeline.stats();
        (pipeline.output, stats)
    }

    fn energy(samples: &[f32]) -> f32 {
        power(samples)
    }

    // How much quieter the last 4 seconds are with the reference than without.
    fn reduction_db(far: &[f32], rate: u32, scenario: &Scenario) -> (f32, EchoStats) {
        let without = Scenario {
            with_reference: false,
            ..*scenario
        };
        let (plain, _) = run(far, rate, &without);
        let (cleaned, stats) = run(far, rate, scenario);
        let tail = OUTPUT_RATE as usize * 4;
        let db = 10.0
            * (energy(&plain[plain.len() - tail..])
                / energy(&cleaned[cleaned.len() - tail..]).max(1e-12))
            .log10();
        (db, stats)
    }

    #[test]
    fn cancels_echo_of_the_reference() {
        let rate = 48_000u32;
        let far = bursts(rate as usize * 12, rate, 7);
        let (db, stats) = reduction_db(&far, rate, &PLAIN);
        println!("echo reduced by {db:.1} dB; {stats:?}");
        assert!(db > 10.0, "expected at least 10 dB less echo, got {db:.1} dB ({stats:?})");
    }

    // System audio arrives in uneven bursts, some late; none of it may be replaced
    // with silence, or the reference drifts out of line with its echo.
    #[test]
    fn keeps_the_reference_in_line_when_it_arrives_late() {
        let rate = 48_000u32;
        let far = bursts(rate as usize * 12, rate, 11);
        let late = Scenario {
            burst: 3,
            jitter: 8,
            ..PLAIN
        };
        let (db, stats) = reduction_db(&far, rate, &late);
        println!("late bursts: echo reduced by {db:.1} dB; {stats:?}");
        assert_eq!(stats.reference_trimmed_ms, 0, "{stats:?}");
        assert!(db > 10.0, "got {db:.1} dB ({stats:?})");
    }

    // Nothing plays for a while and system audio goes quiet; when the far end
    // plays again, its echo is still cancelled.
    #[test]
    fn stays_in_line_after_the_speakers_go_quiet() {
        let rate = 48_000u32;
        let far = bursts(rate as usize * 14, rate, 5);
        let gap = Scenario {
            burst: 2,
            jitter: 3,
            silent: Some((3.0, 6.0)),
            ..PLAIN
        };
        let (db, stats) = reduction_db(&far, rate, &gap);
        println!("after a quiet gap: echo reduced by {db:.1} dB; {stats:?}");
        assert!(stats.silence_filled_ms >= 2_500, "{stats:?}");
        assert!(db > 10.0, "got {db:.1} dB ({stats:?})");
    }

    #[test]
    fn quiet_speech_while_the_speakers_play_is_leftover_echo() {
        // Speakers at -20 dBFS: speech 26 dB below is leftover echo...
        assert!(is_leftover_echo(-46.0, -20.0));
        // ...but the Candidate talking over them, or anyone while they're silent, is not.
        assert!(!is_leftover_echo(-22.0, -20.0));
        assert!(!is_leftover_echo(-58.0, -120.0));
    }

    #[test]
    fn clock_follows_arrival_times() {
        let mut clock = MicClock::new(1000);
        clock.arrived(10, 5_000);
        assert_eq!(clock.time_of(10), 5_000);
        clock.arrived(10, 5_010);
        assert_eq!(clock.time_of(20), 5_010);
        // Audio lost: re-anchors to the arrival time.
        clock.arrived(10, 6_000);
        assert_eq!(clock.time_of(30), 6_000);
    }
}
