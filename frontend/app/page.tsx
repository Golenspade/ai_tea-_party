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
    const ws = new WebSocket(`ws://localhost:8000/ws/default`);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      console.log("WebSocket connected");
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "message") {
        setMessages((prev) => [
          ...prev,
          {
            id: data.data.id,
            character_id: data.data.character_id,
            character_name: data.data.character_name,
            content: data.data.content,
            timestamp: data.data.timestamp,
          },
        ]);
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
      const response = await fetch("http://localhost:8000/api/rooms/default/characters");
      const data = await response.json();
      setCharacters(data);
    } catch (error) {
      console.error("Failed to fetch characters:", error);
    }
  };

  const handleAddCharacter = async () => {
    try {
      const response = await fetch("http://localhost:8000/api/rooms/default/characters", {
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
      await fetch(`http://localhost:8000/api/rooms/default/characters/${id}`, {
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
      const response = await fetch("http://localhost:8000/api/rooms/default/messages", {
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
    try {
      const response = await fetch("http://localhost:8000/api/rooms/default/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ character_id: characterId }),
      });

      if (!response.ok) {
        console.error("Failed to generate AI message");
      }
    } catch (error) {
      console.error("Error generating AI message:", error);
    }
  };

  const handleStartAutoChat = async () => {
    try {
      await fetch("http://localhost:8000/api/rooms/default/auto-chat/start", {
        method: "POST",
      });
      setIsAutoChat(true);
    } catch (error) {
      console.error("Failed to start auto chat:", error);
    }
  };

  const handleStopAutoChat = async () => {
    try {
      await fetch("http://localhost:8000/api/rooms/default/auto-chat/stop", {
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
      const response = await fetch("http://localhost:8000/api/config", {
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
                  <DialogTitle>API Configuration</DialogTitle>
                  <DialogDescription>
                    Configure your AI API settings
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="provider">API Provider</Label>
                    <Select
                      value={apiForm.provider}
                      onValueChange={(value) =>
                        setApiForm({ ...apiForm, provider: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select provider..." />
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
                    <Label htmlFor="apiKey">API Key</Label>
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
                    <Label htmlFor="model">Model (Optional)</Label>
                    <Input
                      id="model"
                      value={apiForm.model}
                      onChange={(e) =>
                        setApiForm({ ...apiForm, model: e.target.value })
                      }
                      placeholder="Leave empty for default"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setApiConfigOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveApiConfig}>Save</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Badge variant={isConnected ? "default" : "destructive"}>
              {isConnected ? "Connected" : "Disconnected"}
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
                Characters
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
                    Add Character
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add AI Character</DialogTitle>
                    <DialogDescription>
                      Create a new AI character for the chatroom
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="name">Character Name</Label>
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
                      <Label htmlFor="personality">Personality</Label>
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
                      <Label htmlFor="background">Background</Label>
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
                        Speaking Style (Optional)
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
                      Cancel
                    </Button>
                    <Button onClick={handleAddCharacter}>Save</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <Separator />

            {/* Chat Controls */}
            <div>
              <h2 className="text-lg font-semibold mb-3">Chat Controls</h2>
              <div className="space-y-2">
                {!isAutoChat ? (
                  <Button
                    className="w-full"
                    onClick={handleStartAutoChat}
                    variant="default"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Start Auto Chat
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    onClick={handleStopAutoChat}
                    variant="destructive"
                  >
                    <Square className="h-4 w-4 mr-2" />
                    Stop Auto Chat
                  </Button>
                )}
                <Button
                  className="w-full"
                  onClick={handleClearChat}
                  variant="outline"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear Messages
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
                <h2 className="text-xl font-semibold">AI Tea Party Chatroom</h2>
                <Badge variant={isAutoChat ? "default" : "secondary"}>
                  {isAutoChat ? "Auto Chat Active" : "Ready"}
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
                    <SelectValue placeholder="Select character..." />
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
                  placeholder="Type a message..."
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
