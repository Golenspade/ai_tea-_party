"use client";

import { useState } from "react";
import type { CharacterFormData } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";

interface AddCharacterDialogProps {
  onAdd: (data: CharacterFormData) => void;
}

export function AddCharacterDialog({ onAdd }: AddCharacterDialogProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CharacterFormData>({
    name: "",
    personality: "",
    background: "",
    speaking_style: "",
  });

  const handleSubmit = () => {
    onAdd(form);
    setOpen(false);
    setForm({ name: "", personality: "", background: "", speaking_style: "" });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full mt-3" variant="outline">
          <Plus className="h-4 w-4 mr-2" />
          添加角色
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>添加 AI 角色</DialogTitle>
          <DialogDescription>为聊天室创建一个新的 AI 角色</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="char-name">角色名称</Label>
            <Input
              id="char-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="char-personality">性格特点</Label>
            <Textarea
              id="char-personality"
              value={form.personality}
              onChange={(e) => setForm({ ...form, personality: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="char-background">背景故事</Label>
            <Textarea
              id="char-background"
              value={form.background}
              onChange={(e) => setForm({ ...form, background: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="char-style">说话风格（可选）</Label>
            <Input
              id="char-style"
              value={form.speaking_style}
              onChange={(e) =>
                setForm({ ...form, speaking_style: e.target.value })
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button onClick={handleSubmit}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
