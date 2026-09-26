// Voice fingerprints, for telling the people on the other side of a Meeting apart.
// A fingerprint is 256 numbers summing up how a voice sounds, from the WeSpeaker
// ResNet34 model trained on VoxCeleb (CC BY 4.0). Two stretches of speech by the same
// person point the same way; different people's point apart. The model runs on this
// computer and is downloaded once, the first time it's needed.
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use futures_util::StreamExt;
use once_cell::sync::Lazy;
use realfft::RealFftPlanner;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncWriteExt;
use tract_onnx::prelude::*;

const MODEL_FILE: &str = "wespeaker_en_voxceleb_resnet34_LM.onnx";
const MODEL_URL: &str = "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/wespeaker_en_voxceleb_resnet34_LM.onnx";
const MODEL_SHA256: &str = "e9848563da86f263117134dfd7ad63c92355b37de492b55e325400c9d9c39012";
const MODEL_BYTES: u64 = 26_530_550;

const SAMPLE_RATE: u32 = 16_000;
// Shorter speech doesn't say enough about the voice.
const MIN_SPEECH_MS: usize = 1_000;
// The middle of an utterance is enough, and keeps the work to a fraction of a second.
const FINGERPRINT_MS: usize = 2_000;

// Kaldi-style log-mel filterbank features, as the model was trained on.
const MEL_BINS: usize = 80;
const FRAME_LENGTH: usize = 400;
const FRAME_SHIFT: usize = 160;
const FFT_SIZE: usize = 512;
const PREEMPHASIS: f32 = 0.97;
const LOW_FREQ: f32 = 20.0;

struct Fingerprinter {
    model: Arc<TypedRunnableModel>,
    mel: Vec<Vec<(usize, f32)>>,
    window: Vec<f32>,
}

fn mel(freq: f32) -> f32 {
    1127.0 * (1.0 + freq / 700.0).ln()
}

// Triangular mel filters over the FFT bins, as (bin, weight) pairs.
fn mel_filters() -> Vec<Vec<(usize, f32)>> {
    let (low, high) = (mel(LOW_FREQ), mel(SAMPLE_RATE as f32 / 2.0));
    let delta = (high - low) / (MEL_BINS + 1) as f32;
    let bin_hz = SAMPLE_RATE as f32 / FFT_SIZE as f32;
    (0..MEL_BINS)
        .map(|m| {
            let left = low + m as f32 * delta;
            let center = left + delta;
            let right = center + delta;
            (0..FFT_SIZE / 2)
                .filter_map(|bin| {
                    let at = mel(bin as f32 * bin_hz);
                    let weight = if at > left && at <= center {
                        (at - left) / (center - left)
                    } else if at > center && at < right {
                        (right - at) / (right - center)
                    } else {
                        0.0
                    };
                    (weight > 0.0).then_some((bin, weight))
                })
                .collect()
        })
        .collect()
}

impl Fingerprinter {
    fn load(path: &Path) -> TractResult<Self> {
        let mut model = tract_onnx::onnx().model_for_path(path)?;
        // One utterance at a time, of any length.
        let frames = model.symbols.sym("T");
        model.set_input_fact(0, f32::fact([1.into(), frames.into(), MEL_BINS.to_dim()]).into())?;
        let model = model.into_optimized()?.into_runnable()?;
        let window = (0..FRAME_LENGTH)
            .map(|n| {
                let phase = 2.0 * std::f32::consts::PI * n as f32 / (FRAME_LENGTH - 1) as f32;
                0.54 - 0.46 * phase.cos()
            })
            .collect();
        Ok(Self {
            model,
            mel: mel_filters(),
            window,
        })
    }

