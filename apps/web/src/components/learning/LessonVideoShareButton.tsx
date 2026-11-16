"use client";

import { useState } from "react";
import { Check, Lock, Share2 } from "lucide-react";
import { Badge, Button, useToast } from "@/components/ui";

export function LessonVideoShareButton({
  videoId,
  isPublic = true,
}: {
  videoId: string;
  isPublic?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  const handleCopy = () => {
    if (!isPublic) {
      toast({
        title: "ไม่อนุญาตให้คัดลอกลิงก์",
        description: "วิดีโอนี้เป็นแบบไม่สาธารณะเพื่อการเรียนรู้เฉพาะในระบบ",
        variant: "destructive",
      });
      return;
    }
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    void navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: "คัดลอกลิงก์วิดีโอแล้ว",
      description: "คัดลอกลิงก์ YouTube ไปยังคลิปบอร์ดแล้ว",
      variant: "success",
    });
  };

  if (!isPublic) {
    return (
      <Badge
        variant="warning"
        className="gap-1.5 py-1 px-2.5 text-xs font-normal"
        title="วิดีโอนี้เป็นแบบไม่สาธารณะ ไม่อนุญาตให้คัดลอกลิงก์ภายนอก"
      >
        <Lock className="h-3.5 w-3.5" />
        วิดีโอไม่สาธารณะ (ไม่อนุญาตให้คัดลอก)
      </Badge>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-1.5 text-xs h-7"
      onClick={handleCopy}
      title="คัดลอกลิงก์วิดีโอสาธารณะ"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Share2 className="h-3.5 w-3.5" />}
      {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์วิดีโอ"}
    </Button>
  );
}
