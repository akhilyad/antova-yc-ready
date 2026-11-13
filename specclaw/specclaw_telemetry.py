"""
SpecClaw Real-Time WebSocket Telemetry Hub
Follows websockets-realtime principles:
- Robust connection lifecycle tracking.
- Heartbeat ping/pong handling and auto-reconnect resilience.
- Pub/sub broadcasting for live sensitivity changes, pipeline progress, and negotiation turns.
"""

import json
import asyncio
from datetime import datetime, timezone
from typing import Set, Dict, Any, Optional
from fastapi import WebSocket, WebSocketDisconnect

class TelemetryConnectionManager:
    def __init__(self):
        # Set of active WebSocket connections
        self.active_connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()
        self.total_messages_broadcast = 0

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self.active_connections.add(websocket)
        
        # Send initial welcome and state snapshot
        await websocket.send_json({
            "event_type": "CONNECTION_ESTABLISHED",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": {
                "active_clients": len(self.active_connections),
                "engine": "SpecClaw Deterministic Validation Engine",
                "status": "ONLINE"
            }
        })

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self.active_connections.discard(websocket)

    async def broadcast(self, event_type: str, payload: Dict[str, Any]) -> int:
        """
        Pub/sub broadcast to all connected dashboard clients.
        Handles dropped connections cleanly.
        """
        message = {
            "event_type": event_type,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": payload
        }
        
        dead_connections = set()
        async with self._lock:
            for connection in self.active_connections:
                try:
                    await connection.send_json(message)
                    self.total_messages_broadcast += 1
                except Exception:
                    dead_connections.add(connection)
            
            # Clean up dead connections
            for dead in dead_connections:
                self.active_connections.discard(dead)

        return len(self.active_connections)

    async def handle_client_message(self, websocket: WebSocket, data_str: str) -> Optional[Dict[str, Any]]:
        """
        Process incoming client commands (e.g. ping heartbeat).
        """
        try:
            msg = json.loads(data_str)
            msg_type = msg.get("type", "").lower()
            
            if msg_type == "ping":
                await websocket.send_json({
                    "event_type": "PONG",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "payload": {"latency_check": "ok"}
                })
                return None
            return msg
        except Exception:
            return None

    def get_stats(self) -> Dict[str, Any]:
        return {
            "active_connections": len(self.active_connections),
            "total_broadcasts": self.total_messages_broadcast
        }

# Global singleton telemetry manager
telemetry_manager = TelemetryConnectionManager()

