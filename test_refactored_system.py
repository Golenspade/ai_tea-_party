#!/usr/bin/env python3
"""
AI Tea Party - 重构后系统测试脚本
测试新的API支持、多轮对话逻辑和前端界面
"""

import asyncio
import json
import time
import os
import sys
from typing import Dict, List, Any
import requests
import websockets
from datetime import datetime

# 添加项目根目录到Python路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from services.ai_service import ai_service, APIProvider
from services.chat_service import chat_service
from models.character import Character, Message


class SystemTester:
    """系统测试类"""
    
    def __init__(self):
        self.base_url = "http://localhost:8000"
        self.ws_url = "ws://localhost:8000/ws/default"
        self.test_results = []
        self.test_room_id = "test_room"
        
    def log_test(self, test_name: str, success: bool, message: str = ""):
        """记录测试结果"""
        result = {
            "test_name": test_name,
            "success": success,
            "message": message,
            "timestamp": datetime.now().isoformat()
        }
        self.test_results.append(result)
        
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}: {message}")
        
    def print_summary(self):
        """打印测试总结"""
        total_tests = len(self.test_results)
        passed_tests = sum(1 for r in self.test_results if r["success"])
        failed_tests = total_tests - passed_tests
        
        print("\n" + "="*60)
        print("🧪 测试总结")
        print("="*60)
        print(f"总测试数: {total_tests}")
        print(f"通过: {passed_tests}")
        print(f"失败: {failed_tests}")
        print(f"成功率: {passed_tests/total_tests*100:.1f}%")
        
        if failed_tests > 0:
            print("\n❌ 失败的测试:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"  - {result['test_name']}: {result['message']}")
        
        print("="*60)

    def test_api_providers(self):
        """测试API提供商配置"""
        print("\n🔧 测试API提供商配置...")
        
        # 测试支持的API提供商
        supported_providers = [
            APIProvider.DEEPSEEK_CHAT,
            APIProvider.DEEPSEEK_REASONER,
            APIProvider.GEMINI_25_FLASH,
            APIProvider.GEMINI_25_PRO
        ]
        
        for provider in supported_providers:
            try:
                # 测试默认模型获取
                from services.ai_service import APIConfig
                config = APIConfig(provider, "test_key")
                expected_models = {
                    APIProvider.DEEPSEEK_CHAT: "deepseek-chat",
                    APIProvider.DEEPSEEK_REASONER: "deepseek-reasoner",
                    APIProvider.GEMINI_25_FLASH: "gemini-2.5-flash",
                    APIProvider.GEMINI_25_PRO: "gemini-2.5-pro"
                }
                
                if config.model == expected_models[provider]:
                    self.log_test(f"API配置-{provider.value}", True, f"默认模型: {config.model}")
                else:
                    self.log_test(f"API配置-{provider.value}", False, f"模型不匹配: {config.model}")
                    
            except Exception as e:
                self.log_test(f"API配置-{provider.value}", False, f"配置失败: {str(e)}")

    def test_character_memory_system(self):
        """测试角色记忆系统"""
        print("\n🧠 测试角色记忆系统...")
        
        try:
            from services.ai_service import CharacterMemory
            memory = CharacterMemory()
            
            # 测试角色特征更新
            memory.update_character_profile("char1", "Alice", ["友好", "健谈"])
            context = memory.get_character_context("char1")
            
            if "Alice" in context and "友好" in context:
                self.log_test("角色记忆-特征存储", True, "成功存储和检索角色特征")
            else:
                self.log_test("角色记忆-特征存储", False, f"特征检索失败: {context}")
            
            # 测试消息分析
            test_messages = [
                Message(character_id="char1", character_name="Alice", content="哈哈，太有趣了！谢谢你的分享。"),
                Message(character_id="char1", character_name="Alice", content="我觉得这个想法很棒。"),
            ]
            
            traits = memory.analyze_character_from_messages("char1", test_messages)
            
            if "幽默开朗" in traits and "礼貌" in traits:
                self.log_test("角色记忆-特征分析", True, f"成功分析特征: {traits}")
            else:
                self.log_test("角色记忆-特征分析", False, f"特征分析不准确: {traits}")
                
        except Exception as e:
            self.log_test("角色记忆系统", False, f"测试失败: {str(e)}")

    def test_enhanced_conversation_logic(self):
        """测试增强的对话逻辑"""
        print("\n💬 测试增强的对话逻辑...")
        
        try:
            # 创建测试角色
            char1 = Character(name="Alice", personality="友好开朗", background="AI助手")
            char2 = Character(name="Bob", personality="理性分析", background="数据科学家")
            
            # 创建对话历史
            conversation = [
                Message(character_id=char1.id, character_name="Alice", content="你好Bob！今天天气真不错。"),
                Message(character_id=char2.id, character_name="Bob", content="确实，根据气象数据，今天的温度和湿度都很适宜。"),
                Message(character_id=char1.id, character_name="Alice", content="你总是这么严谨，哈哈！"),
            ]
            
            # 测试上下文分析
            if hasattr(ai_service, '_analyze_conversation_context'):
                context_analysis = ai_service._analyze_conversation_context(conversation, char2)
                
                if "对话" in context_analysis and ("进行" in context_analysis or "深入" in context_analysis):
                    self.log_test("对话逻辑-上下文分析", True, "成功分析对话上下文")
                else:
                    self.log_test("对话逻辑-上下文分析", False, f"上下文分析结果: {context_analysis}")
            
            # 测试角色记忆上下文
            if hasattr(ai_service, '_get_character_memory_context'):
                memory_context = ai_service._get_character_memory_context(char2.id, conversation)
                
                if "Alice" in memory_context or "最近说过" in memory_context:
                    self.log_test("对话逻辑-角色记忆", True, "成功获取角色记忆上下文")
                else:
                    self.log_test("对话逻辑-角色记忆", False, f"记忆上下文: {memory_context}")
            
        except Exception as e:
            self.log_test("增强对话逻辑", False, f"测试失败: {str(e)}")

    def test_api_endpoints(self):
        """测试API端点"""
        print("\n🌐 测试API端点...")
        
        endpoints_to_test = [
            ("GET", "/api/health", "健康检查"),
            ("GET", "/api/config", "获取API配置"),
            ("GET", "/api/rooms/default", "获取默认房间"),
            ("GET", "/api/rooms/default/characters", "获取角色列表"),
            ("GET", "/api/rooms/default/messages", "获取消息历史"),
        ]
        
        for method, endpoint, description in endpoints_to_test:
            try:
                url = f"{self.base_url}{endpoint}"
                
                if method == "GET":
                    response = requests.get(url, timeout=5)
                elif method == "POST":
                    response = requests.post(url, json={}, timeout=5)
                else:
                    continue
                
                if response.status_code == 200:
                    self.log_test(f"API端点-{description}", True, f"状态码: {response.status_code}")
                else:
                    self.log_test(f"API端点-{description}", False, f"状态码: {response.status_code}")
                    
            except requests.exceptions.RequestException as e:
                self.log_test(f"API端点-{description}", False, f"请求失败: {str(e)}")

    def test_websocket_connection(self):
        """测试WebSocket连接"""
        print("\n🔌 测试WebSocket连接...")
        
        async def test_ws():
            try:
                async with websockets.connect(self.ws_url) as websocket:
                    # 发送测试消息
                    await websocket.send("test message")
                    
                    # 等待响应（超时5秒）
                    try:
                        await asyncio.wait_for(websocket.recv(), timeout=5.0)
                        self.log_test("WebSocket连接", True, "连接成功并可通信")
                    except asyncio.TimeoutError:
                        self.log_test("WebSocket连接", True, "连接成功（无响应消息）")
                        
            except Exception as e:
                self.log_test("WebSocket连接", False, f"连接失败: {str(e)}")
        
        try:
            asyncio.run(test_ws())
        except Exception as e:
            self.log_test("WebSocket连接", False, f"测试失败: {str(e)}")

    def test_character_management(self):
        """测试角色管理功能"""
        print("\n👥 测试角色管理功能...")
        
        try:
            # 测试添加角色
            character_data = {
                "name": "测试角色",
                "personality": "友好测试",
                "background": "专门用于测试的AI角色",
                "speaking_style": "简洁明了"
            }
            
            response = requests.post(
                f"{self.base_url}/api/rooms/default/characters",
                json=character_data,
                timeout=10
            )
            
            if response.status_code == 200:
                result = response.json()
                character_id = result.get("character_id")
                
                if character_id:
                    self.log_test("角色管理-添加角色", True, f"成功添加角色: {character_id}")
                    
                    # 测试删除角色
                    delete_response = requests.delete(
                        f"{self.base_url}/api/rooms/default/characters/{character_id}",
                        timeout=10
                    )
                    
                    if delete_response.status_code == 200:
                        self.log_test("角色管理-删除角色", True, "成功删除角色")
                    else:
                        self.log_test("角色管理-删除角色", False, f"删除失败: {delete_response.status_code}")
                else:
                    self.log_test("角色管理-添加角色", False, "未返回角色ID")
            else:
                self.log_test("角色管理-添加角色", False, f"添加失败: {response.status_code}")
                
        except Exception as e:
            self.log_test("角色管理", False, f"测试失败: {str(e)}")

    def test_message_flow(self):
        """测试消息流"""
        print("\n📨 测试消息流...")
        
        try:
            # 先获取现有角色
            response = requests.get(f"{self.base_url}/api/rooms/default/characters", timeout=5)
            
            if response.status_code == 200:
                characters = response.json()
                
                if characters:
                    character_id = characters[0]["id"]
                    
                    # 测试发送消息
                    message_data = {
                        "character_id": character_id,
                        "content": "这是一条测试消息"
                    }
                    
                    send_response = requests.post(
                        f"{self.base_url}/api/rooms/default/messages",
                        json=message_data,
                        timeout=10
                    )
                    
                    if send_response.status_code == 200:
                        self.log_test("消息流-发送消息", True, "成功发送消息")
                    else:
                        self.log_test("消息流-发送消息", False, f"发送失败: {send_response.status_code}")
                else:
                    self.log_test("消息流-发送消息", False, "没有可用角色")
            else:
                self.log_test("消息流-获取角色", False, f"获取角色失败: {response.status_code}")
                
        except Exception as e:
            self.log_test("消息流", False, f"测试失败: {str(e)}")

    def test_auto_chat_functionality(self):
        """测试自动聊天功能"""
        print("\n🤖 测试自动聊天功能...")
        
        try:
            # 测试启动自动聊天
            start_response = requests.post(
                f"{self.base_url}/api/rooms/default/auto-chat/start",
                timeout=10
            )
            
            if start_response.status_code == 200:
                self.log_test("自动聊天-启动", True, "成功启动自动聊天")
                
                # 等待一小段时间
                time.sleep(2)
                
                # 测试停止自动聊天
                stop_response = requests.post(
                    f"{self.base_url}/api/rooms/default/auto-chat/stop",
                    timeout=10
                )
                
                if stop_response.status_code == 200:
                    self.log_test("自动聊天-停止", True, "成功停止自动聊天")
                else:
                    self.log_test("自动聊天-停止", False, f"停止失败: {stop_response.status_code}")
            else:
                self.log_test("自动聊天-启动", False, f"启动失败: {start_response.status_code}")
                
        except Exception as e:
            self.log_test("自动聊天功能", False, f"测试失败: {str(e)}")

    def test_room_settings(self):
        """测试房间设置"""
        print("\n🏠 测试房间设置...")
        
        try:
            # 测试更新房间设置
            room_data = {
                "name": "测试房间",
                "description": "这是一个测试房间",
                "stealth_mode": False,
                "user_description": "测试用户"
            }
            
            response = requests.put(
                f"{self.base_url}/api/rooms/default",
                json=room_data,
                timeout=10
            )
            
            if response.status_code == 200:
                self.log_test("房间设置-更新", True, "成功更新房间设置")
            else:
                self.log_test("房间设置-更新", False, f"更新失败: {response.status_code}")
                
        except Exception as e:
            self.log_test("房间设置", False, f"测试失败: {str(e)}")

    def run_all_tests(self):
        """运行所有测试"""
        print("🚀 开始运行系统测试...")
        print("="*60)
        
        # 基础功能测试
        self.test_api_providers()
        self.test_character_memory_system()
        self.test_enhanced_conversation_logic()
        
        # API端点测试
        self.test_api_endpoints()
        self.test_websocket_connection()
        
        # 功能测试
        self.test_character_management()
        self.test_message_flow()
        self.test_auto_chat_functionality()
        self.test_room_settings()
        
        # 打印总结
        self.print_summary()
        
        return len([r for r in self.test_results if not r["success"]]) == 0


def main():
    """主函数"""
    print("AI Tea Party - 重构后系统测试")
    print("="*60)
    
    # 检查服务器是否运行
    try:
        response = requests.get("http://localhost:8000/api/health", timeout=5)
        if response.status_code != 200:
            print("❌ 服务器未正常运行，请先启动服务器")
            return False
    except requests.exceptions.RequestException:
        print("❌ 无法连接到服务器，请确保服务器在 localhost:8000 运行")
        return False
    
    # 运行测试
    tester = SystemTester()
    success = tester.run_all_tests()
    
    if success:
        print("\n🎉 所有测试通过！系统重构成功。")
        return True
    else:
        print("\n⚠️  部分测试失败，请检查相关功能。")
        return False


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1) 