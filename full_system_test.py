#!/usr/bin/env python3
"""
统一的完整系统测试脚本，整合原有零散测试：
- 服务器可用性与健康检查
- API 配置/状态检查
- 角色创建、消息发送、AI 回复生成
- 自动聊天启停
- WebSocket 基本连通性
运行前请确保后端已启动，且环境变量中提供对应模型的 API Key。
"""

import asyncio
import json
import os
import time
from datetime import datetime
from typing import Dict, List, Optional
from urllib.parse import urlparse

import httpx
import websockets
from dotenv import load_dotenv

# 加载 .env（如果存在）
load_dotenv()

BASE_URL = os.getenv("AI_TEA_BASE_URL", "http://localhost:8000")
ROOM_ID = os.getenv("AI_TEA_ROOM_ID", "default")
DEFAULT_PROVIDER = os.getenv("AI_PROVIDER", "deepseek_chat").lower()

# 映射提供商到所需的环境变量/默认模型
PROVIDER_ENV_MAP = {
    "deepseek_chat": "DEEPSEEK_API_KEY",
    "deepseek_reasoner": "DEEPSEEK_API_KEY",
    "gemini_25_flash": "GEMINI_API_KEY",
    "gemini_25_pro": "GEMINI_API_KEY",
}

PROVIDER_DEFAULT_MODEL = {
    "deepseek_chat": "deepseek-chat",
    "deepseek_reasoner": "deepseek-reasoner",
    "gemini_25_flash": "gemini-2.5-flash",
    "gemini_25_pro": "gemini-2.5-pro",
}


