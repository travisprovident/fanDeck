export async function withTimeout(promise, milliseconds, message) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

export function stopStream(stream) {
  stream?.getTracks().forEach(track => track.stop());
}

// A browser capture request cannot be aborted. If it completes after timeout,
// removal, replacement or page close, release it rather than leaking a capture.
export async function requestMediaStream(start, isCurrent, timeoutMs = 15000) {
  let finished = false;
  const pending = Promise.resolve(start()).then(stream => {
    if (finished || !isCurrent()) {
      stopStream(stream);
      throw new Error('Capture cancelled.');
    }
    return stream;
  });
  try {
    return await (timeoutMs > 0 ? withTimeout(pending, timeoutMs, 'Capture took too long. Try adding the game again.') : pending);
  } finally { finished = true; }
}
