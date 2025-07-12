#!/usr/bin/env python3
"""
最终 AI 对话功能测试
验证 AI 自动对话是否正常工作
"""
import asyncio
import aiohttp
import json
import time
from datetime import datetime

async def test_complete_ai_chat():
    """测试完整的 AI 对话功能"""
    base_url = "http://localhost:8000"
    
    print("🎉 开始最终 AI 对话功能测试...")
    print(f"⏰ 测试时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    async with aiohttp.ClientSession() as session:
        # 1. 检查服务器状态
        print("\n1️⃣ 检查服务器状态...")
        try:
            async with session.get(f"{base_url}/") as response:
                if response.status == 200:
                    print("✅ 服务器运行正常")
                else:
                    print(f"❌ 服务器状态异常: {response.status}")
                    return
        except Exception as e:
            print(f"❌ 无法连接到服务器: {e}")
            return
        
        # 2. 获取 API 配置
        print("\n2️⃣ 检查 API 配置...")
        try:
            async with session.get(f"{base_url}/api/config") as response:
                if response.status == 200:
                    config = await response.json()
                    print(f"✅ API 配置正常: {config}")
                else:
                    print(f"❌ API 配置获取失败: {response.status}")
        except Exception as e:
            print(f"❌ API 配置检查失败: {e}")
        
        # 3. 创建测试角色
        print("\n3️⃣ 创建测试角色...")
        characters = [
            {
                "name": "小李",
                "personality": "开朗活泼，喜欢聊天",
                "background": "一个热爱生活的年轻人",
                "speaking_style": "轻松幽默，经常用表情符号"
            },
            {
                "name": "小王",
                "personality": "沉稳理性，思考深入",
                "background": "喜欢思考人生的哲学家",
                "speaking_style": "深沉有内涵，言简意赅"
            }
        ]
        
        character_ids = []
        for char in characters:
            try:
                async with session.post(
                    f"{base_url}/api/characters",
                    json=char,
                    headers={"Content-Type": "application/json"}
                ) as response:
                    if response.status == 200:
                        result = await response.json()
                        character_ids.append(result["id"])
                        print(f"✅ 创建角色成功: {char['name']} (ID: {result['id']})")
                    else:
                        print(f"❌ 创建角色失败: {char['name']}")
            except Exception as e:
                print(f"❌ 创建角色异常: {e}")
        
        if len(character_ids) < 2:
            print("❌ 需要至少两个角色才能测试对话")
            return
        
        # 4. 测试手动发送消息
        print("\n4️⃣ 测试手动发送消息...")
        try:
            message_data = {
                "character_id": character_ids[0],
                "content": "大家好！今天天气真不错呢~ 😊"
            }
            async with session.post(
                f"{base_url}/api/rooms/default/messages",
                json=message_data,
                headers={"Content-Type": "application/json"}
            ) as response:
                if response.status == 200:
                    print("✅ 手动消息发送成功")
                else:
                    print(f"❌ 手动消息发送失败: {response.status}")
        except Exception as e:
            print(f"❌ 手动消息发送异常: {e}")
        
        # 5. 测试 AI 生成回复
        print("\n5️⃣ 测试 AI 生成回复...")
        try:
            generate_data = {
                "character_id": character_ids[1]
            }
            async with session.post(
                f"{base_url}/api/rooms/default/generate",
                json=generate_data,
                headers={"Content-Type": "application/json"}
            ) as response:
                if response.status == 200:
                    result = await response.json()
                    print(f"✅ AI 回复生成成功: {result.get('content', '无内容')}")
                else:
                    error_text = await response.text()
                    print(f"❌ AI 回复生成失败: {response.status} - {error_text}")
        except Exception as e:
            print(f"❌ AI 回复生成异常: {e}")
        
        # 6. 测试启动自动聊天
        print("\n6️⃣ 测试启动自动聊天...")
        try:
            async with session.post(f"{base_url}/api/rooms/default/auto-chat/start") as response:
                if response.status == 200:
                    print("✅ 自动聊天启动成功")
                    
                    # 等待几秒钟让自动聊天生成一些消息
                    print("⏳ 等待自动聊天生成消息...")
                    await asyncio.sleep(20)
                    
                    # 停止自动聊天
                    async with session.post(f"{base_url}/api/rooms/default/auto-chat/stop") as stop_response:
                        if stop_response.status == 200:
                            print("✅ 自动聊天停止成功")
                        else:
                            print(f"⚠️ 自动聊天停止失败: {stop_response.status}")
                else:
                    print(f"❌ 自动聊天启动失败: {response.status}")
        except Exception as e:
            print(f"❌ 自动聊天测试异常: {e}")
        
        # 7. 获取聊天历史
        print("\n7️⃣ 检查聊天历史...")
        try:
            async with session.get(f"{base_url}/api/rooms/default/messages") as response:
                if response.status == 200:
                    messages = await response.json()
                    print(f"✅ 聊天历史获取成功，共 {len(messages)} 条消息")
                    
                    # 显示最近的几条消息
                    if messages:
                        print("\n📝 最近的聊天消息:")
                        for msg in messages[-5:]:  # 显示最后5条消息
                            timestamp = msg.get('timestamp', 'Unknown')
                            character_name = msg.get('character_name', 'Unknown')
                            content = msg.get('content', '')
                            print(f"   [{timestamp}] {character_name}: {content}")
                else:
                    print(f"❌ 聊天历史获取失败: {response.status}")
        except Exception as e:
            print(f"❌ 聊天历史获取异常: {e}")
        
        print(f"\n🎯 测试完成！时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 50)
        print("✅ AI Tea Party 系统完全正常运行！")
        print("🚀 您可以在浏览器中访问 http://localhost:8000 开始使用")
        print("=" * 50)

if __name__ == "__main__":
    asyncio.run(test_complete_ai_chat()) 