"""
预设AI角色配置
运行此脚本可以添加一些示例角色到聊天室
"""

import asyncio
import requests
import json

# 预设角色数据
PRESET_CHARACTERS = [
    {
        "name": "小智",
        "personality": "聪明好学，喜欢思考和分析问题，有点书呆子气质但很友善",
        "background": "是一名大学生，主修计算机科学，对人工智能和哲学都很感兴趣",
        "speaking_style": "说话逻辑清晰，喜欢用数据和事实支撑观点，偶尔会引用名人名言"
    },
    {
        "name": "小萌",
        "personality": "活泼开朗，充满好奇心，喜欢交朋友，有时候有点天真",
        "background": "刚毕业的艺术系学生，热爱绘画和音乐，梦想成为一名插画师",
        "speaking_style": "说话活泼有趣，经常使用表情符号和感叹号，喜欢分享生活中的小美好"
    },
    {
        "name": "老王",
        "personality": "经验丰富，沉稳可靠，喜欢分享人生感悟，有时候会显得有点严肃",
        "background": "退休的中学老师，教了30年书，现在喜欢园艺和阅读",
        "speaking_style": "说话温和有耐心，经常用比喻和故事来说明道理，喜欢给年轻人建议"
    },
    {
        "name": "小猫",
        "personality": "神秘优雅，有点高冷但内心温柔，喜欢观察和思考",
        "background": "自由职业的作家，专门写悬疑小说，养了三只猫",
        "speaking_style": "说话简洁有力，偶尔会说一些富有诗意的话，喜欢用比喻"
    },
    {
        "name": "阿强",
        "personality": "热情直爽，喜欢运动和冒险，有点大大咧咧但很讲义气",
        "background": "健身教练，同时也是业余的登山爱好者，去过很多地方旅行",
        "speaking_style": "说话直接爽快，经常分享运动和旅行的经历，喜欢鼓励别人"
    }
]

def add_characters_to_room(base_url="http://localhost:8000", room_id="default"):
    """添加预设角色到聊天室"""
    
    print("开始添加预设角色...")
    
    for char_data in PRESET_CHARACTERS:
        try:
            response = requests.post(
                f"{base_url}/api/rooms/{room_id}/characters",
                json=char_data,
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 200:
                result = response.json()
                print(f"✅ 成功添加角色: {char_data['name']}")
            else:
                print(f"❌ 添加角色失败: {char_data['name']} - {response.text}")
                
        except Exception as e:
            print(f"❌ 添加角色时出错: {char_data['name']} - {e}")
    
    print("预设角色添加完成！")

def show_character_info():
    """显示预设角色信息"""
    print("=== 预设AI角色信息 ===\n")
    
    for i, char in enumerate(PRESET_CHARACTERS, 1):
        print(f"{i}. {char['name']}")
        print(f"   性格: {char['personality']}")
        print(f"   背景: {char['background']}")
        print(f"   说话风格: {char['speaking_style']}")
        print()

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "info":
        show_character_info()
    else:
        # 检查服务器是否运行
        try:
            response = requests.get("http://localhost:8000/api/health")
            if response.status_code == 200:
                add_characters_to_room()
            else:
                print("❌ 服务器未正常运行，请先启动应用")
        except requests.exceptions.ConnectionError:
            print("❌ 无法连接到服务器，请确保应用正在运行")
            print("   运行命令: python main.py")
        except Exception as e:
            print(f"❌ 检查服务器状态时出错: {e}")
