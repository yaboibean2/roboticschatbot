import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

// Smooth streaming config
const CHAR_DELAY_MS = 1; // Very fast character reveal
const BUFFER_THRESHOLD = 15; // Small buffer before starting

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Keep a synchronous view of messages for sending (avoids relying on setState timing)
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const displayedContentRef = useRef("");
  const pendingContentRef = useRef("");
  const animationTimeoutRef = useRef<number | null>(null);
  const isAnimatingRef = useRef(false);

  const updateDisplay = useCallback(() => {
    setMessages((prev) => {
      const lastMsg = prev[prev.length - 1];
      if (lastMsg?.role === "assistant") {
        return prev.map((m, i) =>
          i === prev.length - 1 ? { ...m, content: displayedContentRef.current } : m
        );
      }
      return [...prev, { role: "assistant", content: displayedContentRef.current }];
    });
  }, []);

  const animateNextChar = useCallback(() => {
    if (displayedContentRef.current.length < pendingContentRef.current.length) {
      displayedContentRef.current = pendingContentRef.current.slice(
        0,
        displayedContentRef.current.length + 1
      );
      updateDisplay();
      animationTimeoutRef.current = window.setTimeout(animateNextChar, CHAR_DELAY_MS);
    } else {
      isAnimatingRef.current = false;
      animationTimeoutRef.current = null;
    }
  }, [updateDisplay]);

  const startAnimation = useCallback(() => {
    if (
      !isAnimatingRef.current &&
      pendingContentRef.current.length > displayedContentRef.current.length
    ) {
      isAnimatingRef.current = true;
      animateNextChar();
    }
  }, [animateNextChar]);

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || isLoading) return;

      const userMessage: Message = { role: "user", content: trimmed };
      const currentMessages: Message[] = [...messagesRef.current, userMessage];

      // Optimistically add the user message to UI
      setMessages(currentMessages);
      messagesRef.current = currentMessages;

      setIsLoading(true);
      displayedContentRef.current = "";
      pendingContentRef.current = "";
      isAnimatingRef.current = false;

      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
        animationTimeoutRef.current = null;
      }

      try {
        const response = await fetch(CHAT_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: currentMessages,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Request failed with status ${response.status}`);
        }

        if (!response.body) {
          throw new Error("No response body");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let textBuffer = "";
        let hasStartedAnimation = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          textBuffer += decoder.decode(value, { stream: true });

          let newlineIndex: number;
          while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
            let line = textBuffer.slice(0, newlineIndex);
            textBuffer = textBuffer.slice(newlineIndex + 1);

            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (line.startsWith(":") || line.trim() === "") continue;
            if (!line.startsWith("data: ")) continue;

            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") break;

            try {
              const parsed = JSON.parse(jsonStr);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                pendingContentRef.current += delta;

                // Start animation after buffering enough content
                if (!hasStartedAnimation && pendingContentRef.current.length >= BUFFER_THRESHOLD) {
                  hasStartedAnimation = true;
                  startAnimation();
                } else if (hasStartedAnimation) {
                  startAnimation();
                }
              }
            } catch {
              textBuffer = line + "\n" + textBuffer;
              break;
            }
          }
        }

        // Process remaining buffer
        if (textBuffer.trim()) {
          for (let raw of textBuffer.split("\n")) {
            if (!raw) continue;
            if (raw.endsWith("\r")) raw = raw.slice(0, -1);
            if (raw.startsWith(":") || raw.trim() === "") continue;
            if (!raw.startsWith("data: ")) continue;
            const jsonStr = raw.slice(6).trim();
            if (jsonStr === "[DONE]") continue;
            try {
              const parsed = JSON.parse(jsonStr);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                pendingContentRef.current += delta;
              }
            } catch {
              /* ignore */
            }
          }
        }

        // Ensure animation starts if we have content but didn't hit threshold
        if (pendingContentRef.current.length > 0 && !hasStartedAnimation) {
          startAnimation();
        }

        // Wait for animation to complete
        const waitForAnimation = () => {
          return new Promise<void>((resolve) => {
            const check = () => {
              if (displayedContentRef.current.length >= pendingContentRef.current.length) {
                resolve();
              } else {
                setTimeout(check, 50);
              }
            };
            check();
          });
        };

        await waitForAnimation();
      } catch (error) {
        console.error("Chat error:", error);
        const errorMessage = error instanceof Error ? error.message : "Something went wrong";
        toast.error(errorMessage);

        if (animationTimeoutRef.current) {
          clearTimeout(animationTimeoutRef.current);
          animationTimeoutRef.current = null;
        }

        // Keep the user's message; only remove a (possibly empty) assistant placeholder.
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          return last?.role === "assistant" ? prev.slice(0, -1) : prev;
        });
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, startAnimation]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    messagesRef.current = [];
    displayedContentRef.current = "";
    pendingContentRef.current = "";
    if (animationTimeoutRef.current) {
      clearTimeout(animationTimeoutRef.current);
      animationTimeoutRef.current = null;
    }
    isAnimatingRef.current = false;
  }, []);

  return {
    messages,
    isLoading,
    sendMessage,
    clearMessages,
  };
}
