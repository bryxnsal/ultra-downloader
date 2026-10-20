use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

pub struct RateLimiter {
    enabled: AtomicBool,
    rate_bytes_sec: AtomicU64,
    state: Mutex<TokenBucketState>,
}

struct TokenBucketState {
    available_tokens: f64,
    last_update: Instant,
}

impl RateLimiter {
    pub fn new(enabled: bool, rate_bytes_sec: u64) -> Self {
        Self {
            enabled: AtomicBool::new(enabled),
            rate_bytes_sec: AtomicU64::new(rate_bytes_sec),
            state: Mutex::new(TokenBucketState {
                available_tokens: rate_bytes_sec as f64,
                last_update: Instant::now(),
            }),
        }
    }

    pub fn set_enabled(&self, enabled: bool) {
        self.enabled.store(enabled, Ordering::SeqCst);
    }

    pub fn is_enabled(&self) -> bool {
        self.enabled.load(Ordering::SeqCst)
    }

    pub fn set_rate(&self, bytes_per_sec: u64) {
        self.rate_bytes_sec.store(bytes_per_sec, Ordering::SeqCst);
    }

    pub fn get_rate(&self) -> u64 {
        self.rate_bytes_sec.load(Ordering::SeqCst)
    }

    pub async fn acquire(&self, requested_bytes: usize) {
        if !self.is_enabled() {
            return;
        }

        let max_rate = self.get_rate();
        if max_rate == 0 {
            return;
        }

        let mut state = self.state.lock().await;
        let now = Instant::now();
        let elapsed = now.duration_since(state.last_update).as_secs_f64();
        state.last_update = now;

        let capacity = (max_rate as f64) * 2.0;
        state.available_tokens = (state.available_tokens + elapsed * (max_rate as f64)).min(capacity);

        let needed = requested_bytes as f64;
        if state.available_tokens >= needed {
            state.available_tokens -= needed;
        } else {
            let deficit = needed - state.available_tokens;
            let wait_secs = deficit / (max_rate as f64);
            state.available_tokens = 0.0;
            drop(state);

            tokio::time::sleep(Duration::from_secs_f64(wait_secs)).await;
        }
    }
}