    // Log-mel features (Hamming window), each band's mean over the utterance subtracted.
    fn features(&self, samples: &[f32]) -> Vec<[f32; MEL_BINS]> {
        if samples.len() < FRAME_LENGTH {
            return Vec::new();
        }
        let count = 1 + (samples.len() - FRAME_LENGTH) / FRAME_SHIFT;
        let fft = RealFftPlanner::<f32>::new().plan_fft_forward(FFT_SIZE);
        let mut input = fft.make_input_vec();
        let mut spectrum = fft.make_output_vec();
        let mut frames = Vec::with_capacity(count);

        for f in 0..count {
            // The model expects 16-bit sample values.
            let mut x: Vec<f32> = samples[f * FRAME_SHIFT..f * FRAME_SHIFT + FRAME_LENGTH]
                .iter()
                .map(|s| s * 32768.0)
                .collect();
            let mean = x.iter().sum::<f32>() / FRAME_LENGTH as f32;
            x.iter_mut().for_each(|s| *s -= mean);
            for i in (1..FRAME_LENGTH).rev() {
                x[i] -= PREEMPHASIS * x[i - 1];
            }
            x[0] -= PREEMPHASIS * x[0];
            input.iter_mut().for_each(|v| *v = 0.0);
            for (i, s) in x.iter().enumerate() {
                input[i] = s * self.window[i];
            }
            if fft.process(&mut input, &mut spectrum).is_err() {
                return Vec::new();
            }
            let mut bands = [0f32; MEL_BINS];
            for (m, filter) in self.mel.iter().enumerate() {
                let energy: f32 = filter.iter().map(|(bin, w)| spectrum[*bin].norm_sqr() * w).sum();
                bands[m] = energy.max(f32::EPSILON).ln();
            }
            frames.push(bands);
        }

        let mut means = [0f32; MEL_BINS];
        for frame in &frames {
            for (m, v) in frame.iter().enumerate() {
                means[m] += v / frames.len() as f32;
            }
        }
        for frame in &mut frames {
            frame.iter_mut().zip(means).for_each(|(v, mean)| *v -= mean);
        }
        frames
    }

    // The fingerprint of 16 kHz mono speech, scaled to length 1.
    fn fingerprint(&self, samples: &[f32]) -> TractResult<Option<Vec<f32>>> {
        let features = self.features(samples);
        if features.is_empty() {
            return Ok(None);
        }
        let flat: Vec<f32> = features.iter().flatten().copied().collect();
        let input = tract_ndarray::Array3::from_shape_vec((1, features.len(), MEL_BINS), flat)?;
        let result = self.model.run(tvec!(input.into_tensor().into()))?;
        let embedding: Vec<f32> = result[0].to_plain_array_view::<f32>()?.iter().copied().collect();
        let norm = embedding.iter().map(|v| v * v).sum::<f32>().sqrt().max(1e-9);
        Ok(Some(embedding.iter().map(|v| v / norm).collect()))
    }
}

// Windowed-sinc resampling, low-passed below the lower rate's Nyquist.
fn resample(input: &[f32], from: u32, to: u32) -> Vec<f32> {
    if from == to {
        return input.to_vec();
    }
    const HALF: i64 = 16;
    let ratio = to as f64 / from as f64;
    let cutoff = ratio.min(1.0) * 0.95;
    let len = (input.len() as f64 * ratio) as usize;
    (0..len)
        .map(|n| {
            let t = n as f64 / ratio;
            let center = t.floor() as i64;
            let (mut acc, mut sum) = (0.0f64, 0.0f64);
            for k in (center - HALF + 1)..=(center + HALF) {
                if k < 0 || k >= input.len() as i64 {
                    continue;
                }
                let x = t - k as f64;
                let arg = std::f64::consts::PI * x * cutoff;
                let sinc = if arg.abs() < 1e-9 { 1.0 } else { arg.sin() / arg };
                let window = 0.5 + 0.5 * (std::f64::consts::PI * x / HALF as f64).cos();
                let h = sinc * window;
                acc += input[k as usize] as f64 * h;
                sum += h;
            }
            if sum.abs() > 1e-9 {
                (acc / sum) as f32
            } else {
                0.0
            }
        })
        .collect()
}

