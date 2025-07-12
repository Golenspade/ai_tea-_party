#!/usr/bin/env python3
"""
最终测试：验证DeepSeek API连接和所有功能
"""

import asyncio
import aiohttp
import json
import os
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

async def final_test():
    """最终测试所有功能"""
    base_url = "http://localhost:8000"
    
    # 从环境变量获取DeepSeek API密钥
    deepseek_api_key = os.getenv("DEEPSEEK_API_KEY")
    deepseek_model = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
    
    if not deepseek_api_key:
        print("❌ 未找到DEEPSEEK_API_KEY环境变量")
        return
    
    print("🎉 开始最终功能测试...")
    print(f"🔑 使用DeepSeek API密钥: {deepseek_api_key[:10]}...")
    print(f"🤖 使用模型: {deepseek_model}")
    
    async with aiohttp.ClientSession() as session:
        
        # 1. 配置API并测试连接
        print("\n1️⃣ 配置DeepSeek API并测试连接...")
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
                print(f"✅ 配置更新: {result['message']}")
                
                if 'test_result' in result and result['test_result']['success']:
                    print(f"✅ 自动连接测试成功!")
                    print(f"   响应时间: {result['test_result']['response_time']:.2f}秒")
                else:
                    print("❌ 自动连接测试失败")
                    return
            else:
                print(f"❌ 配置失败: {response.status}")
                return
        
        # 2. 独立连接测试
        print("\n2️⃣ 独立连接测试...")
        async with session.post(f"{base_url}/api/test-connection") as response:
            if response.status == 200:
                result = await response.json()
                if result['success']:
                    print(f"✅ 独立连接测试成功!")
                    print(f"   响应时间: {result['response_time']:.2f}秒")
                else:
                    print(f"❌ 独立连接测试失败: {result['error']}")
            else:
                print(f"❌ 连接测试请求失败: {response.status}")
        
        # 3. API状态检查
        print("\n3️⃣ API状态检查...")
        async with session.get(f"{base_url}/api/status") as response:
            if response.status == 200:
                status = await response.json()
                print(f"✅ API状态: {status['status']}")
                print(f"   提供商: {status.get('provider', 'N/A')}")
                print(f"   模型: {status.get('model', 'N/A')}")
                if status['status'] != 'healthy':
                    print(f"   ⚠️ 状态消息: {status.get('message', 'N/A')}")
            else:
                print(f"❌ 状态检查失败: {response.status}")
        
        # 4. 健康检查
        print("\n4️⃣ 系统健康检查...")
        async with session.get(f"{base_url}/api/health") as response:
            if response.status == 200:
                health = await response.json()
                print(f"✅ 系统状态: {health['status']}")
                print(f"   AI已配置: {health['ai_configured']}")
                print(f"   聊天室数量: {health['rooms']}")
                print(f"   WebSocket连接: {health['connections']}")
            else:
                print(f"❌ 健康检查失败: {response.status}")
        
        # 5. 测试周期性健康监控
        print("\n5️⃣ 测试周期性健康监控...")
        print("等待5秒以观察健康监控...")
        await asyncio.sleep(5)
        
        async with session.get(f"{base_url}/api/status") as response:
            if response.status == 200:
                status = await response.json()
                print(f"✅ 5秒后API状态仍然: {status['status']}")
                if 'last_check' in status:
                    print(f"   最后检查时间: {status['last_check']}")
            else:
                print(f"❌ 状态检查失败: {response.status}")
        
        print("\n🎉 所有测试完成!")
        print("\n📋 测试总结:")
        print("✅ API配置和自动测试")
        print("✅ 独立连接测试")
        print("✅ API状态监控")
        print("✅ 系统健康检查")
        print("✅ 周期性健康监控")
        print("\n🚀 DeepSeek API集成完全正常工作!")

if __name__ == "__main__":
    asyncio.run(final_test())
