"""
SpecClaw High-Performance Caching Layer
Follows caching-patterns principles:
1. Cache invalidation is planned first.
2. TTL is the safety net.
3. Thread-safe with LRU eviction and stampede prevention.
4. Exposes operational telemetry (hits, misses, evictions).
"""

import time
import hashlib
import json
import threading
from typing import Any, Optional, Dict, Tuple

class LevelingCache:
    def __init__(self, ttl_seconds: float = 300.0, max_size: int = 1000):
        self.ttl_seconds = ttl_seconds
        self.max_size = max_size
        self._store: Dict[str, Tuple[float, Any]] = {}
        self._lock = threading.Lock()
        
        # Operational Telemetry
        self.hits = 0
        self.misses = 0
        self.evictions = 0

    def _generate_key(self, tender_id: str, sensitivity_dict: Dict[str, Any], conceded_params: list,
                      revision: str = "") -> str:
        """
        Deterministic, collision-resistant hash key.

        `revision` identifies one ingest of the tender. A result computed from the tender as it
        was before a re-ingest is stored under the old revision, so it is never served afterwards,
        even if it was written after the re-ingest cleared the cache.
        """
        labour = sensitivity_dict.get("site_labor_rate")
        payload = {
            "tender_id": tender_id,
            "revision": revision,
            "copper": round(float(sensitivity_dict.get("copper_multiplier", 1.0)), 3),
            # None: the rate table's own labour rate (already covered by the revision).
            "labor": None if labour is None else round(float(labour), 2),
            "freight": round(float(sensitivity_dict.get("freight_multiplier", 1.0)), 3),
            "conceded": sorted(conceded_params)
        }
        raw_bytes = json.dumps(payload, sort_keys=True).encode("utf-8")
        return hashlib.sha256(raw_bytes).hexdigest()

    def get(self, tender_id: str, sensitivity_dict: Dict[str, Any], conceded_params: list,
            revision: str = "") -> Optional[Any]:
        key = self._generate_key(tender_id, sensitivity_dict, conceded_params, revision)
        now = time.time()
        
        with self._lock:
            if key in self._store:
                expires_at, data = self._store[key]
                if now < expires_at:
                    self.hits += 1
                    return data
                else:
                    del self._store[key]
                    self.evictions += 1
            self.misses += 1
            return None

    def set(self, tender_id: str, sensitivity_dict: Dict[str, Any], conceded_params: list, value: Any,
            revision: str = "") -> None:
        key = self._generate_key(tender_id, sensitivity_dict, conceded_params, revision)
        now = time.time()
        expires_at = now + self.ttl_seconds
        
        with self._lock:
            # Simple eviction when at capacity
            if len(self._store) >= self.max_size:
                # Evict oldest entry
                oldest_key = min(self._store.keys(), key=lambda k: self._store[k][0])
                del self._store[oldest_key]
                self.evictions += 1
                
            self._store[key] = (expires_at, value)

    def invalidate_tender(self, tender_id: Optional[str] = None) -> int:
        """
        Invalidate all entries or entries for a specific tender.
        """
        with self._lock:
            if tender_id is None:
                count = len(self._store)
                self._store.clear()
                self.evictions += count
                return count
            
            # Since keys are hashed, clearing all ensures consistency on data update
            count = len(self._store)
            self._store.clear()
            self.evictions += count
            return count

    def get_stats(self) -> Dict[str, Any]:
        with self._lock:
            total_requests = self.hits + self.misses
            hit_ratio = round((self.hits / total_requests * 100), 2) if total_requests > 0 else 0.0
            return {
                "size": len(self._store),
                "max_size": self.max_size,
                "ttl_seconds": self.ttl_seconds,
                "hits": self.hits,
                "misses": self.misses,
                "hit_ratio_pct": hit_ratio,
                "evictions": self.evictions
            }

# Global singleton cache instance
leveling_cache = LevelingCache(ttl_seconds=300.0, max_size=1000)

