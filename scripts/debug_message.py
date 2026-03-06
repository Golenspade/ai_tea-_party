#!/usr/bin/env python3
"""
调试Message对象创建问题
"""

from models.character import Character, Message

def test_message_creation():
    """测试Message对象创建"""
    print("🧪 测试Message对象创建...")
    
    try:
        # 创建测试角色
        test_character = Character(
            name="测试",
            personality="简洁回复",
            background="测试角色"
        )
        print(f"✅ 创建角色成功: {test_character.name}")
        
        # 创建测试消息
        test_message = Message(
            content="请回复'连接成功'",
            character_id="test",
            character_name="测试",
            is_system=False
        )
        print(f"✅ 创建消息成功: {test_message.content}")
        print(f"   消息ID: {test_message.id}")
        print(f"   角色ID: {test_message.character_id}")
        print(f"   角色名称: {test_message.character_name}")
        print(f"   是否系统消息: {test_message.is_system}")
        
        # 测试消息列表
        message_list = [test_message]
        print(f"✅ 创建消息列表成功，长度: {len(message_list)}")
        
        # 测试访问消息属性
        for i, msg in enumerate(message_list):
            print(f"消息 {i}:")
            print(f"  类型: {type(msg)}")
            print(f"  内容: {msg.content}")
            print(f"  角色名称: {msg.character_name}")
        
        # 测试字典转换
        msg_dict = test_message.dict()
        print(f"✅ 转换为字典成功: {msg_dict}")
        
        # 测试从字典创建
        new_message = Message(**msg_dict)
        print(f"✅ 从字典创建消息成功: {new_message.content}")
        
        return True
        
    except Exception as e:
        print(f"❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    test_message_creation()