class FullSystemTester:
    def __init__(self):
        self.results: List[Dict[str, str]] = []
        self.client = httpx.AsyncClient(base_url=BASE_URL, timeout=15.0)
        self.provider = DEFAULT_PROVIDER
        self.api_key = ""
        self.model = ""
        self.created_characters: List[str] = []
        parsed = urlparse(BASE_URL)
        ws_scheme = "wss" if parsed.scheme == "https" else "ws"
        self.ws_url = f"{ws_scheme}://{parsed.netloc}/ws/{ROOM_ID}"

    def log(self, name: str, status: str, detail: str = ""):
        """记录测试结果并打印到终端"""
        prefix = {"ok": "✅", "fail": "❌", "skip": "⚠️"}.get(status, "ℹ️")
        detail_text = f" - {detail}" if detail else ""
        print(f"{prefix} {name}{detail_text}")
        self.results.append({"name": name, "status": status, "detail": detail})

    async def request(self, method: str, url: str, **kwargs) -> Optional[httpx.Response]:
        try:
            return await self.client.request(method, url, **kwargs)
        except Exception as exc:
            self.log(url, "fail", f"请求异常: {exc}")
            return None

    async def configure_api(self) -> bool:
        env_var = PROVIDER_ENV_MAP.get(self.provider)
        if not env_var:
            self.log("API配置", "fail", f"不支持的提供商: {self.provider}")
            return False

        api_key = os.getenv(env_var)
        if not api_key:
            self.log("API配置", "skip", f"缺少环境变量 {env_var}，跳过AI相关测试")
            return False

        self.api_key = api_key
        self.model = os.getenv("MODEL_OVERRIDE", PROVIDER_DEFAULT_MODEL.get(self.provider, ""))
        payload = {"provider": self.provider, "api_key": api_key, "model": self.model}
        resp = await self.request("POST", "/api/config", json=payload)
        if not resp:
            return False

        if resp.status_code == 200:
            data = resp.json()
            test_result = data.get("test_result", {})
            if test_result.get("success", False):
                self.log("API配置", "ok", f"{self.provider} / {self.model}")
                return True
            self.log("API配置", "fail", f"连接测试失败: {test_result.get('error', '未知错误')}")
            return False

        self.log("API配置", "fail", f"状态码: {resp.status_code}, 内容: {resp.text}")
        return False

    async def check_root(self):
        resp = await self.request("GET", "/")
        if resp and resp.status_code == 200:
            self.log("主页可达", "ok")
        else:
            self.log("主页可达", "fail", f"状态码: {getattr(resp, 'status_code', '无')}")

    async def check_health(self):
        resp = await self.request("GET", "/api/health")
        if resp and resp.status_code == 200:
            data = resp.json()
            self.log("健康检查", "ok", f"房间: {data.get('rooms', '-')}, WS连接: {data.get('connections', '-')}")
        else:
            self.log("健康检查", "fail", f"状态码: {getattr(resp, 'status_code', '无')}")

    async def check_status(self):
        resp = await self.request("GET", "/api/status")
        if resp and resp.status_code == 200:
            data = resp.json()
            self.log("API状态", "ok", f"{data.get('status', 'unknown')} / {data.get('provider', '-')}")
        else:
            self.log("API状态", "fail", f"状态码: {getattr(resp, 'status_code', '无')}")

    async def create_character(self, name_suffix: str) -> Optional[str]:
        payload = {
            "name": f"测试角色-{name_suffix}",
            "personality": "友好、简洁",
            "background": "系统自动化测试角色",
            "speaking_style": "直接、短句",
        }
        resp = await self.request("POST", f"/api/rooms/{ROOM_ID}/characters", json=payload)
        if resp and resp.status_code == 200:
            data = resp.json()
            character_id = data.get("character_id") or data.get("character", {}).get("id")
            if character_id:
                self.created_characters.append(character_id)
                self.log(f"创建角色-{name_suffix}", "ok", f"ID: {character_id}")
                return character_id
        detail = resp.text if resp else "请求异常"
        self.log(f"创建角色-{name_suffix}", "fail", detail)
        return None

    async def send_message(self, character_id: str, content: str):
        resp = await self.request(
            "POST",
            f"/api/rooms/{ROOM_ID}/messages",
            json={"character_id": character_id, "content": content},
        )
        if resp and resp.status_code == 200:
            self.log("发送消息", "ok", content[:30])
        else:
            self.log("发送消息", "fail", f"状态码: {getattr(resp, 'status_code', '无')}")

    async def generate_reply(self, character_id: str):
        resp = await self.request(
            "POST", f"/api/rooms/{ROOM_ID}/generate", json={"character_id": character_id}
        )
        if resp and resp.status_code == 200:
            data = resp.json()
            self.log("AI回复生成", "ok", data.get("content", "无内容")[:50])
        else:
            self.log("AI回复生成", "fail", f"状态码: {getattr(resp, 'status_code', '无')}")

    async def auto_chat_cycle(self):
        start = await self.request("POST", f"/api/rooms/{ROOM_ID}/auto-chat/start")
        if start and start.status_code == 200:
            self.log("自动聊天-启动", "ok")
            await asyncio.sleep(2)  # 给后台生成一点时间
            stop = await self.request("POST", f"/api/rooms/{ROOM_ID}/auto-chat/stop")
            if stop and stop.status_code == 200:
                self.log("自动聊天-停止", "ok")
            else:
                self.log("自动聊天-停止", "fail", f"状态码: {getattr(stop, 'status_code', '无')}")
        else:
            self.log("自动聊天-启动", "fail", f"状态码: {getattr(start, 'status_code', '无')}")

    async def fetch_messages(self):
        resp = await self.request("GET", f"/api/rooms/{ROOM_ID}/messages", params={"limit": 10})
        if resp and resp.status_code == 200:
            msgs = resp.json()
            self.log("获取消息", "ok", f"最近 {len(msgs)} 条")
        else:
            self.log("获取消息", "fail", f"状态码: {getattr(resp, 'status_code', '无')}")

    async def websocket_ping(self):
        try:
            async with websockets.connect(self.ws_url, ping_timeout=5) as websocket:
                await websocket.send("ping")
                self.log("WebSocket连接", "ok", self.ws_url)
        except Exception as exc:
            self.log("WebSocket连接", "fail", str(exc))

    async def cleanup_characters(self):
        for cid in self.created_characters:
            resp = await self.request("DELETE", f"/api/rooms/{ROOM_ID}/characters/{cid}")
            if resp and resp.status_code == 200:
                self.log(f"清理角色-{cid}", "ok")
            else:
                self.log(f"清理角色-{cid}", "skip", "可能未创建成功或已被移除")

    async def run(self):
        print(f"🚀 AI Tea Party 完整系统测试开始 | {datetime.now():%Y-%m-%d %H:%M:%S}")
        print(f"Base URL: {BASE_URL} | Room: {ROOM_ID} | Provider: {self.provider}")
        print("-" * 60)

        await self.check_root()
        await self.check_health()
        await self.check_status()

        ai_ready = await self.configure_api()

        # WebSocket 连通性与基础消息流
        await self.websocket_ping()

        if ai_ready:
            # 角色与消息回路
            c1 = await self.create_character("A")
            c2 = await self.create_character("B")
            if c1 and c2:
                await self.send_message(c1, "你好，我是自动化测试消息。")
                await self.generate_reply(c2)
                await self.auto_chat_cycle()
                await self.fetch_messages()
            await self.cleanup_characters()
        else:
            self.log("AI相关测试", "skip", "未配置 API，跳过角色/消息/自动聊天环节")

        print("-" * 60)
        ok = sum(1 for r in self.results if r["status"] == "ok")
        fail = sum(1 for r in self.results if r["status"] == "fail")
        skip = sum(1 for r in self.results if r["status"] == "skip")
        print(f"总结: ✅ {ok} | ❌ {fail} | ⚠️ {skip}")

    async def close(self):
        await self.client.aclose()


async def main():
    tester = FullSystemTester()
    try:
        await tester.run()
    finally:
        await tester.close()


if __name__ == "__main__":
    asyncio.run(main())