// A WAV as mono f32 samples and their rate.
fn decode_wav(bytes: &[u8]) -> Result<(Vec<f32>, u32), String> {
    let mut reader = hound::WavReader::new(Cursor::new(bytes)).map_err(|e| e.to_string())?;
    let spec = reader.spec();
    let channels = spec.channels.max(1) as usize;
    let interleaved: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Int => {
            let scale = (1i64 << (spec.bits_per_sample.max(1) - 1)) as f32;
            reader
                .samples::<i32>()
                .map(|s| s.map(|v| v as f32 / scale))
                .collect::<Result<_, _>>()
                .map_err(|e| e.to_string())?
        }
        hound::SampleFormat::Float => reader
            .samples::<f32>()
            .collect::<Result<_, _>>()
            .map_err(|e| e.to_string())?,
    };
    let mono = interleaved
        .chunks(channels)
        .map(|c| c.iter().sum::<f32>() / channels as f32)
        .collect();
    Ok((mono, spec.sample_rate))
}

// The middle `ms` of speech sampled at `rate`.
fn middle(samples: &[f32], rate: u32, ms: usize) -> &[f32] {
    let keep = rate as usize * ms / 1000;
    if samples.len() <= keep {
        return samples;
    }
    let start = (samples.len() - keep) / 2;
    &samples[start..start + keep]
}

static FINGERPRINTER: Lazy<Mutex<Option<Arc<Fingerprinter>>>> = Lazy::new(|| Mutex::new(None));
static DOWNLOADING: AtomicBool = AtomicBool::new(false);

fn model_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("No app data folder: {}", e))?
        .join("models");
    Ok(dir.join(MODEL_FILE))
}

fn fingerprinter(app: &AppHandle) -> Result<Option<Arc<Fingerprinter>>, String> {
    let mut loaded = FINGERPRINTER.lock().map_err(|e| e.to_string())?;
    if loaded.is_none() {
        let path = model_path(app)?;
        if !path.exists() {
            return Ok(None);
        }
        let model = Fingerprinter::load(&path)
            .map_err(|e| format!("Failed to load the voice model: {}", e))?;
        *loaded = Some(Arc::new(model));
    }
    Ok(loaded.clone())
}

/// The fingerprint of the speech in a base64 WAV, or nothing when the voice model
/// isn't downloaded yet or the speech is too short to tell.
#[tauri::command]
pub async fn voice_fingerprint(app: AppHandle, audio: String) -> Result<Option<Vec<f32>>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(model) = fingerprinter(&app)? else {
            return Ok(None);
        };
        let bytes = B64.decode(audio.as_bytes()).map_err(|e| e.to_string())?;
        let (samples, rate) = decode_wav(&bytes)?;
        if samples.len() < rate as usize * MIN_SPEECH_MS / 1000 {
            return Ok(None);
        }
        let speech = resample(middle(&samples, rate, FINGERPRINT_MS), rate, SAMPLE_RATE);
        model
            .fingerprint(&speech)
            .map_err(|e| format!("Failed to fingerprint the voice: {}", e))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceModelStatus {
    ready: bool,
    downloading: bool,
    size_bytes: u64,
}

#[tauri::command]
pub fn get_voice_model_status(app: AppHandle) -> Result<VoiceModelStatus, String> {
    Ok(VoiceModelStatus {
        ready: model_path(&app)?.exists(),
        downloading: DOWNLOADING.load(Ordering::Acquire),
        size_bytes: MODEL_BYTES,
    })
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
    received: u64,
    total: u64,
}

