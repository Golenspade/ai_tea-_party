"use client";

import { useState, useEffect } from "react";
import type { ApiConfig, ProviderDef } from "@/lib/types";
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
import { fetchProviders } from "@/services/api";

interface ApiConfigDialogProps {
  onSave: (config: ApiConfig) => void;
}

export function ApiConfigDialog({ onSave }: ApiConfigDialogProps) {
  const [open, setOpen] = useState(false);
  const [providers, setProviders] = useState<Record<string, ProviderDef>>({});
  const [form, setForm] = useState<ApiConfig>({
    provider: "",
    apiKey: "",
    model: "",
    apiBase: "",
  });

  // 加载 provider 列表
  useEffect(() => {
    if (open) {
      fetchProviders()
        .then(setProviders)
        .catch((err) => console.error("Failed to fetch providers:", err));
    }
  }, [open]);

  const selectedProvider = providers[form.provider];
  const showApiKey = !selectedProvider?.needs_api_base || selectedProvider?.env_key;
  const showApiBase = selectedProvider?.needs_api_base;
  const showCustomModel = selectedProvider?.custom_model;
  const modelOptions = selectedProvider?.models ?? [];

  // 选择 provider 后自动填入默认值
  const handleProviderChange = (providerKey: string) => {
    const pdef = providers[providerKey];
    setForm({
      provider: providerKey,
      apiKey: form.apiKey, // 保持已输入的 key
      model: pdef?.default || "",
      apiBase: pdef?.default_api_base || "",
    });
  };

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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>API 配置</DialogTitle>
          <DialogDescription>选择 AI 提供商并配置 API 密钥</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Provider 选择 */}
          <div>
            <Label>AI 提供商</Label>
            <Select value={form.provider} onValueChange={handleProviderChange}>
              <SelectTrigger>
                <SelectValue placeholder="选择提供商..." />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(providers).map(([key, pdef]) => (
                  <SelectItem key={key} value={key}>
                    <span className="font-medium">{pdef.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {pdef.description}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* API Key（Ollama 不需要） */}
          {selectedProvider && showApiKey && selectedProvider.env_key && (
            <div>
              <Label>API 密钥</Label>
              <Input
                type="password"
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                placeholder={`输入 ${selectedProvider.env_key}`}
              />
            </div>
          )}

          {/* API Base（Ollama 需要） */}
          {showApiBase && (
            <div>
              <Label>API 地址</Label>
              <Input
                value={form.apiBase}
                onChange={(e) => setForm({ ...form, apiBase: e.target.value })}
                placeholder={selectedProvider?.default_api_base || "http://localhost:11434"}
              />
            </div>
          )}

          {/* 模型选择 */}
          {selectedProvider && (
            <div>
              <Label>模型</Label>
              {showCustomModel ? (
                <Input
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  placeholder="输入模型名称，如 openai/gpt-4o"
                />
              ) : (
                <Select
                  value={form.model}
                  onValueChange={(v) => setForm({ ...form, model: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择模型..." />
                  </SelectTrigger>
                  <SelectContent>
                    {modelOptions.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={!form.provider}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
