"""Phase 1+2 验证脚本 — 验证人设/世界观系统的所有核心组件"""
import asyncio

from core.prompt.assembler import PromptAssembler
from core.prompt.world_info_scanner import WorldInfoScanner
from db import repository as repo
from models.character import Character, ExampleDialogue
from models.persona import Persona
from models.world_info import WIPosition, WorldInfoBook, WorldInfoEntry


async def main():
    # 1. 验证所有 import
    print("[OK] All imports")

    # 2. WI Scanner 测试
    scanner = WorldInfoScanner()
    book = WorldInfoBook(name="Test", entries=[
        WorldInfoEntry(keys=["hello"], content="Hello World", position=WIPosition.AFTER_CHAR),
        WorldInfoEntry(keys=["secret"], content="Always here", constant=True, position=WIPosition.SYSTEM_TOP),
    ])
    r = scanner.scan([book], "hello there")
    assert r.total_activated == 2, f"Expected 2, got {r.total_activated}"
    print(f"[OK] Scanner: {r.total_activated} activated")

    # 3. Assembler 测试
    c = Character(
        name="X", personality="p", background="b", description="d",
        example_dialogues=[ExampleDialogue(user_message="hi", character_response="hey")],
    )
    p = Persona(name="U", description="user desc")
    msgs = PromptAssembler().assemble(c, [], persona=p, world_info_books=[book])
    print(f"[OK] Assembler: {len(msgs)} messages")

    # 4. DB 初始化
    from db.database import init_db
    await init_db()
    print("[OK] DB init")

    # 5. Persona CRUD
    await repo.save_persona(p)
    ps = await repo.load_all_personas()
    assert any(x.id == p.id for x in ps)
    print(f"[OK] Persona CRUD: {len(ps)} saved")

    # 6. WorldInfo CRUD
    await repo.save_world_info_book(book)
    await repo.save_world_info_entry(book.entries[0], book.id)
    bs = await repo.load_all_world_info_books()
    assert any(x.id == book.id for x in bs)
    print(f"[OK] WorldInfo CRUD: {len(bs)} books")

    # 7. Cleanup
    await repo.delete_persona(p.id)
    await repo.delete_world_info_book(book.id)
    print("[OK] Cleanup done")

    print("\n=== ALL TESTS PASSED ===")


if __name__ == "__main__":
    asyncio.run(main())
