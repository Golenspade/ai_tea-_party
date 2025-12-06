"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MessageCircle,
  Users,
  Plus,
  Play,
  Square,
  Trash2,
  Settings,
  DoorOpen,
  Send,
  Loader2,
} from "lucide-react";

interface Character {
  id: string;
  name: string;
  personality: string;
  background: string;
  speaking_style?: string;
}

interface Message {
  id: string;
  character_id: string;
  character_name: string;
  content: string;
  timestamp: string;
}

export default function Home() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isAutoChat, setIsAutoChat] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState<string>("");
  const [messageInput, setMessageInput] = useState("");

  // Dialog states
  const [addCharacterOpen, setAddCharacterOpen] = useState(false);
  const [apiConfigOpen, setApiConfigOpen] = useState(false);
  const [roomSettingsOpen, setRoomSettingsOpen] = useState(false);

  // Form states
  const [characterForm, setCharacterForm] = useState({
    name: "",
    personality: "",
    background: "",
    speaking_style: "",
  });

  const [apiForm, setApiForm] = useState({
    provider: "",
    apiKey: "",
    model: "",
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // WebSocket connection
  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:3004/ws/default`);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      console.log("WebSocket connected");
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "message") {
        setMessages((prev) => {
          const exists = prev.find((msg) => msg.id === data.data.id);
          if (exists) {
            return prev.map((msg) =>
              msg.id === data.data.id
                ? {
                    ...msg,
                    content: data.data.content,
                    timestamp: data.data.timestamp,
                  }
                : msg
            );
          }

          return [
            ...prev,
            {
              id: data.data.id,
              character_id: data.data.character_id,
              character_name: data.data.character_name,
              content: data.data.content,
              timestamp: data.data.timestamp,
            },
          ];
        });
      } else if (data.type === "character_update") {
        fetchCharacters();
      } else if (data.type === "room_status") {
        if (data.data.is_auto_chat !== undefined) {
          setIsAutoChat(data.data.is_auto_chat);
        }
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      console.log("WebSocket disconnected");
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    fetchCharacters();

    return () => {
      ws.close();
    };
  }, []);

  const fetchCharacters = async () => {
    try {
      const response = await fetch("http://localhost:3004/api/rooms/default/characters");
      const data = await response.json();
      setCharacters(data);
    } catch (error) {
      console.error("Failed to fetch characters:", error);
    }
  };

  const handleAddCharacter = async () => {
    try {
      const response = await fetch("http://localhost:3004/api/rooms/default/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(characterForm),
      });

      if (response.ok) {
        setAddCharacterOpen(false);
        setCharacterForm({
          name: "",
          personality: "",
          background: "",
          speaking_style: "",
        });
        fetchCharacters();
      }
    } catch (error) {
      console.error("Failed to add character:", error);
    }
  };

  const handleDeleteCharacter = async (id: string) => {
    try {
      await fetch(`http://localhost:3004/api/rooms/default/characters/${id}`, {
        method: "DELETE",
      });
      fetchCharacters();
    } catch (error) {
      console.error("Failed to delete character:", error);
    }
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedCharacter) return;

    try {
      const response = await fetch("http://localhost:3004/api/rooms/default/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          character_id: selectedCharacter,
          content: messageInput,
        }),
      });

      if (response.ok) {
        setMessageInput("");
      }
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  const handleAISpeech = async (characterId: string) => {
    const targetCharacter = characters.find((c) => c.id === characterId);
    const tempId = `stream-${Date.now()}`;
    const placeholderMessage: Message = {
      id: tempId,
      character_id: characterId,
      character_name: targetCharacter?.name || "AI",
      content: "",
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, placeholderMessage]);

    try {
      const response = await fetch("http://localhost:3004/api/rooms/default/generate/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ character_id: characterId }),
      });

      if (!response.ok) {
        console.error("Failed to generate AI message");
        setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
        return;
      }

      if (!response.body) {
        console.error("Streaming not supported by the browser");
        setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        events.forEach((event) => {
          const line = event.trim();
          if (!line.startsWith("data:")) return;
          const payload = line.replace(/^data:\s*/, "");
          if (!payload) return;

          try {
            const parsed = JSON.parse(payload);
            if (parsed.type === "chunk" && parsed.content) {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === tempId
                    ? { ...msg, content: (msg.content || "") + parsed.content }
                    : msg
                )
              );
            } else if (parsed.type === "end") {
              setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
            } else if (parsed.type === "error") {
              setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
            }
          } catch (err) {
            console.error("Failed to parse stream chunk", err);
          }
        });

        if (done) {
          break;
        }
      }

      if (buffer.trim()) {
        const remainingEvents = buffer.split("\n\n");
        remainingEvents.forEach((event) => {
          const line = event.trim();
          if (!line.startsWith("data:")) return;
          const payload = line.replace(/^data:\s*/, "");
          if (!payload) return;

          try {
            const parsed = JSON.parse(payload);
            if (parsed.type === "end" || parsed.type === "error") {
              setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
            }
          } catch (err) {
            // ignore leftover parse errors
          }
        });
      }
    } catch (error) {
      console.error("Error generating AI message:", error);
      setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
    }
  };

  const handleStartAutoChat = async () => {
    try {
      await fetch("http://localhost:3004/api/rooms/default/auto-chat/start", {
        method: "POST",
      });
      setIsAutoChat(true);
    } catch (error) {
      console.error("Failed to start auto chat:", error);
    }
  };

  const handleStopAutoChat = async () => {
    try {
      await fetch("http://localhost:3004/api/rooms/default/auto-chat/stop", {
        method: "POST",
      });
      setIsAutoChat(false);
    } catch (error) {
      console.error("Failed to stop auto chat:", error);
    }
  };

  const handleClearChat = () => {
    setMessages([]);
  };

  const handleSaveApiConfig = async () => {
    try {
      const response = await fetch("http://localhost:3004/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: apiForm.provider,
          api_key: apiForm.apiKey,
          model: apiForm.model || undefined,
        }),
      });

      if (response.ok) {
        setApiConfigOpen(false);
      }
    } catch (error) {
      console.error("Failed to save API config:", error);
    }
  };

  const getCharacterInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getAvatarColor = (index: number) => {
    const colors = [
      "bg-blue-500",
      "bg-green-500",
      "bg-purple-500",
      "bg-pink-500",
      "bg-yellow-500",
      "bg-indigo-500",
    ];
    return colors[index % colors.length];
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-50 backdrop-blur-lg bg-white/80 dark:bg-gray-900/80 border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-6 w-6 text-indigo-600" />
            <h1 className="text-xl font-bold">AI Tea Party</h1>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={apiConfigOpen} onOpenChange={setApiConfigOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="icon">
                  <Settings className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>API 配置</DialogTitle>
                  <DialogDescription>
                    配置您的 AI API 设置
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="provider">API 提供商</Label>
                    <Select
                      value={apiForm.provider}
                      onValueChange={(value) =>
                        setApiForm({ ...apiForm, provider: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="选择提供商..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="deepseek_chat">
                          DeepSeek Chat
                        </SelectItem>
                        <SelectItem value="deepseek_reasoner">
                          DeepSeek Reasoner
                        </SelectItem>
                        <SelectItem value="gemini_25_flash">
                          Gemini 2.5 Flash
                        </SelectItem>
                        <SelectItem value="gemini_25_pro">
                          Gemini 2.5 Pro
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="apiKey">API 密钥</Label>
                    <Input
                      id="apiKey"
                      type="password"
                      value={apiForm.apiKey}
                      onChange={(e) =>
                        setApiForm({ ...apiForm, apiKey: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="model">模型（可选）</Label>
                    <Input
                      id="model"
                      value={apiForm.model}
                      onChange={(e) =>
                        setApiForm({ ...apiForm, model: e.target.value })
                      }
                      placeholder="留空使用默认模型"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setApiConfigOpen(false)}>
                    取消
                  </Button>
                  <Button onClick={handleSaveApiConfig}>保存</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Badge variant={isConnected ? "default" : "destructive"}>
              {isConnected ? "已连接" : "未连接"}
            </Badge>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex w-full pt-16">
        {/* Sidebar */}
        <aside className="w-80 border-r bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
          <div className="p-4 space-y-6">
            {/* Character Management */}
            <div>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Users className="h-5 w-5" />
                角色管理
              </h2>
              <ScrollArea className="h-[300px]">
                <div className="space-y-2">
                  {characters.map((character, index) => (
                    <Card key={character.id} className="group">
                      <CardContent className="p-3">
                        <div className="flex items-center gap-3">
                          <Avatar className={getAvatarColor(index)}>
                            <AvatarFallback className="text-white">
                              {getCharacterInitials(character.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">
                              {character.name}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {character.personality}
                            </p>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleAISpeech(character.id)}
                            >
                              <MessageCircle className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteCharacter(character.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>

              <Dialog open={addCharacterOpen} onOpenChange={setAddCharacterOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full mt-3" variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    添加角色
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>添加 AI 角色</DialogTitle>
                    <DialogDescription>
                      为聊天室创建一个新的 AI 角色
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="name">角色名称</Label>
                      <Input
                        id="name"
                        value={characterForm.name}
                        onChange={(e) =>
                          setCharacterForm({
                            ...characterForm,
                            name: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="personality">性格特点</Label>
                      <Textarea
                        id="personality"
                        value={characterForm.personality}
                        onChange={(e) =>
                          setCharacterForm({
                            ...characterForm,
                            personality: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="background">背景故事</Label>
                      <Textarea
                        id="background"
                        value={characterForm.background}
                        onChange={(e) =>
                          setCharacterForm({
                            ...characterForm,
                            background: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="speaking_style">
                        说话风格（可选）
                      </Label>
                      <Input
                        id="speaking_style"
                        value={characterForm.speaking_style}
                        onChange={(e) =>
                          setCharacterForm({
                            ...characterForm,
                            speaking_style: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setAddCharacterOpen(false)}
                    >
                      取消
                    </Button>
                    <Button onClick={handleAddCharacter}>保存</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <Separator />

            {/* Chat Controls */}
            <div>
              <h2 className="text-lg font-semibold mb-3">聊天控制</h2>
              <div className="space-y-2">
                {!isAutoChat ? (
                  <Button
                    className="w-full"
                    onClick={handleStartAutoChat}
                    variant="default"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    开始自动聊天
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    onClick={handleStopAutoChat}
                    variant="destructive"
                  >
                    <Square className="h-4 w-4 mr-2" />
                    停止自动聊天
                  </Button>
                )}
                <Button
                  className="w-full"
                  onClick={handleClearChat}
                  variant="outline"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  清空消息
                </Button>
              </div>
            </div>
          </div>
        </aside>

        {/* Chat Area */}
        <main className="flex-1 flex flex-col">
          <Card className="flex-1 m-4 flex flex-col">
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">AI 茶话会聊天室</h2>
                <Badge variant={isAutoChat ? "default" : "secondary"}>
                  {isAutoChat ? "自动聊天中" : "就绪"}
                </Badge>
              </div>
            </CardHeader>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {messages.map((message) => {
                  const character = characters.find(
                    (c) => c.id === message.character_id
                  );
                  const characterIndex = characters.findIndex(
                    (c) => c.id === message.character_id
                  );
                  return (
                    <div key={message.id} className="flex gap-3">
                      <Avatar className={getAvatarColor(characterIndex)}>
                        <AvatarFallback className="text-white">
                          {getCharacterInitials(message.character_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="font-semibold">
                            {message.character_name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(message.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="mt-1 text-sm">{message.content}</p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Input Area */}
            <div className="border-t p-4">
              <div className="flex gap-2">
                <Select value={selectedCharacter} onValueChange={setSelectedCharacter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="选择角色..." />
                  </SelectTrigger>
                  <SelectContent>
                    {characters.map((character) => (
                      <SelectItem key={character.id} value={character.id}>
                        {character.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="输入消息..."
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
                  className="flex-1"
                />
                <Button onClick={handleSendMessage} disabled={!selectedCharacter}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        </main>
      </div>
    </div>
  );
}
