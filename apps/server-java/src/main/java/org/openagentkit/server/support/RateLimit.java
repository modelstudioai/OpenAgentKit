package org.openagentkit.server.support;

import java.util.HashMap;
import java.util.Map;

public final class RateLimit {
    private final double rate;
    private final long burst;
    private final Map<String, Bucket> buckets = new HashMap<>();
    private long lastCleanup;

    public RateLimit(double rate, long burst) {
        this.rate = rate;
        this.burst = burst;
    }

    public synchronized long take(String key) {
        if (rate == 0) return 0;
        long now = System.nanoTime();
        if (now - lastCleanup > 60_000_000_000L) {
            long idle = (long) (Math.max(60, burst / rate) * 1_000_000_000);
            buckets.values().removeIf(bucket -> now - bucket.touched > idle);
            lastCleanup = now;
        }
        Bucket bucket = buckets.get(key);
        if (bucket == null) {
            if (buckets.size() >= 100_000) return 60;
            bucket = new Bucket(burst, now);
            buckets.put(key, bucket);
        }
        bucket.available = Math.min(burst, bucket.available + rate * (now - bucket.touched) / 1_000_000_000);
        bucket.touched = now;
        if (bucket.available < 1) return (long) Math.ceil((1 - bucket.available) / rate);
        bucket.available -= 1;
        return 0;
    }

    private static final class Bucket {
        double available;
        long touched;

        Bucket(double available, long touched) {
            this.available = available;
            this.touched = touched;
        }
    }
}