async fn download(app: &AppHandle, path: &Path) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        tokio::fs::create_dir_all(dir).await.map_err(|e| e.to_string())?;
    }
    let partial = path.with_extension("part");
    let response = reqwest::get(MODEL_URL)
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("Couldn't download the voice model: {}", e))?;
    let total = response.content_length().unwrap_or(MODEL_BYTES);
    let mut file = tokio::fs::File::create(&partial).await.map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let (mut received, mut reported) = (0u64, 0u64);
    let mut body = response.bytes_stream();
    while let Some(chunk) = body.next().await {
        let chunk = chunk.map_err(|e| format!("The voice model download broke off: {}", e))?;
        hasher.update(&chunk);
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        received += chunk.len() as u64;
        if received - reported >= total / 50 || received == total {
            reported = received;
            let _ = app.emit("voice-model-progress", DownloadProgress { received, total });
        }
    }
    file.flush().await.map_err(|e| e.to_string())?;
    drop(file);

    let digest: String = hasher.finalize().iter().map(|b| format!("{:02x}", b)).collect();
    if digest != MODEL_SHA256 {
        let _ = tokio::fs::remove_file(&partial).await;
        return Err("The downloaded voice model didn't match its checksum".into());
    }
    tokio::fs::rename(&partial, path).await.map_err(|e| e.to_string())
}

/// Downloads the voice model (about 25 MB) unless it's already here. Its checksum
/// is checked before it's used.
#[tauri::command]
pub async fn download_voice_model(app: AppHandle) -> Result<(), String> {
    let path = model_path(&app)?;
    if path.exists() {
        return Ok(());
    }
    if DOWNLOADING.swap(true, Ordering::AcqRel) {
        return Err("The voice model is already downloading".into());
    }
    let result = download(&app, &path).await;
    DOWNLOADING.store(false, Ordering::Release);
    let _ = app.emit("voice-model-changed", result.is_ok());
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resampling_keeps_a_tone_and_its_level() {
        let tone: Vec<f32> = (0..48_000)
            .map(|i| (2.0 * std::f32::consts::PI * 440.0 * i as f32 / 48_000.0).sin() * 0.5)
            .collect();
        let out = resample(&tone, 48_000, 16_000);
        assert_eq!(out.len(), 16_000);
        let rms = (out[1000..15000].iter().map(|s| s * s).sum::<f32>() / 14_000.0).sqrt();
        assert!((rms - 0.5 / 2f32.sqrt()).abs() < 0.01, "rms {rms}");
    }

    #[test]
    fn takes_the_middle_of_long_speech() {
        let samples: Vec<f32> = (0..10).map(|i| i as f32).collect();
        assert_eq!(middle(&samples, 1_000, 4), &[3.0, 4.0, 5.0, 6.0]);
        assert_eq!(middle(&samples, 1_000, 20).len(), 10);
    }

    #[test]
    fn mel_filters_cover_the_spectrum() {
        let filters = mel_filters();
        assert_eq!(filters.len(), MEL_BINS);
        assert!(filters.iter().all(|f| !f.is_empty()));
    }

    // With the model at VOICE_MODEL and WAVs named <voice>_<n>.wav in VOICE_WAVS, the
    // same voice matches itself better than any other voice.
    #[test]
    #[ignore]
    fn tells_voices_apart() {
        let model = Fingerprinter::load(Path::new(&std::env::var("VOICE_MODEL").unwrap())).unwrap();
        let mut prints = Vec::new();
        for entry in std::fs::read_dir(std::env::var("VOICE_WAVS").unwrap()).unwrap() {
            let path = entry.unwrap().path();
            let (samples, rate) = decode_wav(&std::fs::read(&path).unwrap()).unwrap();
            let speech = resample(middle(&samples, rate, FINGERPRINT_MS), rate, SAMPLE_RATE);
            let voice = path.file_stem().unwrap().to_string_lossy()[..2].to_string();
            prints.push((voice, model.fingerprint(&speech).unwrap().unwrap()));
        }
        let cos = |a: &[f32], b: &[f32]| a.iter().zip(b).map(|(x, y)| x * y).sum::<f32>();
        let (mut same, mut other) = (f32::MAX, f32::MIN);
        for (i, (va, a)) in prints.iter().enumerate() {
            for (vb, b) in &prints[i + 1..] {
                let c = cos(a, b);
                if va == vb { same = same.min(c) } else { other = other.max(c) }
            }
        }
        println!("lowest same-voice {same:.2}, highest other-voice {other:.2}");
        assert!(same > other);
    }
}
