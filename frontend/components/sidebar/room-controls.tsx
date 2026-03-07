"use client";

import { Button } from "@/components/ui/button";
import { Play, Square, Trash2 } from "lucide-react";

interface RoomControlsProps {
  isAutoChat: boolean;
  onStartAutoChat: () => void;
  onStopAutoChat: () => void;
  onClearMessages: () => void;
}

export function RoomControls({
  isAutoChat,
  onStartAutoChat,
  onStopAutoChat,
  onClearMessages,
}: RoomControlsProps) {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">聊天控制</h2>
      <div className="space-y-2">
        {!isAutoChat ? (
          <Button className="w-full" onClick={onStartAutoChat} variant="default">
            <Play className="h-4 w-4 mr-2" />
            开始自动聊天
          </Button>
        ) : (
          <Button
            className="w-full"
            onClick={onStopAutoChat}
            variant="destructive"
          >
            <Square className="h-4 w-4 mr-2" />
            停止自动聊天
          </Button>
        )}
        <Button className="w-full" onClick={onClearMessages} variant="outline">
          <Trash2 className="h-4 w-4 mr-2" />
          清空消息
        </Button>
      </div>
    </div>
  );
}
