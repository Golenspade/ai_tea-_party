#!/usr/bin/env python3
"""
测试API改进功能
包括API连接测试、健康检查和状态监控
"""

import asyncio
import aiohttp
import json
import time

async def test_api_improvements():
    """测试API改进功能"""
    base_url = "http://localhost:8000"
    
    async with aiohttp.ClientSession() as session:
        print("🧪 开始测试API改进功能...")
        
        # 1. 测试获取API配置
        print("\n1️⃣ 测试获取API配置...")
        async with session.get(f"{base_url}/api/config") as response:
            if response.status == 200:
                config = await response.json()
                print(f"✅ 当前配置: {config}")
            else:
                print(f"❌ 获取配置失败: {response.status}")
        
        # 2. 测试配置DeepSeek API（带连接测试）
        print("\n2️⃣ 测试配置DeepSeek API...")
        test_config = {
            "provider": "deepseek_v3",
            "api_key": "sk-test-key-12345",  # 测试用的假密钥
            "model": "deepseek-chat"
        }
        
        async with session.post(
            f"{base_url}/api/config",
            json=test_config,
            headers={"Content-Type": "application/json"}
        ) as response:
            if response.status == 200:
                result = await response.json()
                print(f"✅ 配置更新成功: {result['message']}")
                if 'test_result' in result:
                    test_result = result['test_result']
                    if test_result['success']:
                        print(f"✅ API连接测试成功: {test_result['response_time']}s")
                    else:
                        print(f"⚠️ API连接测试失败: {test_result['error']}")
                else:
                    print("⚠️ 未找到测试结果")
            else:
                error = await response.json()
                print(f"❌ 配置失败: {error}")
        
        # 3. 测试独立的API连接测试
        print("\n3️⃣ 测试独立API连接测试...")
        async with session.post(f"{base_url}/api/test-connection") as response:
            if response.status == 200:
                result = await response.json()
                if result['success']:
                    print(f"✅ 独立连接测试成功: {result['response_time']}s")
                else:
                    print(f"❌ 独立连接测试失败: {result['error']}")
            else:
                error = await response.json()
                print(f"❌ 连接测试请求失败: {error}")
        
        # 4. 测试API状态检查
        print("\n4️⃣ 测试API状态检查...")
        async with session.get(f"{base_url}/api/status") as response:
            if response.status == 200:
                status = await response.json()
                print(f"✅ API状态: {status['status']}")
                print(f"   提供商: {status.get('provider', 'N/A')}")
                print(f"   模型: {status.get('model', 'N/A')}")
                print(f"   最后检查: {status.get('last_check', 'N/A')}")
                print(f"   消息: {status.get('message', 'N/A')}")
                if status.get('last_error'):
                    print(f"   最后错误: {status['last_error']}")
            else:
                error = await response.json()
                print(f"❌ 状态检查失败: {error}")
        
        # 5. 测试健康检查端点
        print("\n5️⃣ 测试健康检查端点...")
        async with session.get(f"{base_url}/api/health") as response:
            if response.status == 200:
                health = await response.json()
                print(f"✅ 系统健康状态: {health['status']}")
                print(f"   AI已配置: {health['ai_configured']}")
                print(f"   聊天室数量: {health['rooms']}")
                print(f"   WebSocket连接数: {health['connections']}")
            else:
                print(f"❌ 健康检查失败: {response.status}")
        
        print("\n🎉 API改进功能测试完成！")

if __name__ == "__main__":
    asyncio.run(test_api_improvements())
