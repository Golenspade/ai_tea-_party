"use client";

import { useState } from "react";
import type { ApiConfig } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Settings } from "lucide-react";

interface ApiConfigDialogProps {
  onSave: (config: ApiConfig) => void;
}

export function ApiConfigDialog({ onSave }: ApiConfigDialogProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ApiConfig>({
    provider: "",
    apiKey: "",
    model: "",
  });

  const handleSave = () => {
    onSave(form);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>API 配置</DialogTitle>
          <DialogDescription>配置您的 AI API 设置</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="api-provider">API 提供商</Label>
            <Select
              value={form.provider}
              onValueChange={(value) => setForm({ ...form, provider: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择提供商..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="deepseek_chat">
                  DeepSeek Chat (V3.2)
                </SelectItem>
                <SelectItem value="deepseek_reasoner">
                  DeepSeek Reasoner (V3.2)
                </SelectItem>
                <SelectItem value="gemini_25_flash">
                  Gemini 2.5 Flash
                </SelectItem>
                <SelectItem value="gemini_25_pro">Gemini 2.5 Pro</SelectItem>
                <SelectItem value="gemini_3_flash">Gemini 3 Flash</SelectItem>
                <SelectItem value="gemini_31_pro">Gemini 3.1 Pro</SelectItem>
                <SelectItem value="gemini_31_flash_lite">
                  Gemini 3.1 Flash Lite
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="api-key">API 密钥</Label>
            <Input
              id="api-key"
              type="password"
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="api-model">模型（可选）</Label>
            <Input
              id="api-model"
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              placeholder="留空使用默认模型"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button onClick={handleSave}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
