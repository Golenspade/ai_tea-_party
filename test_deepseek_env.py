#!/usr/bin/env python3
"""
使用.env文件中的DeepSeek API进行测试
"""

import asyncio
import aiohttp
import json
import os
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

async def test_deepseek_from_env():
    """使用.env文件中的DeepSeek API进行测试"""
    base_url = "http://localhost:8000"
    
    # 从环境变量获取DeepSeek API密钥
    deepseek_api_key = os.getenv("DEEPSEEK_API_KEY")
    deepseek_model = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
    
    if not deepseek_api_key:
        print("❌ 未找到DEEPSEEK_API_KEY环境变量")
        return
    
    print(f"🔑 使用DeepSeek API密钥: {deepseek_api_key[:10]}...")
    print(f"🤖 使用模型: {deepseek_model}")
    
    async with aiohttp.ClientSession() as session:
        print("\n🧪 开始测试DeepSeek API连接...")
        
        # 1. 配置DeepSeek API
        print("\n1️⃣ 配置DeepSeek V3 API...")
        config_data = {
            "provider": "deepseek_v3",
            "api_key": deepseek_api_key,
            "model": deepseek_model
        }
        
        async with session.post(
            f"{base_url}/api/config",
            json=config_data,
            headers={"Content-Type": "application/json"}
        ) as response:
            if response.status == 200:
                result = await response.json()
                print(f"✅ 配置更新成功: {result['message']}")
                
                # 检查测试结果
                if 'test_result' in result:
                    test_result = result['test_result']
                    if test_result['success']:
                        print(f"🎉 API连接测试成功!")
                        print(f"   响应时间: {test_result['response_time']}秒")
                        print(f"   提供商: {test_result['provider']}")
                        print(f"   模型: {test_result['model']}")
                    else:
                        print(f"❌ API连接测试失败: {test_result['error']}")
                        return
                else:
                    print("⚠️ 未找到测试结果")
            else:
                error = await response.json()
                print(f"❌ 配置失败: {error}")
                return
        
        # 2. 测试独立连接
        print("\n2️⃣ 测试独立API连接...")
        async with session.post(f"{base_url}/api/test-connection") as response:
            if response.status == 200:
                result = await response.json()
                if result['success']:
                    print(f"✅ 独立连接测试成功!")
                    print(f"   响应时间: {result['response_time']}秒")
                else:
                    print(f"❌ 独立连接测试失败: {result['error']}")
            else:
                error = await response.json()
                print(f"❌ 连接测试请求失败: {error}")
        
        # 3. 检查API状态
        print("\n3️⃣ 检查API状态...")
        async with session.get(f"{base_url}/api/status") as response:
            if response.status == 200:
                status = await response.json()
                print(f"📊 API状态: {status['status']}")
                print(f"   提供商: {status.get('provider', 'N/A')}")
                print(f"   模型: {status.get('model', 'N/A')}")
                print(f"   消息: {status.get('message', 'N/A')}")
                if status.get('last_error'):
                    print(f"   ⚠️ 最后错误: {status['last_error']}")
            else:
                print(f"❌ 状态检查失败: {response.status}")
        
        # 4. 测试实际对话
        print("\n4️⃣ 测试实际AI对话...")
        
        # 首先创建一个测试角色
        character_data = {
            "name": "小助手",
            "personality": "友好、乐于助人的AI助手",
            "background": "我是一个测试用的AI助手，喜欢帮助用户解决问题。"
        }
        
        async with session.post(
            f"{base_url}/api/rooms/default/characters",
            json=character_data,
            headers={"Content-Type": "application/json"}
        ) as response:
            if response.status == 200:
                character_result = await response.json()
                character_id = character_result['character']['id']
                print(f"✅ 创建测试角色成功: {character_result['character']['name']}")
                
                # 发送测试消息
                message_data = {
                    "character_id": character_id,
                    "content": "你好！请简单介绍一下自己。"
                }
                
                async with session.post(
                    f"{base_url}/api/rooms/default/messages",
                    json=message_data,
                    headers={"Content-Type": "application/json"}
                ) as msg_response:
                    if msg_response.status == 200:
                        msg_result = await msg_response.json()
                        print(f"✅ 发送消息成功")
                        print(f"   消息内容: {msg_result['message']['content']}")
                        
                        # 等待一下让AI有时间回复
                        await asyncio.sleep(2)
                        
                        # 获取最新消息
                        async with session.get(f"{base_url}/api/rooms/default/messages") as get_response:
                            if get_response.status == 200:
                                messages = await get_response.json()
                                if len(messages) > 1:
                                    latest_message = messages[-1]
                                    if latest_message['character_id'] == character_id and latest_message['content'] != message_data['content']:
                                        print(f"🎉 AI回复成功!")
                                        print(f"   AI回复: {latest_message['content']}")
                                    else:
                                        print("⚠️ 未检测到AI回复")
                                else:
                                    print("⚠️ 消息列表中没有新回复")
                    else:
                        print(f"❌ 发送消息失败: {msg_response.status}")
            else:
                print(f"❌ 创建测试角色失败: {response.status}")
        
        print("\n🎉 DeepSeek API测试完成!")

if __name__ == "__main__":
    asyncio.run(test_deepseek_from_env())
