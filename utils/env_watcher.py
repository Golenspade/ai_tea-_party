"""
环境变量文件监视器 - 实现 .env 文件的热重载
"""
import os
import time
import logging
import threading
from pathlib import Path
from dotenv import load_dotenv
from typing import Callable, Optional

logger = logging.getLogger(__name__)


class EnvWatcher:
    """环境变量文件监视器"""

    def __init__(self, env_path: str = ".env", check_interval: float = 1.0):
        """
        初始化环境变量监视器

        Args:
            env_path: .env 文件路径
            check_interval: 检查间隔（秒）
        """
        self.env_path = Path(env_path)
        self.check_interval = check_interval
        self.last_modified = 0.0
        self.is_watching = False
        self.watch_thread: Optional[threading.Thread] = None
        self.callbacks: list[Callable] = []

    def add_callback(self, callback: Callable):
        """添加回调函数，在配置更新时调用"""
        self.callbacks.append(callback)

    def _get_file_mtime(self) -> float:
        """获取文件修改时间"""
        try:
            if self.env_path.exists():
                return self.env_path.stat().st_mtime
        except Exception as e:
            logger.error(f"获取文件修改时间失败: {e}")
        return 0.0

    def _reload_env(self):
        """重新加载环境变量"""
        try:
            # 重新加载 .env 文件
            load_dotenv(self.env_path, override=True)
            logger.info("✅ 成功重新加载 .env 配置")

            # 调用所有回调函数
            for callback in self.callbacks:
                try:
                    callback()
                except Exception as e:
                    logger.error(f"执行回调函数失败: {e}")

        except Exception as e:
            logger.error(f"重新加载 .env 失败: {e}")

    def _watch_loop(self):
        """监视循环"""
        self.last_modified = self._get_file_mtime()
        logger.info(f"开始监视 .env 文件: {self.env_path}")

        while self.is_watching:
            try:
                current_mtime = self._get_file_mtime()

                # 检查文件是否被修改
                if current_mtime > self.last_modified and current_mtime > 0:
                    logger.info(f"检测到 .env 文件变化，正在重新加载...")
                    self.last_modified = current_mtime
                    # 稍等一下确保文件写入完成
                    time.sleep(0.1)
                    self._reload_env()

                time.sleep(self.check_interval)

            except Exception as e:
                logger.error(f"监视 .env 文件时出错: {e}")
                time.sleep(self.check_interval)

    def start(self):
        """启动监视器"""
        if self.is_watching:
            logger.warning(".env 监视器已经在运行")
            return

        if not self.env_path.exists():
            logger.warning(f".env 文件不存在: {self.env_path}，跳过热重载")
            return

        self.is_watching = True
        self.watch_thread = threading.Thread(target=self._watch_loop, daemon=True)
        self.watch_thread.start()
        logger.info("🔥 .env 热重载已启动")

    def stop(self):
        """停止监视器"""
        if not self.is_watching:
            return

        self.is_watching = False
        if self.watch_thread:
            self.watch_thread.join(timeout=2.0)
        logger.info(".env 监视器已停止")


# 全局实例
env_watcher = EnvWatcher()
