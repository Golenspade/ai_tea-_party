#!/usr/bin/env python3
"""
调试 OpenAI 客户端初始化问题
"""
import openai
import os
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

def test_openai_client():
    """测试 OpenAI 客户端初始化"""
    print("🔍 调试 OpenAI 客户端初始化...")
    
    # 获取 DeepSeek API 密钥
    deepseek_api_key = os.getenv("DEEPSEEK_API_KEY")
    
    if not deepseek_api_key:
        print("❌ 未找到 DEEPSEEK_API_KEY 环境变量")
        return
    
    print(f"✅ 找到 API 密钥: {deepseek_api_key[:10]}...")
    
    # 测试不同的初始化方式
    print("\n🧪 测试 1: 基本初始化")
    try:
        client = openai.AsyncOpenAI(
            api_key=deepseek_api_key,
            base_url="https://api.deepseek.com"
        )
        print("✅ 基本初始化成功")
    except Exception as e:
        print(f"❌ 基本初始化失败: {e}")
    
    print("\n🧪 测试 2: 检查 OpenAI 版本")
    try:
        print(f"OpenAI 版本: {openai.__version__}")
    except Exception as e:
        print(f"❌ 无法获取 OpenAI 版本: {e}")
    
    print("\n🧪 测试 3: 检查环境变量")
    env_vars = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY']
    for var in env_vars:
        value = os.getenv(var)
        if value:
            print(f"⚠️ 发现代理环境变量 {var}: {value}")
        else:
            print(f"✅ 未设置 {var}")
    
    print("\n🧪 测试 4: 清理环境变量后初始化")
    try:
        # 临时清理代理相关环境变量
        for var in ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY']:
            if var in os.environ:
                del os.environ[var]
        
        client = openai.AsyncOpenAI(
            api_key=deepseek_api_key,
            base_url="https://api.deepseek.com"
        )
        print("✅ 清理环境变量后初始化成功")
    except Exception as e:
        print(f"❌ 清理环境变量后初始化失败: {e}")

if __name__ == "__main__":
    test_openai_client() 