#!/usr/bin/env python3
"""
测试 AI 对话功能
"""
import asyncio
import sys
import os

# 添加项目根目录到路径
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from services.ai_service import AIService, APIProvider
from models.character import Character, Message


async def test_ai_chat():
    """测试 AI 对话功能"""
    print("🚀 开始测试 AI 对话功能...")
    
    # 初始化 AI 服务
    ai_service = AIService()
    
    # 检查配置
    if not ai_service.is_configured():
        print("❌ AI 服务未配置。请检查环境变量中的 API 密钥。")
        return
    
    config = ai_service.get_current_config()
    print(f"✅ AI 服务已配置: {config}")
    
    # 创建测试角色
    character = Character(
        name="小明",
        personality="开朗、乐于助人、有趣",
        background="一个友好的聊天机器人，喜欢帮助用户解决问题",
        speaking_style="轻松幽默，喜欢用表情符号"
    )
    
    print(f"🤖 创建测试角色: {character.name}")
    
    # 创建对话历史
    conversation_history = [
        Message(
            character_id="user1",
            character_name="用户",
            content="你好！今天天气怎么样？",
            is_system=False
        )
    ]
    
    print("💬 开始对话测试...")
    
    try:
        # 生成回复
        response = await ai_service.generate_response(
            character=character,
            conversation_history=conversation_history,
            max_tokens=100
        )
        
        if response:
            print(f"✅ AI 回复成功: {response}")
        else:
            print("❌ AI 回复失败: 没有生成回复")
            
    except Exception as e:
        print(f"❌ AI 回复失败: {e}")
    
    # 测试 API 连接
    print("\n🔗 测试 API 连接...")
    try:
        connection_result = await ai_service.test_api_connection()
        print(f"API 连接测试结果: {connection_result}")
    except Exception as e:
        print(f"❌ API 连接测试失败: {e}")


if __name__ == "__main__":
    asyncio.run(test_ai_chat()) 