"use client";
import { useRouter } from "next/navigation";
import { AssistantChat, type ChatMsg } from "@/components/assistant/chat";

export function AssistantPageChat({ conversationId, initial, aiEnabled }: { conversationId: string | null; initial: ChatMsg[]; aiEnabled: boolean }) {
  const router = useRouter();
  return (
    <AssistantChat
      initialConversationId={conversationId}
      initialMessages={initial}
      aiEnabled={aiEnabled}
      onConversation={(id) => {
        // Keep the URL in sync without remounting the chat.
        window.history.replaceState(null, "", `/assistant?c=${id}`);
        router.refresh();
      }}
    />
  );
}
